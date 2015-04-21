var express = require("express");
var app = express();
var mongoose = require("mongoose");
var url = require('url');
var async = require('async');
var logger = require('tracer').colorConsole();

var _ = require("underscore");

/******
	PROTOTYPES
*****/

if (typeof String.prototype.startsWith != 'function') {
	String.prototype.startsWith = function (str){
		return this.slice(0, str.length) == str;
	};
}

if (typeof String.prototype.endsWith != 'function') {
	String.prototype.endsWith = function (str){
		return this.slice(-str.length) == str;
	};
}

global.stringArrayToRegexArray = function(strArray) {
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
};

global.stringArrayToNumberArray = function(strArray) {
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
};

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

/**** DATASET INITS ****/
app.delete('/dataset/:datasetid', api_dataset.delete);

app.put('/dataset/:datasetid/upload', api_dataset.upload);

app.get('/dataset/:datasetid/names/:gender/put/:names', function(req, res, next) {
	var datasetid = req.params.datasetid;
	var gendername = req.params.gender.toLowerCase();	
	var gender = gendername === "male" || gendername === "m" ? 1 : 0;
	var names = req.params.names; //req.param("names", "");
	if (!names || names.length <= 0) return res.send(500);
	var nameSegments = names.split(',');
	var names = [];
	for (var i = 0; i < nameSegments.length; i++) {
		names.push(nameSegments[i].trim());
	}

	async.each(names, function(name, callback) {
		var firstName = new db.FirstNameModel();
		firstName.dataset = datasetid;
		firstName.name = name;
		firstName.gender = gender;

		firstName.save(function(err) {
			if (err) {
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
		return res.send(200);
	});
});

app.get('/dataset/:datasetid/persons/guess/gender', api_dataset.guessGender);

app.get('/dataset/:datasetid/filter', api_company.filter);

/**** MAILINGS ****/

app.post('/dataset/:datasetid/mail/send/template/:templateid', api_mailings.sendToFilter);

app.get('/dataset/:datasetid/mails/fetch', api_mailings.fetchIMAP);

/**** MAILS ****/

app.post('/dataset/:datasetid/mail/address/:addressid', api_mails.setAddressState);

app.get('/dataset/:datasetid/mails', api_mails.getMails);

/**** MAILINGLISTS ****/

app.get('/dataset/:datasetid/mail/lists', api_mailinglists.getMailingLists);

app.get('/dataset/:datasetid/randomizeOrder/mails/list/:mailinglistid', api_mailinglists.randomizeOrder);

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

app.listen(8000);