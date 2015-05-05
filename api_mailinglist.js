var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");
var Buffer = require('buffer');

module.exports = function(db) {
	return {
		exportCSV: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;

			var query;
			if (maillistid && maillistid.length > 0) {
				query = { dataset: datasetid, _id: maillistid };
			}
			else {
				query = { dataset: datasetid };	
			}

			db.MailingListModel.find(query)
			.populate("sendTo", "-__v -raw")
			.exec(function(err, mailingLists) {
				if (err) {
					logger.error(err);
					res.write("\n\nERROR");
					return res.end();
				}

				if (!mailingLists) {
					res.write("\n\nNo Mailing Lists");
					return res.end();	
				}

				var now = new Date();
				var friendlyDate = now.getFullYear() + "_" + ("0" + (now.getMonth() + 1)).slice(-2) + "_" + ("0" + now.getDate()).slice(-2) + "_" + now.getHours() + "_" + now.getMinutes() + "_" + now.getSeconds();

				res.writeHead(200, {
			        'Content-Type': 'text/csv; charset=latin1',
			        'Content-Encoding': 'latin1',
			        'Content-Disposition': 'attachment; filename="export_' + friendlyDate + '.csv"'
			    });

				res.write("Vorname;Nachname;Position;Department;Firma;Datenbank;ID\n");
				async.eachSeries(mailingLists, function(mailingList, callback) {
					async.eachSeries(mailingList.sendTo, function(receiver, callback) {
						receiver.populate("company", "-__v -raw", function(err, receiver) {
							var str = receiver.firstName.replace(";", ",") + ";" + receiver.lastName.replace(";", ",") + ";" + receiver.position.replace(";", ",") + ";" + receiver.departement.replace(";", ",") + ";" + receiver.company.name.replace(";", ",") + ";" + receiver.company.publisher.replace(";", ",") + ";" + receiver.company.publisherId.replace(";", ",").replace(".", "").trim() + "\n";
							res.write(str, "latin1");
							callback();
						});
					}, callback);
				}, function(err) {
					if (err) {
						logger.error(err);
						res.write("\n\nERROR");
					}
					return res.end();
				})
			});
		},

		getMailingList: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;

			db.MailingListModel
			.findOne({ "_id": maillistid, "dataset": datasetid }, { __v: 0 })
			.populate("preparedMails", "-__v")
			.exec(function(err, doc) {
				if (err) {
					logger.error(err);
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
						logger.error(err);
						return res.send(500);
					}

					return res.json(doc);
				})
			});
		},

		getPersonsAddressed: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;
			var failedOnly = req.param("failedOnly", false);
			if (failedOnly === "true") failedOnly = true;

			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);

			db.MailingListModel
			.aggregate([
				{ $match: { _id: new mongoose.Types.ObjectId(maillistid), dataset: new mongoose.Types.ObjectId(datasetid) } }, 
				{ $project: { count: { $size: "$sendTo" } } }
			], function (err, aggregation) {
				if (err) {
					logger.error(err);
				}
				var count = 0;
				if (aggregation && aggregation.length > 0 && aggregation[0].count && !isNaN(aggregation[0].count)) count = aggregation[0].count;
				

				db.MailingListModel
				.findOne({ dataset: datasetid, _id: maillistid }, { sendTo: { $slice: [skip, take] } })
				.populate("sendTo", "-raw -__v")
				.exec(function (err, mailingList) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!mailingList) {
						return res.send(404);
					}

					var persons = [];

					async.each(mailingList.sendTo, function(person, callback) {
						if (failedOnly === true) {
							for (var i = 0; i < person.mailAddresses.length; i++) {
								if (person.mailAddresses[i].state === 1 || person.mailAddresses[i].state === 2) {
									return callback();
								}
							}
						}

						persons.push(person);

						db.CompanyModel.findOne({ dataset: datasetid, _id: person.company }, { raw: 0,  "__v": 0 }, function(err, company) {
							if (company) {
								person.company = company;
							}

							callback(err);
						});
					}, function(err) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						mailingList.persons = undefined;

						var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

						return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: persons.length, total: failedOnly === true ? 0 : count, results: persons, mailingList: mailingList });
					});
				});
			});
		},

		getPersonsAddressedFailed: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;
			var failedOnly = req.param("failedOnly", false);
			if (failedOnly === "true") failedOnly = true;

			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);

			db.MailingListModel
			.findOne({ dataset: datasetid, _id: maillistid }, function(err, mailingList) {
				db.PersonModel
				.aggregate([
					{ $match: { '_id' : { $in: mailingList.sendTo } } },
				    { $unwind: "$mailAddresses" },
				    { $group: { 
				        _id: '$_id', 
				        all: { $sum: 1 },
				        all_withMatchingStates: { $sum: { $cond: [ { $not: { $or: [{ $eq: [ '$mailAddresses.state', 1 ] }, { $lte: [ '$mailAddresses.state', 2 ] }] } }, 1, 0 ] } },
				    } },
				    { $project: {
				        _id: 1,
				        same: { $cond: [ { $eq: [ '$all', '$all_withMatchingStates' ] }, 1, 0 ] }
				    } },
				    { $match: { 'same' : 1 } },
				    { $group: {
				    	_id: null, 
				    	total: { $sum: 1 }, 
				    	data: { $addToSet:'$_id' } } 
				   	}
				])
				.exec(function (err, aggregation) {
					if (err) {
						logger.error(err);
					}

					if (!aggregation || aggregation.length <= 0) {
						return res.send(500);
					}

					aggregation = aggregation[0];
					
					db.PersonModel
					.find({ dataset: datasetid, _id: { $in: aggregation.data } })
					.skip(skip)
					.limit(take)
					.exec(function(err, persons) {
						logger.log(aggregation.data.length);
						async.each(persons, function(person, callback) {
							db.CompanyModel.findOne({ dataset: datasetid, _id: person.company }, { raw: 0,  "__v": 0 }, function(err, company) {
								if (company) {
									person.company = company;
								}

								callback(err);
							});
						}, function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}

							mailingList.persons = undefined;

							var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

							logger.log({take: take, skip: skip, count: persons.length, total: aggregation.total});

							return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: persons.length, total: aggregation.total, results: persons, mailingList: mailingList });
						});
					});
				});
			});
		},

		getMailingListItems: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;

			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);
			
			db.MailingListModel
			.aggregate([
				{ $match: { _id: new mongoose.Types.ObjectId(maillistid), dataset: new mongoose.Types.ObjectId(datasetid) } }, 
				{ $project: { count: { $size: "$preparedMails" } } }
			], function (err, aggregation) {
				if (err) {
					logger.error(err);
				}
				var count = 0;
				if (aggregation && aggregation.length > 0 && aggregation[0].count && !isNaN(aggregation[0].count)) count = aggregation[0].count;
				
				db.MailingListModel
				.findOne({ "_id": maillistid, "dataset": datasetid }, { __v: 0, preparedMails: { $slice: [skip, take] } })
				.populate("preparedMails", "-__v")
				.exec(function(err, doc) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!doc) {
						return res.send(404);
					}

					var preparedMails = new Array(doc.preparedMails.length);
					var i = 0;

					db.MailModel.aggregate([{ $match : { "_id": { $in: doc.sentMails } } },
					{ $project: { bounced: { $eq: ["$bounced", true] } } },
					{ $group : { _id: "$bounced", count: { $sum: 1 } } }], function(err, bouncedNotBounced) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						if (!bouncedNotBounced) {
							return res.send(500);
						}

						logger.error("a: " + bouncedNotBounced);

						for (var i = 0; i < bouncedNotBounced.length; i++) {
							if (bouncedNotBounced[i]._id === true) {
								doc.bouncedCount = bouncedNotBounced[i].count;
							}
							else if (bouncedNotBounced[i]._id === true) {
								doc.notBouncedCount = bouncedNotBounced[i].count;
							}
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
								preparedMails[i] = preparedMail;
								i++;

								callback();
							});
						}, function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}

							doc.preparedMails = undefined;

							var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
							return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: preparedMails.length, total: count, results: preparedMails, mailingList: doc });
							//return res.json(doc);
						})
					});
				});
			});
		},

		setMailingList: function(req, res, next) {
			return res.send(200);
		},

		deleteMailingListItem: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;
			var mailid = req.params.mailid;

			db.MailingListModel.findOne({ dataset: datasetid, _id: maillistid }, { __v: 0 })
			.exec(function(err, maillist) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!maillist) {
					return res.send(404);
				}

				db.MailModel.findOne({ dataset: datasetid, _id: mailid }, { __v: 0 })
				.exec(function(err, mail) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!mail) {
						return res.send(404);
					}

					mail.remove(function(err) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						maillist.preparedMails.pull(mailid);

						maillist.save(function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}

							return res.send(200);
						});
					});
				});
			});
		},

		updateMailingListItem: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.maillistid;
			var mailid = req.params.mailid;

			var data = req.body;

			db.MailModel.findOne({ dataset: datasetid, _id: mailid }, { __v: 0 })
			.populate("person", "-__v -raw")
			.exec(function(err, mail) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!mail || !mail.person) {
					return res.send(404);
				}

				mail.subject = data.subject;
				mail.body = data.body;
				mail.person.firstName = data.firstName;
				mail.person.lastName = data.lastName;
				mail.person.title = data.title;
				mail.person.gender = data.gender;
				mail.person.position = data.position;
				mail.person.departement = data.departement;

				mail.person.save(function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					mail.save(function(err) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						return res.send(200);
					});
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
				logger.log("count:" + count);
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
									logger.error(err);
									callbackDeep();
									return;
								}

								person.company = company;
								return callbackDeep();
							});
						}, function(err) {
							if (err) {
								logger.error(err);
								callback(err);
								return res.send(500);
							}
							else {
								callback();
							}
						});
					}, function(err) {
						if (err) {
							logger.error(err);
							callback(err);
							return res.send(500);
						}
						else {
							var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

							return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
						}
					});
					*/

					async.each(docs, function(doc, callback) {
						db.MailModel.aggregate([
							{ $match : { "_id": { $in: doc.sentMails } } },
							{ $project: { bounced: { $eq: ["$bounced", true] } } },
							{ $group : { _id: "$bounced", count: { $sum: 1 } } }], 
							function(err, bouncedNotBounced) {
							if (err) {
								return callback(err);
							}

							if (!bouncedNotBounced) {
								return callback();
							}

							for (var i = 0; i < bouncedNotBounced.length; i++) {
								if (bouncedNotBounced[i]._id === true) {
									doc["bouncedCount"] = bouncedNotBounced[i].count;
								}
								else if (bouncedNotBounced[i]._id === false) {
									doc["notBouncedCount"] = bouncedNotBounced[i].count;
								}
							}

							callback();
						});
					}, function(err) {
						if (err) {
							logger.error(err);
						}

						var results = [];
						for (var i = 0; i < docs.length; i++) {
							results.push(docs[i].toObject());
							results[i].bouncedCount = docs[i].bouncedCount;
							results[i].notBouncedCount = docs[i].notBouncedCount;
						}

						var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
						return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: results.length, total: count, results: results });
					});
				});
			});
		}
	};
};