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
	firstName = firstName.replace(validCharsRegex, "").trim().toLowerCase();
	lastName = lastName.replace(validCharsRegex, "").trim().toLowerCase();

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

					var options = {
						mailingListId: mailingList._id,
						datasetId: datasetid,
						sender: {
							name: "",
							address: "",
							smtp: {
								server: "smtp-auth.uni-koeln.de",
								port: 587,
								ssl: false,
								tls: true, // STARTTLS
								username: "",
								password: "",
								quota: { // S-Mail: 900 Mails / 10 Minutes according to RRZK
									numberOfMails: 900,
									perTimeFrame: 10 * 60 * 1000
								}
							}
						}
					}

					var child = exec('node mailings.js', { env: { options: JSON.stringify(options) } });
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
	var addressid = req.params.addressid;
	var state = req.param("state", -1);

	PersonModel.findOne({ "mailAddresses._id": addressid }).exec(function(err, doc) {
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