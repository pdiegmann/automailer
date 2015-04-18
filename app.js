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
var exec = require('child_process').exec;
var Imap = require('imap');
var MailParser = require("mailparser").MailParser;

var _ = require("underscore");

/******
	MODELS
*****/
var dbconnection = mongoose.connect("mongodb://127.0.0.1:27017/automailer");
var DatasetModel = require("./models/Dataset")(dbconnection);
var MailModel = require("./models/Mail")(dbconnection);
var MailingListModel = require("./models/MailingList")(dbconnection);
var MailTemplateModel = require("./models/MailTemplate")(dbconnection);
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

app.get('/datasets/all', function(req, res, next) {
	DatasetModel.find({"active" : true}, { "__v": 0 }, function (err, datasets) {
		if (err) {
			logger.debug(req.params, err);
			return res.send(500);
		}

		if (!datasets)
			return res.send(500);

		return res.json(datasets);
	});
});

app.delete('/dataset/:datasetid', function(req, res, next) {
	var datasetId = req.params.datasetid;
	if (datasetId && datasetId.length > 0) {
		PersonModel.find({"dataset": datasetId}).remove().exec(function(err) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}
			CompanyModel.find({"dataset": datasetId}).remove().exec(function(err) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}
				return res.send(200);
			});
		});
	}
	else {
		return res.send(404);
	}
});

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
			return res.send(500);
		}
		
		if (!dataset)
			return res.send(500);

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

							guessMailAddresses(person, company);

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

	var nameSegments = segments[1].replace(" .", "").split(" ");
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
	for (var i = titleOffset; i < nameSegmentsLength - 1; i++) {
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
	var take = req.param("take", 0);
	if (isNaN(take) || take <= 0 || take > 500) take = 500;
	take = parseInt(take);
	var skip = req.param("skip", 0);
	if (isNaN(skip) || skip < 0) skip = 0;
	skip = parseInt(skip);

	CompanyModel.find({ dataset: datasetid }, { raw: 0, __v: 0 }).populate("executives", "-raw -__v").limit(take).skip(skip).exec(function(err, docs) {
		if (err) {
			logger.error(err);
			return res.send(500);
		}

		if (!docs) {
			return res.send(404);
		}

		return res.json(docs);
	});
});

