module.exports = function(mongoose) {
	var PersonSchema = new mongoose.Schema({
		raw: { type: String },
		title: { type: String, index: true },
		firstName: { type: String, index: true },
		lastName: { type: String, index: true },
		gender: { type: Number, index: true, min: -1, max: 1 },
		location: { type: String, index: true },
		departement: { type: String, index: true },
		position: { type: String, index: true },
		created: { type: Date, default: Date.now },
		updated: { type: Date, default: Date.now },
		mailAddresses: [{
			address: { type: String, index: true },
			state: { type: Number, index: true }, // 0: not tried, 1: in progress, 2: successfull, 3: failed
			date: { type: Date, default: Date.now }
		}],
		telephone: { type: String },
		company: { type: mongoose.Schema.ObjectId, ref: 'Company', index: true },
		active: { type: Boolean, default: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("Person", PersonSchema);
};