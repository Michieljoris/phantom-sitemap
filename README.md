phantom-sitemap
------

Crawls a site, extracts the links and returns the promise of either a sitemap or
just a list of links. 

If a url has a hashbang (#!) or the page contains the fragment meta tag, the html to parse will be created by calling on phantomjs.

	var options =
		{ maxDepth: 1,
		  maxConnections: 5,
		  maxFollow: 0,
		  verbose: false,
		  silent: false,
		  //timeout for a request:
		  timeout: 60000,
		  //interval before trying again:
		  retryTimeout: 10000,
		  retries:3,
		  ignore: ['pdf', 'doc', 'xls', 'png', 'jpg', 'png','js', 'css' ],
		  cacheDir: './cache',
		  sitemap: true 
		};

Set options.sitemap to false to return just a list of links.

	// Tes t
	var crawl = module.exports(options);
	crawl('http://localhost:9000').when(
		function(data) {
			console.log('RESULT:\n', data);
		}
		,function(err) {
			console.log('ERROR', err);
		}
	)
	
Using node-crawler to crawl static pages.	


