module.exports = function(mongoose) {
	var MailingListSchema = new mongoose.Schema({
		created: { type: Date, default: Date.now, required: true },
		sendTo: [{ type: mongoose.Schema.ObjectId, ref: 'Person', index: true }],
		template: { 
			name: { type: String, index: true },
			content: { type: String },
			subject: { type: String, index: true }
		},
		from: {
			address: { type: String },
			name: { type: String },
		},
		preparedMails: [{ type: mongoose.Schema.ObjectId, ref: 'Mail', index: true }],
		sentMails: [{ type: mongoose.Schema.ObjectId, ref: 'Mail', index: true }],
		answers: [{ type: mongoose.Schema.ObjectId, ref: 'Mail', index: true }],
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("MailingList", MailingListSchema);
};