var defaultDiacriticsRemovalMap = [
    {'base':'A', 'letters':/[\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F]/g},
    {'base':'AA','letters':/[\uA732]/g},
    {'base':'AE','letters':/[\u00C6\u01FC\u01E2\u00C4]/g},
    {'base':'AO','letters':/[\uA734]/g},
    {'base':'AU','letters':/[\uA736]/g},
    {'base':'AV','letters':/[\uA738\uA73A]/g},
    {'base':'AY','letters':/[\uA73C]/g},
    {'base':'B', 'letters':/[\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181]/g},
    {'base':'C', 'letters':/[\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E]/g},
    {'base':'D', 'letters':/[\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779]/g},
    {'base':'DZ','letters':/[\u01F1\u01C4]/g},
    {'base':'Dz','letters':/[\u01F2\u01C5]/g},
    {'base':'E', 'letters':/[\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E]/g},
    {'base':'F', 'letters':/[\u0046\u24BB\uFF26\u1E1E\u0191\uA77B]/g},
    {'base':'G', 'letters':/[\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E]/g},
    {'base':'H', 'letters':/[\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D]/g},
    {'base':'I', 'letters':/[\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197]/g},
    {'base':'J', 'letters':/[\u004A\u24BF\uFF2A\u0134\u0248]/g},
    {'base':'K', 'letters':/[\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2]/g},
    {'base':'L', 'letters':/[\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780]/g},
    {'base':'LJ','letters':/[\u01C7]/g},
    {'base':'Lj','letters':/[\u01C8]/g},
    {'base':'M', 'letters':/[\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C]/g},
    {'base':'N', 'letters':/[\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4]/g},
    {'base':'NJ','letters':/[\u01CA]/g},
    {'base':'Nj','letters':/[\u01CB]/g},
    {'base':'O', 'letters':/[\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C]/g},
    {'base':'OE', 'letters':/[\u00D6]/g},
    {'base':'OI','letters':/[\u01A2]/g},
    {'base':'OO','letters':/[\uA74E]/g},
    {'base':'OU','letters':/[\u0222]/g},
    {'base':'P', 'letters':/[\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754]/g},
    {'base':'Q', 'letters':/[\u0051\u24C6\uFF31\uA756\uA758\u024A]/g},
    {'base':'R', 'letters':/[\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782]/g},
    {'base':'S', 'letters':/[\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784]/g},
    {'base':'T', 'letters':/[\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786]/g},
    {'base':'TZ','letters':/[\uA728]/g},
    {'base':'U', 'letters':/[\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244]/g},
    {'base':'UE', 'letters':/[\u00DC]/g},
    {'base':'V', 'letters':/[\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245]/g},
    {'base':'VY','letters':/[\uA760]/g},
    {'base':'W', 'letters':/[\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72]/g},
    {'base':'X', 'letters':/[\u0058\u24CD\uFF38\u1E8A\u1E8C]/g},
    {'base':'Y', 'letters':/[\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE]/g},
    {'base':'Z', 'letters':/[\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762]/g},
    {'base':'a', 'letters':/[\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250]/g},
    {'base':'aa','letters':/[\uA733]/g},
    {'base':'ae','letters':/[\u00E6\u01FD\u01E3\u00E4]/g},
    {'base':'ao','letters':/[\uA735]/g},
    {'base':'au','letters':/[\uA737]/g},
    {'base':'av','letters':/[\uA739\uA73B]/g},
    {'base':'ay','letters':/[\uA73D]/g},
    {'base':'b', 'letters':/[\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253]/g},
    {'base':'c', 'letters':/[\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184]/g},
    {'base':'d', 'letters':/[\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A]/g},
    {'base':'dz','letters':/[\u01F3\u01C6]/g},
    {'base':'e', 'letters':/[\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD]/g},
    {'base':'f', 'letters':/[\u0066\u24D5\uFF46\u1E1F\u0192\uA77C]/g},
    {'base':'g', 'letters':/[\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F]/g},
    {'base':'h', 'letters':/[\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265]/g},
    {'base':'hv','letters':/[\u0195]/g},
    {'base':'i', 'letters':/[\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131]/g},
    {'base':'j', 'letters':/[\u006A\u24D9\uFF4A\u0135\u01F0\u0249]/g},
    {'base':'k', 'letters':/[\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3]/g},
    {'base':'l', 'letters':/[\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747]/g},
    {'base':'lj','letters':/[\u01C9]/g},
    {'base':'m', 'letters':/[\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F]/g},
    {'base':'n', 'letters':/[\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5]/g},
    {'base':'nj','letters':/[\u01CC]/g},
    {'base':'o', 'letters':/[\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275]/g},
    {'base':'oe', 'letters':/[\u00F6]/g},
    {'base':'oi','letters':/[\u01A3]/g},
    {'base':'ou','letters':/[\u0223]/g},
    {'base':'oo','letters':/[\uA74F]/g},
    {'base':'p','letters':/[\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755]/g},
    {'base':'q','letters':/[\u0071\u24E0\uFF51\u024B\uA757\uA759]/g},
    {'base':'r','letters':/[\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783]/g},
    {'base':'s','letters':/[\u0073\u24E2\uFF53\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B]/g},
    {'base':'ss','letters':/[\u00DF]/g},
    {'base':'t','letters':/[\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787]/g},
    {'base':'tz','letters':/[\uA729]/g},
    {'base':'u','letters':/[\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289]/g},
    {'base':'ue','letters':/[\u00FC]/g},
    {'base':'v','letters':/[\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C]/g},
    {'base':'vy','letters':/[\uA761]/g},
    {'base':'w','letters':/[\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73]/g},
    {'base':'x','letters':/[\u0078\u24E7\uFF58\u1E8B\u1E8D]/g},
    {'base':'y','letters':/[\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF]/g},
    {'base':'z','letters':/[\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763]/g}
];
var changes;
function removeDiacritics(str) {
    if(!changes) {
        changes = defaultDiacriticsRemovalMap;
    }
    for(var i=0; i<changes.length; i++) {
        str = str.replace(changes[i].letters, changes[i].base);
    }
    return str;
}

