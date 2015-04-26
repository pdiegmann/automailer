var mongoose = require("mongoose");
var logger = require('tracer').colorConsole();
var email   = require("emailjs");
var async = require('async');
var _ = require("underscore");
var os = require("os");

/******
	MODELS
*****/
var dbconnection = mongoose.connect("mongodb://127.0.0.1:27017/automailer");
var DatasetModel = require("./models/Dataset")(dbconnection);
var MailModel = require("./models/Mail")(dbconnection);
var MailingListModel = require("./models/MailingList")(dbconnection);
var MailTemplateModel = require("./models/MailTemplate")(dbconnection);
var PersonModel = require("./models/Person")(dbconnection);
var CompanyModel = require("./models/Company")(dbconnection);

var sender = {
	address: "",
	name: "",
	smtp: {
		server: "smtp-auth.uni-koeln.de",
		port: 587,
		ssl: false,
		tls: true, // STARTTLS
		username: "",
		password: "",
		quota: { // S-Mail: 900 Mails / 10 Minutes according to RRZK
			numberOfMails: 900,
			perTimeFrame: 10 * 60 * 1000
		}
	},
	settings: {
		includeAddressStates: [],
		sequential: false
	}
};

var options = JSON.parse(process.env.options);

var datasetId = options.datasetId;
var mailingListId = options.mailingListId;

sender.name = options.sender.name || sender.name;
sender.address = options.sender.address || sender.address;
if (!sender.settings) sender.settings = {};
sender.settings.sequential = options.sender.settings.sequential || sender.settings.sequential;

for (var i = 0; i < options.sender.settings.includeAddressStates.length; i++) {
	sender.settings.includeAddressStates[i] = options.sender.settings.includeAddressStates[i];
}

if (!sender.smtp) sender.smtp = {};
sender.smtp.server = options.sender.smtp.server || sender.smtp.server;
sender.smtp.port = options.sender.smtp.port || sender.smtp.port;
sender.smtp.ssl = options.sender.smtp.ssl || sender.smtp.ssl;
sender.smtp.tls = options.sender.smtp.tls || sender.smtp.tls;
sender.smtp.username = options.sender.smtp.username || sender.smtp.username;
sender.smtp.password = options.sender.smtp.password || sender.smtp.password;
if (!sender.smtp.quota) sender.smtp.quota = {};
sender.smtp.quota.numberOfMails = options.sender.smtp.quota.numberOfMails || sender.smtp.quota.numberOfMails;
sender.smtp.quota.perTimeFrame = options.sender.smtp.quota.perTimeFrame || sender.smtp.quota.perTimeFrame;

console.log(sender);

var smtpServer;
var mailsSent = 0;
var mailsFinished = 0;
var startingSendMails = 0;

var currentlySleeping = false;
var checkingForMails = false;

function connectToSmtpServer() {
	smtpServer = email.server.connect({
		user: sender.smtp.username,
		password: sender.smtp.password,
		host: sender.smtp.server,
		ssl: sender.smtp.ssl,
		tls: sender.smtp.tls,
		port: sender.smtp.port
	});
	console.log(smtpServer);
}

function processMailings() {
	MailingListModel.findOne({ "_id": mailingListId, dataset: datasetId, sendTo: { $not: { $size: 0 } } }, { "__v": 0 })
	.populate("preparedMails", "-__v")
	.exec(function(err, mailingList) {
		if (err) {
			console.error(err);
			throw err;
			return;
		}

		if (!mailingList) {
			console.log("No Mailing List found");
			console.log("96: finished: " + mailsFinished + " sleeping: " + currentlySleeping);
			process.exit();
			return;
		}

		console.log("Mailing List has " + mailingList.sendTo.length + " receivers (persons)");
		async.eachSeries(mailingList.preparedMails, function (mail, callback) {
			console.log("Processing Mail to " + mail.to);
			var message = {
				text: mail.body.replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, ""), 
				from: mail.from,
				"reply-to": mail.from,
				to: "mail@phildiegmann.com", //mail.to,
				subject: mail.subject,
				"message-id": "<" + mail._id + "." + mailingListId + "." + datasetId + "@" + os.hostname() +">", 
				attachment: [
					{ 
						data: mail.body, 
						alternative: true 
					}
				]
			};

			if (smtpServer) {
				mailsSent++;

				if (startingSendMails <= 0) startingSendMails = new Date().getTime();
				smtpServer.send(message, function(err, message) {
					try {
						if (err) {
							mailsFinished++;
							console.error(err);
							return callback();
						}
						else {
							mail.sent = Date.now();
							mail.save(function(err) {
								if (err) {
									console.error(err);
								}

								if (!mailingList.sentMails) mailingList.sentMails = [];
								mailingList.sentMails.push(mail._id);
								mailingList.preparedMails.remove(mail._id);

								mailingList.save(function(err) {
									if (err) {
										console.error(err);
									}

									mail.populate("person", "-__v -raw", function(err, mail) {
										var addressFound = false;
										for (var i = 0; i < mail.person.mailAddresses.length; i++) {
											if (mail.person.mailAddresses[i].address === mail.to) {
												if (mail.person.mailAddresses[i].state === 0) {
													addressFound = true;
													mail.person.mailAddresses[i].state = 1;
													mail.person.save(function(err) {
														if (err) {
															console.error(err);
														}

														mailsFinished++;

														if (mailsFinished >= mailsSent && currentlySleeping === false && checkingForMails === false) {
															console.log("97: finished: " + mailsFinished + " sleeping: " + currentlySleeping);
															process.exit();
														}
													});
												}

												break;
											}
										}

										if (!addressFound) {
											mailsFinished++;

											if (mailsFinished >= mailsSent && currentlySleeping === false && checkingForMails === false) {
												console.log("98: finished: " + mailsFinished + " sleeping: " + currentlySleeping);
												process.exit();
											}
										}
									});
								});

								console.log("Timeout? (" + mailsSent + " / " + sender.smtp.quota.numberOfMails + " | " + sender.smtp.quota.perTimeFrame + ")");
								if (sender.smtp.quota && sender.smtp.quota.numberOfMails && sender.smtp.quota.perTimeFrame && !isNaN(sender.smtp.quota.perTimeFrame) && !isNaN(sender.smtp.quota.numberOfMails) && sender.smtp.quota.numberOfMails > 0 && mailsSent >= sender.smtp.quota.numberOfMails) {
									var resumingAllowed = startingSendMails + sender.smtp.quota.perTimeFrame * 1000 + 2000;
									var timeToSleep = Math.max(resumingAllowed - new Date().getTime(), 2000);
									if (timeToSleep < 2000) timeToSleep = sender.smtp.quota.perTimeFrame * 1000;
									console.log("time to sleep: " + timeToSleep)

									currentlySleeping = true;

									return setTimeout(function() {
										checkingForMails = true;
										mailsSent = 0;
										startingSendMails = 0;
										callback();
										currentlySleeping = false;
									}, timeToSleep);
								}
								else {
									callback();
								}
							});
						}
					}
					catch (e) {
						console.error(e);
						callback();
					}
				});
			}
			else {
				callback();
			}
		}, function (err) {
			if (err) {
				console.error(err);
			}

			if (currentlySleeping === false) checkingForMails = false;

			if (mailsFinished >= mailsSent && currentlySleeping === false) {
				console.log("99: finished: " + mailsFinished + " sleeping: " + currentlySleeping);
				process.exit();
			}
		});
	});
}

console.log("connecting to server...");
connectToSmtpServer();
console.log("processing mailings...");
processMailings();