define(["text!templates/notFound.html"], function(notFoundTemplate) {
	var notFoundView = Backbone.View.extend({
		el: $('#content'),

		render: function() {
			this.$el.html(notFoundTemplate);
		}
	});

	return notFoundView;
});