function guessMailAddresses(person, company) {
	if (!person) return;

	if (!company) {
		CompanyModel.findOne({ "_id": person.company }, function(err, company) {
			if (err) {
				console.error(err);
				return;
			}

			if (!company) 
				return;

			guessMailAddresses(company, person);
		});
		return;
	}

	var firstName = person.firstName;
	var lastName = person.lastName;
	var companyDomain = company.email ? company.email.split("@").pop() : "";

	var validCharsRegex = /[^a-zA-Z0-9\-_]/g;
	firstName = removeDiacritics(firstName).replace(validCharsRegex, "").trim().toLowerCase();
	lastName = removeDiacritics(lastName).replace(validCharsRegex, "").trim().toLowerCase();

	var firstNameAlternatives = [];
	if (firstName && firstName.length > 0) {
		if (firstName.indexOf(" ") > -1) {
			firstNameAlternatives = [
				firstName[0],
				firstName.replace(" ", ""),
				firstName.replace(" ", "."),
				firstName.replace(" ", "_"),
				firstName.replace(" ", "-"),
				firstName.replace("-", ""),
				firstName.replace("-", "."),
				firstName.replace("-", "_")
			];
		}
		else {
			firstNameAlternatives = [firstName[0], firstName];
		}
	}

	var lastNameAlternatives = [];
	if (lastName && lastName.length > 0) {
		if (lastName.indexOf(" ") > -1) {
			lastNameAlternatives = [
				lastName.replace(" ", ""),
				lastName.replace(" ", "."),
				lastName.replace(" ", "_"),
				lastName.replace(" ", "-"),
				lastName.replace("-", ""),
				lastName.replace("-", "."),
				lastName.replace("-", "_")
			];
		}
		else {
			lastNameAlternatives = [lastName];
		}
	}

	var mailAddresses = [];
	person.mailAddresses = [];
	for (var i = 0; i < lastNameAlternatives.length; i++) {
		var mailAddress = lastNameAlternatives[i] + "@" + companyDomain;
		mailAddresses.push(mailAddress);
		person.mailAddresses.push({ address: mailAddress, state: 0 });

		for (var j = 0; j < firstNameAlternatives.length; j++) {
			mailAddress = firstNameAlternatives[j] + "." + lastNameAlternatives[i] + "@" + companyDomain;
			mailAddresses.push(mailAddress);
			person.mailAddresses.push({ address: mailAddress, state: 0 });
		}
	}

	person.save(function (err) {
		if (err) {
			logger.error(err);
		}
	});
}

function stringArrayToRegexArray(strArray) {
	if (!strArray) return [];
	var segments = strArray.split(",");
	var regexes = [];
	var segmentsLength = segments.length;
	if (segmentsLength <= 0) return [];
	for (var i in segments) {
		if (!segments[i] || segments[i].trim().length <= 0) continue;
		regexes.push(new RegExp(".*" + segments[i].trim() + ".*"));
	}
	return regexes;
}

function stringArrayToNumberArray(strArray) {
	if (!strArray) return [];
	var segments = strArray.split(",");
	var numbers = [];
	var segmentsLength = segments.length;
	if (segmentsLength <= 0) return [];
	for (var i in segments) {
		if (!segments[i] || segments[i].trim().length <= 0) continue;
		numbers.push(parseInt(segments[i].trim()));
	}
	return numbers;
}

