/*global module:false require:false process:false __dirname:false*/
/*jshint strict:false unused:true smarttabs:true eqeqeq:true immed: true undef:true*/
/*jshint maxparams:7 maxcomplexity:7 maxlen:150 devel:true newcap:false*/

//Gleaned miscellaneous from:
//https://npmjs.org/package/simplecrawler
//https://github.com/sylvinus/node-crawler
//https://npmjs.org/package/crawl

//Using cheerio:
// https://github.com/cbright/node-crawler

var Crawler = require("./node-crawler").Crawler,
VOW = require('dougs_vow'),
Url = require('url'),
sm = require('sitemap'),
request = require('request'),
extend = require('extend'),
parseString = require('xml2js').parseString,
wash = require('url_washer'),
fs = require('fs-extra'),
md5 = require('MD5'),
Path = require('path')
// util = require("util"),
;

//Modified crawler.js module, line 384:
// //Static HTML was given, skip request
// if (toQueue.html) {
//     if (typeof toQueue.html==="function") {
//         toQueue.html(toQueue.uri, function(html) {
//             if (html)
//                 self.onContent(null,toQueue,{body:html},false);
//             else self.onContent('No html received',toQueue,null,false);
//         });
//     }
//     else self.onContent(null,toQueue,{body:toQueue.html},false);
//     return;
// }

//TODO update dougs_vow repo with my vow.status edit
//TODO update wash.js in repo


var defaultOptions = { maxDepth: 1,
                           maxFollow: 0,
                       verbose: false,
                       silent: false,
                       //timeout for a request:
                       timeout: 60000,
                       //interval before trying again:
                       retryTimeout: 10000,
                       retries:3,
                       ignore: ['xls', 'png', 'jpg', 'png','js', 'css' ],
                       include: ['pdf', 'doc', 'docx'],
                       cacheDir: './cache',
                       sitemap: true,
                       out: 'sitemap.xml',
                       replaceHost: 'www.example.com'
                     };

