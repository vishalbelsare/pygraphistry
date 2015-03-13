'use strict';

var fs = require('fs');
var path = require('path');
var fstools = require('fs-tools');
var http = require('http');
var https = require('https');
var crypto = require('crypto');
var Q = require('q');
var debug = require('debug')('graphistry:graph-viz:data:data-loader');
var _ = require('underscore');
var config  = require('config')();
var zlib = require('zlib');
var Rx = require('rx');
var urllib = require('url');
var util = require('./util.js');

var MatrixLoader = require('./libs/MatrixLoader.js'),
    VGraphLoader = require('./libs/VGraphLoader.js'),
    VGraphWriter = require('./libs/VGraphWriter.js'),
    kmeans = require('./libs/kmeans.js');

// Make sure caching directory exists
fstools.mkdirSync(config.LOCAL_CACHE_DIR, '0777');

var loaders = {
    'default': VGraphLoader.load,
    'vgraph': VGraphLoader.load,
    'matrix': loadMatrix,
    'random': loadRandom,
    'OBSOLETE_geo': loadGeo,
    'OBSOLETE_socioPLT': loadSocioPLT,
    'OBSOLETE_rectangle': loadRectangle
};

var downloader = {
    'http:': httpDownloader.bind(undefined, http),
    'https:': httpDownloader.bind(undefined, https),
    'null': graphistryS3Downloader // For legacy compatibility
}

function downloadDataset(query) {
    var url = urllib.parse(decodeURIComponent(query.dataset));

    function hasParam(param) { return param !== undefined && param !== 'undefined' }
    var config = {};

    config.scene    = hasParam(query.scene)    ? query.scene    : 'default';
    config.controls = hasParam(query.controls) ? query.controls : 'default';
    config.mapper   = hasParam(query.mapper)   ? query.mapper   : 'default';
    config.device   = hasParam(query.device)   ? query.device   : 'default';
    config.vendor   = hasParam(query.vendor)   ? query.vendor   : 'default';
    config.type     = hasParam(query.type)     ? query.type     : 'default';

    console.info('scene:%s  controls:%s  mapper:%s  device:%s',
                  config.scene, config.controls, config.mapper, config.device);

    return downloader[url.protocol](url).then(function (data) {
        return { body: data, metadata: config };
    }).fail(util.makeErrorHandler('Failure while retrieving dataset'));
}

function getCacheFile(url) {
    var hash = crypto.createHash('sha1').update(url.href).digest('hex');
    var fileName = encodeURIComponent(url.pathname) + '.' + hash;
    return path.resolve(config.LOCAL_CACHE_DIR, fileName);
}

function readCache(url, timestamp) {
    var res = Q.defer();

    var filePath = getCacheFile(url);
    Q.denodeify(fs.stat)(filePath).then(function (stats) {
        if (!stats.isFile()) {
            res.reject('Error: Cached dataset is not a file!');
        } else if (stats.mtime.getTime() > timestamp.getTime()) {
            debug('Found up-to-date dataset in cache');
            res.resolve(fs.readFileSync(filePath));
        } else {
            debug('Found obsolete dataset in cache (%s), ignoring...', stats.mtime);
            res.reject();
        }
    }).fail(function (err) {
        debug('No matching dataset found in cache', err);
        res.reject(err);
    });

    return res.promise;
}

function cache(data, url) {
    if (!config.LOCAL_CACHE)
        return Q();

    var path = getCacheFile(url);
    return Q.denodeify(fs.writeFile)(path, data, {encoding: 'utf8'}).then(
        function () {
            debug('Dataset saved in cache:', path);
        },
        util.makeErrorHandler('Failure while caching dataset')
    );
}

