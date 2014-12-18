/**
 * PDF/HTML Export Script for OpenScholar
 * Tonis Tartes
 * Anno.2014
 * @type type
 */
var request = require('request'),
    cheerio = require('cheerio'),
    path = require('path'),
    async = require('async'),
    fs = require('fs');
    
// Params.
var domain = 'https://sisu.ut.ee'; // MC Hammer - Can't touch this
var subsite = '/measurement'; // Change OS SubSite
var address = domain+subsite;
var download_dir = 'downloads'+subsite+'/';
    // Check for dir.
    if (!fs.existsSync(download_dir)) {
        fs.mkdir(download_dir, '0777');
    }
    
    // Delete old pdf.html.
    if (fs.existsSync(download_dir+'pdf.html')) {
        fs.unlink(download_dir+'pdf.html', function (err) {
            if (err) throw err;
            console.log('Successfully deleted '+download_dir+'pdf.html !');
        });
    }
// Starting...
request(address, function(error, response, body) {  
    if (error) throw error;
        
    if (!error && response.statusCode === 200) {
        async.waterfall([
            function (step) {
                // 1.Step - Generating sitemap and head of document
                var sites_arr = siteMapper(body);
                console.log('Sitemap done!');
                var $ = cheerio.load(body);
                // CSS Download - Experimental.
                $('link[type="text/css"]').each(function() {                
                    var css_link = $(this).attr('href');
                    var valid_css = css_link.split('https://');                 
                    if (valid_css[1]) {
                        download_file($(this).attr('href'), download_dir+css_link, function(err) {
                            if (err) {
                                console.log(err);
                            }
                        });
                        $(this).attr('href', path.basename(css_link));
                    }
                });
                var head = $('head').html();
                var customhead = '<style type="text/css">tbody { border-top: 0px !important } .ui-accordion-content { display: block !important; border: 0px !important; } #accordion h3 { border: 0px !important; }</style>';
                // Write to file.     
                fs.appendFile(download_dir+'pdf.html', '<html><head>'+head+customhead+'</head><body style="font-family: Verdana, sans-serif !important;">', function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
                step(null, sites_arr);
            },
            function (sites_arr, step) {
                // 2.Step - Generate title page.
                console.log('Generating Title page...');
                var $ = cheerio.load(body);
                var settitle = $('head title').html();
                var setdesc = $('head meta[name="description"]').attr('content');
                var titlepage = '<div class="resource" style="page-break-after:always;"><div style="margin:auto; margin-top:300px; text-align:center;"><h1>'+settitle+'</h1><br />'+setdesc+'</div></div>';
                console.log('Title page finished...');
                fs.appendFile(download_dir+'pdf.html', titlepage, function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
                step(null, sites_arr);
            },
            function (sites_arr, step) {
                // 3.Step - Generating Table of contents.
                console.log('Generating TOC...');
                var toc = '<div class="resource" style="page-break-after:always;"><header><h1>Table of contents</h1></header><ul>';
                var count = Object.keys(sites_arr).length;
                async.eachSeries(Object.keys(sites_arr), function(item, callback) {
                    toc += '<li><h3 style="font-size:13px; margin-bottom:0px;">'+sites_arr[item][1]+'</h2></li>';
                    callback();
                }, function(err) {
                    if (err) {
                       console.log(err); 
                    }
                });
                toc += '</ul></div>';
                console.log('TOC finished...');
                fs.appendFile(download_dir+'pdf.html', toc, function(err) {
                    if (err) {
                        console.log(err);
                    }
                });
                step(null, sites_arr);
            },
            function (sites_arr, step) {
                // 4.Step - Fetch content from pages.
                console.log('Page crawler init...');
                var count = Object.keys(sites_arr).length;
                async.eachSeries(Object.keys(sites_arr), function(item, callback) {
                    getPages(item, sites_arr[item][0], sites_arr[item][1], function() {
                        callback();
                    });                    
                    console.log(count);
                    if (--count === 0) {
                        console.log('Page crawling done!');
                        step();
                    }
                }, function(err) {
                    if (err) {
                       console.log(err); 
                    }
                });
            },
            function (step) {
                // 5.Step - Finishing up document.
                console.log('Finishing up!');
                // Write to file.
                fs.appendFile(download_dir+'pdf.html', '</body></html>');
                step();
            }
        ],
        function(err, results) {
            console.log('Crawling complete!');
        });
    }
});

// Crawl pages.
function getPages(title, href, doctitle, callback) {
    request(address+href, function(error, response, body) {          
        if (!error && response.statusCode === 200) {
            // pageWorker(decodeURI(title), body, callback); // If cyrillic sites uncomment this.
            pageWorker(title, body, doctitle, callback);
        }        
    });
}

// Work the pages.
function pageWorker(title, html, doctitle, callback) {
    
    var $ = cheerio.load(html);
    
    async.waterfall([
        function (next) {
            // 1.Step - Download images from content.
            var count = $('#columns #content-column .node-content img').length;
            if (count > 0) {
                // Images uploaded to content.
                $('#columns #content-column .node-content img').each(function() {
                    var link = $(this).attr('src');
                    download_file($(this).attr('src'), download_dir+link, function(err) {                   
                        if (--count === 0) {
                            next(null, doctitle);
                        }
                    });
                    $(this).attr('src', path.basename(link)); 
                });
            } else {
                next(null, doctitle);
            }
        },
        function (doctitle, next) {
            // 2.Step - Set current page title.
            var doctitle = '<div class="resource" style="page-break-after:always;"><header><h1>'+doctitle+'</h1></header><br />';
            fs.appendFile(download_dir+'pdf.html', doctitle);
            next();
        },
        function (next) {
            // 3.Step - Set page content.
            var doccontent = $('#columns #content-column .node-content');
            $('#columns #content-column .node-content iframe').each(function() {
                $(this).replaceWith('&nbsp;');
            });
            $('#columns #content-column .node-content a.jpopup_dialog').each(function() {
                $(this).replaceWith('&nbsp;');
            });
            $('#columns #content-column .node-content table.os-files-other-list').each(function() {
                $(this).replaceWith('&nbsp;');
            });
            if (doccontent.length > 0) {                
                doccontent = doccontent.html()+'</div>';
                // Write to file. 
                fs.appendFile(download_dir+'pdf.html', doccontent);
            }
            next();
        }
    ],
    function(err, results) {
        callback();
    });
}

// ze Allmighty download.
function download_file(uri, filename, callback) {
    
    var get_file = '';
    get_file = path.basename(filename).split('?');
    filename = get_file[0];
    
    // 02.12.2013 - Check pattern for valid http or https
    var pattern = /^((http|https):\/\/)/;
    if (!pattern.test(uri)) {
        uri = domain+uri;
    }
    
    try {
        request.head(uri, function(err, res, body){
            // console.log('content-type:', res.headers['content-type']);
            // console.log('content-length:', res.headers['content-length']);        
            var file1 = request(uri);
            file1.pipe(fs.createWriteStream(download_dir+filename));                
            file1.on('end', function(){
                callback();
            });
            file1.on('error', function(err) {
               callback(err); 
            });
        });
    } catch(err) {
        callback(err);
    }
}

// Check if file exists.
function file_exists(url) {
    var filename = path.basename(url);
    if (!fs.existsSync(download_dir+filename)) {
        return false;
    }
    return true;    
}

// Map the menu & site.
function siteMapper(html) {
    var $ = cheerio.load(html);    
    var sites = [];
    $('.menu li a').each(function() {        
        var title = $(this).attr('href').split('/');
        // Skip Quizzes.
        if (title[2] === 'node') {
            return true;
        }
        sites[title[2]] = [$(this).attr('href'), $(this).html()];
    });
    return sites;
}