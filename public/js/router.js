define(["views/index", "views/uploadCSV", "views/search", "views/notFound", "views/oops", "models/Company", "models/CompanyCollection"], 
	function(IndexView, UploadCSVView, SearchView, NotFoundView, OopsView, Company, CompanyCollection) {
	var Router = Backbone.Router.extend({
		permissions: {},
		currentView: null,
		initialize: function() {
			this.routesHit = 0;
			//keep count of number of routes handled by your application
			Backbone.history.on('route', function() { this.routesHit++; }, this);
			this.bind('route', this.googleAnalytics);
		},

		permissionsMap: {'index' : ''},

		routes: {
			"!/index": "index",
			"!/upload/csv": "uploadCSV",
			"!/search": "search",
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
			try { $("select").select2(); } catch(e) {}
			try { $('.carousel').carousel(); } catch(e) {}
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
		console.log("Denied action "+info.action+" on "+info.type + " for id "+info.id+" (path "+info.path+", permissions: " + JSON.stringify(window.router.permissions, null, 2) + ")");
		messaging.error("Das darfst du leider nicht - bist du schon angemeldet?");
	});
	window.router = router;
	return router;
});