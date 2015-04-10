var express = require("express");
var app = express();
var mongoose = require("mongoose");
var url = require('url');
var CSVConverter = require("csvtojson").core.Converter;
var fs = require('fs');
var Hashids = require('hashids');
var mkdirp = require('mkdirp');
var FlakeIdGen = require('flake-idgen')
    , intformat = require('biguint-format')
    , flakeGenerator = new FlakeIdGen;
var logger = require('tracer').colorConsole();

/******
	MODELS
*****/
var dbconnection = mongoose.connect("mongodb://127.0.0.1:27017/automailer");
var DatasetModel = require("./models/Dataset")(dbconnection);
var MailModel = require("./models/Mail")(dbconnection);
var CompanyModel = require("./models/Company")(dbconnection);
var PersonModel = require("./models/Person")(dbconnection);

app.configure(function() {
	app.set("view engine", "jade");
	app.use(express.static(__dirname + "/public"));
	app.set('views', __dirname + '/views');
	app.use(express.cookieParser());
  	app.use(express.methodOverride());
	app.use(express.session({ secret: 'AuT0M@Il€r', cookie:{maxAge:3600000}}));
	app.use(express.bodyParser({ 
    	keepExtensions: true, 
    	uploadDir: __dirname + '/tmp',
    	limit: '12mb'
  	}));
});

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str){
		return this.slice(0, str.length) == str;
	};
}

if (typeof String.prototype.endsWith != 'function') {
	String.prototype.endsWith = function (str){
		return this.slice(-str.length) == str;
	};
}

function stripAlphaChars(source) { 
  var out = source.replace(/[^0-9]/g, ''); 

  return out; 
}

app.put('/dataset/:datasetid/upload', function(req, res, next) {
	var file = req.files.file;
	var datasetId = req.params.datasetid;
	var largeFile = req.param("large", true);
	var delimiter = req.param("delimiter", ",");
	var skipEmpty = req.param("skipEmpty", false);
	var checkType = req.param("checkType", false);
	var quote = req.param("quote", "\"");

	if (datasetId == null || datasetId.length <= 0)
		return res.send(404);

	hashids = new Hashids(datasetId != null && datasetId != undefined && datasetId.length > 0 ? datasetId : 'automailer', 8);
	var id = hashids.encrypt(intformat(flakeGenerator.next(), 'dec') / 1000)

	DatasetModel.findOne({"_id" : datasetId}, function (err, dataset) {
		if (err) {
			logger.debug(req.params, err);
			return;
		}
		
		if (!dataset)
			return;

		try {
			var csvConverter = new CSVConverter({ 
				constructResult: !largeFile, 
				delimiter: delimiter, 
				ignoreEmpty: skipEmpty,
				checkType: checkType,
				quote: quote
			});

			if (largeFile) {
				csvConverter.on("record_parsed",function(resultRow,rawRow,rowIndex){
					//console.log(rawRow);
					try { 
						saveCompanyAndPersonsFromCSVRow(resultRow, datasetId);
					}
					catch (e) { logger.error(e); }
				});
			}
			else {
				csvConverter.on("end_parsed",function(jsonObj){
					try { 
						if (jsonObj) {
							var parsed = jsonObj.csvRows ? jsonObj.csvRows : jsonObj;
							for (var rowIndex in parsed) {
								try { 
									saveCompanyAndPersonsFromCSVRow(jsonObj[rowIndex], datasetId);
								}
								catch (e) { logger.error(e); }
							}
						}

						try { fs.unlinkSync(file.path); } 
						catch(e) { logger.error(e); }
						
						return res.send(200);
					}
					catch (e) { 
						logger.error(e); 
						return res.send(500);
					}
				});
			}

			var fileStream = fs.createReadStream(file.path); //, { encoding: 'utf8' }

			fileStream.pipe(csvConverter);
		}
		catch (e) { 
			logger.error(e); 
			return res.send(500);
		}
	});
});

function saveCompanyAndPersonsFromCSVRow(row, datasetId) {
	var company = getCompanyFromCSVRow(row, datasetId);
	if (!company) return;

	company.save(function (err) {
		if (err) {
			logger.error(err);
			return;
		}

		var person;
		for (var i = 1; i <= 100; i++) {
			if (!row["Management/Executives" + i]) continue;
			person = getPersonFromString(row["Management/Executives" + i], company._id, datasetId);

			if (person) {
				person.save(function (err) {
					if (err) {
						logger.error(err);
						return;
					}
				});
			}
		}
	});
}

function tryGetNumber(value) {
	if (isNaN(value)) {
		try { value = parseInt(value); }
		catch (e) { value = NaN; }
	} else return value;

	if (isNaN(value)) {
		try { value = parseInt(stripAlphaChars(value)); }
		catch (ex) { value = NaN; }
	} else return value;
	
	if (isNaN(value)) value = undefined;

	return value;
}

