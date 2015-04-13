module.exports = function(mongoose) {
	var MailTemplateSchema = new mongoose.Schema({
		name: { type: String, index: true, required: true },
		content: { type: String },
		subject: { type: String, index: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("MailTemplate", MailTemplateSchema);
}