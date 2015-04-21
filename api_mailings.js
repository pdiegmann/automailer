var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

var exec = require('child_process').exec;
var Imap = require('imap');
var MailParser = require("mailparser").MailParser;

module.exports = function(db) {
	return {
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
			for (var i = 0; i < mailSettings.sender.settings.includeAddressStates.length; i++) {
				mailSettings.sender.settings.includeAddressStates[i] = mailSettings.sender.settings.includeAddressStates[i] === "true" || mailSettings.sender.settings.includeAddressStates[i] === "on" ? true : false;
			}

			mailSettings.sender.smtp.port = parseInt(mailSettings.sender.smtp.port);
			mailSettings.sender.smtp.ssl = mailSettings.sender.smtp.ssl === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.tls = mailSettings.sender.smtp.tls === "true" || mailSettings.sender.smtp.ssl === "on" ? true : false;
			mailSettings.sender.smtp.quota.numberOfMails = parseInt(mailSettings.sender.smtp.quota.numberOfMails);
			mailSettings.sender.smtp.quota.perTimeFrame = parseInt(mailSettings.sender.smtp.quota.perTimeFrame);

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

			db.PersonModel.find(query, { raw: 0, title: 0, firstName: 0, lastName: 0, location: 0, departement: 0, position: 0, created: 0, updated: 0, mailAddresses: 0,  telephone: 0, company: 0, active: 0, dataset: 0, "__v": 0 }, function (err, docs) {
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

							mailSettings.mailingListId = mailingList._id;

							var child = exec('node proc_mailings.js', { env: { options: JSON.stringify(mailSettings) } });
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
		},

		fetchIMAP: function(req, res, next) {
			var mails = [];
			var start = process.hrtime();

			var parsingFinishedCount = 0;
			var imapCMDsRunning = 0;
			var processingFinishedCount = 0;
			var mailsReceivedCount = 0;
			var allMailsReceived = false;

			var datasetid = req.params.datasetid;

			var mailparser = new MailParser({ streamAttachments: false });

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

			var checkForReturn = function(force) {
				console.log("processed: " + processingFinishedCount + " / " + mailsReceivedCount + " parsed: " + parsingFinishedCount + " / " + mailsReceivedCount + " imap CMDs running: " + imapCMDsRunning + " all received: " + allMailsReceived + " force: " + force);
				if ((force && force === true) || (allMailsReceived === true && parsingFinishedCount >= mailsReceivedCount && processingFinishedCount >= mailsReceivedCount) && imapCMDsRunning <= 0) {
					try { imap.end(); }
					catch (e) { console.error(e); }
					var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
					return res.send(200);
				}
			};

			imap.once('ready', function() {
				imap.openBox('INBOX', false, function(err, box) {
					if (err) {
						console.error(err);
						try { imap.end(); }
						catch (e) { console.error(e); }
						return res.send(500);
					}

					imap.search([ (settings.imap.unseenOnly === true ? 'UNSEEN' : 'ALL'), ['SINCE', 'January 01, 2015'] ], function(err, results) {
						if (err) {
							console.error(err);
							try { imap.end(); }
							catch (e) { console.error(e); }
							return res.send(500);
						}

						if (!results || results.length <= 0) {
							return res.send(200);
						}

						var f = imap.fetch(results, { bodies: '', markSeen: true });

						f.on('message', function(msg, seqno) {
							mailsReceivedCount++;
							var prefix = '(#' + seqno + ') ';

							msg.on('body', function(stream, info) {
								console.log(prefix + 'Body');

								mailparser.on("end", function(mail) {
									mail.deliveryFailed = false;

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
										mailIdCandidate = ids[0].replace(/[^a-z0-9]/gi, "");
										maillistIdCandidate = ids[1].replace(/[^a-z0-9]/gi, "");
										datasetIdCandidate = ids[2].replace(/[^a-z0-9]/gi, "");

										if (!mailIdCandidate || mailIdCandidate.length <= 0) mailIdCandidate = undefined;
										if (!maillistIdCandidate || maillistIdCandidate.length <= 0) maillistIdCandidate = undefined;
										if (!datasetIdCandidate || datasetIdCandidate.length <= 0) datasetIdCandidate = undefined;
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
														mail.from = {
															name: "",
															address: failedAddress
														};
													}
													mail.deliveryFailed = true;
													if (contents.length > 0) contents += "\n\n----\n\n";
													contents += content;
												}
											}
											else {
												var content = attachment.content.toString();
											}
										}
									}

									processingFinishedCount++;

									db.MailModel.findOne({ "dataset": datasetid, "_id": mailIdCandidate }, function (err, originalMail) {
										if (err) {
											console.error(err);
										}

										if (!originalMail) {
											return checkForReturn();
										}

										db.MailModel.findOne({ "dataset": datasetid, "externalId": "" + (msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno) }, function (err, oldResponse) {
											if (err) {
												console.error(err);
											}

											var response = oldResponse ? oldResponse : new db.MailModel();

											response.from = mail.from[0].address;
											response.to = mail.to[0].address;
											response.subject = mail.subject;
											response.received = mail.date;
											response.dataset = datasetid;
											response.body = contents;
											response.externalId = msg.attributes && msg.attributes.uid ? msg.attributes.uid : seqno;

											response.save(function(err) {
												if (err) {
													console.error(err);
												}

												db.MailingListModel.findOne({ "dataset": datasetid, "_id": maillistIdCandidate }, function(err, mailingList) {
													if (err) {
														console.error(err);
													}

													if (!mailingList) {
														console.log("no mailing list");
														return;
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
																console.error(err);
															}
														});
													}
												});

												if (originalMail) {
													response.person = originalMail.person;
													response.responseTo = originalMail._id;

													response.save(function(err) {
														if (err) {
															console.error(err);
														}

														return checkForReturn();
													});

													db.PersonModel.findOne({ "dataset": datasetid, "_id": originalMail.person }, function(err, person) {
														if (err) {
															console.error(err);
														}

														if (!person || !person.mailAddresses) {
															return;
														}

														for (var i = 0; i < person.mailAddresses.length; i++) {
															if (person.mailAddresses[i].address === mail.from[0].address) {
																person.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;
																break;
															}
														}

														person.save(function(err) {
															if (err) {
																console.error(err);
															}
														});
													});
												}
												else {
													db.PersonModel.find({ "dataset": datasetid, "mailAddresses.address": mail.from[0].address }, function(err, persons) {
														if (err) {
															console.error(err);
														}

														if (!persons) {
															return;
														}

														for (var j = 0; j < persons.length; j++) {
															var person = persons[j];
															if (!person || !person.mailAddresses) {
																continue;
															}

															for (var i = 0; i < person.mailAddresses.length; i++) {
																if (person.mailAddresses[i].address === mail.from.address) {
																	person.mailAddresses[i].state = mail.deliveryFailed === true ? 3 : 2;

																	response.person = person._id;
																	response.save(function(err) {
																		if (err) {
																			console.error(err);
																		}
																	});

																	break;
																}
															}

															person.save(function(err) {
																if (err) {
																	console.error(err);
																}
															});
														}
													});

													return checkForReturn();
												}
											});
										});
									});
								});

								stream.pipe(mailparser);
							});
							
							msg.once('attributes', function(attrs) {
								msg.attributes = attrs;
							});
							
							msg.once('end', function() {
								console.log(prefix + 'Finished');
								parsingFinishedCount++;
								return checkForReturn();
							});
						});
						
						f.once('error', function(err) {
							console.log('Fetch error: ' + err);
							return res.send(500);
						});

						f.once('end', function() {
							console.log('Done fetching all messages!');
							allMailsReceived = true;
							return checkForReturn();
						});
					});
				});
			});

			imap.once('error', function(err) {
				console.log(err);
				return res.send(500);
			});

			imap.once('end', function() {
				console.log('Connection ended');
				return checkForReturn(true);
			});

			imap.connect();
		},

		stringArrayToRegexArray: function(strArray) {
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
		},

		stringArrayToNumberArray: function(strArray) {
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
	};
};