define(["text!templates/faq.html"], function(faqTemplate) {
	var faqView = Backbone.View.extend({
		el: $('#content'),

		render: function() {
			this.$el.html(faqTemplate);
		}
	});

	return faqView;
});