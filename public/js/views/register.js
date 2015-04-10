define(["BaseView", "text!templates/register.html"], function(BaseView, loginTemplate) {
	var loginView = BaseView.extend({
		el: $('#content'),

		initialize: function(options) {
			this.events = _.extend({}, this.genericEvents, this.events);
    		this.delegateEvents();
		},

		events: {
            'submit form': 'submit',
            'error': 'handleAjaxError'
        },

		render: function() {
			this.$el.html(loginTemplate);
		},

		handleAjaxError: function (event, request, settings, thrownError) {
			console.log(event + " " + request + " " + settings + " " + thrownError);
		},

		submit: function(e) {
            e.preventDefault();
            var that = this;
 			$.post("/register/", $(this.$el).children("form").serializeJSON(), function(json) {
 				that.processReturn(json);
				Backbone.history.navigate("!/", true);
				$('.nav_logout').removeClass('hide');
				$('.nav_register').addClass('hide');
				$('.nav_login').addClass('hide');
			})
			.fail(function(xhr, textStatus, errorThrown) {
				console.log(textStatus);
				console.log(errorThrown);
				var json = $.parseJSON(xhr.responseText);
				console.log(json);
				that.processReturn(json);
				window.router.navigate("!/register", true);
			});
        }
	});

	return loginView;
});