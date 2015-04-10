define(["text!templates/oops.html"], function(oopsTemplate) {
	var oopsView = Backbone.View.extend({
		el: $('#content'),

		render: function() {
			this.$el.html(oopsTemplate);
		}
	});

	return oopsView;
});