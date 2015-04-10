module.exports = function(mongoose) {
	var MailSchema = new mongoose.Schema({
		body: { type: String },
		subject: { type: String, index: true },
		to: { type: String, index: true },
		from: { type: String, index: true },
		person: { type: mongoose.Schema.ObjectId, ref: 'PersonSchema', index: true },
		sent: { type: Date },
		received: { type: Date },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'DatasetSchema', index: true, required: true }
	});

	return mongoose.model("Mail", MailSchema);
}