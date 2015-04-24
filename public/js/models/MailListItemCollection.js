define(['models/MailList'], function(MailList) {
	var MailListItemCollection = Backbone.PageableCollection.extend({
		model: MailList,
		url: '/dataset/' + (this.attributes && this.attributes.dataset ? this.attributes.dataset : "") + '/mail/list/' + (this.attributes && this.attributes.maillistid ? this.attributes.maillistid : ""),
		initialize: function(maillistid, datasetid) {
			this.updateUrl();
		},
	    parseRecords: function (resp, options) {
	      if (resp.mailingList) { this.mailList = resp.mailingList; }
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
		updateUrl: function(datasetid, maillistid) {
			this.url = '/dataset/' + datasetid + '/mail/list/' + maillistid;
	    }
	});

  return MailListItemCollection;
});