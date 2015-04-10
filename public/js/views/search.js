define(["BaseView", "views/location_short", "text!templates/search.html", "text!templates/map_popup.html"], 
	function(BaseView, LocationShortView, searchTemplate, popupTemplate) {
	var searchView = BaseView.extend({
		el: $('#content'),
		markers: null,
		loadedMarkers: {},
		triggerCount: 0,
		bounds: [],

		events: {
			'click #loadMore': 'loadMore'
		},

		initialize: function() {
			this.listenTo(this.collection.fullCollection, 'sync', this.renderCollection);
			this.listenTo(this.collection.fullCollection, 'reset', this.renderCollection);
			this.listenTo(this.collection, 'sync', this.addLocation);
			L.mapbox.accessToken = 'pk.eyJ1IjoicGRpZWdtYW5uIiwiYSI6IkhYWGdVYTgifQ.dQNWOWUBTufNb8PAXdzz4A';
		},

		remove: function() {
			this.infiniScroll.destroy();
			return Backbone.View.prototype.remove.call(this);
		},

		render: function() {
			this.$el.html(searchTemplate);

			var that = this;

			$('a[href$="\#results"]').on("click", function(event) { 
				event.preventDefault();
			});

			$('a.triggerSearch').on("click", function(event) { 
				event.preventDefault(); 
				that.triggerSearch();
			});

			$('#increaseMapSizeInset').on('click', function(e) {
				e.preventDefault();
				var mapContainer = $(that.map.getContainer());
				if (mapContainer) {
					var expanded = mapContainer.height() > 300;
					mapContainer.animate({ height: expanded ? 300 : 600 }, 300);
					that.map.invalidateSize(true);
					
					window.setTimeout(function() {
						if (that.map && that.bounds && that.bounds.length > 0) {
							that.map.fitBounds(new L.latLngBounds(that.bounds));
						}
					}, 350);

					$('#increaseMapSizeInset').text(expanded ? "Karte vergrößern" : "Karte verkleinern");

					$('html, body').animate({
				        scrollTop: $("#beforeMapDivider").offset().top - $('#mainNavBarMeasure').outerHeight(true) + $("#beforeMapDivider").outerHeight(true)
				    }, 300);
				}
			});
		},

		triggerSearch: function() {
			$('.results').empty();
			var start = new Date().getMilliseconds();
			var query = $('#mainSearchbar').val();

			if (query && query.length > 0 || this.triggerCount > 0) { 
				/*
				$('html, body').animate({
				    scrollTop: $("#searchResults").offset().top
				}, 'fast');
				*/

				var that = this;

				if (!that.map) {
					$('#mapContainerMedium').parent().parent().show();
					that.map = L.mapbox.map('mapContainerMedium', 'pdiegmann.j90dpbeh');
					that.map.invalidateSize(true);
					that.map.setView([47, 9], 4);
				}

				that.loadedMarkers = {};
				that.bounds = [];
				that.markers = new L.MarkerClusterGroup({maxClusterRadius: 40});
				that.map.addLayer(that.markers);

				if (query && query.length > 0)
					Backbone.history.navigate("!/search/" + encodeURIComponent(query), true);
				else
					Backbone.history.navigate("!/search", true);
				
				var params = $('#search_details').serializeJSON();
				params.q = query;
				$.extend(this.collection.queryParams,params);
				this.collection.queryParams = params;

				this.collection.fetch().done(function() {
					var end = new Date().getMilliseconds();
					that.collection.executionTime = Math.abs((end - start) / 1000);
					var newItemCount = that.collection.length;

					if (newItemCount < that.collection.state.pageSize) {
						$('#loadMore').addClass('hide');
					}
					else {
						$('#loadMore').removeClass('hide');
					}

					if (that.collection.fullCollection.length == 0) {
						$('#info').html("Keine Ergebnisse gefunden!");
					}
					else if (that.collection.fullCollection.length == 1) {
						$('#info').html("Ein Ergebnis in " + that.collection.executionTime.toFixed(2) + "s gefunden.");
					}
					else {
						$('#info').html(that.collection.fullCollection.length + " Ergebnisse in " + that.collection.executionTime.toFixed(2) + "s gefunden.");
					}
				});
			}

			this.triggerCount++;
		},

		loadMore: function() {
			var start = new Date().getMilliseconds();
			var query = $('#mainSearchbar').val();
			if (query && query.length > 0 || this.triggerCount > 0) { 
				if (query && query.length > 0)
					Backbone.history.navigate("!/search/" + encodeURIComponent(query), true);
				else
					Backbone.history.navigate("!/search", true);
				var that = this;
				var params = $('#search_details').serializeJSON();
				params.q = query;
				var oldSize = this.collection.fullCollection.length;
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
					that.collection.each(function(location) {
						var html = (new LocationShortView({ model: location })).render().el;
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
			}
		},

		addLocation: function() {
			return;
			var location = this.collection[0];
			var html = (new LocationShortView({ model: location })).render().el;
			$(html).appendTo('.results');
		},

		renderCollection: function(collection) {
			//if (!collection)
				collection = this.collection;

			$('.results').html('');

			var that = this;

			if (collection.length > 0) { 
				$("<tr><thead><th>Name</th><th>Koordinaten</th><th>Adresse</th><th class=\"hidden-xs hidden-sm\">Erstellt</th></thead></tr>").appendTo('.results');
				collection.each(function(location) {
					if (!location.attributes.compiledAddress) {
						location.attributes.compiledAddress = "";
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.name, ", ");
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.street, ", ");
						if (!location.attributes.address.zip) location.attributes.address.zip = "";
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.zip.appendWithSeparator(location.attributes.address.city, " "), ", ");
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.county, ", ");
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.region, ", ");
						location.attributes.compiledAddress = location.attributes.compiledAddress.appendWithSeparator(location.attributes.address.country, ", ");
					}

					var html = (new LocationShortView({ model: location })).render().el;
					$(html).appendTo('.results');

					if (!(location._id in that.loadedMarkers)) {
						var _marker = L.marker([location.attributes.location[1], location.attributes.location[0]], {
						    icon: L.mapbox.marker.icon({
						        'marker-size': 'large',
						        'marker-symbol': 'camera',
						        'marker-color': '#428BCA'
						    }),
						    title: location.attributes.name
						});

						_marker.bindPopup(_.template(popupTemplate, {
							model: location.attributes
						}));

						that.markers.addLayer(_marker);

						that.loadedMarkers[location.attributes._id] = _marker;

						that.bounds.push(new L.latLng({ lat: location.attributes.location[1], lng: location.attributes.location[0] }));
					}

					that.map.fitBounds(new L.latLngBounds(that.bounds));
				});

				
			}
			else {
				$("<div><h1>:-(</h1><br/>Leider haben wir nichts passendes gefunden!<br />Du kennst die Location schon, die du suchst? Dann <a href=\"/!/+location\">füge sie doch hinzu</a> :-)</a></div></hr>").appendTo('.results');
			}
		},


	});

	return searchView;
});