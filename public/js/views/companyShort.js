define(["text!templates/companyShort.html"], function(companyTemplate) {
	var companyShortView = Backbone.View.extend({
		tagName: 'tr',

		render: function() {
			$(this.el).html(_.template(companyTemplate, {
				model: this.model.toJSON()
			}));
			return this;
		}
	});

	return companyShortView;
});