app.get('/dataset/:datasetid/filter', function(req, res, next) {
	var start = process.hrtime();

	var datasetid = req.params.datasetid;
	var take = req.param("take", 0);
	if (isNaN(take) || take <= 0 || take > 500) take = 500;
	take = parseInt(take);
	var skip = req.param("skip", 0);
	if (isNaN(skip) || skip < 0) skip = 0;
	skip = parseInt(skip);

	var executive = req.param("executive", { departement: "", position: "" });
	var company = req.param("company", { name: "", employees: { gt: -1, lt: -1 }, branch: { USSIC: -1, NACE: -1 } });

	var departements = stringArrayToRegexArray(executive.departement);
	var positions = stringArrayToRegexArray(executive.position);
	var locations = stringArrayToRegexArray(executive.location);

	var orQueries = [];
	if (departements && departements.length > 0) {
		orQueries.push({ "departement": { $in : departements } });
	}
	if (positions && positions.length > 0) {
		orQueries.push({ "positions": { $in : positions } });
	}
	if (positions && positions.length > 0) {
		orQueries.push({ "location": { $in : positions } });
	}

	var query;
	if (orQueries.length > 0) {
		query = { dataset: datasetid, $or: orQueries };
	}
	else {
		query = { dataset: datasetid };
	}

	console.log(query);

	PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, personIds) {
		if (err) {
			console.error(err);
			return res.send(500);
		}

		if (!personIds)
			return res.send(500);

		console.log("skip: " + skip + " take: " + take + " person count: " + personIds.length);

		var companyNames = stringArrayToRegexArray(company.name);
		var employeesGT;
		var employeesLT;
		if (company.employees) {
			if (company.employees.gt && !isNaN(company.employees.gt))
				employeesGT = parseInt(company.employees.gt);
			if (company.employees.lt && !isNaN(company.employees.lt))
				employeesLT = parseInt(company.employees.lt);
		}
		var branchesNACE;
		var branchesUSSIC;
		if (company.branch) {
			branchesNACE = stringArrayToNumberArray(company.branch.NACE);
			branchesUSSIC = stringArrayToNumberArray(company.branch.USSIC);
		}

		var orQueriesCompany = [];
		if (companyNames && companyNames.length > 0) {
			orQueriesCompany.push({ "name": { $in : companyNames } });
		} 
		if (employeesGT && !isNaN(employeesGT) && employeesLT && !isNaN(employeesLT)) {
			orQueriesCompany.push({ "employees": { $gte: employeesGT, $lte: employeesLT } });
		}
		else {
			if (employeesGT && !isNaN(employeesGT)) {
				orQueriesCompany.push({ "employees": { $gte: employeesGT } });
			} 
			else if (employeesLT && !isNaN(employeesLT)) {
				orQueriesCompany.push({ "employees": { $lte: employeesLT } });
			} 
		}
		if (branchesNACE && branchesNACE.length > 0) {
			orQueriesCompany.push({ "branch.NACE": { $in : branchesNACE } });
		} 
		if (branchesUSSIC && branchesUSSIC.length > 0) {
			orQueriesCompany.push({ "branch.USSIC": { $in : branchesUSSIC } });
		} 

		var queryCompany;
		if (orQueriesCompany.length > 0) 
			queryCompany = { dataset: datasetid, executives: { $in: personIds }, $or: orQueriesCompany}
		else
			queryCompany = { dataset: datasetid, executives: { $in: personIds }}

		CompanyModel.count(queryCompany, function(err, count) {
			CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 })
			.populate("executives", "-raw -__v")
			.limit(take)
			.skip(skip)
			.exec(function (err, companies) {
				if (err) {
					logger.debug(req.params, err);
					return res.send(500);
				}

				if (!companies)
					return res.send(500);

			    var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

				return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: companies.length, personCount: personIds.length, total: count, results: companies});
			});
		});
	});
});

