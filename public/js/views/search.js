define(["Underscore", "text!templates/search.html", "text!templates/companyListShort.html", "text!templates/pagination.html", "models/Company", "models/CompanyCollection"], 
	function(_, searchTemplate, companyListShortTemplate, paginationTemplate, Company, CompanyCollection) {
	var searchView = Backbone.View.extend({
		el: $('#content'),
		triggerCount: 0,
		collection: new CompanyCollection(),

		events: {
			'click [data-gotoPage]': 'gotoPage',
			'click .setmailaddressstate': 'setMailAddressState',
			'click #sendMails': 'sendMails'
		},

		initialize: function() {
			this.listenTo(this.collection, 'sync', this.renderCollection);
			this.listenTo(this.collection, 'reset', this.renderCollection);
		},

		remove: function() {
			return Backbone.View.prototype.remove.call(this);
		},

		render: function() {
			this.collection.setDatasetId($('#dataset-selector').val());

			this.$el.html(searchTemplate);

			var that = this;

			$('a[href$="\#results"]').on("click", function(event) { 
				event.preventDefault();
			});

			$('a.triggerSearch').on("click", function(event) { 
				event.preventDefault(); 
				that.triggerSearch();
			});

			$.get("/dataset/" + $('#dataset-selector').val() + "/mail/templates", function(res) {
				$('#template-selector').html("<option value=\"\">-- Wählen --</option>");
				if (res.results && res.results.length > 0) {
					for (var i = 0; i < res.results.length; i++) {
						$('#template-selector').append("<option value=\"" + res.results[i]._id + "\">" + res.results[i].name + "</option>");
					}
				}
			});
		},

		triggerSearch: function() {
			$('.results').empty();

			var that = this;

			Backbone.history.navigate("!/search", true);
			
			var params = $('#search_details').serializeJSON();
			if (!this.collection.queryParams) this.collection.queryParams = {};
			$.extend(this.collection.queryParams,params);

			this.showLoading();

			this.collection.getFirstPage().done(function() {
				that.doneFetchingPage();
			});

			this.triggerCount++;
		},

		renderCollection: function(collection) {
			if (!collection)
				collection = this.collection;

			var departementSegments = $("input[name='executive[departement]']").val() ? $("input[name='executive[departement]']").val().split(',') : [];
			var departementRegexStr = "";
			for (var i in departementSegments) {
				if (!departementSegments[i] || departementSegments[i].length <= 0) continue;
				if (departementRegexStr.length > 0) departementRegexStr += "|";
				departementRegexStr += ".\*" + departementSegments[i].trim() + ".\*";
			}

			var positionSegments = $("input[name='executive[position]']").val() ? $("input[name='executive[position]']").val().split(',') : [];
			var positionRegexStr = "";
			for (var i in positionSegments) {
				if (!positionSegments[i] || positionSegments[i].length <= 0) continue;
				if (positionRegexStr.length > 0) positionRegexStr += "|";
				positionRegexStr += ".\*" + positionSegments[i].trim() + ".\*";
			}

			var locationSegments = $("input[name='executive[location]']").val() ? $("input[name='executive[location]']").val().split(',') : [];
			var locationRegexStr = "";
			for (var i in locationSegments) {
				if (!locationSegments[i] || locationSegments[i].length <= 0) continue;
				if (locationRegexStr.length > 0) locationRegexStr += "|";
				locationRegexStr += ".\*" + locationSegments[i].trim() + ".\*";
			}

			var t = _.template(companyListShortTemplate)({
                "model": collection.toJSON(),
                "state": collection.state,
                "departementRegex": departementRegexStr && departementRegexStr.length > 0 ? new RegExp(departementRegexStr) : null,
                "positionRegex": positionRegexStr && positionRegexStr.length > 0 ? new RegExp(positionRegexStr) : null,
                "locationRegex": locationRegexStr && locationRegexStr.length > 0 ? new RegExp(locationRegexStr) : null
            });

			$('.results').html(t);

			this.renderPagination();
		},

		renderPagination: function(collection) {
			if (!collection)
				collection = this.collection;

			var t = _.template(paginationTemplate)({
                "model": collection,
                "surroundingPages": 5
            });

			$('ul.pagination').html(t);
		},

		doneFetchingPage: function() {
			$('html, body').animate({
				scrollTop: $("#info").offset().top - $('#mainNavBar').outerHeight(true)
			}, 'fast');

			if (this.collection.state.totalRecords == 0) {
				$('#sendMails').addClass("disabled");
				$('#info').html("Keine Ergebnisse gefunden!");
			}
			else if (this.collection.state.totalRecords == 1) {
				$('#sendMails').removeClass("disabled");
				$('#info').html("Ein Ergebnis in " + (this.collection.duration / 1000).toFixed(2) + "s gefunden.");
			}
			else {
				$('#sendMails').removeClass("disabled");
				$('#info').html(this.collection.state.totalRecords + " Ergebnisse in " + (this.collection.duration / 1000).toFixed(2) + "s gefunden.");
			}

			this.hideLoading();
		},

		gotoPage: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("gotopage")) $e = $e.parent();

			var page = $e.data("gotopage");
			if (this.collection && page) {
				var that = this;
				this.showLoading();
				this.collection.getPage(page).done(function() {
					that.doneFetchingPage();
				});
			}

			return false;
		},

		setMailAddressState: function(e) {
			e.preventDefault();
			var $e = $(e.target);
			if (!$e.data("addressid")) $e = $e.parent();
			if (!$e.data("addressid")) $e = $e.parent();

			var addressid = $e.data("addressid");
			var state = $e.data("state");
			// 0 == untried, 1 == in progress, 2 == successfull, 3 == failed

			if (addressid && !isNaN(state)) {
				$e.addClass("disabled");
				$e.siblings("a[data-state]").addClass("disabled");

				var $siblings = $e.siblings("span");
				$siblings.removeClass("text-success");
				$siblings.removeClass("text-info");
				$siblings.removeClass("text-warning");
				$siblings.removeClass("text-danger");

				switch (state) {
					case 0: {
						break;
					}
					case 1: {
						$siblings.addClass("text-info");
						break;
					}
					case 2: {
						$siblings.addClass("text-success");
						break;
					}
					case 3: {
						$siblings.addClass("text-danger");
						break;
					}
					default: break;
				}

				// /dataset/:datasetid/mail/address/:addressid
				$.post("/dataset/" + $('#dataset-selector').val() + "/mail/address/" + addressid, { state: state }, function(res) {
					$e.removeClass("disabled");
					$e.siblings("a[data-state]").removeClass("disabled");
					$e.addClass("disabled");
					//$e.siblings("a[data-state='" + state + "'][data-addressid='" + addressid + "']").addClass("disabled");
				});
			}
		},

		sendMails: function(e) {
			e.preventDefault();
			var templateid = $('#template-selector').val();

			if (this.collection.personCount < 1 || !templateid || templateid.length <= 0) {
				return;
			}	

			var $e = $(e.target);
			if ($e.data("confirmed") == undefined) $e = $e.parent();
			if ($e.data("confirmed") == undefined) {
				$e = $(e.target);
				$e.data("confirmed", false);
			}
			var confirmed = $e.data("confirmed");

        	if (confirmed == false) {
        		if (this.collection.personCount > 1) {
        			$e.text(this.collection.personCount + " Mails senden?");
        		}
        		else {
        			$e.text("Eine Mail senden?");	
        		}
        		$e.removeClass("btn-danger");
        		$e.addClass("btn-warning");
        		$e.data("confirmed", true);
        	}
        	else {
        		$e.addClass("disabled");
        		$e.removeClass("btn-warning");
				$e.addClass("btn-info");
				$e.text("Sende...");
				$e.data("confirmed", null);

				var params = $('#search_details').serializeJSON();

				$.post("/dataset/" + $("#dataset-selector").val() + "/mail/send/template/" + templateid, params, function(res) {
					$e.removeClass("btn-info");
	        		$e.addClass("btn-success");
	        		$e.text("Alle Mails gesendet!");
				});
        	}
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

	return searchView;
});