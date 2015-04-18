define(['models/MailList'], function(MailList) {
	var MailListCollection = Backbone.PageableCollection.extend({
		model: MailList,
		url: '/dataset/' + $('#dataset-selector').val() + '/mail/lists',
	    parseRecords: function (resp, options) {
          return resp.results ? resp.results : resp;
        },
	    parseState: function (resp, queryParams, state, options) {
	      if (resp.results && resp.duration && !isNaN(resp.duration)) this.duration = resp.duration;
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
			this.url = '/dataset/' + datasetid + '/mail/lists';
		}
	});

  return MailListCollection;
});