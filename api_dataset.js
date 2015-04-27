var logger = require('tracer').colorConsole();
var async = require('async');
var mongoose = require("mongoose");

var FlakeIdGen = require('flake-idgen')
    , intformat = require('biguint-format')
    , flakeGenerator = new FlakeIdGen;

var CSVConverter = require("csvtojson").core.Converter;
var fs = require('fs');
var Hashids = require('hashids');
var mkdirp = require('mkdirp');

module.exports = function(db) {
	var csv_interpreter = require('./csv_interpreter')(db);

	return {
		all: function(req, res, next) {
			db.DatasetModel.find({"active" : true}, { "__v": 0 }, function (err, datasets) {
				if (err) {
					logger.debug(req.params, err);
					return res.send(500);
				}

				if (!datasets)
					return res.send(500);

				return res.json(datasets);
			});
		},

		upload: function(req, res, next) {
			var file = req.files.file;
			var datasetId = req.params.datasetid;
			var largeFile = req.param("large", true);
			var delimiter = req.param("delimiter", ",");
			var skipEmpty = req.param("skipEmpty", false);
			var checkType = req.param("checkType", false);
			var encoding = req.param("encoding", "utf8");
			var quote = req.param("quote", "\"");

			if (datasetId == null || datasetId.length <= 0)
				return res.send(404);

			hashids = new Hashids(datasetId != null && datasetId != undefined && datasetId.length > 0 ? datasetId : 'automailer', 8);
			var id = hashids.encrypt(intformat(flakeGenerator.next(), 'dec') / 1000)

			db.DatasetModel.findOne({"_id" : datasetId}, function (err, dataset) {
				if (err) {
					logger.debug(req.params, err);
					return res.send(500);
				}
				
				if (!dataset)
					return res.send(500);

				try {
					var csvConverter = new CSVConverter({ 
						constructResult: !largeFile, 
						delimiter: delimiter, 
						ignoreEmpty: skipEmpty,
						checkType: checkType,
						quote: quote
					});

					if (largeFile) {
						csvConverter.on("record_parsed",function(resultRow,rawRow,rowIndex){
							try { 
								csv_interpreter.saveCompanyAndPersonsFromCSVRow(resultRow, datasetId);
							}
							catch (e) { logger.error(e); }
						});
					}

					csvConverter.on("end_parsed",function(jsonObj){
						try { 
							if (jsonObj && !largeFile) {
								var parsed = jsonObj.csvRows ? jsonObj.csvRows : jsonObj;
								for (var rowIndex in parsed) {
									try { 
										csv_interpreter.saveCompanyAndPersonsFromCSVRow(jsonObj[rowIndex], datasetId);
									}
									catch (e) { logger.error(e); }
								}
							}

							try { fs.unlinkSync(file.path); } 
							catch(e) { logger.error(e); }
							
							return res.send(200);
						}
						catch (e) { 
							logger.error(e); 
							return res.send(500);
						}
					});

					var fileStream = fs.createReadStream(file.path, { encoding: encoding });

					fileStream.pipe(csvConverter);
				}
				catch (e) { 
					logger.error(e); 
					return res.send(500);
				}
			});
		},

		delete: function(req, res, next) {
			var datasetId = req.params.datasetid;
			if (datasetId && datasetId.length > 0) {
				db.PersonModel.find({"dataset": datasetId}).remove().exec(function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}
					db.CompanyModel.find({"dataset": datasetId}).remove().exec(function(err) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}
						db.MailModel.find({"dataset": datasetId}).remove().exec(function(err) {
							if (err) {
								logger.error(err);
								return res.send(500);
							}
							db.MailingListModel.find({"dataset": datasetId}).remove().exec(function(err) {
								if (err) {
									logger.error(err);
									return res.send(500);
								}
								db.MailTemplateModel.find({"dataset": datasetId}).remove().exec(function(err) {
									if (err) {
										logger.error(err);
										return res.send(500);
									}
									db.FirstNameModel.find({"dataset": datasetId}).remove().exec(function(err) {
										if (err) {
											logger.error(err);
											return res.send(500);
										}
										return res.send(200);
									});
								});
							});
						});
					});
				});
			}
			else {
				return res.send(404);
			}
		},

		initNamesWithGenders: function(req, res, next) {
			var datasetid = req.params.datasetid;
			var gendername = req.params.gender.toLowerCase();	
			var gender = gendername === "male" || gendername === "m" ? 1 : 0;
			var names = req.params.names; //req.param("names", "");
			if (!names || names.length <= 0) return res.send(500);
			var nameSegments = names.split(',');
			names = [];
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
					logger.error(err);
					return res.send(500);
				}
				return res.send(200);
			});
		},

		guessMailAddresses: function(req, res, next) {
			var datasetid = req.params.datasetid;

			db.PersonModel.count({ "dataset": datasetid, "active": true }, function(err, count) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				var processed = 0;
				async.whilst(function() { logger.log(processed + " < " + count + " = " + (processed < count)); return processed < count; }, function(callback) {
					db.PersonModel
					.find({ "dataset": datasetid, "active": true }, { __v: 0, raw: 0 })
					.populate("company", "-__v -raw")
					.skip(processed)
					.limit(1000)
					.exec(function(err, persons) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						if (!persons || persons.length <= 0) {
							return res.send(404);
						}

						var length = persons.length;
						
						async.eachLimit(persons, 5, function(person, callback) {
							csv_interpreter.guessMailAddresses(person, person.company, callback, false);
						}, function(err) {
							processed += length;
							callback(err);
						})
					});
				}, function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					return res.send(200);
				});
			});
		},

		guessGender: function(req, res, next) {
			var datasetid = req.params.datasetid;

			db.PersonModel.count({ "dataset": datasetid, "active": true }, function(err, count) {
				if (err) {
					logger.error(err);
					return res.send(500);
				}

				var processed = 0;
				async.whilst(function() { logger.log(processed + " < " + count + " = " + (processed < count)); return processed < count; }, function(callback) {
					db.PersonModel
					.find({ "dataset": datasetid, "active": true }, { __v: 0, raw: 0 })
					.skip(processed)
					.limit(2500)
					.exec(function(err, persons) {
						if (err) {
							logger.error(err);
							return res.send(500);
						}

						if (!persons || persons.length <= 0) {
							return res.send(404);
						}

						var length = persons.length;
						
						async.eachLimit(persons, 5, function(person, callback) {
							csv_interpreter.guessGender(person, datasetid, callback);
						}, function(err) {
							processed += length;
							callback(err);
						})
					});
				}, function(err) {
					if (err) {
						logger.error(err);
						return res.send(500);
					}

					return res.send(200);
				});
			});
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