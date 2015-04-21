var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {
	return {
		randomizeOrder: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var mailinglistid = req.params.mailinglistid; 

			db.MailingListModel.findOne({ dataset: datasetid, "_id": mailinglistid }, { __v: 0 }, function(err, mailingList) {
				if (err) {
					console.error(err);
					return res.send(500);
				}

				if (!mailingList) {
					return res.send(404);
				}

				db.CompanyModel.find({ dataset: datasetid, executives: { $in: mailingList.sendTo } }, { __v: 0, raw: 0 }, function(err, companies) {
					if (err) {
						console.error(err);
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
						company.save(function(err) {
							if (err) {
								console.error(err);
								callback(err);
							}
							else {
								callback();
							}
						})
					}, function(err) {
						if (err) {
							console.error(err);
							return res.send(500);
						}
						else {
							res.send(200);
						}
					})
				});
			});
		},

		getMailingLists: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);

			db.MailingListModel.count({ dataset: datasetid }, function(err, count) {
				console.log("count:" + count);
				db.MailingListModel.find({ dataset: datasetid }, { __v: 0 }).sort({ created: -1 }).populate("sendTo", "-__v").populate("sentMails", "-__v").populate("answers", "-__v").limit(take).skip(skip).exec(function(err, docs) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!docs) {
						return res.send(404);
					}

					async.each(docs, function(doc, callback) {
						if (!doc || !doc.sendTo) {
							return callback();
						}

						async.each(doc.sendTo, function(person, callbackDeep) {
							if (!person || !person.company) {
								return callbackDeep();
							}

							db.CompanyModel.findOne({ "_id": person.company }, { "__v": 0, "raw": 0 }, function(err, company) {
								if (err) {
									console.error(err);
									callbackDeep();
									return;
								}

								person.company = company;
								return callbackDeep();
							});
						}, function(err) {
							if (err) {
								console.error(err);
								callback(err);
								return res.send(500);
							}
							else {
								callback();
							}
						});
					}, function(err) {
						if (err) {
							console.error(err);
							callback(err);
							return res.send(500);
						}
						else {
							var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

							return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
						}
					});
				});
			});
		}
	};
};