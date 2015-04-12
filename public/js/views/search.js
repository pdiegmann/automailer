define(["Underscore", "text!templates/search.html", "text!templates/companyListShort.html", "text!templates/pagination.html", "views/companyShort", "models/Company", "models/CompanyCollection"], 
	function(_, searchTemplate, companyListShortTemplate, paginationTemplate, CompanyShortView, Company, CompanyCollection) {
	var searchView = Backbone.View.extend({
		el: $('#content'),
		triggerCount: 0,
		collection: new CompanyCollection(),

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

			this.$el.html(searchTemplate);

			var that = this;

			$('a[href$="\#results"]').on("click", function(event) { 
				event.preventDefault();
			});

			$('a.triggerSearch').on("click", function(event) { 
				event.preventDefault(); 
				that.triggerSearch();
			});
		},

		triggerSearch: function() {
			$('.results').empty();

			var that = this;

			Backbone.history.navigate("!/search", true);
			
			var params = $('#search_details').serializeJSON();
			if (!this.collection.queryParams) this.collection.queryParams = {};
			$.extend(this.collection.queryParams,params);

			this.collection.getFirstPage().done(function() {
				if (that.collection.state.totalRecords == 0) {
					$('#info').html("Keine Ergebnisse gefunden!");
				}
				else if (that.collection.state.totalRecords == 1) {
					$('#info').html("Ein Ergebnis in " + (that.collection.duration / 1000).toFixed(2) + "s gefunden.");
				}
				else {
					$('#info').html(that.collection.state.totalRecords + " Ergebnisse in " + (that.collection.duration / 1000).toFixed(2) + "s gefunden.");
				}
			});

			this.triggerCount++;
		},

		renderCollection: function(collection) {
			if (!collection)
				collection = this.collection;

			var t = _.template(companyListShortTemplate)({
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

		gotoPage: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("gotopage")) $e = $e.parent();

			var page = $e.data("gotopage");
			if (this.collection && page) {
				this.collection.getPage(page).done(function() {
					if (that.collection.state.totalRecords == 0) {
						$('#info').html("Keine Ergebnisse gefunden!");
					}
					else if (that.collection.state.totalRecords == 1) {
						$('#info').html("Ein Ergebnis in " + (that.collection.duration / 1000).toFixed(2) + "s gefunden.");
					}
					else {
						$('#info').html(that.collection.state.totalRecords + " Ergebnisse in " + (that.collection.duration / 1000).toFixed(2) + "s gefunden.");
					}
				});
			}

			return false;
		}

	});

	return searchView;
});