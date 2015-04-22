module.exports = function(mongoose) {
	var MailSchema = new mongoose.Schema({
		body: { type: String },
		subject: { type: String, index: true },
		to: { type: String, index: true },
		from: { type: String, index: true },
		externalId: { type: String, index: true },
		bounced: { type: Boolean, index: true },
		person: { type: mongoose.Schema.ObjectId, ref: 'Person', index: true },
		sent: { type: Date },
		received: { type: Date },
		created: { type: Date, default: Date.now, index: true },
		responseTo: { type: mongoose.Schema.ObjectId, ref: 'Mail', index: true },
		inMailingList: { type: mongoose.Schema.ObjectId, ref: 'MailingList', index: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("Mail", MailSchema);
}