app.post('/dataset/:datasetid/mail/send/template/:templateid', function(req, res, next) {
	var datasetid = req.params.datasetid;
	var templateid = req.params.templateid;

	var mailSettings = {
		"mailingListId": null,
		"datasetId": datasetid,
		"sender": {
		    "name": "",
		    "address": "",
		    "smtp": {
		        "server": "",
		        "port": 587,
		        "username": "",
		        "password": "",
		        "quota": {
		            "numberOfMails": 900,
		            "perTimeFrame": 10 * 60 * 1000
		        },
		        "ssl": false,
		        "tls": true
		    }
		},
		"settings": {
			"includeAddressStates": [true, false, false, false],
			"sequential": false
		}
	}

	var executive = req.body.executive || { departement: "", position: "" };
	var company = req.body.company || { name: "", employees: { gt: -1, lt: -1 }, branch: { USSIC: -1, NACE: -1 } };
	company.employees.gt = parseInt(company.employees.gt);
	company.employees.lt = parseInt(company.employees.lt);
	company.branch.NACE = parseInt(company.branch.NACE);
	company.branch.USSIC = parseInt(company.branch.USSIC);

	mailSettings.sender = req.body.mail || mailSettings.sender;
	mailSettings.sender.settings.sequential = mailSettings.sender.settings.sequential === "true" || mailSettings.sender.settings.sequential === "on" ? true : false;
	for (var i = 0; i < mailSettings.sender.settings.includeAddressStates.length; i++) {
		mailSettings.sender.settings.includeAddressStates[i] = mailSettings.sender.settings.includeAddressStates[i] === "true" || mailSettings.sender.settings.includeAddressStates[i] === "on" ? true : false;
	}

	mailSettings.sender.smtp.port = parseInt(mailSettings.sender.smtp.port);
	mailSettings.sender.smtp.ssl = mailSettings.sender.smtp.ssl === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
	mailSettings.sender.smtp.tls = mailSettings.sender.smtp.tls === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
	mailSettings.sender.smtp.quota.numberOfMails = parseInt(mailSettings.sender.smtp.quota.numberOfMails);
	mailSettings.sender.smtp.quota.perTimeFrame = parseInt(mailSettings.sender.smtp.quota.perTimeFrame);

	var departements = stringArrayToRegexArray(executive.departement);
	var positions = stringArrayToRegexArray(executive.position);
	var locations = stringArrayToRegexArray(executive.location);

	var orQueries = [];
	if (departements && departements.length > 0) {
		orQueries.push({ "departement": { $in : departements } });
	}
	if (positions && positions.length > 0) {
		orQueries.push({ "positions": { $in : positions } });
	}
	if (positions && positions.length > 0) {
		orQueries.push({ "location": { $in : positions } });
	}

	var query;
	if (orQueries.length > 0) {
		query = { dataset: datasetid, $or: orQueries };
	}
	else {
		query = { dataset: datasetid };
	}

	var personIdsToContact = [];

	PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, docs) {
		if (err) {
			console.error(err);
			return res.send(500);
		}

		if (!docs)
			return res.send(500);

		var personIds = [];
		for (var i in docs) {
			if (docs[i] && docs[i]._id && docs[i]._id.length <= 0) continue;
			personIds.push(docs[i]._id);
		}

		var companyNames = stringArrayToRegexArray(company.name);
		var employeesGT;
		var employeesLT;
		if (company.employees) {
			if (company.employees.gt && !isNaN(company.employees.gt))
				employeesGT = parseInt(company.employees.gt);
			if (company.employees.lt && !isNaN(company.employees.lt))
				employeesLT = parseInt(company.employees.lt);
		}
		var branchesNACE;
		var branchesUSSIC;
		if (company.branch) {
			branchesNACE = stringArrayToNumberArray(company.branch.NACE);
			branchesUSSIC = stringArrayToNumberArray(company.branch.USSIC);
		}

		var orQueriesCompany = [];
		if (companyNames && companyNames.length > 0) {
			orQueriesCompany.push({ "name": { $in : companyNames } });
		} 
		if (employeesGT && !isNaN(employeesGT) && employeesLT && !isNaN(employeesLT)) {
			orQueriesCompany.push({ "employees": { $gte: employeesGT, $lte: employeesLT } });
		}
		else {
			if (employeesGT && !isNaN(employeesGT)) {
				orQueriesCompany.push({ "employees": { $gte: employeesGT } });
			} 
			else if (employeesLT && !isNaN(employeesLT)) {
				orQueriesCompany.push({ "employees": { $lte: employeesLT } });
			} 
		}
		if (branchesNACE && branchesNACE.length > 0) {
			orQueriesCompany.push({ "branch.NACE": { $in : branchesNACE } });
		} 
		if (branchesUSSIC && branchesUSSIC.length > 0) {
			orQueriesCompany.push({ "branch.USSIC": { $in : branchesUSSIC } });
		} 

		var queryCompany;
		if (orQueriesCompany.length > 0) 
			queryCompany = { dataset: datasetid, executives: { $in: personIds }, $or: orQueriesCompany}
		else
			queryCompany = { dataset: datasetid, executives: { $in: personIds }}

		CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 }, function(err, docs) {
			for (var i in docs) {
				var company = docs[i];
				if (!company || !company.executives || company.executives.length <= 0) continue;
				
				for (var k = 0; k < company.executives.length; k++) {
					var positionsToDelete = [];

					for (var j = 0; j < personIds.length; j++) {
						if ((personIds[j] + "") === company.executives[k] + "") {
							positionsToDelete.push(j);
							personIdsToContact.push(personIds[j]);
							break;
						}	
					}

					for (var j in positionsToDelete) {
						personIds.splice(j, 1);
					}
				}
			}

			MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!doc) {
					return res.send(404);
				}

				var mailingList = new MailingListModel();
				mailingList.sendTo = personIdsToContact;
				mailingList.dataset = datasetid;
				mailingList.template = {
					content: doc.content,
					subject: doc.subject
				};

				mailingList.save(function(err) {
					if (err) {
						console.error(err);
						return res.send(500);
					}

					mailSettings.mailingListId = mailingList._id;

					var child = exec('node mailings.js', { env: { options: JSON.stringify(mailSettings) } });
					child.stdout.on('data', function(data) {
					    console.log('stdout: ' + data);
					});
					child.stderr.on('data', function(data) {
					    console.log('stderr: ' + data);
					});
					child.on('close', function(code) {
					    console.log('closing code: ' + code);
					});

					return res.send(200);
				});
			});
		});
	});
});

