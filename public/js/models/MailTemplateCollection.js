define(['models/MailTemplate'], function(MailTemplate) {
	var MailTemplateCollection = Backbone.PageableCollection.extend({
		model: MailTemplate,
		url: '/dataset/' + $('#dataset-selector').val() + '/mail/templates',
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
			this.url = '/dataset/' + datasetid + '/mail/templates';
		}
	});

  return MailTemplateCollection;
});