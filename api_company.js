var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {

	return {
		
		filter: function(req, res, next) {
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

			var departements = global.stringArrayToRegexArray(executive.departement);
			var positions = global.stringArrayToRegexArray(executive.position);
			var locations = global.stringArrayToRegexArray(executive.location);

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

			db.PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, personIds) {
				if (err) {
					console.error(err);
					return res.send(500);
				}

				if (!personIds)
					return res.send(500);

				console.log("skip: " + skip + " take: " + take + " person count: " + personIds.length);

				var companyNames = global.stringArrayToRegexArray(company.name);
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

				db.CompanyModel.count(queryCompany, function(err, count) {
					db.CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 })
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
		}
	};
};