app.get('/dataset/:datasetid/mail/templates', function(req, res, next) {
	var start = process.hrtime();

	var datasetid = req.params.datasetid;
	var take = req.param("take", 0);
	if (isNaN(take) || take <= 0 || take > 500) take = 500;
	take = parseInt(take);
	var skip = req.param("skip", 0);
	if (isNaN(skip) || skip < 0) skip = 0;
	skip = parseInt(skip);

	MailTemplateModel.count({ dataset: datasetid }, function(err, count) {
		MailTemplateModel.find({ dataset: datasetid }, { __v: 0 }).limit(take).skip(skip).exec(function(err, docs) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}

			if (!docs) {
				return res.send(404);
			}

			var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

			return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
		});
	});
});


app.get('/dataset/:datasetid/mail/template/:templateid?', function(req, res, next) {
	var templateid = req.params.templateid;

	MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
		if (err) {
			logger.error(err);
			return res.send(500);
		}

		if (!doc) {
			return templateid && templateid.length > 0 ? res.send(404) : res.json(new MailTemplateModel());
		}

		return res.json(doc);
	});
});

app.post('/dataset/:datasetid/mail/template/:templateid?', function(req, res, next) {
	var templateid = req.params.templateid;
	var datasetid = req.params.datasetid;

	MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
		if (err) {
			logger.error(err);
			return res.send(500);
		}

		if (!doc) {
			doc = new MailTemplateModel();
		}

		doc.name = req.body.name;
		doc.subject = req.body.subject;
		doc.content = req.body.content;
		doc.dataset = datasetid;

		doc.save(function (err) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}
			return res.json({id: doc._id});
		});
	});
});

app.delete('/dataset/:datasetid/mail/template/:templateid', function(req, res, next) {
	var templateid = req.params.templateid;

	MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
		if (err) {
			logger.error(err);
			return res.send(500);
		}

		if (!doc) {
			return res.send(404);
		}

		doc.remove(function(err) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}
			return res.send(200);
		});
	});
});

