define(["Underscore", "text!templates/maillists.html", "text!templates/mailListsListShort.html", "text!templates/pagination.html", "models/MailList", "models/MailListCollection"], 
	function(_, maillistsTemplate, maillistsListShortTemplate, paginationTemplate, MailList, MailListCollection) {
	var maillistsView = Backbone.View.extend({
		el: $('#content'),
		triggerCount: 0,
		collection: new MailListCollection(),

		events: {
			'click [data-gotoPage]': 'gotoPage',
			'click .refresh': 'refresh',
			'click .sendUnsent': 'sendUnsent',
			'click .stockUp': 'stockUp'
		},

		initialize: function() {
			this.listenTo(this.collection, 'sync', this.renderCollection);
			this.listenTo(this.collection, 'reset', this.renderCollection);
		},

		remove: function() {
			return Backbone.View.prototype.remove.call(this);
		},

		render: function() {
			this.collection.setDatasetId($('#dataset-selector').val());

			this.$el.html(maillistsTemplate);

			$('.results').empty();

			var that = this;

			this.showLoading();

			this.collection.getFirstPage().done(function() {
				that.doneFetchingPage();
			});

			this.triggerCount++;
		},

		renderCollection: function(collection) {
			if (!collection)
				collection = this.collection;

			console.log(collection);

			var t = _.template(maillistsListShortTemplate, {
                "model": collection.toJSON(),
                "state": collection.state
            });

			$('.results').html(t);

			$('[data-toggle="popover"]').popover({ html: true });

			this.renderPagination();
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
			$('html, body').animate({
				scrollTop: $("#info").offset().top - $('#mainNavBar').outerHeight(true)
			}, 'fast');

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

		refresh: function(e) {
			e.preventDefault();
			var that = this;
			this.showLoading();
			this.collection.getFirstPage().done(function() {
				that.doneFetchingPage();
			});

			return false;
		},

		sendUnsent: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("maillistid")) $e = $e.parent();
			if (!$e.data("maillistid")) $e = $e.parent();

			var maillistid = $e.data("maillistid");
			var params = $('#mailsettings').serializeJSON({checkboxUncheckedValue:"false"});

			this.showLoading();
			var that = this;
			$.post("/dataset/" + $("#dataset-selector").val() + "/mail/send/mailinglist/" + maillistid, params, function(res) {
				setTimeout(function() { 
					that.hideLoading();
					that.refresh(e);
				}, 2500);
			});
		},

		stockUp: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("maillistid")) $e = $e.parent();
			if (!$e.data("maillistid")) $e = $e.parent();

			var maillistid = $e.data("maillistid");
			var params = $('#mailsettings').serializeJSON({checkboxUncheckedValue:"false"});

			this.showLoading();
			var that = this;
			$.post("/dataset/" + $("#dataset-selector").val() + "/mail/stockup/mailinglist/" + maillistid, params, function(res) {
				setTimeout(function() { 
					that.hideLoading();
					that.refresh(e);
				}, 2500);
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

	return maillistsView;
});