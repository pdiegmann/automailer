define(["text!templates/addPicture.html", "models/Location", "libs/dropzone-amd-module"], function(pictureTemplate, Location, Dropzone) {
	var addPictureView = Backbone.View.extend({
		el: $('#content'),

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError'
        },

		initialize: function() {
			if (!this.model)
				this.model = new Location();
			this.model.on('reset', this.render, this);
			this.model.on('sync', this.render, this);
		},

		render: function() {
			$(this.el).html(_.template(pictureTemplate, {
				model: this.model.toJSON()
			}));

			var settings = { 
				maxFilesize: 12, 
				method: "put", 
				clickable: true, 
				createImageThumbnails: true, 
				thumbnailWidth: 200, 
				thumbnailHeight: 200, 
				acceptedFiles: "image/*",
				url: "/upload"
			};
			var myDropzone = new Dropzone("#pictureUploadDropzone", settings);

			return this;
		},

		handleAjaxError: function (event, request, settings, thrownError) {
			console.log(event + " " + request + " " + settings + " " + thrownError);
		},

		showInfo: function(message) {
			$('div.progress').hide();
			$('strong.message').text(message);
			$('div.alert').show();
		},

		submit: function(e) {
		    e.preventDefault();
		    return false;
        }
	});

	return addPictureView;
});