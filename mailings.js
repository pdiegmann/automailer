var mongoose = require("mongoose");
var logger = require('tracer').colorConsole();
var email   = require("emailjs");
var async = require('async');
var _ = require("underscore");

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
	}
};

var options = JSON.parse(process.env.options);

var datasetId = options.datasetId;
var mailingListId = options.mailingListId;

sender.name = options.sender.name || sender.name;
sender.address = options.sender.address || sender.address;
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

console.log(JSON.stringify(sender));

console.log(((sender.name && sender.name.length > 0) ? ("\"" + sender.name.replace(",", "\\,") + "\"") : "") + " <" + sender.address + ">");

var smtpServer;
var mailsSent = 0;
var mailsFinished = 0;
var startingSendMails = 0;

function connectToSmtpServer() {
	smtpServer = email.server.connect({
		user: sender.smtp.username,
		password: sender.smtp.password,
		host: sender.smtp.server,
		ssl: sender.smtp.ssl,
		port: sender.smtp.port
	});
}

function processMailings() {
	MailingListModel.find({ "_id": mailingListId, dataset: datasetId, sendTo: { $not: { $size: 0 } } }, { "__v": 0 })
	.populate("sendTo", "-__v -raw")
	.exec(function(err, docs) {
		if (err) {
			console.error(err);
			throw err;
			return;
		}

		if (!docs || docs.length <= 0) {
			console.log("No Mailing Lists found");
			return;
		}

		console.log(docs.length + " Mailing Lists found");

		async.eachSeries(docs, function (mailingList, callback) {
			console.log("Mailing List has " + mailingList.sendTo.length + " receivers (persons)");
			async.eachSeries(mailingList.sendTo, function (receiver, callback) {
				console.log("Processing " + receiver.firstName + " " + receiver.lastName);
				var countProcessedMailAddresses = 0;
				async.eachSeries(receiver.mailAddresses, function (mailAddress, callback) {
					if (sender.settings.includeAddressStates[mailAddress.state] !== true) return callback();
					if (sender.settings.sequential === true && countProcessedMailAddresses > 0) return callback();

					console.log("Preparing mail to " + mailAddress.address);

					var mail = new MailModel();
					
					mail.body = _.template(mailingList.template.content, {
						"sender": { name: sender.name, address: sender.address },
						"receiver": receiver
					})();

					mail.subject = _.template(mailingList.template.subject, {
						"sender": { name: sender.name, address: sender.address },
						"receiver": receiver
					})();

					mail.to = mailAddress.address.indexOf("pdiegman") >= 0 || mailAddress.address.indexOf("phildiegman") >= 0 ? mailAddress.address : sender.address;
					mail.from = sender.address;
					mail.person = receiver._id;
					mail.dataset = mailingList.dataset;
					mail.save(function(err) {
						if (err) {
							console.error(err);
							return;
						}

						var message = {
							text: mailAddress.address + " | " + mail.body.replace(/<br\s*[\/]?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, ""), 
							from: (sender.name && sender.name.length > 0) ? ("\"" + sender.name.replace(",", "") + "\"") : "" + " <" + mail.from + ">",
							to: mail.to,
							subject: mail.subject,
							attachment: [
								{ 
									data: mailAddress.address + " | " + mail.body, 
									alternative: true 
								},
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
										if (mailsFinished >= mailsSent) {
											process.exit();
										}
									}
									else {
										console.log(message);
										mail.sent = Date.now();
										mail.save(function(err) {
											mailsFinished++;
											if (err) {
												console.error(err);
											}

											if (mailsFinished >= mailsSent) {
												process.exit();
											}
										});
									}
								}
								catch (e) {
									console.error(e);
								}
							});

							countProcessedMailAddresses++;

							console.log("Timeout? (" + mailsSent + " / " + sender.smtp.quota.numberOfMails + " | " + sender.smtp.quota.perTimeFrame + ")");
							if (sender.smtp.quota && sender.smtp.quota.numberOfMails && sender.smtp.quota.perTimeFrame && !isNaN(sender.smtp.quota.perTimeFrame) && !isNaN(sender.smtp.quota.numberOfMails) && sender.smtp.quota.numberOfMails > 0 && mailsSent >= sender.smtp.quota.numberOfMails) {
								var resumingAllowed = startingSendMails + sender.smtp.quota.perTimeFrame + 2000;
								var timeToSleep = Math.max(resumingAllowed - new Date().getTime(), 2000);
								console.log("time to sleep: " + timeToSleep)

								setTimeout(function() {
									mailsSent = 0;
									startingSendMails = 0;
									callback();
								}, timeToSleep);
							}
							else {
								callback();
							}
						}
						else {
							callback();
						}
					});
				}, function (err) {
					if (err) {
						console.error(err);
					}
					callback();
				});
			}, function (err) {
				if (err) {
					console.error(err);
				}
				callback();
			});
		}, function (err) {
			if (err) {
				console.error(err);
			}

			if (mailsFinished >= mailsSent) {
				process.exit();
			}
		});
	});
}

console.log("connecting to server...");
connectToSmtpServer();
console.log("processing mailings...");
processMailings();