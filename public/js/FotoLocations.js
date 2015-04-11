define(["router"], function(router) {
	var initialize = function() {
		runApplication();
		moment.locale('de');

		$('form.location_query').on("submit", function(event) {
			event.preventDefault();
			var query = $(this).find("input[name=q]").val();
			Backbone.history.navigate("!/search/" + encodeURIComponent(query), true);
		});
	};
	
	var runApplication = function(authenticated) {
		if (typeof String.prototype.endsWith != 'function') {
			String.prototype.endsWith = function(str) {
			    return this.indexOf(str, this.length - str.length) !== -1;
			};
		}
		if (typeof String.prototype.startsWith != 'function') {
			String.prototype.startsWith = function (str){
				return this.lastIndexOf(str, 0) === 0;
			};
		}
		String.prototype.wordCount = function() {
			var _match = this.match(/(\w+)/g);
			return _match ? _match.length : 0;
		};
		String.prototype.trimToWords = function(maxWords, appendDots) {
			appendDots = (appendDots || false);
			return this.wordCount() <= maxWords ? this : this.split(" ").splice(0, maxWords).join(" ") + (appendDots ? "..." : "");
		};
		String.prototype.appendWithSeparator = function(append, separator) {
			return this + (this.length > 0 && !this.endsWith(separator) ? (separator ? separator : "") : "") + (append ? append : "");
		};

		$('.nav a').on('click', function(){
		    $(".navbar-toggle").click();
		});

		Number.prototype.toFixed = function(digits) {
		    var pow = Math.pow(10, digits);

		    return Math.floor(this * pow) / pow;
		};

		$.ajaxSetup({
			cache: false,
			global: false,
			statusCode: {
				401: function() {
					Backbone.history.navigate("!/login", true);
				},
				404: function() {
					Backbone.history.navigate("!/notFound", true);
				},
				500: function() {
					Backbone.history.navigate("!/oops", true);
				},
			}
		});
		$(document).ajaxStart(function() {
			$('#content').hide();
			$('#mainSpinner').html("<div class=\"spinner\"></div>");
			/*$('#content').fadeOut(function() {
				$('#mainSpinner').html("<div class=\"spinner\"></div>");
				$('#mainSpinner').fadeIn();
			});*/
		});
		$(document).ajaxStop(function() {
			$('#content').show();
			$('#mainSpinner').html("");
			/*$('#mainSpinner').fadeOut(function() {
				$('#content').fadeIn();
				$('#mainSpinner').html("");
			});*/
		});

		Backbone.history.start({pushState: true});

		$(window).on("orientationchange",function(){
			if ($('#mapContainerLarge')) {
				$('#mapContainerLarge').height($(document).height() - $('#mainNavBar').outerHeight(true) - $('#mainFooter').outerHeight(true));
				if (window.router && window.router.currentView && window.router.currentView.map) {
					window.router.currentView.map.invalidateSize(true);
				}
			}
		});
		$(window).on("resize",function(){
			if ($('#mapContainerLarge')) {
				$('#mapContainerLarge').height($(document).height() - $('#mainNavBar').outerHeight(true) - $('#mainFooter').outerHeight(true));
				if (window.router && window.router.currentView && window.router.currentView.map) {
					window.router.currentView.map.invalidateSize(true);
				}
			}
		});

		$('.nav li:not(.alwaysVisible)').each(function(index, li) { 
			$(li).addClass("disabled");
			$(li).on("click", function(e) {
				e.preventDefault();
				return false;
			});
		});

		$.get('/datasets/all', function(datasets) {
			$('#dataset-selector option:not(.fixedOption)').remove();
			$.each(datasets, function(index, dataset) {
				$('#dataset-selector').append("<option value=\"" + dataset._id + "\">" + dataset.name + "</option>");
			});

			$('#dataset-selector').on("change", function(e) {
				$('.nav li.disabled:not(.alwaysVisible)').each(function(index, li) { 
					$(li).removeClass("disabled");
					$(li).unbind("click");
				});
				$('#dataset-selector').unbind("change");
			});
		});
	}

	return {
		initialize: initialize
	};
});