define(['models/Company'], function(Company) {
	var CompanyCollection = Backbone.PageableCollection.extend({
		model: Company,
		url: '/dataset/' + $('#dataset-selector').val() + '/filter',
		parse: function (resp) {
			console.log(resp.duration);
			console.log(resp.total);
			console.log(resp.results.length);
			if (resp.results && resp.duration && !isNaN(resp.duration)) this.duration = resp.duration;
			if (resp.results && resp.total && !isNaN(resp.total)) this.state.totalRecords = resp.total;

	        return resp.results ? resp.results : resp;
	    },
		state: {
    		firstPage: 0,
    		totalRecords: 0,
    		pageSize: 25
    	},
		queryParams: {
			currentPage: "page",
			pageSize: "take",
			skip: function () { return this.state.currentPage * this.state.pageSize; }
		},
		setDatasetId: function(datasetid) {
			this.url = '/dataset/' + datasetid + '/filter';
		}
	});

  return CompanyCollection;
});