function getCompanyFromCSVRow(row, datasetId) {
	var company = new CompanyModel();

	//console.log(JSON.stringify(row));
	console.log(row["Firma/Company"] + " StraßeAdresse: " + row["StraßeAdresse/StreetAddress"]);

	company.dataset = datasetId;
	company.raw = JSON.stringify(row);
	company.name = row["Firma/Company"];
	company.address = {
		street: row["StraßeAdresse/StreetAddress"],
		city: row["StadtAdresse/CityAddress"],
		zip: row["PostcodeAdresse/ZipCodeAddress"],
		country: row["LandAdresse/CountryAddress"]
	};
	var NACE = tryGetNumber(row["NACEBranche"]); 
	var USSIC = tryGetNumber(row["US-SICBranche"]); 
	company.branch = {
		NACE: NACE,
		USSIC: USSIC
	};
	company.publisher = row["Pub"];
	company.publisherId = row["Hopp-Firma-Nr/Hopp-Company-No"];
	company.legal = row["Rechtsform/Legal-Form"];
	company.founded = row["Gruendung/FoundationDate"];
	if (company.founded && company.founded.length <= 0) company.founded = undefined;
	company.employees = tryGetNumber(row["Beschaeftigte/Employees"]);

	company.telephone = row["Telefon/Telephone"];
	var revenueAmount = tryGetNumber(row["Umsatz/Revenues"]);
	if (revenueAmount) {
		company.revenue = [{
			amount: revenueAmount,
			year: row["Umsatzjahr/Reporting Year"]
		}];
	}
	else { company.revenue = undefined; }

	company.offices = [];
	var offices = row["Niederlassungen/Branches"] ? row["Niederlassungen/Branches"].split(";") : [];
	for (var rowIndex in offices) {
		if (rowIndex < 1 || !offices[rowIndex] || offices[rowIndex].length <= 0) continue;
		company.offices.push(offices[rowIndex]);
	}
	if (company.offices && company.offices.length <= 0) company.offices = undefined;
	company.email = row["E-Mail"];

	return company;
}

function getPersonFromString(string, companyId, datasetId) {
	if (!string || string.length <= 0) return null;
	var segments = string.split(",");
	var segmentsLength = segments.length;
	if (!segments || segmentsLength <= 0) return null;

	var person = new PersonModel();

	person.dataset = datasetId;
	person.raw = string;
	person.position = segments[0].trim();
	person.departement = person.position;

	var nameSegments = segments[1].split(" ");
	var nameSegmentsLength = nameSegments.length;

	// e.g. "Aufsichtsrat, Ulrich Ehrhardt (stellv. Vors.)"
	// and not e.g. "Geschäftsführer, Volker Hipp, Ulm, Donau"
	if (nameSegments && nameSegments[-1] && nameSegments[-1].startsWith("(")) { // && nameSegments[-1].endsWith(")")) {
		nameSegmentsLength -= 1;

		// e.g. "... (IT/EDV)"
		person.departement = nameSegments[-1].trim();	
	}

	// Suggestion: Double last names always have a -
	person.lastName = nameSegments[nameSegmentsLength - 1];
	
	person.firstName = "";
	person.title = "";

	if (companyId) {
		person.company = companyId;
	}

	// offset of the firstname because of title(s)
	var titleOffset = 0;

	// append all titles
	for (titleOffset = 0; titleOffset < nameSegmentsLength - 1; i++) {
		// titles have to end with . to be valid and ongoing
		if (!nameSegments[titleOffset].endsWith(".")) break;
		person.title = i > 0 ? person.title + " " + nameSegments[titleOffset].trim() : nameSegments[titleOffset].trim();
	}

	// remove title property if nothing found
	if (titleOffset <= 0) person.title = undefined;

	// append all first names
	for (var i = titleOffset; i < nameSegmentsLength - 1; i++) {
		person.firstName = i > titleOffset ? person.firstName + " " + nameSegments[i].trim() : nameSegments[i].trim();
	}

	// end is always location such as "..., Stade, Niederelbe"
	if (segmentsLength > 2) {
		person.location = "";
		for (var i = 2; i < segmentsLength; i++) {
			person.location = i > 2 ? person.location + ", " + segments[i].trim() : segments[i].trim(); 
		}
	}

	return person;
}

app.post("/location/:id/photo/add/flickr/:url", function(req, res, next){
	if (!req.user)
		return res.send(401);
	
	var locationId = req.params["id"];
	var flickrUrl = req.params["url"];

	logger.debug("location: " + locationId);
	logger.debug("url: " + flickrUrl);

	if (locationId == null || locationId.length <= 0)
		return res.send(404);
	if (flickrUrl == null || flickrUrl.length <= 0)
		return res.send(500, {error: ["Leider ist etwas schief gelaufen!"]});

	LocationModel.findOne({"_id" : locationId}, function (err, location) {
		if (err) {
			logger.debug(req.params, err);
			return res.send(500, {error: ["Leider ist etwas schief gelaufen!"]});
		}
		
		if (!location)
			return res.send(404);

		if (location.createdByUser != req.user.id)
			return res.send(401);

		if (!location.pictures)
			location.pictures = []

		getFlickrInfo(getFlickrPhotoIdFromURL(flickrUrl), function(error, info) {
			if (!error && info) {
				location.pictures.push({
					url: flickrUrl, 
					flickrBase: info.flickrBase,
					displayUrl: info.displayUrl,
					taken: info.taken,
					user: req.user.id,
					owner: {
						name: info.owner.name,
						profile: info.owner.profile
					},
					tags: info.tags_
				});

				location.save(function (err) {
					if (err) {
						logger.error(err);
						return res.send(500, {error: ["Leider ist etwas schief gelaufen!"]});
					}
					else {
						res.send(200, {success: ["Bild \"" + info.title + "\" erfolgreich hinzugefügt!"]});
					}
				});
			}
			else {
				logger.error(error);
				return res.send(500, {error: ["Leider ist etwas schief gelaufen!"]});
			}
		});
	});
});

app.all('/!*', function(req, res, next){
	var url_parts = url.parse(req.url);
	var path = url_parts.path;
	path = path.slice(3);
	res.redirect("/#!/" + path);
});

app.all('*', function(req, res, next) {
	res.setHeader('charset', 'utf8');
	res.charset = 'utf-8'
	next();
});

app.get("/", function(req, res, next) {
	res.render(__dirname + "/views/index.jade", { layout: false });
});

app.listen(8000);