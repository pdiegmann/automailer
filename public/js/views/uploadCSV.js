define(["text!templates/uploadCSV.html", "libs/dropzone-amd-module"], function(uploadTemplate, Dropzone) {
	var indexView = Backbone.View.extend({
		el: $('#content'),

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError'
        },

		render: function() {
			this.$el.html(_.template(uploadTemplate));

			var settings = { 
				maxFilesize: 12, 
				method: "put", 
				clickable: true, 
				createImageThumbnails: false, 
				acceptedFiles: "text/csv",
				url: "/dataset/" + $("#dataset-selector").val() + "/upload"
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

	return indexView;
});