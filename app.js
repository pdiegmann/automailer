var express = require("express");
var app = express();
var mongoose = require("mongoose");
var url = require('url');
var async = require('async');
var logger = require('tracer').colorConsole();
var iconv = require('iconv-lite');

var _ = require("underscore");

iconv.extendNodeEncodings();

/******
	ARGUMENTS
*****/

var port = 8000;
var host = "localhost";
process.argv.forEach(function(val, index, array) {
	logger.log(index + ': ' + val);
	if (val.indexOf("port=") >= 0 || val.indexOf("p=") >= 0) {
		var _port = val.split("=").pop();
		if (!isNaN(_port)) port = _port;
	}
	else if (val.indexOf("host=") >= 0 || val.indexOf("h=") >= 0) {
		host = val.split("=").pop();
	}
});

/******
	MODELS
*****/

var db = {};
db.connection = mongoose.connect("mongodb://127.0.0.1:27017/automailer");
db.DatasetModel = require("./models/Dataset")(db.connection);
db.MailModel = require("./models/Mail")(db.connection);
db.MailingListModel = require("./models/MailingList")(db.connection);
db.MailTemplateModel = require("./models/MailTemplate")(db.connection);
db.PersonModel = require("./models/Person")(db.connection);
db.CompanyModel = require("./models/Company")(db.connection);
db.FirstNameModel = require("./models/FirstName")(db.connection);

/******
	PROTOTYPES & GLOBALS
*****/

require("./prototypes");
require("./globals")(db);

/******
	API
*****/

var api_dataset = require("./api_dataset")(db);
var api_company = require("./api_company")(db);
var api_mails = require("./api_mails")(db);
var api_mailings = require("./api_mailings")(db);
var api_mailtemplates = require("./api_mailtemplates")(db);
var api_mailinglists = require("./api_mailinglist")(db);

/******
	APP
*****/

app.configure(function() {
	app.set("view engine", "jade");
	app.use(express.static(__dirname + "/public"));
	app.set('views', __dirname + '/views');
	app.use(express.cookieParser());
  	app.use(express.methodOverride());
	app.use(express.session({ secret: 'AuT0M@Il€r', cookie:{maxAge:3600000}}));
	app.use(express.bodyParser({ 
    	keepExtensions: true, 
    	uploadDir: __dirname + '/tmp',
    	limit: '12mb'
  	}));
});

app.on('connection', function(socket) {
	logger.log("A new connection was made by a client.");
	socket.setTimeout(10 * 60 * 1000); 
})

/**** DATASET INITS ****/
app.delete('/dataset/:datasetid', api_dataset.delete);

app.get('/dataset/:datasetid/sanitize/publisherIds', api_dataset.sanitizePublisherIds);

app.put('/dataset/:datasetid/upload', api_dataset.upload);

app.get('/dataset/:datasetid/randomizeOrder', api_company.randomizeOrder);

app.get('/dataset/:datasetid/names/:gender/put/:names', api_dataset.initNamesWithGenders);

app.get('/dataset/:datasetid/persons/guess/gender', api_dataset.guessGender);

app.get('/dataset/:datasetid/persons/guess/mailaddresses', api_dataset.guessMailAddresses);

app.get('/dataset/:datasetid/filter', api_company.filter);

app.get('/dataset/:datasetid/companies/exclude/publisher/:publisher/:publisherids', api_company.exclude);

/**** MAILINGS ****/

app.post('/dataset/:datasetid/mail/send/template/:templateid', api_mailings.sendToFilter);

app.post('/dataset/:datasetid/mail/send/mailinglist/:mailinglistid', api_mailings.sendUnsent);

app.post('/dataset/:datasetid/mail/stockup/mailinglist/:mailinglistid', api_mailings.stockUpMails);

app.post('/dataset/:datasetid/mail/prepare/template/:templateid', api_mailings.prepareMailingList);

app.get('/dataset/:datasetid/mails/fetch', api_mailings.fetchIMAP);

/**** MAILS ****/

app.post('/dataset/:datasetid/mail/address/:addressid', api_mails.setAddressState);

app.get('/dataset/:datasetid/mails', api_mails.getMails);

/**** MAILINGLISTS ****/

app.get('/dataset/:datasetid/mail/lists', api_mailinglists.getMailingLists);

app.get('/dataset/:datasetid/mail/list/export', api_mailinglists.exportCSV);
app.get('/dataset/:datasetid/mail/list/export/:maillistid', api_mailinglists.exportCSV);

app.get('/dataset/:datasetid/mail/list/:maillistid/all', api_mailinglists.getMailingList);

app.get('/dataset/:datasetid/mail/list/:maillistid/persons', api_mailinglists.getPersonsAddressed);
app.get('/dataset/:datasetid/mail/list/:maillistid/persons/failed', function(req, res, next) { 
	api_mailinglists.getPersonsAddressedWithState(req, res, next, 3, true);
});
app.get('/dataset/:datasetid/mail/list/:maillistid/persons/inprogress', function(req, res, next) { 
	api_mailinglists.getPersonsAddressedWithState(req, res, next, 1, false);
});
app.get('/dataset/:datasetid/mail/list/:maillistid/persons/successfull', function(req, res, next) { 
	api_mailinglists.getPersonsAddressedWithState(req, res, next, 2, false);
});

app.get('/dataset/:datasetid/mail/list/:maillistid', api_mailinglists.getMailingListItems);

app.post('/dataset/:datasetid/mail/list/:maillistid/copy/template/:templateid', api_mailinglists.copyMailingList);

app.post('/dataset/:datasetid/mail/list/:maillistid', api_mailinglists.setMailingList);

app.post("/dataset/:datasetid/mail/list/:maillistid/update/mail/:mailid", api_mailinglists.updateMailingListItem);

app.post("/dataset/:datasetid/mail/list/:maillistid/delete/mail/:mailid", api_mailinglists.deleteMailingListItem);

/**** MAIL TEMPLATES ****/

app.get('/dataset/:datasetid/mail/templates', api_mailtemplates.getTemplates);

app.get('/dataset/:datasetid/mail/template/:templateid?', api_mailtemplates.getTemplate);

app.post('/dataset/:datasetid/mail/template/:templateid?', api_mailtemplates.setTemplate);

app.delete('/dataset/:datasetid/mail/template/:templateid', api_mailtemplates.deleteTemplate);

/**** GENERAL ****/

app.get('/datasets/all', api_dataset.all);

app.all('/!*', function(req, res, next){
	res.redirect("/");
});

app.all('*', function(req, res, next) {
	res.setHeader('charset', 'utf8');
	res.charset = 'utf-8'
	next();
});

app.get("/", function(req, res, next) {
	res.render(__dirname + "/views/index.jade", { layout: false });
});

db.DatasetModel.count({active: true}, function(err, count) {
	if (err) {
		return logger.error(err);
	}
	if (count <= 0) {
		var dataset = new db.DatasetModel();
		dataset.active = true;
		dataset.name = "Default";
		dataset.save(function(err) {
			if (err) {
				return logger.error(err);
			}
		});
	}
});

app.listen(port);