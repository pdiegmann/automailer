define(['models/Location', 'BackbonePageable'], function(Location, PageableCollection) {
	//PageableCollection = Backbone.Collection;
	var LocationCollection = PageableCollection.extend({
		model: Location,
		url: '/search',
		executionTime: 0.0,
		mode: "infinite",
		state: {
    		pageSize: 30,
    		sortKey: null,
    		firstPage: 0
    	},
		queryParams: {
			currentPage: "page",
			pageSize: "take",
			skip: function () { return this.state.currentPage * this.state.pageSize; }
		},
		parseLinks: function (res, xhr) {
			return { first: '/search', next: '/search', prev: '/search' };
		}
	});

  return LocationCollection;
});