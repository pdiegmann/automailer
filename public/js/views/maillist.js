define(["text!templates/maillist.html", "text!templates/mailListShort.html", "models/MailListItemCollection", "text!templates/pagination.html"], function(maillistTemplate, mailListShortTemplate, MailListItemCollection, paginationTemplate) {
	var maillistView = Backbone.View.extend({
		el: $('#content'),
		collection: new MailListItemCollection(),

		events: {
			'submit form': 'submit',
			'click [data-mailid][data-action="edit"]': 'edit',
			'click [data-mailid][data-action="cancel"]': 'cancel',
			'click [data-mailid][data-action="save"]': 'save',
			'click [data-mailid][data-action="delete"]': 'delete'
		},

		initialize: function() {
			this.listenTo(this.collection, 'sync', this.renderCollection);
			this.listenTo(this.collection, 'reset', this.renderCollection);
		},

		remove: function() {
			return Backbone.View.prototype.remove.call(this);
		},

		render: function() {
			this.$el.html(_.template(maillistTemplate, {
				"model": this.collection.mailList
			}));

			$('.results').empty();

			var that = this;

			this.showLoading();

			this.collection.getFirstPage().done(function() {
				that.doneFetchingPage();
			});

			return this;
		},

		renderCollection: function(collection) {
			if (!collection)
				collection = this.collection;

			this.$el.html(_.template(maillistTemplate, {
				"model": this.collection.mailList
			}));

			$('.results').empty();

			var t = _.template(mailListShortTemplate, {
                "model": collection.toJSON(),
                "state": collection.state
            });

			$('.results').html(t);

			this.renderPagination();

			try { $('.summernote').summernote({ lang: "de-DE", height: 320 }); } catch(e) { console.error(e); }
			//$(".summernote").code(this.model.content);
		},

		renderPagination: function(collection) {
			if (!collection)
				collection = this.collection;

			var t = _.template(paginationTemplate)({
                "model": collection,
                "surroundingPages": 5
            });

			$('ul.pagination').html(t);
		},

		doneFetchingPage: function() {
			if (this.collection.state.totalRecords == 0) {
				$('#info').html("Keine Ergebnisse gefunden!");
			}
			else if (this.collection.state.totalRecords == 1) {
				$('#info').html("Ein Ergebnis in " + (this.collection.duration / 1000).toFixed(2) + "s gefunden.");
			}
			else {
				$('#info').html(this.collection.state.totalRecords + " Ergebnisse in " + (this.collection.duration / 1000).toFixed(2) + "s gefunden.");
			}

			this.hideLoading();
		},

		gotoPage: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("gotopage")) $e = $e.parent();

			var page = $e.data("gotopage");
			if (this.collection && page) {
				var that = this;
				this.showLoading();
				this.collection.getPage(page).done(function() {
					that.doneFetchingPage();
				});
			}

			return false;
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

		delete: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("mailid")) $e = $e.parent();
			if (!$e.data("mailid")) $e = $e.parent();

			var $e = $(e.target);
			if ($e.data("confirmed") == undefined) $e = $e.parent();
			if ($e.data("confirmed") == undefined) {
				$e = $(e.target);
				$e.data("confirmed", false);
			}
			var confirmed = $e.data("confirmed");

        	if (confirmed == false) {
        		$e.html("Wirklich?");
        		$e.data("confirmed", true);
        	}
        	else {
				$('[data-action][data-mailid="' + $e.data("mailid") + '"]').addClass("disabled");

				$('input[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
				$('textarea[data-field][data-mailid="' + $e.data("mailid") + '"]').siblings('.note-editor').hide(0);
				$('select[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
				$('[data-action="cancel"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
				$('[data-action="save"][data-mailid="' + $e.data("mailid") + '"]').hide(0);

				$('span[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
				$('[data-action="edit"][data-mailid="' + $e.data("mailid") + '"]').show(0);
				$('[data-action="delete"][data-mailid="' + $e.data("mailid") + '"]').show(0);

				$.post("/dataset/" + $('#dataset-selector').val() + "/mail/list/" + this.model.id + "/delete/mail/" + $e.data("mailid"), function(res) {
					$('tr[data-mailid="' + $e.data("mailid") + '"]').remove();
					$('[data-action][data-mailid="' + $e.data("mailid") + '"]').removeClass("disabled");
				});
			}
		},

		save: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("mailid")) $e = $e.parent();
			if (!$e.data("mailid")) $e = $e.parent();

			$('[data-action][data-mailid="' + $e.data("mailid") + '"]').addClass("disabled");

			$('input[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('textarea[data-field][data-mailid="' + $e.data("mailid") + '"]').siblings('.note-editor').hide(0);
			$('select[data-field][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="cancel"][data-mailid="' + $e.data("mailid") + '"]').hide(0);
			$('[data-action="save"][data-mailid="' + $e.data("mailid") + '"]').hide(0);

			$('span[data-field][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="edit"][data-mailid="' + $e.data("mailid") + '"]').show(0);
			$('[data-action="delete"][data-mailid="' + $e.data("mailid") + '"]').show(0);

			var data = { };

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
					data[field] = newValue;

					if (!selectAsSource) {
						$(span).html(newValue);
					}
					else {
						$(span).html($('select[data-field="' + field + '"][data-mailid="' + $e.data("mailid") + '"] option:selected').text());	
					}
				}
			});

			$.post("/dataset/" + $('#dataset-selector').val() + "/mail/list/" + this.model.id + "/update/mail/" + $e.data("mailid"), data, function(res) {
				$('[data-action][data-mailid="' + $e.data("mailid") + '"]').removeClass("disabled");
			});
		},

		hideLoading: function() {
			$('#loadingOverlay').remove();
		},

		showLoading: function() {
	        // add the overlay with loading image to the page
	        var over = "<div id='loadingOverlay'><div class='uil-ring-css' style='-webkit-transform:scale(0.89)'><div></div></div></div>";
	        $(over).appendTo('body');
		}
	});

	return maillistView;
});