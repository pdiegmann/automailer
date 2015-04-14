define(['models/Company'], function(Company) {
	var CompanyCollection = Backbone.PageableCollection.extend({
		model: Company,
		url: '/dataset/' + $('#dataset-selector').val() + '/filter',
	    parseRecords: function (resp, options) {
          return resp.results ? resp.results : resp;
        },
	    parseState: function (resp, queryParams, state, options) {
	      if (resp.results && resp.duration && !isNaN(resp.duration)) this.duration = resp.duration;
	      if (resp.personCount && resp.personCount && !isNaN(resp.personCount)) this.personCount = resp.personCount;
          return { totalRecords: resp.total };
        },
		state: {
    		pageSize: 25
    	},
		queryParams: {
			currentPage: null,
			pageSize: "take",
			skip: function () { return (this.state.currentPage - this.state.firstPage) * this.state.pageSize; }
		},
		setDatasetId: function(datasetid) {
			this.url = '/dataset/' + datasetid + '/filter';
		}
	});

  return CompanyCollection;
});