var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {
	return {
		getMailingList: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;

			db.MailingListModel
			.findOne({ "_id": maillistid, "dataset": datasetid }, { __v: 0 })
			.populate("preparedMails", "-__v")
			.exec(function(err, doc) {
				if (err) {
					console.error(err);
					return res.send(500);
				}

				if (!doc) {
					return res.send(404);
				}

				async.each(doc.preparedMails, function(preparedMail, callback) {
					db.PersonModel.findOne({ dataset: datasetid, "_id": preparedMail.person }, { "__v": 0, "raw": 0 })
					.populate("company", "-__v -raw")
					.exec(function(err, person) {
						if (err) {
							return callback(err);
						}

						if (!person) {
							return callback();
						}

						preparedMail.person = person;
						callback();
					});
				}, function(err) {
					if (err) {
						console.error(err);
						return res.send(500);
					}

					return res.json(doc);
				})
			});
		},

		setMailingList: function(req, res, next) {
			return res.send(200);
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
				db.MailingListModel.find({ dataset: datasetid }, { __v: 0 }).sort({ created: -1 })
				//.populate("sendTo", "-__v")
				//.populate("sentMails", "-__v")
				//.populate("answers", "-__v")
				.limit(take)
				.skip(skip)
				.exec(function(err, docs) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!docs) {
						return res.send(404);
					}

					/*
					async.each(docs, function(doc, callback) {
						if (!doc || !doc.sendTo) {
							return callback();
						}

						async.each(doc.sendTo, function(person, callbackDeep) {
							if (!person || !person.company) {
								return callbackDeep();
							}

							db.CompanyModel.findOne({ "_id": person.company, "dataset": datasetid, "active": true }, { "__v": 0, "raw": 0 }, function(err, company) {
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
					*/

					var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
					return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
				});
			});
		}
	};
};