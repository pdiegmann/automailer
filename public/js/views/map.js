define(["BaseView", "text!templates/map.html", "text!templates/map_popup.html"], function(BaseView, mapTemplate, popupTemplate, Location) {
	var locationView = BaseView.extend({
		el: $('#content'),
		map: null,
		markers: null,
		loadedMarkers: {},

		events: {
			'click #showMeOnMap': 'showMeOnMap'
		},

		initialize: function() {
			L.mapbox.accessToken = 'pk.eyJ1IjoicGRpZWdtYW5uIiwiYSI6IkhYWGdVYTgifQ.dQNWOWUBTufNb8PAXdzz4A';
		},

		updateMarkers: function() {
			var bounds = this.map.getBounds();
			var sw = bounds.getSouthWest();
			var nw = bounds.getNorthWest();
			var ne = bounds.getNorthEast();
			var se = bounds.getSouthEast();

			var that = this;
			
			//console.log("/map?latsw=" + sw.lat + "&lngsw=" + sw.lng + "&latnw=" + nw.lat + "&lngnw=" + nw.lng + "&latne=" + ne.lat + "&lngne=" + ne.lng + "&latse=" + se.lat + "&lngse=" + se.lng + "&take=1500");

			$.get('/map', { "latsw": sw.lat, "lngsw": sw.lng, "latnw": nw.lat, "lngnw": nw.lng, "latne": ne.lat, "lngne": ne.lng, "latse": se.lat, "lngse": se.lng, "take": 1500 }, function (data) {
				if (data instanceof Array) {
					if (!that.markers) {
						that.loadedMarkers = {};
						that.markers = new L.MarkerClusterGroup({maxClusterRadius: 40});
						that.map.addLayer(that.markers);
					}

					var element;
					for (var i in data) {
						element = data[i];
						
						if (element._id in that.loadedMarkers) continue;

						var _marker = L.marker([element.location[1], element.location[0]], {
						    icon: L.mapbox.marker.icon({
						        'marker-size': 'large',
						        'marker-symbol': 'camera',
						        'marker-color': '#428BCA'
						    }),
						    title: element.name
						});

						_marker.bindPopup(_.template(popupTemplate, {
							model: element
						}));

						that.markers.addLayer(_marker);

						that.loadedMarkers[element._id] = _marker;
					}
				}
			}).fail(function(xhr, textStatus, errorThrown) {
				try {
					console.log(JSON.stringify(xhr));
					var json = $.parseJSON(xhr.responseText);
					console.log(json);
				}
				catch (e) { }
				that.processReturn(json);
			});
		},

		showMeOnMap: function() {
			var that = this;

			if (navigator && navigator.geolocation && navigator.geolocation.getCurrentPosition) {
				navigator.geolocation.getCurrentPosition(function(location) {
					if (location && location.coords) {
						if (that.map) {
							L.marker({lat: location.coords.latitude, lng: location.coords.longitude}).addTo(that.map);
							L.circle({lat: location.coords.latitude, lng: location.coords.longitude}, location.coords.accuracy / 2).addTo(that.map);
							if (that.map.getZoom() < 9) {
								that.map.setView({lat: location.coords.latitude, lng: location.coords.longitude}, 12, {animate:true});
							}
							else {
								that.map.panTo({lat: location.coords.latitude, lng: location.coords.longitude});
							}
						}
					}
				}, function(err) {
					alert("Upps, da ist was schief gelaufen!")
				},
				{
					'enableHighAccuracy': false,
					'timeout': 30000,
					'maximumAge': 0}
				);
			}
			else {
				alert("Dein Browser unterstützt leider keine Positionierung.")
			}
		},

		render: function() {
			$(this.el).html(_.template(mapTemplate));
			
			var that = this;

			$('#mapContainerLarge').height($(document).height() - $('#mainNavBarMeasure').outerHeight(false) - $('#mainFooter').outerHeight(true) - 9);

			window.setTimeout(function() {
				that.map = L.mapbox.map('mapContainerLarge', 'pdiegmann.j90dpbeh');
				that.map.invalidateSize(true);
				that.map.setView([47, 9], 4);

				that.map.on("moveend", function() { that.updateMarkers() });
				that.map.on("zoomend", function() { that.updateMarkers() });
				that.map.on("resize", function() { that.updateMarkers() });

				that.updateMarkers();
			}, 150);
			
			return this;
		}
	});

	return locationView;
});