app.post('/dataset/:datasetid/mail/address/:addressid', function(req, res, next) {
	var datasetid = req.params.datasetid;
	var addressid = req.params.addressid;
	var state = req.param("state", -1);

	PersonModel.findOne({ "dataset": datasetid, "mailAddresses._id": addressid }).exec(function(err, doc) {
		if (err) {
			logger.error(err);
			return res.send(500);
		}

		if (!doc) {
			console.log("not found!");
			return res.send(404);
		}

		if (!state || state < 0) {
			return res.send(400);
		}

		for (var i in doc.mailAddresses) {
			if (doc.mailAddresses[i]._id == addressid) {
				doc.mailAddresses[i].state = state;
			}
		}

		doc.save(function (err) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}
			return res.send(200);
		});
	});

});
app.get('/dataset/:datasetid/mails', function(req, res, next) {
	var start = process.hrtime();

	var datasetid = req.params.datasetid;
	var take = req.param("take", 0);
	if (isNaN(take) || take <= 0 || take > 500) take = 500;
	take = parseInt(take);
	var skip = req.param("skip", 0);
	if (isNaN(skip) || skip < 0) skip = 0;
	skip = parseInt(skip);

	MailModel.count({ dataset: datasetid }, function(err, count) {
		MailModel.find({ dataset: datasetid }, { __v: 0 }).sort({ created: -1 }).populate("responseTo", "-__v").populate("person", "-__v -raw").limit(take).skip(skip).exec(function(err, docs) {
			if (err) {
				logger.error(err);
				return res.send(500);
			}

			if (!docs) {
				return res.send(404);
			}

			async.each(docs, function(doc, callback) {
				if (!doc || !doc.person || !doc.person.company) {
					return callback();
				}

				CompanyModel.findOne({ "_id": doc.person.company }, { "__v": 0, "raw": 0 }, function(err, company) {
					if (err) {
						console.error(err);
						callback();
						return;
					}

					doc.person.company = company;
					return callback();
				});
			}, function(err) {
				if (err) {
					console.error(err);
					return res.send(500);
				}
				else {
					var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

					return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
				}
			});
		});
	});
});

