define(["text!templates/location_short.html"], function(locationTemplate) {
	var locationShortView = Backbone.View.extend({
		tagName: 'tr',

		render: function() {
			$(this.el).html(_.template(locationTemplate, {
				model: this.model.toJSON()
			}));
			return this;
		}
	});

	return locationShortView;
});