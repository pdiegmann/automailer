var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

var CSVConverter = require("csvtojson").core.Converter;
var diacritics = require('./diacritics');

module.exports = function(db) {

	return {
		guessGender: function(person, datasetid, callback) {
			if (!person || !person.firstName || person.firstName.length <= 0) {
				if (callback) {
					callback();
				}
				return;
			}

			var firstNameSegments = person.firstName.replace("-", " ").split(" ");
			if (!firstNameSegments) {
				if (callback) {
					callback();
				}
				return;
			};

			var regex;
			try {
				regex = new RegExp("^" + firstNameSegments[0] + "$", "i")
			}
			catch (e) {
				logger.error(e);
				if (callback) {
					callback();
				}
				return;
			}

			db.FirstNameModel.find({ "dataset": datasetid, "name": regex }, function(err, firstNames) {
				if (err) {
					if (callback) {
						callback(err);
					}
					else {
						logger.error(err);
					}
					return;
				}
				else if (firstNames && firstNames.length > 0) {
					if (firstNames.length > 1) {
						var foundGender = -1;
						for (var i = 0; i < firstNames.length; i++) {
							if (foundGender != -1 && firstNames[i].gender != foundGender) {
								foundGender = -1;
								break;
							}
							foundGender = firstNames[i].gender;
						}
						
						if (foundGender >= -1 && foundGender <= 1) {
							person.gender = foundGender;
						}
					}
					else {
						person.gender = firstNames[0].gender;
					}

					person.save(function(err) {
						if (err) {
							if (callback) {
								callback(err);
							}
							else {
								logger.error(err);
							}
						}
						else {
							if (callback) {
								callback();
							}
						}
					});
				}
				else {
					if (callback) {
						callback();
					}
				}
			});
		},

		saveCompanyAndPersonsFromCSVRow: function(row, datasetId) {
			var company = this.getCompanyFromCSVRow(row, datasetId);
			if (!company) return;

			var that = this;

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
							var person = that.getPersonFromString(currentRow, company._id, datasetId);
							if (person) {
								person.save(function (err) {
									if (err) {
										logger.error(err);
										callback();
										return;
									}
									
									persons.push(person._id);

									async.series([
										function(callback) {
											that.guessMailAddresses(person, company, callback);
										},
										function(callback) {
											that.guessGender(person, datasetId, callback)
										}
									]);

									callback();
								});
								return;
							}
						}
						callback();
				    },
				    function (err) {
				    	if (err) logger.error("Error: " + err);
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
		},

		stripAlphaChars: function(source) { 
			var out = source.replace(/[^0-9]/g, ''); 

			return out; 
		},

		tryGetNumber: function(value) {
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
		},

		getCompanyFromCSVRow: function(row, datasetId) {
			var company = new db.CompanyModel();

			company.dataset = datasetId;
			company.raw = JSON.stringify(row);
			company.name = row["Firma/Company"];
			company.address = {
				street: row["StraßeAdresse/StreetAddress"],
				city: row["StadtAdresse/CityAddress"],
				zip: row["PostcodeAdresse/ZipCodeAddress"],
				country: row["LandAdresse/CountryAddress"]
			};
			var NACE = this.tryGetNumber(row["NACEBranche"]); 
			var USSIC = this.tryGetNumber(row["US-SICBranche"]); 
			company.branch = {
				NACE: NACE,
				USSIC: USSIC
			};
			company.publisher = row["Pub"];
			company.publisherId = row["Hopp-Firma-Nr/Hopp-Company-No"];
			company.legal = row["Rechtsform/Legal-Form"];
			company.founded = row["Gruendung/FoundationDate"];
			if (company.founded && company.founded.length <= 0) company.founded = undefined;
			company.employees = this.tryGetNumber(row["Beschaeftigte/Employees"]);

			company.telephone = row["Telefon/Telephone"];
			var revenueAmount = this.tryGetNumber(row["Umsatz/Revenues"]);
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
		},

		getPersonFromString: function(string, companyId, datasetId) {
			if (!string || string.length <= 0) return null;
			string = string.replace("Dipl,", "Dipl.").replace("(en)", "");
			var segments = string.split(",");
			var segmentsLength = segments.length;
			if (!segments || segmentsLength <= 1) return null;

			var person = new db.PersonModel();

			person.dataset = datasetId;
			person.raw = string;
			person.position = segments[0].trim();
			person.departement = person.position;

			var nameSegments = segments[1].replace(" .", "").split(" ");
			var nameSegmentsLength = nameSegments ? nameSegments.length : 0;

			var nestedDepartementClosed = true;
			
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
				if (nameSegments[i].startsWith("(")) {
					nestedDepartementClosed = false;
				}
				if (!nestedDepartementClosed) {
					person.departement = nameSegments[i].trim();
					person.departement = person.departement.replace("(", "").replace(")", "").trim();

					if (nameSegments[i].endsWith(")")) {
						nestedDepartementClosed = true;
					}
					continue;
				}
				person.firstName = person.firstName && person.firstName.length > 0 ? person.firstName + " " + nameSegments[i].trim() : nameSegments[i].trim();
			}

			if (!person.lastName || person.lastName.length <= 0) {
				// Suggestion: Double last names always have a -
				var firstNameSegments = person.firstName.split(" ");
				person.lastName = firstNameSegments.pop().trim();
				person.firstName = firstNameSegments.join(" ");
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

			//console.log("title: " + person.title + " firstName: " + person.firstName + " lastName: " + person.lastName + " position: " + person.position + " departement: " + person.departement + " location: " + person.location);

			return person;
		},

		guessMailAddresses: function(person, company, callback, force) {
			if (!person) return;

			force = force !== undefined ? force : true;

			if (!company) {
				var that = this;
				db.CompanyModel.findOne({ "_id": person.company }, function(err, company) {
					if (err) {
						logger.error(err);
						return;
					}

					if (!company) 
						return;

					that.guessMailAddresses(company, person, callback);
				});
				return;
			}

			var firstName = person.firstName;
			var lastName = person.lastName;
			var companyDomain = company.email ? company.email.split("@").pop() : "";

			var validCharsRegex = /[^a-zA-Z0-9\-_]/g;
			firstName = diacritics.removeDiacritics(firstName).replace(validCharsRegex, "").trim().toLowerCase();
			lastName = diacritics.removeDiacritics(lastName).replace(validCharsRegex, "").trim().toLowerCase();

			var firstNameAlternatives = [];
			if (firstName && firstName.length > 0) {
				firstNameAlternatives = [firstName, "", firstName[0]];

				if (firstName.indexOf(" ") > -1) {
					firstNameAlternatives = firstNameAlternatives.concat([
						firstName.replace(" ", "."),
						firstName.replace(" ", "_"),
						//firstName.replace(" ", "-")
					]);
				}

				if (firstName.indexOf("-") > -1) {
					firstNameAlternatives = firstNameAlternatives.concat([
						firstName.replace("-", ""),
						firstName.replace("-", "."),
						firstName.replace("-", "_")
					]);
				}
			}

			var lastNameAlternatives = [];
			if (lastName && lastName.length > 0) {
				lastNameAlternatives = [lastName];

				if (lastName.indexOf(" ") > -1) {
					lastNameAlternatives = lastNameAlternatives.concat([
						lastName.replace(" ", "."),
						lastName.replace(" ", "_"),
						//lastName.replace(" ", "-")
					]);
				}
				
				if (lastName.indexOf("-") > -1) {
					lastNameAlternatives = lastNameAlternatives.concat([
						lastName.replace("-", ""),
						lastName.replace("-", "."),
						lastName.replace("-", "_")
					]);
				}
			}

			var mailAddresses = [];
			if (force === true) person.mailAddresses = [];
			else {
				for (var i = 0; i < person.mailAddresses.length; i++) {
					mailAddresses.push(person.mailAddresses[i].address);
				}
			}

			for (var i = 0; i < lastNameAlternatives.length; i++) {
				var mailAddress;

				// first name, last name
				for (var j = 0; j < firstNameAlternatives.length; j++) {
					mailAddress = (firstNameAlternatives[j].length > 0 ? (firstNameAlternatives[j] + ".") : "") + lastNameAlternatives[i] + "@" + companyDomain;
					if (mailAddresses.indexOf(mailAddress) < 0) {
						mailAddresses.push(mailAddress);
						person.mailAddresses.push({ address: mailAddress, state: 0 });
					}
					// else {
					//	logger.log("mail address already known: " + mailAddress);
					// }
				}

				// last name
				mailAddress = lastNameAlternatives[i] + "@" + companyDomain;
				if (mailAddresses.indexOf(mailAddress) < 0) {
					mailAddresses.push(mailAddress);
					person.mailAddresses.push({ address: mailAddress, state: 0 });
				}
				// else {
				//	logger.log("mail address already known: " + mailAddress);
				// }

				// last name, first name
				for (var j = 0; j < firstNameAlternatives.length; j++) {
					if (firstNameAlternatives[j].length <= 0) continue;
					mailAddress = lastNameAlternatives[i] + "." + firstNameAlternatives[j] + "@" + companyDomain;
					if (mailAddresses.indexOf(mailAddress) < 0) {
						mailAddresses.push(mailAddress);
						person.mailAddresses.push({ address: mailAddress, state: 0 });
					}
					// else {
					//	logger.log("mail address already known: " + mailAddress);
					// }
				}
			}

			person.save(function (err) {
				if (err) {
					logger.error(err);
				}

				if (callback) {
					callback(err);
				}
			});
		}
	};
};