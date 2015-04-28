var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

var _ = require("underscore");
var exec = require('child_process').exec;
var Imap = require('imap');
var MailParser = require("mailparser").MailParser;

module.exports = function(db) {
	return {
		stockUpMails: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var maillistid = req.params.mailinglistid;

			var parameters = {
				"sender": {
			    	"name": "",
			    	"address": ""
				},
				"settings": {
					"includeAddressStates": [true, false, false, false],
					"sequential": false
				}
			};

			parameters = req.body.mail || parameters;
			parameters.settings.sequential = parameters.settings.sequential === "true" || parameters.settings.sequential === "on" ? true : false;
			parameters.settings.randomPersonSelection = parameters.settings.randomPersonSelection === "true" || parameters.settings.randomPersonSelection === "on" ? true : false;
			for (var i = 0; i < parameters.settings.includeAddressStates.length; i++) {
				parameters.settings.includeAddressStates[i] = parameters.settings.includeAddressStates[i] === "true" || parameters.settings.includeAddressStates[i] === "on" ? true : false;
			}

			db.MailingListModel.findOne({ "_id": maillistid, dataset: datasetid, sendTo: { $not: { $size: 0 } } }, { "__v": 0 })
			.populate("preparedMails", "-__v")
			.populate("sendTo", "-__v -raw")
			.exec(function(err, mailingList) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!mailingList) {
					logger.log("no Mail List found");
					return res.send(404);
				}

				if (parameters.settings.randomPersonSelection === true) {
					global.shuffleArray(mailingList.sendTo);
				}

				async.eachSeries(mailingList.sendTo, function(receiver, callback) {
					logger.log("going for " + receiver.firstName + " " + receiver.lastName);
					var done = false;
					var i = 0;
					async.until(function() { return done; }, function(callback) {
						if (i >= receiver.mailAddresses.length) {
							done = true;
							logger.log("iterated all addresses");
							return callback();
						}

						var mailAddress = receiver.mailAddresses[i];
						logger.log("searching for " + mailAddress.address);
						i++;

						db.MailModel.find({ dataset: datasetid, person: receiver._id, inMailingList: maillistid, to: new RegExp(mailAddress.address, "i"), bounced: true }, function(err, mails) {
							if (err || !mails || mails.length <= 0) { 
								logger.log("no bounced mail this time");
								if (err) logger.error(err);
								return callback();
							}

							var nextAddress;

							async.eachSeries(receiver.mailAddresses, function(nextMailAddressCandidate, callback) {
								if (nextAddress || !nextMailAddressCandidate) return callback();
								if (parameters.settings.includeAddressStates[nextMailAddressCandidate.state] !== true) return callback();
								nextAddress = nextMailAddressCandidate;
								callback();
							}, function(err) {
								if (err) {
									logger.error(err);
								}

								if (!nextAddress || !nextAddress.address || nextAddress.address.length <= 0) {
									return callback();
								}

								db.CompanyModel.findOne({ dataset: datasetid, active: true, _id: receiver.company }, { __v: 0, raw: 0 }, function(err, company) {
									if (err) {
										logger.error(err);
										return callback();
									}

									if (!company) {
										logger.log("no company");
										return callback();
									}

									receiver.company = company;

									logger.log("Preparing mail to " + nextAddress.address);

									var mail = new db.MailModel();
									
									mail.body = _.template(mailingList.template.content)({
										"sender": { name: mailingList.from.name, address: mailingList.from.address },
										"receiver": receiver.toJSON()
									});

									mail.subject = _.template(mailingList.template.subject)({
										"sender": { name: mailingList.from.name, address: mailingList.from.address },
										"receiver": receiver.toJSON()
									});

									mail.to = nextAddress.address;
									mail.from = ((mailingList.from.name && mailingList.from.name.length > 0) ? ("\"" + mailingList.from.name + "\" ") : "") + "<" + mailingList.from.address + ">";
									mail.person = receiver._id;
									mail.dataset = datasetid;
									mail.inMailingList = maillistid;

									mail.save(function(err) {
										if (err) {
											done = true;
											return callback(err);
										}
										else {
											if (!mailingList.preparedMails) mailingList.preparedMails = [];
											mailingList.preparedMails.push(mail);
											mailingList.save(function(err) {
												done = true;
												callback(err);
											});
										}
									});
								});
							});
						});
					}, callback);
				}, function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}
					else {
						return res.send(200);
					}
				})
			});
		},

		prepareMailingList: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var templateid = req.params.templateid;

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

			var executive = req.body.executive || { departement: "", position: "" };
			var company = req.body.company || { name: "", employees: { gt: -1, lt: -1 }, branch: { USSIC: -1, NACE: -1 } };
			company.employees.gt = parseInt(company.employees.gt);
			company.employees.lt = parseInt(company.employees.lt);
			company.branch.NACE = parseInt(company.branch.NACE);
			company.branch.USSIC = parseInt(company.branch.USSIC);

			parameters = req.body.mail || parameters;
			parameters.settings.sequential = parameters.settings.sequential === "true" || parameters.settings.sequential === "on" ? true : false;
			parameters.settings.randomPersonSelection = parameters.settings.randomPersonSelection === "true" || parameters.settings.randomPersonSelection === "on" ? true : false;
			for (var i = 0; i < parameters.settings.includeAddressStates.length; i++) {
				parameters.settings.includeAddressStates[i] = parameters.settings.includeAddressStates[i] === "true" || parameters.settings.includeAddressStates[i] === "on" ? true : false;
			}
			parameters.settings.skip = parseInt(parameters.settings.skip);
			parameters.settings.take = parseInt(parameters.settings.take);

			var departements = global.stringToRegexQuery(executive.departement);
			var positions = global.stringToRegexQuery(executive.position);
			var locations = global.stringToRegexQuery(executive.location);

			var subQueries = [];
			if (departements) {
				subQueries.push({ "departement": departements });
			}
			if (positions) {
				subQueries.push({ "position": positions });
			}
			if (locations) {
				subQueries.push({ "location": locations });
			}

			var query;
			if (subQueries.length > 0) {
				query = { dataset: datasetid, "active": true, $and: subQueries };
			}
			else {
				query = { dataset: datasetid, "active": true };
			}

			logger.log(JSON.stringify(query));

			var personIdsToContact = [];

			db.PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, docs) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!docs)
					return res.send(500);

				var personIds = [];
				for (var i in docs) {
					if (docs[i] && docs[i]._id && docs[i]._id.length <= 0) continue;
					personIds.push(docs[i]._id);
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
					queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true, $or: orQueriesCompany}
				else
					queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true}

				logger.log("skip: " + parameters.settings.skip + " take: " + parameters.settings.take);
				db.CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 })
				.skip(parameters.settings.skip)
				.limit(parameters.settings.take)
				.sort({ "orderNr": 1 })
				.exec(function(err, docs) {
					if (err) {
						logger.error(err);
					}

					if (!docs || docs.length <= 0) {
						logger.error("no companies found!");
					}

					for (var i in docs) {
						var company = docs[i];
						if (!company || !company.executives || company.executives.length <= 0) continue;
						
						for (var k = 0; k < company.executives.length; k++) {
							var positionsToDelete = [];
							var personFound = false;
							for (var j = 0; j < personIds.length; j++) {
								if ((personIds[j] + "") === company.executives[k] + "") {
									positionsToDelete.push(j);
									personIdsToContact.push(personIds[j]);
									personFound = true;
									break;
								}	
							}

							if (parameters.settings.randomPersonSelection === true && personFound) {
								break;
							}

							for (var j in positionsToDelete) {
								personIds.splice(j, 1);
							}
						}
					}

					db.MailTemplateModel.findOne({ "_id": templateid, "dataset": datasetid }, { __v: 0 }).exec(function(err, doc) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						if (!doc) {
							return res.send(404);
						}

						var mailingList = new db.MailingListModel();
						mailingList.sendTo = personIdsToContact;
						mailingList.dataset = datasetid;
						mailingList.from = {
							address: parameters.sender.address,
							name: parameters.sender.name
						};
						mailingList.template = {
							content: doc.content,
							subject: doc.subject
						};

						mailingList.save(function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}

							if (parameters.settings.randomPersonSelection === true) {
								global.shuffleArray(mailingList.sendTo);
							}

							async.eachSeries(mailingList.sendTo, function (receiver, callback) {
								db.PersonModel.findOne({ "dataset": datasetid, "active": true, "_id": receiver }, { __v: 0, raw: 0 }, function(err, receiver) {
									if (err) {
										return callback(err);
									}

									logger.log("Processing " + receiver.firstName + " " + receiver.lastName);

									receiver.populate("company", "-__v -raw", function(err, receiver) {
										if (err) {
											return callback(err);
										}

										var countProcessedMailAddresses = 0;
										async.eachSeries(receiver.mailAddresses, function (mailAddress, callback) {
											if (parameters.settings.includeAddressStates[mailAddress.state] !== true) return callback();
											if (parameters.settings.sequential === true && countProcessedMailAddresses > 0) return callback();

											logger.log("Preparing mail to " + mailAddress.address);

											var mail = new db.MailModel();
											
											mail.body = _.template(mailingList.template.content)({
												"sender": { name: parameters.sender.name, address: parameters.sender.address },
												"receiver": receiver.toJSON()
											});

											mail.subject = _.template(mailingList.template.subject)({
												"sender": { name: parameters.sender.name, address: parameters.sender.address },
												"receiver": receiver.toJSON()
											});

											mail.to = mailAddress.address;
											mail.from = ((parameters.sender.name && parameters.sender.name.length > 0) ? ("\"" + parameters.sender.name + "\" ") : "") + "<" + parameters.sender.address + ">";
											mail.person = receiver._id;
											mail.dataset = mailingList.dataset;
											mail.inMailingList = mailingList._id;
											mail.save(function(err) {
												if (err) {
													return callback(err);
												}
												else {
													countProcessedMailAddresses++;
													if (!mailingList.preparedMails) mailingList.preparedMails = [];
													mailingList.preparedMails.push(mail);
													mailingList.save(callback);
												}
											});
										}, callback);
									});
								});
							}, function (err) {
								if (err) {
									logger.error(err);
									return res.send(500);
								}
								else {
									return res.send(200);
								}
							});
						});
					});
				});
			});
		},

		sendToFilter: function(req, res, next) {
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
			parameters.settings.randomPersonSelection = parameters.settings.randomPersonSelection === "true" || parameters.settings.randomPersonSelection === "on" ? true : false;
			for (var i = 0; i < mailSettings.sender.settings.includeAddressStates.length; i++) {
				mailSettings.sender.settings.includeAddressStates[i] = mailSettings.sender.settings.includeAddressStates[i] === "true" || mailSettings.sender.settings.includeAddressStates[i] === "on" ? true : false;
			}

			mailSettings.sender.smtp.port = parseInt(mailSettings.sender.smtp.port);
			mailSettings.sender.smtp.ssl = mailSettings.sender.smtp.ssl === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.tls = mailSettings.sender.smtp.tls === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.quota.numberOfMails = parseInt(mailSettings.sender.smtp.quota.numberOfMails);
			mailSettings.sender.smtp.quota.perTimeFrame = parseInt(mailSettings.sender.smtp.quota.perTimeFrame);

			var departements = global.stringToRegexQuery(executive.departement);
			var positions = global.stringToRegexQuery(executive.position);
			var locations = global.stringToRegexQuery(executive.location);

			var orQueries = [];
			if (departements && departements.length > 0) {
				orQueries.push({ "departement": { $in : departements } });
			}
			if (positions && positions.length > 0) {
				orQueries.push({ "position": { $in : positions } });
			}
			if (positions && positions.length > 0) {
				orQueries.push({ "location": { $in : positions } });
			}

			var query;
			if (orQueries.length > 0) {
				query = { dataset: datasetid, "active": true, $or: orQueries };
			}
			else {
				query = { dataset: datasetid, "active": true };
			}

			var personIdsToContact = [];

			db.PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, docs) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!docs)
					return res.send(500);

				var personIds = [];
				for (var i in docs) {
					if (docs[i] && docs[i]._id && docs[i]._id.length <= 0) continue;
					personIds.push(docs[i]._id);
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
					queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true, $or: orQueriesCompany}
				else
					queryCompany = { dataset: datasetid, executives: { $in: personIds }, "active": true}

				db.CompanyModel.find(queryCompany, { "raw": 0, "__v": 0 }, function(err, docs) {
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

					db.MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						if (!doc) {
							return res.send(404);
						}

						var mailingList = new db.MailingListModel();

						if (parameters.settings.randomPersonSelection === true) {
							global.shuffleArray(personIdsToContact);
						}

						mailingList.sendTo = personIdsToContact;
						mailingList.dataset = datasetid;
						mailingList.from = {
							address: parameters.sender.address,
							name: parameters.sender.name
						};
						mailingList.template = {
							content: doc.content,
							subject: doc.subject
						};

						mailingList.save(function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}

							mailSettings.mailingListId = mailingList._id;

							var child = exec('node proc_mailings.js', { env: { options: JSON.stringify(mailSettings) } });
							child.stdout.on('data', function(data) {
							    logger.log(data);
							});
							child.stderr.on('data', function(data) {
							    logger.log(data);
							});
							child.on('close', function(code) {
							    logger.log('closing code: ' + code);
							});

							return res.send(200);
						});
					});
				});
			});
		},

		sendUnsent: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var mailinglistid = req.params.mailinglistid;

			var mailSettings = {
				"mailingListId": mailinglistid,
				"datasetId": datasetid,
				"sender": {
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
				}
			};

			mailSettings.sender = req.body.mail || mailSettings.sender;
			mailSettings.sender.smtp.port = parseInt(mailSettings.sender.smtp.port);
			mailSettings.sender.smtp.ssl = mailSettings.sender.smtp.ssl === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.tls = mailSettings.sender.smtp.tls === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.quota.numberOfMails = parseInt(mailSettings.sender.smtp.quota.numberOfMails);
			mailSettings.sender.smtp.quota.perTimeFrame = parseInt(mailSettings.sender.smtp.quota.perTimeFrame);

			var child = exec('node proc_mailings.js', { env: { options: JSON.stringify(mailSettings) } });
			child.stdout.on('data', function(data) {
			    logger.log(data);
			});
			child.stderr.on('data', function(data) {
			    logger.log(data);
			});
			child.on('close', function(code) {
			    logger.log('closing code: ' + code);
			});

			return res.send(200);
		},

		fetchIMAP: function(req, res, next) {
			var mails = [];
			var start = process.hrtime();

			var datasetid = req.params.datasetid;

			var settings = req.param("mail");
			settings.imap.port = parseInt(settings.imap.port);
			settings.imap.ssl = settings.imap.ssl === "true" || settings.imap.ssl === "on" ? true : false;
			settings.imap.tls = settings.imap.tls === "true" || settings.imap.tls === "on" ? true : false;
			settings.imap.unseenOnly = settings.imap.unseenOnly === "true" || settings.imap.unseenOnly === "on" ? true : false;

			var imap = new Imap({
				user: settings.imap.username,
				password: settings.imap.password,
				host: settings.imap.server,
				tls: settings.imap.tls == true,
				port: settings.imap.port
			});

			var processMail = function(mail, msg, callback) {
				mail.deliveryFailed = false;
				logger.log("processing from: " + mail.from[0].address);

				var replyTo = mail.headers["inReplyTo"];
				if (!replyTo) replyTo = mail.headers["InReplyTo"];
				if (!replyTo) replyTo = mail.headers["inreplyto"];
				if (!replyTo) replyTo = mail.headers["in-reply-to"];
				if (!replyTo) replyTo = mail.headers["In-Reply-To"];
				if (!replyTo) replyTo = mail.headers["in-Reply-To"];

				var mailIdCandidate;
				var maillistIdCandidate;
				var datasetIdCandidate;
				var indexOfAt = replyTo ? replyTo.indexOf("@") : -1;
				if (replyTo && (replyTo.match(/\./g) || []).length >= 2 && indexOfAt >= 0) {
					var ids = replyTo.substr(0, indexOfAt).split(".");
					if (ids.length >= 3) {
						mailIdCandidate = ids[0].replace(/[^a-z0-9]/gi, "");
						maillistIdCandidate = ids[1].replace(/[^a-z0-9]/gi, "");
						datasetIdCandidate = ids[2].replace(/[^a-z0-9]/gi, "");

						if (!mailIdCandidate || mailIdCandidate.length <= 0) mailIdCandidate = undefined;
						if (!maillistIdCandidate || maillistIdCandidate.length <= 0) maillistIdCandidate = undefined;
						if (!datasetIdCandidate || datasetIdCandidate.length <= 0) datasetIdCandidate = undefined;
					}
				}

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
									mail.from = [{
										name: "",
										address: failedAddress
									}];
								}
								mail.deliveryFailed = true;
								if (contents.length > 0) contents += "\n\n----\n\n";
								contents += content;
							}
						}
						else {
							var content = attachment.content.toString();
							if ((!mailIdCandidate || !maillistIdCandidate || !datasetIdCandidate) && (content.indexOf("Message-Id") >= 0 || content.indexOf("Message-ID") >= 0 || content.indexOf("message-id") >= 0 || content.indexOf("MessageId") >= 0 || content.indexOf("MessageID") >= 0 || content.indexOf("messageid") >= 0)) {//attachment.contentType && attachment.contentType === "text/rfc822-headers")) {
								contents += content;
								var indexOfMessageId = content.indexOf("Message-Id");
								if (indexOfMessageId < 0) indexOfMessageId = content.indexOf("Message-ID");
								if (indexOfMessageId < 0) indexOfMessageId = content.indexOf("message-id");
								if (indexOfMessageId < 0) indexOfMessageId = content.indexOf("MessageId");
								if (indexOfMessageId < 0) indexOfMessageId = content.indexOf("MessageID");
								if (indexOfMessageId < 0) indexOfMessageId = content.indexOf("messageid");
								if (indexOfMessageId >= 0) {
									replyTo = content;
									content = content.substr(indexOfMessageId).split(">")[0].trim();
									content = content.split("<").pop().trim();

									var indexOfAt = content ? content.indexOf("@") : -1;
									if (indexOfAt >= 0) {
										var ids = content.substr(0, indexOfAt).split(".");
										if (ids.length < 3) {
											continue;
										}
										mailIdCandidate = ids[0].replace(/[^a-z0-9]/gi, "");
										maillistIdCandidate = ids[1].replace(/[^a-z0-9]/gi, "");
										datasetIdCandidate = ids[2].replace(/[^a-z0-9]/gi, "");

										if (!mailIdCandidate || mailIdCandidate.length <= 0) mailIdCandidate = undefined;
										if (!maillistIdCandidate || maillistIdCandidate.length <= 0) maillistIdCandidate = undefined;
										if (!datasetIdCandidate || datasetIdCandidate.length <= 0) datasetIdCandidate = undefined;

										if (datasetIdCandidate && datasetIdCandidate !== datasetid) return callback();
									}
								}
							}
						}
					}
				}

				db.MailModel.findOne({ "dataset": datasetid, "_id": mailIdCandidate }, function (err, originalMail) {
					if (err) {
						logger.error(mail.from[0].address + ": error");
						//logger.error(err);
						return callback();
					}

					if (!originalMail) {
						logger.error(mail.from[0].address + ": no originalMail! replyTo: " + replyTo);
						return callback();
					}

					originalMail.bounced = mail.deliveryFailed;

					originalMail.save(function(err) {
						if (err) {
							logger.error(err);
						}

						db.MailModel.findOne({ "dataset": datasetid, "externalId": "" + (msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno) }, function (err, oldResponse) {
							if (err) {
								logger.error(err);
							}

							var response = oldResponse ? oldResponse : new db.MailModel();

							response.from = mail.from[0].address;
							response.to = mail.to[0].address;
							response.subject = mail.subject;
							response.received = mail.date;
							response.dataset = datasetid;
							response.body = contents;
							response.externalId = msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno;
							response.inMailingList = maillistIdCandidate;

							response.save(function(err) {
								if (err) {
									logger.error(err);
									return callback();
								}

								async.series([function(callback) {
									db.MailingListModel.findOne({ "dataset": datasetid, "_id": maillistIdCandidate }, function(err, mailingList) {
										if (err) {
											logger.error(err);
											return callback();
										}

										if (!mailingList) {
											logger.log("no mailing list");
											return callback();
										}

										if (!mailingList.answers) mailingList.answers = [];
										var found = false;
										for (var k = 0; k < mailingList.answers.length; k++) {
											if (mailingList.answers[k] + "" == response._id + "") {
												found = true;
												break;
											}
										}

										if (!found) {
											mailingList.answers.push(response._id);
											mailingList.save(function(err) {
												if (err) {
													logger.error(err);
												}
												return callback();
											});
										}
										else {
											return callback();
										}
									});
								},
								function(callback) {
									if (originalMail) {
										response.person = originalMail.person;
										response.responseTo = originalMail._id;

										response.save(function(err) {
											if (err) {
												logger.error(err);
											}
											return callback();
										});
									}
									else {
										return callback();
									}
								},
								function(callback) {
									if (originalMail) {
										db.PersonModel.findOne({ "dataset": datasetid, "active": true, "_id": originalMail.person }, function(err, person) {
											if (err) {
												logger.error(err);
												return callback();
											}

											if (!person || !person.mailAddresses) {
												return callback();
											}

											for (var i = 0; i < person.mailAddresses.length; i++) {
												if (person.mailAddresses[i].address === mail.from[0].address) {
													person.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;
													break;
												}
											}

											person.save(function(err) {
												if (err) {
													logger.error(err);
												}
												return callback();
											});
										});
									}
									else {
										db.PersonModel.find({ "dataset": datasetid, "active": true, "mailAddresses.address": mail.from[0].address }, function(err, persons) {
											if (err) {
												logger.error(err);
												return callback();
											}

											if (!persons || persons.length <= 0) {
												return callback();
											}

											async.eachSeries(persons, function(person, callback) {
												if (!person || !person.mailAddresses) {
													return callback();
												}

												async.series([function(callback) {
													var found = false;
													for (var i = 0; i < person.mailAddresses.length; i++) {
														if (person.mailAddresses[i].address === mail.from.address) {
															found = true;
															person.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;

															response.person = person._id;
															response.save(function(err) {
																if (err) {
																	logger.error(err);
																}
																return callback();
															});

															break;
														}
													}
													
													if (!found) {
														return callback();
													}
												},
												function(callback) {
													person.save(function(err) {
														if (err) {
															logger.error(err);
															return callback();
														}
													});
												}], callback);
											}, callback);
										});
									}
								}], callback);
							});
						});
					});	
				});
			};

			var messagesProcessingInProcess = false;
			var messagesFetchedAndParsed = function() {
				if (messagesStillParsing > 0) return;
				if (messagesProcessingInProcess) return;
				messagesProcessingInProcess = true;

				var mailCount = mailsToProcess.length;
				logger.log('Done fetching ' + mailCount + ' messages!');

				var counter = 0;
				async.eachSeries(mailsToProcess, function(mailAndMsg, callback) {
					logger.log("processed " + counter + " / " + mailCount);
					processMail(mailAndMsg.mail, mailAndMsg.msg, callback);
					counter++;
				}, function(err) {
					try { imap.end(); }
					catch (e) { }

					var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
					logger.log("mails fetched and processsed in " + (elapsed / 1000).toFixed(2) + "s");

					if (err) {
						logger.error(err);
						return res.send(500);
					}

					return res.send(200);
				});
			};

			var mailsToProcess = [];

			var messagesStillParsing = 0;

			imap.once('ready', function() {
				imap.openBox('INBOX', false, function(err, box) {
					if (err) {
						logger.error(err);
						try { imap.end(); }
						catch (e) { logger.error(e); }
						return res.send(500);
					}

					imap.search([ (settings.imap.unseenOnly === true ? 'UNSEEN' : 'ALL'), ['SINCE', 'April 01, 2015'] ], function(err, results) {
						if (err) {
							logger.error(err);
							try { imap.end(); }
							catch (e) { logger.error(e); }
							return res.send(500);
						}

						if (!results || results.length <= 0) {
							return res.send(200);
						}

						var f = imap.fetch(results, { bodies: '', markSeen: true });

						f.on('message', function(msg, seqno) {
							msg.on('body', function(stream, info) {
								messagesStillParsing++;
								var mailparser = new MailParser({ streamAttachments: false });
								mailparser.on("end", function(mail) {
									mailsToProcess.push({ mail: mail, msg: msg });
									messagesStillParsing--;

									if (messagesStillParsing <= 0) {
										setTimeout(messagesFetchedAndParsed, 2500);
									}
								});

								stream.pipe(mailparser);
							});
							
							msg.once('attributes', function(attrs) {
								msg.attributes = attrs;
							});
							
							msg.once('end', function() {
								
							});
						});
						
						f.once('error', function(err) {
							logger.log('Fetch error: ' + err);
							return res.send(500);
						});

						f.once('end', function() {
							if (messagesStillParsing > 0) return;

							setTimeout(messagesFetchedAndParsed, 2500);
						});
					});
				});
			});

			imap.once('error', function(err) {
				logger.log(err);
				return res.send(500);
			});

			imap.once('end', function() {
				logger.log('Connection ended');
				return checkForReturn(true);
			});

			imap.connect();
		}
	};
};