require.config({
	paths: {
		jQuery: "https://code.jquery.com/jquery-1.11.2.min", //"/js/libs/jquery",
		Bootstrap: "/js/libs/bootstrap",
		Select2: "/js/libs/select2",
		Select2DE: "/js/libs/select2_locale_de",
		Underscore: "https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.6.0/underscore-min", //"/js/libs/underscore",
		Backbone: "/js/libs/backbone",
		BackbonePageable: "/js/libs/backbone.paginator",
		InfiniScroll: "/js/libs/infiniScroll",
		text: "/js/libs/text",
		serializeJSON: "/js/libs/serializeJSON",
		Messaging: "/js/libs/messaging",
		templates: "../templates",
		models: "models",
		BaseView: "/js/BaseView",
		Upload: "/js/libs/dropzone.min",
		Leaflet: "https://api.tiles.mapbox.com/mapbox.js/v2.1.5/mapbox", //"/js/libs/mapbox",
		LeafletMarkerCluster: "/js/libs/leaflet.markercluster",
		Moment: "/js/libs/moment",
		summernote: "/js/libs/summernote.min",
		summernoteDE: "/js/libs/summernote-de-DE"
	},

	shim: {
		"serializeJSON": {
			deps: ["jQuery"]
		},
		"Select2": {
			deps: ["jQuery"]
		},
		"Select2DE": {
			deps: ["Select2"]
		},
		"Bootstrap": {
			deps: ["jQuery","Select2",  "serializeJSON", "Messaging"]
		},
		"Underscore": {
			deps: ["Moment"],
			exports: "_"
		},
		"Backbone": {
			deps: ["Underscore", "jQuery", "Messaging"],
			exports: "Backbone"
		},
		"BackbonePageable": {
			deps: ['Backbone','Underscore','jQuery'],
			exports: 'Backbone.Paginator'
		},
		"Upload": {
			deps: ['jQuery']
		},
		"LeafletMarkerCluster": {
			deps: ["jQuery", "Leaflet", "Moment"]
		},
		"summernote": {
			deps: ["jQuery", "Bootstrap"]
		},
		"summernoteDE": {
			deps: ["summernote"]
		},
		"FotoLocations": ["Backbone", "Bootstrap", "BackbonePageable", "Upload", "Moment", "summernoteDE"]
	}
});

require(["FotoLocations"], function(Fotolocations){
	Fotolocations.initialize();
})

function cutNumber(num, len) {
	if (!num || isNaN(num)) return num;
	if (!len || isNaN(len)) len = 5;
	return +num.toFixed(len);
}

function isRetina() {
	return window.devicePixelRatio > 1;
}