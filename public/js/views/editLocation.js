define(["BaseView", "text!templates/editLocation.html", "text!templates/map_popup.html", "models/Location"], function(BaseView, locationTemplate, popupTemplate, Location) {
	var locationView = BaseView.extend({
		el: $('#content'),
		map: null,
		marker: null,
		markers: null,
		loadedMarkers: {},

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError',
            'click #getInfoFromFlickr': 'getInfoFromFlickr',
            'click #loadInfoFromFlickr': 'loadInfoFromFlickr',
            'click #addFlickrPhoto': 'showAddFlickrPhotoForm',
            'click #addPhotoFromFlickr': 'addFlickrPhoto'
        },

		initialize: function() {
			if (!this.model)
				this.model = new Location();
			this.model.on('reset', this.render, this);
			this.model.on('sync', this.render, this);
			this.model.on('change', this.render, this);
			L.mapbox.accessToken = 'pk.eyJ1IjoicGRpZWdtYW5uIiwiYSI6IkhYWGdVYTgifQ.dQNWOWUBTufNb8PAXdzz4A';
		},

		createMarker: function(lat, lng) {
			return L.marker([lat, lng], {
				    icon: L.mapbox.marker.icon({
				        'marker-size': 'large',
				        'marker-symbol': 'camera',
				        'marker-color': '#428BCA'
				    }), 
				    draggable:'true'
				})
				.on('dragend', function(event){
		            var marker = event.target;
		            var position = marker.getLatLng();
		            $('#lat').val(position.lat);
		            $('#lng').val(position.lng);
		            marker.setLatLng([position.lat, position.lng],{draggable:'true'});
    			})
				.addTo(this.map);
		},

		updateMarker: function(e) {
			var that = this;
			if (e) e.preventDefault();
			if (!that.map) return;

			var lat = $('#lat').val();
			var lng = $('#lng').val();

			if (isNaN(lat) || isNaN(lng)) {
				try {
					lat = parseFloat(lat);
					lng = parseFloat(lng);
				}
				catch(e) { }
			}

			if (isNaN(lat) || isNaN(lng)) {
				return;
			}

			if (!that.marker) {
				that.marker = that.createMarker(lat, lng);
			}
			else {
				that.marker.setLatLng([lat, lng],{draggable:'true'});
			}

			that.map.panTo([lat, lng]);
		},

		updateMarkers: function() {
			var bounds = this.map.getBounds();
			var sw = bounds.getSouthWest();
			var nw = bounds.getNorthWest();
			var ne = bounds.getNorthEast();
			var se = bounds.getSouthEast();

			var that = this;
			var model = that.model ? that.model.toJSON() : null;
			
			//console.log("/map?latsw=" + sw.lat + "&lngsw=" + sw.lng + "&latnw=" + nw.lat + "&lngnw=" + nw.lng + "&latne=" + ne.lat + "&lngne=" + ne.lng + "&latse=" + se.lat + "&lngse=" + se.lng + "&take=1500");

			$.get('/map', { "latsw": sw.lat, "lngsw": sw.lng, "latnw": nw.lat, "lngnw": nw.lng, "latne": ne.lat, "lngne": ne.lng, "latse": se.lat, "lngse": se.lng, "take": 1500 }, function (data) {
				if (data instanceof Array) {
					if (!that.markers) {
						that.loadedMarkers = {};
						that.markers = new L.layerGroup();
						that.map.addLayer(that.markers);
					}

					var element;
					for (var i in data) {
						element = data[i];

						if (element._id in that.loadedMarkers || (model && element._id == model._id)) continue;

						var _marker = L.marker([element.location[1], element.location[0]], {
						    icon: L.mapbox.marker.icon({
						        'marker-size': 'medium',
						        'marker-symbol': 'camera',
						        'marker-color': '#68ca42'
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

		render: function() {
			$(this.el).html(_.template(locationTemplate, {
				model: this.model.toJSON()
			}));
		
			var that = this;

    		$('#lat').bind('input', that.updateMarker);
    		$('#lng').bind('input', that.updateMarker);
    		$('#lat').bind('onchange', that.updateMarker);
    		$('#lng').bind('onchange', that.updateMarker);

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

			$('.deletePicture').on('click', function(e) {
				e.preventDefault();
				var deleted = $('#deletePictures').val();
				if (!deleted || deleted.length <= 0) {
					deleted = '[' + ($(e.target).data('number') - 1) + ']';
				}
				else {
					deleted = deleted.slice(0, deleted.length - 1);
					deleted += ',' + ($(e.target).data('number') - 1) + ']';
				}
				$('#deletePictures').val(deleted);
				console.log($('#deletePictures').val());
				$(e.target).parent().remove();
			});

			var that = this;
			window.setTimeout(function() {
				if (!that.map) that.map = L.mapbox.map('mapContainer', 'pdiegmann.j90dpbeh');
				that.map.on('click', function(e) {
					that.map.invalidateSize(true);
					if (!that.marker) {
						that.marker = that.createMarker(e.latlng.lat, e.latlng.lng);
					}
					else {
						that.marker.setLatLng([e.latlng.lat, e.latlng.lng],{draggable:'true'});
					}
					$('#lat').val(e.latlng.lat);
			        $('#lng').val(e.latlng.lng);
				});

	    		var model = that.model ? that.model.toJSON() : null;
	    		
				if (that.map && model && model.location && model.location.length == 2 && model.location[0] && model.location[1] && !isNaN(model.location[0]) && !isNaN(model.location[1])) {
					that.map.setView([model.location[1], model.location[0]], 13);
					that.marker = that.createMarker(model.location[1], model.location[0]);
				}
				else {
					that.map.setView([50.93728313036512, 6.957950592041015], 13);
				}

				that.map.on("moveend", function() { that.updateMarkers() });
				that.map.on("zoomend", function() { that.updateMarkers() });
				that.map.on("resize", function() { that.updateMarkers() });

				that.updateMarkers();
			}, 150);

			return this;
		},

		handleAjaxError: function (event, request, settings, thrownError) {
			console.log(event + " " + request + " " + settings + " " + thrownError);
		},

		submit: function(e) {
			if (e) {
            	e.preventDefault();
        	}
            var data = $(this.$el).find("form").serializeJSON();
            try { data.deletePictures = JSON.parse($('#deletePictures').val()); }
            catch(ex) { data.deletePictures = []; }
            try { data.addFlickrPicture = JSON.parse($('#addFlickrPicture').val()); }
            catch(ex) { data.addFlickrPicture = []; }

            var that = this;

            var hadId = (this.model && this.model.id != undefined && this.model.id != null && this.model.id.length > 0);

 			$.post("/location/" + (this.model && this.model.id ? this.model.id : ""), data, function(data) {
 				that.processReturn(data);
 				if (hadId) {
					Backbone.history.navigate("!/location/" + data.id, true);
 				}
 				else {
					Backbone.history.navigate("!/editLocation/" + data.id, true);
				}
			}).fail(function(xhr, textStatus, errorThrown) {
				try {
					var json = $.parseJSON(xhr.responseText);
					console.log(json);
					that.processReturn(json);
				}
				catch (e) { }
				window.router.navigate("!/editLocation/" + (this.model && this.model.id ? this.model.id : ""), true);
			});
        },

        getInfoFromFlickr: function(e) {
        	if (e) {
        		e.preventDefault();
        	}

    		$('#flickrInitDataGroup').show();
    		$('#getInfoFromFlickr').hide();

    		document.getElementById("flickrInitUrl").focus();
        },

        loadInfoFromFlickr: function(e) {
        	if (e) {
        		e.preventDefault();
        	}

    		$('#flickrInitDataGroup').hide();
    		$('#getInfoFromFlickr').show();
    		var flickrUrl = $('#flickrInitUrl').val();

    		var that = this;

    		$.get("/flickr/info/" + encodeURIComponent(flickrUrl), function(data) {
    			$('input[name=name]').val(data.title);
    			if (data.location && data.location.length == 2) {
	    			$('input#lat').val(data.location[1]);
	    			$('input#lng').val(data.location[0]);
	    			that.updateMarker(null);
    			}
    			$('input#county').val(data.county);
    			$('input#region').val(data.region);
    			$('input#country').val(data.country);
    			$('textarea[name=tags_]').val(data.tags_);
    			$('textarea[name=description]').val(data.description);
    			var pictureData = {
    				"flickrBase": data.flickrBase, 
    				"displayUrl": data.displayUrl, 
    				"owner": { 
    					"name": data.owner.name, 
    					"profile": data.owner.profile 
    				}, 
    				"taken": data.taken,
    				"tags_": data.tags_
    			};
    			$('input#addFlickrPicture').val(JSON.stringify(pictureData));
    		}).fail(function(xhr, textStatus, errorThrown) {
				try {
					var json = $.parseJSON(xhr.responseText);
					console.log(json);
					that.processReturn(json);
				}
				catch (e) { }
				window.router.navigate("!/editLocation/" + (this.model && this.model.id ? this.model.id : ""), true);
			});

			return false;
        },

        showAddFlickrPhotoForm: function(e) {
        	if (e) {
        		e.preventDefault();
        	}

        	$('#flickrPhotoButtonRow').hide();
    		$('#addFlickrPhotoGroup').show();

    		document.getElementById("flickrAddUrl").focus();
        },

        addFlickrPhoto: function(e) {
        	if (e) {
        		e.preventDefault();
        	}
        	
    		var flickrUrl = $("#flickrAddUrl").val();

    		if (!flickrUrl || flickrUrl.length <= 0) return;

			$('#flickrPhotoButtonRow').show();
    		$('#addFlickrPhotoGroup').hide();

    		var that = this;

        	$.post("/location/" + (this.model && this.model.id ? this.model.id : "") + "/photo/add/flickr/" + encodeURIComponent(flickrUrl), function(data) {
        		that.processReturn(data);
        		that.model.fetch({success: function (model) {}});
        	}).fail(function(xhr, textStatus, errorThrown) {
        		try {
					var json = $.parseJSON(xhr.responseText);
					console.log(json);
					that.processReturn(json);
				}
				catch (e) { }
				window.router.navigate("!/editLocation/" + (this.model && this.model.id ? this.model.id : ""), true);
			});
        }
	});

	return locationView;
});