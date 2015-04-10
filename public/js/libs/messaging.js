define(['module'], function (module) {
    
    messaging = function() {};

    messaging.createAlert = function(type, message) {
    	return $('<div class="alert alert-' + type + ' alert-dismissable fade in"><button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button><span>'+message+'</span></div>');
    };
    messaging.appendAlert = function(alert) {
    	$('#messages').append(alert);
    	return alert;
    };
    messaging.autoCloseAlert = function(alert, timeout) {
    	if (!timeout || timeout < 1000) timeout = this.autoTimeout;
    	window.setTimeout(function() { alert.alert('close'); }, timeout);
    	return alert;
    };

    messaging.autoTimeout = 4000;

    messaging.message = function(type, message) {
        return messaging.autoCloseAlert(messaging.messageSticky(type, message));
    }

    messaging.error = function(message) {
		return messaging.autoCloseAlert(messaging.errorSticky(message));
    }

    messaging.warning = function(message) {
        return messaging.autoCloseAlert(messaging.warningSticky(message));
    }
        
    messaging.info = function(message) {
        return messaging.autoCloseAlert(messaging.infoSticky(message));
    }

    messaging.success = function(message) {
        return messaging.autoCloseAlert(messaging.successSticky(message));
    }

    messaging.messageSticky = function(type, message) {
        return messaging.appendAlert(messaging.createAlert(type, message));
    }

    messaging.errorSticky = function(message) {
		return messaging.messageSticky("danger", message);
    }

    messaging.warningSticky = function(message) {
        return messaging.messageSticky("warning", message);
    }
        
    messaging.infoSticky = function(message) {
        return messaging.messageSticky("info", message);
    }

    messaging.successSticky = function(message) {
        return messaging.messageSticky("success", message);
    }
});