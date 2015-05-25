module.exports = function(mongoose) {
	var DatasetSchema = new mongoose.Schema({
		name: { type: String, index: true },
		createdTime: { type: Date, default: Date.now, required: true },
		active: { type: Boolean, default: true }
	});

	return mongoose.model("Dataset", DatasetSchema);
};