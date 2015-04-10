define(["BaseView", "text!templates/logout.html"], function(BaseView, loginTemplate) {
	var loginView = BaseView.extend({
		el: $('#content'),

		render: function() {
			var that = this;
			$.get("/logout", function(data) {
				that.processReturn(data);
				window.router.loggedIn = false;
				Backbone.history.navigate("!/", true);
				$('.nav_logout').addClass('hide');
				$('.nav_register').removeClass('hide');
				$('.nav_login').removeClass('hide');
			})
			.fail(function(xhr, textStatus, errorThrown) {
				var json = $.parseJSON(xhr.responseText);
				that.processReturn(json);
				Backbone.history.navigate("!/", true);
			});
		}
	});

	return loginView;
});