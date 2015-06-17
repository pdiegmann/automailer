var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {

	return {

		exclude: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var publisher = req.params.publisher;

			var publisherIds = req.params.publisherids;
			if (!publisherIds || publisherIds.length <= 0) return res.send(500);
			var publisherIdSegments = publisherIds.split(',');
			publisherIds = [];
			for (var i = 0; i < publisherIdSegments.length; i++) {
				publisherIds.push(publisherIdSegments[i].trim());
			}

			logger.log("excluding " + publisherIds.length + " companies");
			db.CompanyModel.count({ dataset: datasetid, publisherId: {$in: publisherIds}, publisher: publisher}, function(err, count) {
				logger.log("matches: " + count);
			});

			async.each(publisherIds, function(publisherId, callback) {
				db.CompanyModel.findOne({ dataset: datasetid, publisherId: publisherId, publisher: publisher}, function(err, company) {
					if (err) {
						return callback(err);
					}

					if (!company) {
						logger.info(publisherId);
						return callback();
					}

					company.active = false;
					company.save(callback);
				});
			}, function(err) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}
				return res.send(200);
			});
		},
		
		filter: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);
			
			var filter = global.getFilter(req, true); 
			var personSubQueries = filter.personSubQueries;
			var subQueriesCompany = filter.subQueriesCompany;
			
			var personQueryTasks = [];
			if (filter.executive.onlyNotInMailingList === true || filter.company.onlyNotInMailingList === true) {
				personQueryTasks.push(global.getExcludeQueryTask(filter, datasetid));
			}

			personQueryTasks.push(function(callback) {
				var query = global.getPersonQuery(filter, personSubQueries, datasetid);
				//logger.log(JSON.stringify(query));

				db.PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, personIds) {
					if (err) {
						return callback(err);
					}
	
					if (!personIds)
						return callback("no person ids");

					for (var i = 0; i < personIds.length; i++) {
						personIds[i] = personIds[i]._id;
					}
	
					logger.log("skip: " + skip + " take: " + take + " person count: " + personIds.length);
	
					var queryCompany = global.getCompanyQuery(filter, subQueriesCompany, personIds, datasetid);
	
					db.CompanyModel.count(queryCompany, function(err, count) {
						db.CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 })
						.populate("executives", "-raw -__v")
						.sort({ orderNr: 1 })
						.limit(take)
						.skip(skip)
						.exec(function (err, companies) {
							if (err) {
								return callback(err);
							}
	
							if (!companies)
								return callback("no companies");
	
						    var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
	
							return callback(null, { duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: companies.length, personCount: personIds.length, total: count, results: companies});
						});
					});
				});
			});
			
			async.series(personQueryTasks, function(err, result) {
				if (err) {
					console.log(err.stack);
					logger.error(err);
					return res.send(500);
				} else { 
					var lastResult = result.pop();
					if (lastResult) {
						return res.json(lastResult);
					} else {
						res.send(500);
					}
				}
			});
		},

		randomizeOrder: function(req, res, next) {
			var datasetid = req.params.datasetid;

			db.CompanyModel.find({ dataset: datasetid, "active": true }, { __v: 0, raw: 0 }, function(err, companies) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!companies) {
					return res.send(404);
				}

				var companiesLength = companies.length;
				var indexPool = new Array(companiesLength);
				for (var i = 0; i < companiesLength; i++) {
					indexPool[i] = i;
				}

				var getNumber = function () {
					if (indexPool.length == 0) {
						throw "No numbers left";
					}
					var index = Math.floor(indexPool.length * Math.random());
					var drawn = indexPool.splice(index, 1);
					return drawn[0];
				}

				async.each(companies, function(company, callback) {
					company.orderNr = getNumber();
					logger.log((companiesLength - indexPool.length) + " " + company.name + " " + company.orderNr);
					company.save(callback);
				}, function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}
					else {
						res.send(200);
					}
				})
			});
		}
	};
};