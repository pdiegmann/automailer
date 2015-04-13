define(["Underscore", "text!templates/mailtemplates.html", "text!templates/mailtemplatesListShort.html", "text!templates/pagination.html", "models/MailTemplate", "models/MailTemplateCollection"], 
	function(_, mailtemplatesTemplate, mailtemplatesListShortTemplate, paginationTemplate, MailTemplate, MailTemplateCollection) {
	var mailtemplatesView = Backbone.View.extend({
		el: $('#content'),
		triggerCount: 0,
		collection: new MailTemplateCollection(),

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
			this.collection.setDatasetId($('#dataset-selector').val());

			this.$el.html(mailtemplatesTemplate);

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

			var t = _.template(mailtemplatesListShortTemplate)({
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

		hideLoading: function() {
			$('#loadingOverlay').remove();
		},

		showLoading: function() {
	        // add the overlay with loading image to the page
	        var over = "<div id='loadingOverlay'><div class='uil-ring-css' style='-webkit-transform:scale(0.89)'><div></div></div></div>";
	        $(over).appendTo('body');
		}

	});

	return mailtemplatesView;
});