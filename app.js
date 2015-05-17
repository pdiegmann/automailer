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

if (typeof String.prototype.decodeHTML != 'function') {
	String.prototype.decodeHTML = function() {
	    var map = {"gt":">", "lt": "<", "amp": "&", "quot": "\""};
	    return this.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);?/gi, function($0, $1) {
	        if ($1[0] === "#") {
	            return String.fromCharCode($1[1].toLowerCase() === "x" ? parseInt($1.substr(2), 16)  : parseInt($1.substr(1), 10));
	        } else {
	            return map.hasOwnProperty($1) ? map[$1] : $0;
	        }
	    });
	};
}

global.shuffleArray = function(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
};

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

global.stringToRegexQuery = function(str) {
	try {
		if (!str || str.length <= 0) return undefined;

		if (str.startsWith("not:")) {
			return { $not: global.stringToRegexQuery(str.substr(4)) }
		}
		else if (str.startsWith("in:")) {
			str = str.substr(3);
			var parts = str.split(",");
			var arr = [];
			for (var i = 0; i < parts.length; i++) {
				var item = global.stringToRegexQuery(parts[i].trim());
				if(item !== undefined && item !== null) {
					if (item instanceof Array) {
						arr = arr.concat(item);
					}
					else if (typeof item === 'RegExp' || item instanceof RegExp || typeof item === 'string' || item instanceof String) {
						arr.push(item);
					}
				}
			}
			return { $in: arr }
		}
		else if (str.startsWith("regex:")) {
			return new RegExp(str.substr(6));
		}
		else if (str.startsWith("ci:")) {
			return new RegExp("^" + str.substr(3).replace(/\./g, "\\.") + "$", "i");
			//return new RegExp(str.substr(3).replace(/\./g, "\\."), "i");
		}
		else {
			return str;
		}
	}
	catch (e) {
		logger.error(e);
		return undefined;
	}
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

app.listen(8000);