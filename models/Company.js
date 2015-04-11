module.exports = function(mongoose) {
	var CompanySchema = new mongoose.Schema({
		raw: { type: String },
		name: { type: String, index: true },
		url: { type: String, index: true },
		publisher: { type: String, index: true },
		publisherId: { type: String, index: true },
		address: {
			street: { type: String },
			city: { type: String, index: true },
			zip: { type: String, index: true },
			country: { type: String, index: true }
		},
		branch: { 
			NACE: { type: Number, index: true },
			USSIC: { type: Number, index: true },
		},
		created: { type: Date, default: Date.now },
		updated: { type: Date, default: Date.now },
		legal: { type: String },
		founded: { type: String },
		employees: { type: Number },
		revenue: [{
			amount: { type: Number },
			year: { type: Number }
		}],
		offices: [String],
		telephone: { type: String },
		executives: [{ type: mongoose.Schema.ObjectId, ref: 'Person', index: true }],
		email: { type: String, index: true },
		active: { type: Boolean, default: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("Company", CompanySchema);
}