define(function(require) {
  var MailList = Backbone.Model.extend({
  	idAttribute: '_id',
  	urlRoot: '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/list',
  	defaults: {
  	},
    initialize: function(){
        this.updateUrl();
    },
    updateUrl: function() {
      this.urlRoot = '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/list'
    }
  });

  return MailList;
});
