define(["text!templates/uploadCSV.html", "libs/dropzone-amd-module"], function(uploadTemplate, Dropzone) {
	var indexView = Backbone.View.extend({
		el: $('#content'),

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError',
            'click #clearcsv': 'clearCSV'
        },

		render: function() {
			this.$el.html(_.template(uploadTemplate));

			$('#pictureUploadDropzone').attr("action", "/dataset/" + $('#dataset-selector').val() + "/upload");

			var settings = { 
				maxFilesize: 12, 
				method: "put", 
				clickable: true, 
				createImageThumbnails: false, 
				//acceptedFiles: "text/csv",
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
        },

        clearCSV: function(e) {
        	e.preventDefault();
        	var $e = $(e.target);
			if ($e.data("confirmed") == undefined) $e = $e.parent();
			var confirmed = $e.data("confirmed");

        	if (confirmed == false) {
        		$e.text("Sind Sie sicher, dass Sie den Datensatz löschen möchten?");
        		$e.removeClass("btn-danger");
        		$e.addClass("btn-warning");
        		$e.data("confirmed", true);
        	}
        	else {
        		$e.addClass("disabled");
        		$e.removeClass("btn-warning");
				$e.addClass("btn-info");
				$e.text("Lösche...");
				$e.data("confirmed", null);

				$.ajax({
					url: "/dataset/" + $('#dataset-selector').val(),
					type: 'DELETE',
					success: function(response) {
						$e.removeClass("btn-info");
		        		$e.addClass("btn-success");
		        		$e.text("Alle Daten gelöscht!");
					}
				});
        	}
        }
	});

	return indexView;
});