define(["text!templates/maillist.html", "models/MailList"], function(maillistTemplate, MailListTemplate) {
	var maillistView = Backbone.View.extend({
		el: $('#content'),

		events: {
			'submit form': 'submit',
			'click [data-mailid][data-action="edit"]': 'edit',
			'click [data-mailid][data-action="cancel"]': 'cancel',
			'click [data-mailid][data-action="save"]': 'save'
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

			try { $('.summernote').summernote({ lang: "de-DE", height: 320 }); } catch(e) { console.error(e); }
			$(".summernote").code(this.model.content);

			return this;
		},

		edit: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("mailid")) $e = $e.parent();
			if (!$e.data("mailid")) $e = $e.parent();

			$('input[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('textarea[data-field][data-mailid="' + $e.data("mailid") + '"]').siblings('.note-editor').show(0);
			$('select[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="cancel"][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="save"][data-mailid="' + $e.data("mailid") + '"]').show(0);

			$('span[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="edit"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="delete"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
		},

		cancel: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("mailid")) $e = $e.parent();
			if (!$e.data("mailid")) $e = $e.parent();

			$('input[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('textarea[data-field][data-mailid="' + $e.data("mailid") + '"]').siblings('.note-editor').hide(0);
			$('select[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="cancel"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="save"][data-mailid="' + $e.data("mailid") + '"]').hide(0);

			$('span[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="edit"][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="delete"][data-mailid="' + $e.data("mailid") + '"]').show(0);
		},

		save: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("mailid")) $e = $e.parent();
			if (!$e.data("mailid")) $e = $e.parent();

			$('input[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('textarea[data-field][data-mailid="' + $e.data("mailid") + '"]').siblings('.note-editor').hide(0);
			$('select[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="cancel"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="save"][data-mailid="' + $e.data("mailid") + '"]').hide(0);

			$('span[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="edit"][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="delete"][data-mailid="' + $e.data("mailid") + '"]').show(0);

			$.each($('span[data-field][data-mailid="' + $e.data("mailid") + '"]'), function(i, span) {
				var field = $(span).data("field");
				var selectAsSource = false;
				var newValue = $('input[data-field="' + field + '"][data-mailid="' + $e.data("mailid") + '"]').val();
				if (!newValue) {
					newValue = $('select[data-field="' + field + '"][data-mailid="' + $e.data("mailid") + '"]').val();
					if (newValue) selectAsSource = true;
				}
				if (!newValue) newValue = $('textarea[data-field="' + field + '"][data-mailid="' + $e.data("mailid") + '"]').code();

				if (newValue) {
					if (!selectAsSource) {
						$(span).html(newValue);
					}
					else {
						$(span).html($('select[data-field="' + field + '"][data-mailid="' + $e.data("mailid") + '"] option:selected').text());	
					}
				}
			});
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