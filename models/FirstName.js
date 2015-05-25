module.exports = function(mongoose) {
	var FirstNameSchema = new mongoose.Schema({
		name: { type: String, index: true },
		gender: { type: Number, index: true, min: 0, max: 1, required: true },
		created: { type: Date, default: Date.now, index: true },
		dataset: { type: mongoose.Schema.ObjectId, ref: 'Dataset', index: true, required: true }
	});

	return mongoose.model("FirstName", FirstNameSchema);
};