define(function(require) {
  var MailTemplate = Backbone.Model.extend({
  	idAttribute: '_id',
  	urlRoot: '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/template/',
  	defaults: {
  		name: '',
      subject: '',
  		content: '',
      dataset: ''
  	},
    initialize: function(){
        this.updateUrl();
    },
    updateUrl: function() {
      this.urlRoot = '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/template/'
    }
  });

  return MailTemplate;
});