function httpDownloader(http, url) {
    debug('Attemping to download dataset using HTTP');
    var result = Q.defer();

    // Q.denodeify fails http.get because it does not follow
    // the usual nodejs conventions
    http.request(_.extend(url, {method: 'HEAD'}), function (res) {
        var mtime = new Date(res.headers['last-modified']);
        //Try to read from cache otherwise download the dataset
        readCache(url, mtime).then(function (data) {
            result.resolve(data);
        }).fail(function () {
            http.get(url.href, function (res) {
                res.setEncoding('binary');
                var mtime = new Date(res.headers['last-modified']);

                var data = '';
                res.on('data', function (chunk) {
                    data += chunk;
                });

                res.on('end', function () {
                    var buffer = new Buffer(data, 'binary');
                    cache(buffer, url);
                    result.resolve(buffer);
                });
            }).on('error', function (err) {
                util.error('Cannot download dataset at', url.href, err.message);
                result.reject(err);
            });
        })
    }).on('error', function (err) {
        util.error('Cannot fetch headers from', url.href, err.message);
        result.reject(err);
    }).end();

    return result.promise;
}

/*
 * Kick off the download process. This checks the
 * modified time and fetches from S3 accordingly.
**/
function graphistryS3Downloader(url) {
    debug('Attempting to download from S3 ' + url.href);
    var params = {
      Bucket: config.BUCKET,
      Key: url.href
    };
    var res = Q.defer();

    // Attempt to download headers
    config.S3.headObject(params, function (err, data) {
        if (err) {
            debug('Could not fetch S3 header', err.message)
            debug('Falling back on local cache');
            // Try to load from cache regardless of timestamp.
            res.resolve(readCache(url, new Date(0)));
        } else {
            var mtime = new Date(data['LastModified']);
            debug('Got S3 headers, dataset was last modified on', mtime);
            readCache(url, mtime).then(function (data) {
                res.resolve(data);
            }).fail(function () { // Not in cache of stale
                config.S3.getObject(params, function(err, data) {
                    if (err) {
                        util.error('S3 Download failed', err.message);
                        res.reject();
                    } else {
                        debug('Successful S3 download');
                        cache(data.Body, url);
                        res.resolve(data.Body);
                    }
                });
            });
        }
    });

    return res.promise;
}


function loadDatasetIntoSim(graph, dataset) {
    debug('Loading dataset: %o', dataset);

    var loader = loaders[dataset.metadata.type];

    // If body is gzipped, decompress transparently
    if (dataset.body.readUInt16BE(0) === 0x1f8b) { //Do we care about big endian? ARM?
        debug('Dataset body is gzipped, decompressing');
        return Q.denodeify(zlib.gunzip)(dataset.body).then(function (gunzipped) {
            dataset.body = gunzipped;
            return loader(graph, dataset);
        });
    } else {
        return loader(graph, dataset);
    }
}


// Generates `amount` number of random points
function createPoints(amount, dim) {
    // Allocate 2 elements for each point (x, y)
    var points = [];

    for(var i = 0; i < amount; i++) {
        points.push([Math.random() * dim[0], Math.random() * dim[1]]);
    }

    return points;
}


function createEdges(amount, numNodes) {
    var edges = [];
    // This may create duplicate edges. Oh well, for now.
    for(var i = 0; i < amount; i++) {
        var source = (i % numNodes),
            target = (i + 1) % numNodes;

        edges.push([source, target]);
    }

    return edges;
}


function loadRandom(graph, dataset) {
    var cfg = dataset.Metadata.config
    var points = createPoints(cfg.npoints, cfg.dimensions);
    var edges = createEdges(cfg.nedges, cfg.npoints);

    return graph.setPoints(points).then(function() {
        graph.setColorMap("test-colormap2.png");
        return graph.setEdges(edges);
    });
}


function loadRectangle(graph, dataset) {
    var cfg = dataset.Metadata.config
    debug("Loading rectangle", cfg.rows, cfg.columns);

    var points =
        _.flatten(
            _.range(0, cfg.rows)
                .map(function (row) {
                    return _.range(0, cfg.columns)
                        .map(function (column) {
                            return [column, row];
                        });
                }),
            true);
    return graph.setPoints(new Float32Array(_.flatten(points)))
        .then(function () {
            return graph.setEdges(new Uint32Array([0,1]));
        });
}


