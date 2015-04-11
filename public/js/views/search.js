define(["Underscore", "text!templates/search.html", "text!templates/companyListShort.html", "views/companyShort", "models/Company", "models/CompanyCollection"], 
	function(_, searchTemplate, companyListShortTemplate, CompanyShortView, Company, CompanyCollection) {
	var searchView = Backbone.View.extend({
		el: $('#content'),
		triggerCount: 0,
		collection: new CompanyCollection(),

		events: {
			'click .nextPage': 'nextPage',
			'click .prevPage': 'prevPage'
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
			this.collection.queryParams = params;

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

		loadMore: function() {
			Backbone.history.navigate("!/search", true);
			
			var that = this;
			
			var params = $('#search_details').serializeJSON();
			$.extend(params, this.collection.queryParams);
			this.collection.queryParams = params;

			this.collection.getNextPage().done(function() {
				var end = new Date().getMilliseconds();
				that.collection.executionTime += (end - start) / 1000;
				var newItemCount = that.collection.length;
				if (newItemCount < that.collection.state.pageSize) {
					$('#loadMore').addClass('hide');
				}
				else {
					$('#loadMore').removeClass('hide');
				}
				that.collection.each(function(company) {
					var html = (new CompanyShortView({ model: company })).render().el;
					$(html).appendTo('.results');
				});

				if (that.collection.length == 0) {
					$('#info').html("Kein weiteres Ergebnis gefunden!");
				}
				else if (that.collection.length == 1) {
					$('#info').html("Ein weiteres Ergebnis in " + that.collection.executionTime.toFixed(2) + "s gefunden.");
				}
				else {
					$('#info').html(that.collection.length + " weitere Ergebnisse in " + that.collection.executionTime.toFixed(2) + "s gefunden.");
				}
			});
		},

		renderCollection: function(collection) {
			//if (!collection)
			collection = this.collection;

			var t = _.template(companyListShortTemplate)({
                "model": collection.toJSON()
            });

			$('.results').html(t);
		},


	});

	return searchView;
});