var express = require("express");
var app = express();
var mongoose = require("mongoose");
var url = require('url');
var CSVConverter = require("csvtojson").core.Converter;
var fs = require('fs');
var async = require('async');
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
var PersonModel = require("./models/Person")(dbconnection);
var CompanyModel = require("./models/Company")(dbconnection);

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
					try { 
						saveCompanyAndPersonsFromCSVRow(resultRow, datasetId);
					}
					catch (e) { logger.error(e); }
				});
			}

			csvConverter.on("end_parsed",function(jsonObj){
				try { 
					if (jsonObj && !largeFile) {
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

		var i = 1;
		var persons = [];
		async.whilst(
		    function () { return i <= 100; },
		    function (callback) {
		    	var currentRow = row["Management/Executives" + i];
		        i++;
		    	if (currentRow && currentRow.length > 0); {
					var person = getPersonFromString(currentRow, company._id, datasetId);
					if (person) {
						person.save(function (err) {
							if (err) {
								logger.error(err);
								callback();
								return;
							}
							persons.push(person._id);
							callback();
						});
						return;
					}
				}
				callback();
		    },
		    function (err) {
		    	if (err) console.error("Error: " + err);
		    	else {
		    		company.executives = persons;
					company.save(function (err) {
						if (err) {
							logger.error(err);
						}
					});
		    	}
		    }
		);
	});
}

function savePersonAndUpdateCompany(person, company) {
	var p = person;
	var c = company;
	if (p && c) {
		p.save(function (err) {
			if (err) {
				logger.error(err);
				return;
			}

			c.model(c.constructor.modelName).findOne({_id: c._id},
			    function(err, newDoc) {
			        if (!err) {
			            c = newDoc;
			        }

			        if (!c.executives) c.executives = [];
					c.executives.push(p._id);
					c.save(function (err) {
						if (err) {
							logger.error(err);
							logger.log(p._id);
						}
					});
			    }
			);
		});
	}
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

	var nestedDepartementClosed = true;

	// e.g. "Aufsichtsrat, Ulrich Ehrhardt (stellv. Vors.)"
	// and not e.g. "Geschäftsführer, Volker Hipp, Ulm, Donau"
	if (nameSegments && nameSegments[nameSegmentsLength - 1] && nameSegments[nameSegmentsLength - 1].trim().startsWith("(")) { // && nameSegments[-1].endsWith(")")) {
		// e.g. "... (IT/EDV)"
		person.departement = nameSegments[nameSegmentsLength - 1].trim();
		person.departement = person.departement.substring(1).trim();
		nameSegmentsLength -= 1;

		if (person.departement.endsWith(")")) person.departement = person.departement.substring(0, person.departement.length - 1).trim();
		else nestedDepartementClosed = false;
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
	for (titleOffset = 0; titleOffset < nameSegmentsLength; titleOffset++) {
		if (nameSegments[titleOffset].trim().length <= 0) continue;
		// titles have to end with . to be valid and ongoing
		if (!nameSegments[titleOffset].trim().endsWith(".")) break;
		person.title = person.title && person.title.length > 0 ? person.title + " " + nameSegments[titleOffset].trim() : nameSegments[titleOffset].trim();
	}

	// remove title property if nothing found
	if (titleOffset <= 0) person.title = undefined;

	// append all first names
	for (var i = titleOffset; i < nameSegmentsLength; i++) {
		person.firstName = person.firstName && person.firstName.length > 0 ? person.firstName + " " + nameSegments[i].trim() : nameSegments[i].trim();
	}

	// end is always location such as "..., Stade, Niederelbe"
	if (segmentsLength > 2) {
		person.location = "";
		for (var i = 2; i < segmentsLength; i++) {
			if (!nestedDepartementClosed) {
				person.departement = person.departement && person.departement.length > 0 ? person.departement + ", " + segments[i].trim() : segments[i].trim();
				if (segments[i].trim().endsWith(")")) {
					nestedDepartementClosed = true;
					person.departement = person.departement.substring(0, person.departement.length - 1).trim();
				}
			}
			else {
				person.location = person.location && person.location.length > 0 ? person.location + ", " + segments[i].trim() : segments[i].trim(); 
			}
		}
	}

	return person;
}

app.get('/dataset/:datasetid/all', function(req, res, next)	{
	var datasetid = req.params.datasetid;
	console.log("find: " + datasetid);
	CompanyModel.find({ dataset: datasetid }, { raw: 0, __v: 0 }).populate("executives", "-raw -__v").exec(function(err, docs) {
		return res.json(docs);
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