function loadSocioPLT(graph, dataset) {
    debug("Loading SocioPLT");

    var data = require('./libs/socioplt/generateGraph.js').process(dataset.body);

    var nodesPerRow = Math.floor(Math.sqrt(data.nodes.length));
    var points =
        data.nodes.map(
            function (_, i) {
                return [i % nodesPerRow, Math.floor(i / nodesPerRow)];
            });
    var pointSizes = new Uint8Array(_.pluck(data.nodes, 'size'));
    var pointColors = new Uint32Array(_.pluck(data.nodes, 'color'));

    //data.edges = [{src: 0, dst: 1}];

    var edges = _.flatten(data.edges.map(function (edge) {
            return [edge.src, edge.dst];
        }));
    var edgeColors = _.flatten(data.edges.map(function (edge) {
            return [edge.color, edge.color];
        }));

        //graph.setVisible({edgeStrength: -10});
        //physicsControls.gravity     ( 0.020083175556898723);
        //physicsControls.edgeStrength( 4.292198241799153);
        //physicsControls.edgeDistance( 0.0000158);



    return graph.setPoints(new Float32Array(_.flatten(points)), pointSizes, pointColors)
        .then(function () {
            return graph.setEdgesAndColors(
                new Uint32Array(edges),//new Uint32Array(_.flatten(edges).map(function (idx, i) { return idx; })),
                new Uint32Array(edgeColors));
        }).then(function () {
            return graph;
        }, function (err) {
            throw err;
        })
}


function loadGeo(graph, dataset) {
    debug("Loading Geo");

    return Q(MatrixLoader.loadGeo(dataset.body))
     .then(function(geoData) {
        var processedData = MatrixLoader.processGeo(geoData, 0.03);

        debug("Processed %d/%d nodes/edges", processedData.points.length, processedData.edges.length);

        return graph.setPoints(processedData.points)
            .then(function () {
                return graph.setLabels(processedData.points.map(function (v, i) {
                    return '<b>' + i + '</b><hr/>' + v[0].toFixed(4) + ', ' + v[1].toFixed(4);
                }));
            })
            .then(_.constant(processedData))
    })
    .then(function(processedData) {

        var position = function (points, edges) {
            return edges.map(function (pair){
                var start = points[pair[0]];
                var end = points[pair[1]];
                return [start[0], start[1], end[0], end[1]];
            });
        };
        var k = 6; //need to be <= # supported colors, currently 9
        var steps =  50;
        var positions = position(processedData.points, processedData.edges);
        var clusters = kmeans(positions, k, steps); //[ [0--1]_4 ]_k

        return graph
                .setColorMap("test-colormap2.png", {clusters: clusters, points: processedData.points, edges: processedData.edges})
                .then(function () { return graph.setEdges(processedData.edges); })
                .then(function () {
                    var sizes = [];
                    for (var i = 0; i < processedData.edges.length; i++) {
                        sizes.push(3);
                    }
                    return graph.setSizes(sizes); })
                .then(function () {
                    var colors = [];
                    var yellow = util.palettes.qual_palette1[1];
                    var red = util.palettes.qual_palette1[3];
                    for (var i = 0; i < processedData.edges.length; i++) {
                        colors.push(yellow);
                        colors.push(red);
                    }
                    return graph.setColors(colors);
                });
    })
    .then(function() {
        debug("Done setting geo points, edges");
        return graph;
    });
}


/**
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, dataset) {
    var graphFile;

    debug("Loading dataset %s", dataset.body);

    var v = MatrixLoader.loadBinary(dataset.body)
    var graphFile = v;
    if (typeof($) != 'undefined') {
        $('#filenodes').text('Nodes: ' + v.numNodes);
        $('#fileedges').text('Edges: ' + v.numEdges);
    }

    var points = createPoints(graphFile.numNodes, graph.dimensions);

    return graph.setPoints(points)
    .then(function() {
        return graph.setEdges(graphFile.edges);
    })
    .then(function() {
        return graph;
    });
}


module.exports = {
    createPoints: createPoints,
    createEdges: createEdges,
    loadDatasetIntoSim: loadDatasetIntoSim,
    downloadDataset: downloadDataset,
    cache: cache
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax:
