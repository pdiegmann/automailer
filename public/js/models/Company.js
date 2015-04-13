define(function(require) {
  var Company = Backbone.Model.extend({
  	idAttribute: '_id',
  	urlRoot: '/company',
  	defaults: {
  		name: '',
  		address: { name: '', street: '', zip: '', city: '', country: '' },
      branch: { NACE: 0, USSIC: 0 },
      revenue: { amount: 0, year: 0}
  	},
    initialize: function(){
        this.compileAddress();
    },
    compileAddress: function() {
      if (!this.attributes.compiledAddress) {
        this.attributes.compiledAddress = "";
        this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.name, ", ");
        this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.street, ", ");
        if (!this.attributes.address.zip) this.attributes.address.zip = "";
        this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.zip.appendWithSeparator(this.attributes.address.city, " "), ", <br/>");
        if (this.attributes.address.county && this.attributes.address.county.length > 0) this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.county, ", <br/>");
        else this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator("", ", <br/>");
        if (this.attributes.address.region && this.attributes.address.region.length > 0) this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.region, ", ");
        this.attributes.compiledAddress = this.attributes.compiledAddress.appendWithSeparator(this.attributes.address.country, ", <br/>");
      }
      return true;
    }
  });

  return Company;
});
