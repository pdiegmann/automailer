var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

module.exports = function(db) {
	return {
		getTemplates: function(req, res, next) {
			var start = process.hrtime();

			var datasetid = req.params.datasetid;
			var take = req.param("take", 0);
			if (isNaN(take) || take <= 0 || take > 500) take = 500;
			take = parseInt(take);
			var skip = req.param("skip", 0);
			if (isNaN(skip) || skip < 0) skip = 0;
			skip = parseInt(skip);

			db.MailTemplateModel.count({ dataset: datasetid }, function(err, count) {
				db.MailTemplateModel.find({ dataset: datasetid }, { __v: 0 }).limit(take).skip(skip).exec(function(err, docs) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					if (!docs) {
						return res.send(404);
					}

					var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli

					return res.json({ duration: parseFloat(Math.round(elapsed).toFixed(0)), take: take, skip: skip, count: docs.length, total: count, results: docs});
				});
			});
		},

		getTemplate: function(req, res, next) {
			var templateid = req.params.templateid;
			var datasetid = req.params.datasetid;

			db.MailTemplateModel.findOne({ "_id": templateid, "dataset": datasetid }, { __v: 0 }).exec(function(err, doc) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!doc) {
					return templateid && templateid.length > 0 ? res.send(404) : res.json(new db.MailTemplateModel());
				}

				return res.json(doc);
			});
		},

		setTemplate: function(req, res, next) {
			var templateid = req.params.templateid;
			var datasetid = req.params.datasetid;

			db.MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!doc) {
					doc = new db.MailTemplateModel();
				}

				doc.name = req.body.name;
				doc.subject = req.body.subject.replace(/&lt;%/g, "<%").replace(/%&gt;/g, "%>");
				doc.content = req.body.content.replace(/&lt;%/g, "<%").replace(/%&gt;/g, "%>");
				doc.dataset = datasetid;

				doc.save(function (err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}
					return res.json({id: doc._id});
				});
			});
		},

		deleteTemplate: function(req, res, next) {
			var templateid = req.params.templateid;

			db.MailTemplateModel.findOne({ "_id": templateid }, { __v: 0 }).exec(function(err, doc) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				if (!doc) {
					return res.send(404);
				}

				doc.remove(function(err) {
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