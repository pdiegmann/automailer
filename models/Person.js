module.exports = function(mongoose) {
	var PersonSchema = new mongoose.Schema({
		raw: { type: String },
		title: { type: String, index: true },
		firstName: { type: String, index: true },
		lastName: { type: String, index: true },
		location: { type: String, index: true },
		departement: { type: String, index: true },
		position: { type: String, index: true },
		created: { type: Date, default: Date.now },
		updated: { type: Date, default: Date.now },
		failedMailAddresses: [{
			address: { type: String, index: true },
			date: { type: Date }
		}],
		succeededMailAddresses: [{
			address: { type: String, index: true },
			date: { type: Date }
		}],
		telephone: { type: String },
		company: { type: mongoose.Schema.ObjectId, ref: 'Company', index: true },
		active: { type: Boolean, default: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("Person", PersonSchema);
}