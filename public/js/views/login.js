define(["BaseView", "text!templates/login.html"], function(BaseView, loginTemplate) {
	var loginView = BaseView.extend({
		el: $('#content'),

		initialize: function(options) {
			this.events = _.extend({}, this.genericEvents, this.events);
    		this.delegateEvents();
		},

		events: {
            'submit form': 'submit'
        },

		render: function() {
			this.$el.html(loginTemplate);
		},

		submit: function(e) {
			var that = this;
            e.preventDefault();
 			$.post("/login", $(this.$el).children("form").serializeJSON(), function(data) {
 				that.processReturn(data);
 				window.router.loggedIn = true;
				Backbone.history.history.back();
				$('.nav_logout').removeClass('hide');
				$('.nav_register').addClass('hide');
				$('.nav_login').addClass('hide');
			})
			.fail(function(xhr, textStatus, errorThrown) {
				var json = $.parseJSON(xhr.responseText);
				that.processReturn(json);
				window.router.navigate("!/login", true);
			});
			return false;
        }
	});

	return loginView;
});