app.get('/dataset/:datasetid/mails/fetch', function(req, res, next) {
	var mails = [];
	var start = process.hrtime();

	var parsingFinishedCount = 0;
	var imapCMDsRunning = 0;
	var processingFinishedCount = 0;
	var mailsReceivedCount = 0;
	var allMailsReceived = false;

	var datasetid = req.params.datasetid;

	var mailparser = new MailParser({ streamAttachments: false });

	var settings = req.param("mail");
	settings.imap.port = parseInt(settings.imap.port);
	settings.imap.ssl = settings.imap.ssl === "true" ? true : false;
	settings.imap.tls = settings.imap.tls === "true" ? true : false;

	var imap = new Imap({
		user: settings.imap.username,
		password: settings.imap.password,
		host: settings.imap.server,
		tls: settings.imap.tls == true,
		port: settings.imap.port
	});

	var checkForReturn = function(force) {
		console.log("processed: " + processingFinishedCount + " / " + mailsReceivedCount + " parsed: " + parsingFinishedCount + " / " + mailsReceivedCount + " imap CMDs running: " + imapCMDsRunning + " all received: " + allMailsReceived + " force: " + force);
		if ((force && force === true) || (allMailsReceived === true && parsingFinishedCount >= mailsReceivedCount && processingFinishedCount >= mailsReceivedCount) && imapCMDsRunning <= 0) {
			try { imap.end(); }
			catch (e) { console.error(e); }
			var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
			return res.send(200);
		}
	};

	imap.once('ready', function() {
		imap.openBox('INBOX', false, function(err, box) {
			if (err) {
				console.error(err);
				try { imap.end(); }
				catch (e) { console.error(e); }
				return res.send(500);
			}

			imap.search([ 'UNSEEN', ['SINCE', 'January 01, 2015'] ], function(err, results) {
				if (err) {
					console.error(err);
					try { imap.end(); }
					catch (e) { console.error(e); }
					return res.send(500);
				}

				if (!results || results.length <= 0) {
					return res.send(200);
				}

				var f = imap.fetch(results, { bodies: '' });

				f.on('message', function(msg, seqno) {
					mailsReceivedCount++;
					var prefix = '(#' + seqno + ') ';

					msg.on('body', function(stream, info) {
						console.log(prefix + 'Body');

						mailparser.on("end", function(mail) {
							mail.deliveryFailed = false;

							var contents = "";

							if (mail.attachments) {
								for (var i = 0; i < mail.attachments.length; i++) {
									var attachment = mail.attachments[i];
									if (!attachment) continue;

									if (attachment.contentType && attachment.contentType === "message/delivery-status") {
										var content = attachment.content.toString();
										var indexOfAction = content.indexOf("Action: failed");
										if (indexOfAction >= 0 || content.indexOf("Status: 5." >= 0)) {
											var address = "";
											var indexOfFinalRecipient = content.indexOf("Final-Recipient:");
											if (indexOfAction >= 0) {
												var finalRecipientLength = "Final-Recipient:".length;
												var failedAddress = content.substr(indexOfFinalRecipient, indexOfAction - indexOfFinalRecipient).split(";").pop().trim();
												mail.from = {
													name: "",
													address: failedAddress
												};
											}
											mail.deliveryFailed = true;
											if (contents.length > 0) contents += "\n\n----\n\n";
											contents += content;
										}
									}
								}
							}

							if (mail.deliveryFailed === true) {
								if (seqno) {
									imapCMDsRunning++;
									imap.addFlags(seqno, ['\\Seen'], function (err) {
										imapCMDsRunning--;
										if (err) {
											console.error(err);
										}
										console.log(prefix + "marked as read");
										return checkForReturn();
									});
								}
							}

							processingFinishedCount++;

							MailModel.find({ "dataset": datasetid, "to": mail.from[0].address }, function (err, docs) {
								if (err) {
									console.error(err);
								}

								if (!docs || docs.length <= 0) {
									return checkForReturn();
								}

								for (var j = 0; j < docs.length; j++) {
									var doc = docs[j];

									MailModel.findOne({ "dataset": datasetid, "externalId": "" + (msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno) }, function (err, oldResponse) {
										if (err) {
											console.error(err);
										}

										var response = oldResponse ? oldResponse : new MailModel();

										response.from = mail.from[0].address;
										response.to = mail.to[0].address;
										response.subject = mail.subject;
										response.received = mail.date;
										response.dataset = datasetid;
										response.body = contents;
										response.externalId = msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno;

										response.save(function(err) {
											if (err) {
												console.error(err);
											}

											if (doc) {
												response.person = doc.person;
												response.responseTo = doc._id;

												response.save(function(err) {
													if (err) {
														console.error(err);
													}

													return checkForReturn();
												});

												PersonModel.find({ "dataset": datasetid, "_id": doc.person }, function(err, docs) {
													if (err) {
														console.error(err);
													}

													if (!docs) {
														return;
													}

													for (var j = 0; j < docs.length; j++) {
														var doc = docs[j];
														if (!doc || !doc.mailAddresses) {
															return;
														}

														for (var i = 0; i < doc.mailAddresses.length; i++) {
															if (doc.mailAddresses[i].address === mail.from[0].address) {
																doc.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;
																break;
															}
														}

														doc.save(function(err) {
															if (err) {
																console.error(err);
															}
														});
													}
												});
											}
											else {
												PersonModel.find({ "dataset": datasetid, "mailAddresses.address": mail.from[0].address }, function(err, docs) {
													if (err) {
														console.error(err);
													}

													if (!docs) {
														return;
													}

													for (var j = 0; j < docs.length; j++) {
														var doc = docs[j];
														if (!doc || !doc.mailAddresses) {
															continue;
														}

														for (var i = 0; i < doc.mailAddresses.length; i++) {
															if (doc.mailAddresses[i].address === mail.from.address) {
																doc.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;

																response.person = doc._id;
																response.save(function(err) {
																	if (err) {
																		console.error(err);
																	}
																});

																break;
															}
														}

														doc.save(function(err) {
															if (err) {
																console.error(err);
															}
														});
													}
												});

												return checkForReturn();
											}
										});
									});
								}
							});
						});

						stream.pipe(mailparser);
					});
					
					msg.once('attributes', function(attrs) {
						msg.attributes = attrs;
					});
					
					msg.once('end', function() {
						console.log(prefix + 'Finished');
						parsingFinishedCount++;
						return checkForReturn();
					});
				});
				
				f.once('error', function(err) {
					console.log('Fetch error: ' + err);
					return res.send(500);
				});

				f.once('end', function() {
					console.log('Done fetching all messages!');
					allMailsReceived = true;
					return checkForReturn();
				});
			});
		});
	});

	imap.once('error', function(err) {
		console.log(err);
		return res.send(500);
	});

	imap.once('end', function() {
		console.log('Connection ended');
		return checkForReturn(true);
	});

	imap.connect();
});

app.all('/!*', function(req, res, next){
	/*var url_parts = url.parse(req.url);
	var path = url_parts.path;
	path = path.slice(3);
	res.redirect("/#!/" + path);*/
	res.redirect("/");
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