define(["text!templates/maillist.html", "models/MailList"], function(maillistTemplate, MailListTemplate) {
	var maillistView = Backbone.View.extend({
		el: $('#content'),

		events: {
			'submit form': 'submit'
		},

		initialize: function() {
			if (!this.model)
				this.model = new MailListTemplate();
			this.model.on('reset', this.render, this);
			this.model.on('sync', this.render, this);
		},

		render: function() {
			this.$el.html(_.template(maillistTemplate, {
				"model": this.model.toJSON()
			}));

			//try { $('.summernote').summernote({ lang: "de-DE", height: 320 }); } catch(e) { console.error(e); }
			//$(".summernote").code(this.model.content);

			return this;
		},

		submit: function(e) {
			return e.preventDefault();

			var data = $(this.$el).find("form").serializeJSON();
			var that = this;

			$.post("/dataset/" + $('#dataset-selector').val() + "/mail/template/" + (this.model && this.model.id ? this.model.id : ""), data, function(data) {
				Backbone.history.navigate("/!/mail/templates", true);
			});
		}
	});

	return maillistView;
});