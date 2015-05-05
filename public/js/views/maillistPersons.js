define(["text!templates/maillistPersons.html", "text!templates/mailListPersonListShort.html", "models/MailListPersonCollection", "text!templates/pagination.html"], function(maillistPersonsTemplate, mailListPersonListShort, MailListPersonCollection, paginationTemplate) {
	var maillistView = Backbone.View.extend({
		el: $('#content'),
		collection: new MailListPersonCollection(),

		events: {
			'click [data-gotoPage]': 'gotoPage'
		},

		initialize: function() {
			this.listenTo(this.collection, 'sync', this.renderCollection);
			this.listenTo(this.collection, 'reset', this.renderCollection);
		},

		remove: function() {
			return Backbone.View.prototype.remove.call(this);
		},

		render: function() {
			this.$el.html(_.template(maillistPersonsTemplate, {
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

			this.$el.html(_.template(maillistPersonsTemplate, {
				"model": this.collection.mailList
			}));

			$('.results').empty();

			var t = _.template(mailListPersonListShort, {
                "model": collection.toJSON(),
                "state": collection.state
            });

			$('.results').html(t);

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

			$('html, body').animate({
		        scrollTop: $("#resultsrow").offset().top - $('#mainNavBar').outerHeight()
		    }, 300);
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