define(["views/index", "views/uploadCSV", "views/search", "views/mailtemplates", "views/mailtemplate", "views/mails", "views/notFound", "views/oops", "models/Company", "models/CompanyCollection", "models/MailTemplate", "models/MailTemplateCollection"], 
	function(IndexView, UploadCSVView, SearchView, MailTemplatesView, MailTemplateView, MailsView, NotFoundView, OopsView, Company, CompanyCollection, MailTemplate, MailTemplateCollection) {
	var Router = Backbone.Router.extend({
		currentView: null,
		initialize: function() {
			this.routesHit = 0;
			//keep count of number of routes handled by your application
			Backbone.history.on('route', function() { this.routesHit++; }, this);
			this.bind('route', this.googleAnalytics);
		},

		routes: {
			"!/index": "index",
			"!/upload/csv": "uploadCSV",
			"!/search": "search",
			"!/mail/template": "mailTemplate",
			"!/mail/template/:id": "mailTemplate",
			"!/mail/templates": "mailTemplates",
			"!/mail": "automail",
			"!/notFound": "notFound",
			"!/oops": "oops",
			"*actions" : "defaultRoute"
		},

		changeView: function(view) {
			if (this.currentView != null) {
				this.currentView.undelegateEvents();
			}
			this.currentView = view;
			this.currentView.render();
			try { $("select").select2({
				width: 150
			}); } catch(e) {}
			try { $('.carousel').carousel(); } catch(e) {}
			try { $('#loadingOverlay').remove(); } catch(e) {}
		},
		index: function() {
			activateMenuItem('nav_start');
			this.changeView(new IndexView());
		},
		uploadCSV: function() {
			activateMenuItem('nav_upload_csv');
			this.changeView(new UploadCSVView());
		},
		search: function() {
			activateMenuItem('nav_search');
			this.changeView(new SearchView());
		},
		automail: function() {
			activateMenuItem('nav_mails');
			this.changeView(new MailsView());
		},
		mailTemplates: function() {
			activateMenuItem('nav_mailtemplates');
			this.changeView(new MailTemplatesView());
		},
		mailTemplate: function(templateid) {
			var model = new MailTemplate({_id:templateid, dataset: $('#dataset-selector').val()});
			model.updateUrl();
			var view = new MailTemplateView({model:model});
			this.changeView(view);
			model.fetch({success: function (model) {
				//view.render(model);
			}});
		},
		notFound: function() {
			activateMenuItem('');
			this.changeView(new NotFoundView());
		},
		oops: function() {
			activateMenuItem('');
			this.changeView(new OopsView());
		},
		back: function() {
			if(this.routesHit > 1) {
				//more than one route hit -> user did not land to current page directly
				window.history.back();
				this.routesHit--;
			} else {
				//otherwise go to the home page. Use replaceState if available so
				//the navigation doesn't create an extra history entry
				this.navigate('index', {trigger:true, replace:true});
			}
		},
		defaultRoute : function(actions) {
			console.log(window.location.pathname);
			activateMenuItem('nav_start');
			this.changeView(new IndexView());
		}
	});

	function activateMenuItem(menuItem) {
		$('ul.nav li.active').removeClass("active");
		if (menuItem && menuItem.length > 0)
			$('ul.nav li.' + menuItem).addClass("active");
	}

	$(document).on('click', 'a:not([data-bypass])', function(e){
		href = $(this).prop('href')
		root = location.protocol+'//'+location.host+'/'
		if (root===href.slice(0,root.length)){
			e.preventDefault();
			//console.log(href.slice(root.length));
			Backbone.history.navigate(href.slice(root.length), true);
		}
	});

	var router = new Router();
	router.on('denied', function(info) {
		messaging.error("Das darfst du leider nicht - bist du schon angemeldet?");
	});
	window.router = router;
	return router;
});