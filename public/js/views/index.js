define(["text!templates/index.html", "libs/dropzone-amd-module"], function(indexTemplate, Dropzone) {
	var indexView = Backbone.View.extend({
		el: $('#content'),

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError'
        },

		render: function() {
			this.$el.html(_.template(indexTemplate));

			var settings = { 
				maxFilesize: 12, 
				method: "put", 
				clickable: true, 
				createImageThumbnails: false, 
				acceptedFiles: "text/csv",
				url: "/dataset/5527b9848ec8e42413424b91/upload"
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