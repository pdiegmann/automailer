var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {
	return {
		getMails: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);

			db.MailModel.count({ dataset: datasetid }, function(err, count) {
				db.MailModel.find({ dataset: datasetid }, { __v: 0 }).sort({ created: -1 }).populate("responseTo", "-__v").populate("person", "-__v -raw").limit(take).skip(skip).exec(function(err, docs) {
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

						db.CompanyModel.findOne({ "_id": doc.person.company, "dataset":datasetid , "active": true }, { "__v": 0, "raw": 0 }, function(err, company) {
							if (err) {
								logger.error(err);
								callback();
								return;
							}

							doc.person.company = company;
							return callback();
						});
					}, function(err) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}
						else {
							var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

							return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
						}
					});
				});
			});
		},

		setAddressState: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var addressid = req.params.addressid;
			var state = req.param("state", -1);

			db.PersonModel.findOne({ "dataset": datasetid, "active": true, "mailAddresses._id": addressid }).exec(function(err, doc) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!doc) {
					logger.log("not found!");
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

		}
	};
};