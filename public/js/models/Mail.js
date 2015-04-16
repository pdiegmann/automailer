define(function(require) {
  var Mail = Backbone.Model.extend({
  	idAttribute: '_id',
  	urlRoot: '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/',
  	defaults: {
  	},
    initialize: function(){
        this.updateUrl();
    },
    updateUrl: function() {
      this.urlRoot = '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/'
    }
  });

  return Mail;
});
