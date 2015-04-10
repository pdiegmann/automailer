define(["text!templates/location.html", "models/Location"], function(locationTemplate, Location) {
	var locationView = Backbone.View.extend({
		el: $('#content'),
		map: null,
		marker: null,

		initialize: function() {
			if (!this.model)
				this.model = new Location();
			this.model.on('reset', this.render, this);
			this.model.on('sync', this.render, this);
			L.mapbox.accessToken = 'pk.eyJ1IjoicGRpZWdtYW5uIiwiYSI6IkhYWGdVYTgifQ.dQNWOWUBTufNb8PAXdzz4A';
			$('.carousel').carousel();
		},

		render: function() {
			$(this.el).html(_.template(locationTemplate, {
				model: this.model.toJSON()
			}));

			var that = this;

			$('#increaseMapSize').on('click', function(e) {
				e.preventDefault();
				var mapContainer = $(that.map.getContainer());
				if (mapContainer) {
					var expanded = mapContainer.height() > 200;
					mapContainer.animate({ height: expanded ? 200 : 600 }, 300);
					that.map.invalidateSize(true);
					
					window.setTimeout(function() {
						var model = that.model ? that.model.toJSON() : null;
						if (that.map && model && model.location && model.location.length == 2 && model.location[0] && model.location[1] && !isNaN(model.location[0]) && !isNaN(model.location[1])) {
							that.map.invalidateSize(true);
							that.map.panTo([model.location[1], model.location[0]]);
						}
					}, 350);

					$('#increaseMapSize').text(expanded ? "Karte vergrößern" : "Karte verkleinern");

					$('html, body').animate({
				        scrollTop: $("#beforeMapDivider").offset().top - $('#mainNavBarMeasure').outerHeight(true) + $("#beforeMapDivider").outerHeight(true)
				    }, 300);
				}
			});
			
			var that = this;
			window.setTimeout(function() {
				that.map = L.mapbox.map('mapContainer', 'pdiegmann.j90dpbeh');

	    		var model = that.model ? that.model.toJSON() : null;
	    		
				if (that.map && model && model.location && model.location.length == 2 && model.location[0] && model.location[1] && !isNaN(model.location[0]) && !isNaN(model.location[1])) {
					that.map.setView([model.location[1], model.location[0]], 13);
					that.marker = L.marker([model.location[1], model.location[0]], {
					    icon: L.mapbox.marker.icon({
					        'marker-size': 'large',
					        'marker-symbol': 'camera',
					        'marker-color': '#428BCA'
					    })
					}).addTo(that.map);
				}
				else {
					that.map.setView([50.93728313036512, 6.957950592041015], 13);
				}
			}, 150);
			
			return this;
		}
	});

	return locationView;
});