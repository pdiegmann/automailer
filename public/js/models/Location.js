define(function(require) {
  var Location = Backbone.Model.extend({
  	idAttribute: '_id',
  	urlRoot: '/location',
  	defaults: {
  		name: '',
  		location: { lat: '', lng: '' },
  		address: { name: '', street: '', zip: '', city: '', country: '' }
  	}
  });

  return Location;
});
