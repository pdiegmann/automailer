define(function(require) {
	var BaseView = function(options) {
		Backbone.View.call(this, options);
	}

	_.extend(BaseView.prototype, Backbone.View.prototype, {
		isRetina: function() {
			return window.devicePixelRatio > 1;
		},

		genericEvents: {
			'click a.forceReload': function(e) {
				console.log('go to ' + $(e.target).parent().attr('href'));
				Backbone.history.navigate($(e.target).parent().attr('href'));
				window.location.reload();
				return false;
			}
		},

		processReturn: function(data) {
			if (!data)
				return;
			if (data.error) {
				var messages = data.error;
				if (messages instanceof Array) {
					for (i = 0; i < messages.length; ++i) {
						this.addMessage(messages[i], "danger");
					}
				}
			}
			if (data.warning) {
				var messages = data.warning;
				if (messages instanceof Array) {
					for (i = 0; i < messages.length; ++i) {
						this.addMessage(messages[i], "warning");
					}
				}
			}
			if (data.info) {
				var messages = data.info;
				if (messages instanceof Array) {
					for (i = 0; i < messages.length; ++i) {
						this.addMessage(messages[i], "info");
					}
				}
			}
			if (data.success) {
				var messages = data.success;
				if (messages instanceof Array) {
					for (i = 0; i < messages.length; ++i) {
						this.addMessage(messages[i], "success");
					}
				}
			}
			
			if (data.permissions) {
				window.router.permissions = data.permissions;
			}
		},
		addMessage: function(message, type) {
			if (!type || (type && type.length <= 0))
				type = "info";
			messaging.message(type, message);
		}
	});
	
	BaseView.extend = Backbone.View.extend;

	return BaseView;
});
