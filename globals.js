var async = require('async');
var logger = require('tracer').colorConsole();

module.exports = function(db) {
	global.getExcludeQueryTask = function(filter, datasetid) {
		return function(callback) {
			if (!filter.excludeCompanyIds) filter.excludeCompanyIds = [];
			if (!filter.excludePersonIds) filter.excludePersonIds = [];
		
			db.MailingListModel.distinct("sendTo", { dataset: datasetid }, function (err, sendToPersonIds) {
				if (err) {
					return callback(err);
				}
				
				if (!sendToPersonIds) sendToPersonIds = [];
				if (filter.executive.onlyNotInMailingList === true) {
					filter.excludePersonIds = filter.excludePersonIds.concat(sendToPersonIds);
				}
				
				if (filter.company.onlyNotInMailingList === true) {
					async.eachSeries(sendToPersonIds, function(sendToPersonId, callback) {
						db.PersonModel.findOne({ dataset: datasetid, _id: sendToPersonId }, { company: 1 }, function (err, person) {
							if (err) {
								return callback(err);
							}
							
							if (!person) {
								return callback();
							}
							filter.excludeCompanyIds.push(person.company);
							callback();
						}, callback);
					}, function(err) {
						callback(err);
					});
				} else {
					return callback();
				}
			});
		};
	};
	
	global.getPersonQuery = function(filter, personSubQueries, datasetid) {
		var query;
		if (filter.excludePersonIds && filter.excludePersonIds.length > 0) {
			personSubQueries.push({ "_id": { $nin: filter.excludePersonIds } });
		}
		if (filter.excludeCompanyIds && filter.excludeCompanyIds.length > 0) {
			personSubQueries.push({ "company": { $nin: filter.excludeCompanyIds } });
		}
		if (personSubQueries.length > 0) {					
			query = { dataset: datasetid, "active": true, $and: personSubQueries };
		}
		else {
			query = { dataset: datasetid, "active": true };
		}
		
		return query;
	};
	
	global.getCompanyQuery = function(filter, companySubQueries, personIds, datasetid) {
		var queryCompany;
		if (companySubQueries.length > 0) {
			if (filter.excludeCompanyIds && filter.excludeCompanyIds.length > 0) {
				queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true, "_id": { $nin: filter.excludeCompanyIds }, $or: companySubQueries };
			} else {
				queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true, $or: companySubQueries };
			}
		}
		else {
			if (filter.excludeCompanyIds && filter.excludeCompanyIds.length > 0) {
				queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true, "_id": { $nin: filter.excludeCompanyIds } };
			} else {
				queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true };
			}
		}
		
		return queryCompany;
	};
	
	global.getFilter = function(req, useParams) {
		var executive;
		var company;
		if (useParams === true) {
			executive = req.param("executive", { departement: "", position: "", onlyNotInMailingList: false });
			company = req.param("company", { name: "", employees: { gt: -1, lt: -1 }, branch: { USSIC: -1, NACE: -1 }, onlyNotInMailingList: false });
		} else {
			executive = req.body.executive || { departement: "", position: "", onlyNotInMailingList: false };
			company = req.body.company || { name: "", employees: { gt: -1, lt: -1 }, branch: { USSIC: -1, NACE: -1 }, onlyNotInMailingList: false };
		}
		
		executive.onlyNotInMailingList = executive.onlyNotInMailingList === true || executive.onlyNotInMailingList === "on" || executive.onlyNotInMailingList === "true";
		company.onlyNotInMailingList = company.onlyNotInMailingList === true || company.onlyNotInMailingList === "on" || company.onlyNotInMailingList === "true";
		company.employees.gt = parseInt(company.employees.gt);
		company.employees.lt = parseInt(company.employees.lt);
		company.branch.NACE = parseInt(company.branch.NACE);
		company.branch.USSIC = parseInt(company.branch.USSIC);
		
		var departements = global.stringToRegexQuery(executive.departement);
		var positions = global.stringToRegexQuery(executive.position);
		var locations = global.stringToRegexQuery(executive.location);
		
		var personSubQueries = [];
		if (departements) {
			personSubQueries.push({ "departement": departements });
		}
		if (positions) {
			personSubQueries.push({ "position": positions });
		}
		if (locations) {
			personSubQueries.push({ "location": locations });
		}
		
		var companyNames = global.stringToRegexQuery(company.name);
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
			branchesNACE = global.stringArrayToNumberArray(company.branch.NACE);
			branchesUSSIC = global.stringArrayToNumberArray(company.branch.USSIC);
		}
	
		var subQueriesCompany = [];
		if (companyNames && companyNames.length > 0) {
			subQueriesCompany.push({ "name": { $in : companyNames } });
		} 
		if (employeesGT && !isNaN(employeesGT) && employeesLT && !isNaN(employeesLT)) {
			subQueriesCompany.push({ "employees": { $gte: employeesGT, $lte: employeesLT } });
		}
		else {
			if (employeesGT && !isNaN(employeesGT)) {
				subQueriesCompany.push({ "employees": { $gte: employeesGT } });
			} 
			else if (employeesLT && !isNaN(employeesLT)) {
				subQueriesCompany.push({ "employees": { $lte: employeesLT } });
			} 
		}
		if (branchesNACE && branchesNACE.length > 0) {
			subQueriesCompany.push({ "branch.NACE": { $in : branchesNACE } });
		} 
		if (branchesUSSIC && branchesUSSIC.length > 0) {
			subQueriesCompany.push({ "branch.USSIC": { $in : branchesUSSIC } });
		} 
		
		return { "company": company, "executive": executive, "departements": departements, "positions": positions, "locations": locations, "personSubQueries": personSubQueries, "subQueriesCompany": subQueriesCompany };
	};
	
	global.getMailSettings = function(req) {
		var parameters = {
			"sender": {
		    	"name": "",
		    	"address": ""
			},
			"settings": {
				"includeAddressStates": [true, false, false, false],
				"sequential": false,
				"skip": 0,
				"take": 100
			}
		};
	
		parameters = req.body.mail || parameters;
		parameters.settings.sequential = parameters.settings.sequential === true || parameters.settings.sequential === "true" || parameters.settings.sequential === "on" ? true : false;
		parameters.settings.randomPersonSelection = parameters.settings.randomPersonSelection === true || parameters.settings.randomPersonSelection === "true" || parameters.settings.randomPersonSelection === "on" ? true : false;
		for (var i = 0; i < parameters.settings.includeAddressStates.length; i++) {
			parameters.settings.includeAddressStates[i] = parameters.settings.includeAddressStates[i] === true || parameters.settings.includeAddressStates[i] === "true" || parameters.settings.includeAddressStates[i] === "on" ? true : false;
		}
		parameters.settings.skip = parseInt(parameters.settings.skip);
		parameters.settings.take = parseInt(parameters.settings.take);
		
		return parameters;
	};
	
	global.shuffleArray = function(array) {
	    for (var i = array.length - 1; i > 0; i--) {
	        var j = Math.floor(Math.random() * (i + 1));
	        var temp = array[i];
	        array[i] = array[j];
	        array[j] = temp;
	    }
	    return array;
	};
	
	global.stringArrayToRegexArray = function(strArray) {
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
	};
	
	global.stringArrayToNumberArray = function(strArray) {
		if (!strArray || !(strArray instanceof String)) return [];
		
		var segments = strArray.split(",");
		var numbers = [];
		var segmentsLength = segments.length;
		if (segmentsLength <= 0) return [];
		for (var i in segments) {
			if (!segments[i] || segments[i].trim().length <= 0) continue;
			numbers.push(parseInt(segments[i].trim()));
		}
		return numbers;
	};
	
	global.stringToRegexQuery = function(str) {
		try {
			if (!str || str.length <= 0) return undefined;
	
			if (str.startsWith("not:")) {
				return { $not: global.stringToRegexQuery(str.substr(4)) }
			}
			else if (str.startsWith("in:")) {
				str = str.substr(3);
				var parts = str.split(",");
				var arr = [];
				for (var i = 0; i < parts.length; i++) {
					var item = global.stringToRegexQuery(parts[i].trim());
					if(item !== undefined && item !== null) {
						if (item instanceof Array) {
							arr = arr.concat(item);
						}
						else if (typeof item === 'RegExp' || item instanceof RegExp || typeof item === 'string' || item instanceof String) {
							arr.push(item);
						}
					}
				}
				return { $in: arr };
			}
			else if (str.startsWith("regex:")) {
				return new RegExp(str.substr(6));
			}
			else if (str.startsWith("ci:")) {
				return new RegExp("^" + str.substr(3).replace(/\./g, "\\.") + "$", "i");
				//return new RegExp(str.substr(3).replace(/\./g, "\\."), "i");
			}
			else {
				return str;
			}
		}
		catch (e) {
			logger.error(e);
			return undefined;
		}
	};
};