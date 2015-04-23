define(["text!templates/other.html"], function(otherTemplate) {
	var otherView = Backbone.View.extend({
		el: $('#content'),

		events: {
			'click #maleNames': 'maleNames',
			'click #femaleNames': 'femaleNames',
			'click #excludeCompanies': 'excludeCompanies'
		},

		render: function() {
			this.$el.html(_.template(otherTemplate));

			return this;
		},

		excludeCompanies: function(e) {
			e.preventDefault();
			var params = $('#excludeCompaniesForm').serializeJSON({checkboxUncheckedValue:"false"});
			this.showLoading();
			var that = this;

			$.get("/dataset/" + $("#dataset-selector").val() + "/companies/exclude/publisher/" + params.publisher + "/" + params.publisherids, function(res) {
				that.hideLoading();
			});
		},

		maleNames: function(e) {
			e.preventDefault();
			var params = $('#genderFirstNameForm').serializeJSON({checkboxUncheckedValue:"false"});
			this.showLoading();
			var that = this;
			$.get("/dataset/" + $("#dataset-selector").val() + "/names/male/put/" + params.names, function(res) {
				that.hideLoading();
			});
		},

		femaleNames: function(e) {
			e.preventDefault();
			var params = $('#genderFirstNameForm').serializeJSON({checkboxUncheckedValue:"false"});
			this.showLoading();
			var that = this;
			$.get("/dataset/" + $("#dataset-selector").val() + "/names/female/put/" + params.names, function(res) {
				that.hideLoading();
			});
		},

		hideLoading: function() {
			$('#loadingOverlay').remove();
		},

		showLoading: function() {
	        // add the overlay with loading image to the page
	        var over = "<div id='loadingOverlay'><div class='uil-ring-css' style='-webkit-transform:scale(0.89)'><div></div></div></div>";
	        $(over).appendTo('body');
		}
	});

	return otherView;
});