function getCrawler(options) {

    var followed;
    var dynamic;
    var host;

        // var log = [];
    function debug() {
        if (options.verbose) console.log.apply(console, arguments);
        // log.push(arguments);
    }

    function filter(url) {
        var parsed = Url.parse(url);
        function ignore(url) {
            return options.ignore.some(function(e) {
                return url.match(new RegExp('\\.' + e + '$', 'i'));

            });
        }
        return parsed.host !== host || ignore(url);
    }

    function fetchSitemap(url) {
        var vow = VOW.make();
        request(Url.resolve(url, 'sitemap.xml'), function(err, response, body) {
            if (err || response.statusCode !== 200) vow.keep([]);
            else {
                parseString(body, function(err, result) {
                    if (err) {
                        debug('no sitemap found');
                        vow.keep([]);
                    }
                    else {
                        var urls = [];
                        result.urlset.url.forEach(function(l) {
                            urls.push(l.loc[0]);
                        });
                        vow.keep(urls);
                    }
                });
            }
        });
        return vow.promise;
    }

    function printDot() {
        if (!options.silent && !options.verbose)
            process.stdout.write(".");
    }

    function extractLinks(result,$) {
        if (result.uri) debug('Parsing ',  result.uri);
        var links = [];
        if (result.body.links) {
            links = result.body.links;
        }
            else if (result.headers && result.headers['content-type'] === 'text/html' && $) {
                $("a").each(function(index,a) {
                    links.push(a.href);
                });
            }
        return links;
    }

    function maxFollowed(vow) {
        if (options.maxFollow && followed.length >= options.maxFollow) {
            debug('maxFollow reached');
            if (vow.status() === 'pending') vow.keep();
            return true;
        }
        return false;
    }

    function validUri(uri) {
        return !followed[uri] && !filter(uri, host) ;
    }

    function getHtml(url, cb) {
        console.log('washing ' + url);
        wash(url).when(
            function(result) { //html, headers and links
                fs.outputJsonSync(Path.resolve(__dirname, options.cacheDir, md5(url)), { val: result.html } );
                cb(result);
            }
            ,function(err) {
                debug('ERROR washing url:', err);
                cb();
            }
        );
    }

    function harvest(seed) {
        var vow = VOW.make();

        var c = new Crawler({
            "maxConnections":options.maxConnections
            ,timeout: options.timeout
            ,retryTimeout: options.retryTimeout
            ,retries: options.retries
            ,callback: function(error, result, $) {
                // debug('in callback \n', error ? error : 'no error', result ? result.body.slice(0,20): '');
                if (error) debug('error', error);
                if ($ && $('meta[name="fragment"][content="!"]').length) {
                    fetch('phantom', result.uri, result.options.depth); //fetch again
                    return;
                }
                if (maxFollowed(vow)) return;
                var links = extractLinks(result, $);
                links.forEach(function(link) {
                    // debug('link', link);
                    var url = Url.parse(link);
                    var ext = Path.extname(url.pathname).slice(1);
                    var method;
                    if (options.include.indexOf(ext) !== -1) {
                        debug('Found included file:', url.pathname);
                        method = 'ignore';
                    } 
                    else method = url.hash && url.hash.indexOf('#!') === 0 ?
                        'phantom' :'crawl';
                    fetch(method, link, result.options.depth + 1);
                });
            }
            ,onDrain: function() {
                if (vow.status() === 'pending') vow.keep(followed);
            }
        });

        function fetch(method, uri, depth) {
            printDot();
            if (maxFollowed(vow)) return;
            if (validUri(uri) &&  depth <= options.maxDepth) {
                debug('Following link ' + uri + ' with ' + method);
                followed[uri] = true;
                if (method === 'ignore') ;
                else if (method === 'crawl')
                    c.queue({ uri: uri, depth: depth});
                else {
                    dynamic.push(uri);
                    c.queue({ uri: uri, html: getHtml, jQuery: false, depth: depth });
                }
            }
        }

        fetch('crawl', seed, 0);
        return vow.promise;
    }

    function respond(vow) {
        // debug('followed:', followed);
        if (!options.sitemap)
            vow.keep({ followed: Object.keys(followed), phantomed: dynamic });
        else {
            var sitemap = {
                hostname: host,
                urls: []};
            Object.keys(followed).forEach(function(l) {
                sitemap.urls.push( { url: l, changefreq: options.changefreq });
            });

            sitemap = sm.createSitemap(sitemap).toString();
            vow.keep(sitemap);
        }
    }

    function getData(seed) {

        var vow = VOW.make();
        // vow.keep('xxxxblaxxxxxbla\nxxxxxbla');
        // return vow.promise;;
            var seeds = [];
        followed = {};
        dynamic = [];
        debug(options);
        host = Url.parse(seed || '').host;
        if (!host) vow.breek('No seed passed in.');
        else {
            fetchSitemap(seed).when(
                function(someLinks) {
                    if (!options.sitemap)
                        someLinks.forEach(function(l) {
                            seeds.push(l);
                        });
                    if (seed) seeds.push(seed);
                    function recur() {
                        if (seeds.length) {
                            harvest(seeds.pop()).when(
                                recur
                            );
                        }
                        else respond(vow, host);
                    }

                    recur();
                }
            );
        }

        return vow.promise;
    }

    function go(seed) {
        var vow = VOW.make();
        getData(seed).when(
            function(data) {
                if (options.replaceHost) {
                    var re = new RegExp(seed, 'g');
                    data = data.replace(re, options.replaceHost);
                }
                if (!options.out) {
                    vow.keep(data);
                    return;
                }
                fs.outputFile(options.out, data, function(err) {
                    if (err) vow.breek(err);
                    else vow.keep(data);
                });

            }
        );
        return vow.promise;
    }
    return go;
}

module.exports =  function(someOptions) {
    var options = extend(extend({}, defaultOptions), someOptions);
    return getCrawler(options);
};

// Test
var c = module.exports({ verbose: true,
                         replaceHost: 'http://www.firstdoor.com.au',
                         sitemap: true,
                         out: 'sitemap.xml'
                       });

c('http://localhost:9000').when(
    function(data) {
        console.log('RESULT:\n', data);
    }
    ,function(err) {
        console.log('ERROR', err);
    }
);
