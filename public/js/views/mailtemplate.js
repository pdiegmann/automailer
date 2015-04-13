define(["text!templates/mailtemplate.html", "models/MailTemplate"], function(mailtemplateTemplate, MailTemplate) {
	var mailtemplateView = Backbone.View.extend({
		el: $('#content'),

		events: {
			'submit form': 'submit'
		},

		initialize: function() {
			if (!this.model)
				this.model = new MailTemplate();
			this.model.on('reset', this.render, this);
			this.model.on('sync', this.render, this);
		},

		render: function() {
			this.$el.html(_.template(mailtemplateTemplate, {
				"model": this.model.toJSON()
			}));

			try { $('.summernote').summernote({ lang: "de-DE", height: 320 }); } catch(e) { console.error(e); }
			$(".summernote").code(this.model.content);

			return this;
		},

		submit: function(e) {
			e.preventDefault();

			var data = $(this.$el).find("form").serializeJSON();
			var that = this;

			$.post("/dataset/" + $('#dataset-selector').val() + "/mail/template/" + (this.model && this.model.id ? this.model.id : ""), data, function(data) {
				Backbone.history.navigate("/!/mail/templates", true);
			});
		}
	});

	return mailtemplateView;
});