'use strict';

var http = require('http');
var https = require('https');
var Q = require('q');
var _ = require('underscore');
var config  = require('config')();
var zlib = require('zlib');
var Rx = require('rx');
var urllib = require('url');
var util = require('./util.js');
var Cache = require('common/cache.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:data:data-loader');

var MatrixLoader = require('./libs/MatrixLoader.js');
var VGraphLoader = require('./libs/VGraphLoader.js');
var kmeans = require('./libs/kmeans.js');

var loaders = {
    'default': VGraphLoader.load,
    'vgraph': VGraphLoader.load,
    'jsonMeta': loadJSONMeta,
    'matrix': loadMatrix,
    'random': loadRandom,
    'OBSOLETE_geo': loadGeo,
    'OBSOLETE_rectangle': loadRectangle
};

var downloader = {
    'http:': httpDownloader.bind(undefined, http),
    'https:': httpDownloader.bind(undefined, https),
    'null': graphistryS3Downloader // For legacy compatibility
};

var tmpCache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);

function httpDownloader(http, url) {
    logger.trace('Attempting to download dataset using HTTP');
    var result = Q.defer();

    // Q.denodeify fails http.get because it does not follow
    // the usual nodejs conventions
    http.request(_.extend(url, {method: 'HEAD'}), function (res) {
        var lastModifiedTime = new Date(res.headers['last-modified']);
        // Try to read from cache otherwise download the dataset
        tmpCache.get(url, lastModifiedTime).then(function (data) {
            result.resolve(data);
        }).fail(function () {
            http.get(url.href, function (res) {
                res.setEncoding('binary');
                //var lastModifiedTime = new Date(res.headers['last-modified']);

                var data = '';
                res.on('data', function (chunk) {
                    data += chunk;
                });

                res.on('end', function () {
                    var buffer = new Buffer(data, 'binary');
                    tmpCache.put(url, buffer);
                    result.resolve(buffer);
                });
            }).on('error', function (err) {
                logger.error(err, 'Cannot download dataset at', url.href);
                result.reject(err);
            });
        });
    }).on('error', function (err) {
        logger.error(err, 'Cannot fetch headers from', url.href);
        result.reject(err);
    }).end();

    return result.promise;
}

/*
* Kick off the download process. This checks the
 * modified time and fetches from S3 accordingly.
**/
function graphistryS3Downloader(url) {
    console.error('Attempting to download from S3 ' + url.pathname);
    var params = {
        Bucket: config.BUCKET,
        Key: url.pathname.replace(/^\//,'') // Strip leading slash if there is one
    };
    var res = Q.defer();

    // Attempt to download headers
    config.S3.headObject(params, function (err, data) {
        if (err) {
            logger.trace('Could not fetch S3 header', err.message)
            logger.trace('Falling back on local cache');
            // Try to load from cache regardless of timestamp.
            res.resolve(tmpCache.get(url, new Date(0)));
        } else {
            var mtime = new Date(data['LastModified']);
            logger.debug('Got S3 headers, dataset was last modified on', mtime);
            tmpCache.get(url, mtime).then(function (data) {
                res.resolve(data);
            }).fail(function () { // Not in cache of stale
                config.S3.getObject(params, function(err, data) {
                    if (err) {
                        logger.error(err, 'S3 Download failed');
                        res.reject();
                    } else {
                        logger.trace('Successful S3 download');
                        tmpCache.put(url, data.Body);
                        res.resolve(data.Body);
                    }
                });
            });
        }
    });

    return res.promise;
}


// If body is gzipped, decompress transparently
function unzipBufferIfCompressed(buffer, twice) {
    if (buffer.readUInt16BE(0) === 0x1f8b) { // Do we care about big endian? ARM?
        logger.trace('Data body is gzipped, decompressing');
        if (twice) {
            console.warn('Data blob is zipped at least twice!');
        }

        return Q.denodeify(zlib.gunzip)(buffer).then(function (gunzipped) {
            return unzipBufferIfCompressed(gunzipped, true);
        });
    } else {
        return Q(buffer);
    }
}


// Run appropriate loader based on dataset type
function loadDatasetIntoSim(graph, dataset) {
    logger.debug('Loading dataset: %o', dataset);

    var loader = loaders[dataset.metadata.type];
    return unzipBufferIfCompressed(dataset.body).then(function (body) {
        dataset.body = body;
        return loader(graph, dataset);
    });
}


// Parse the json dataset decription, download then load data.
function loadJSONMeta(graph, rawDataset) {
    var dataset = JSON.parse(rawDataset.body.toString('utf8'));
    return downloadDatasources(dataset).then(function (dataset) {
        if (dataset.datasources.length !== 1) {
            throw new Error('For now only datasets with one single datasource are supported');
        }
        if (dataset.datasources[0].type !== 'vgraph') {
            throw new Error('For now only datasources of type "vgraph" are supported');
        }

        var data = dataset.datasources[0].data
        return VGraphLoader.load(graph, {body: data, metadata: dataset});
    });
}


// Download all datasources in dataset
function downloadDatasources(dataset) {
    var qBlobs = _.map(dataset.datasources, function (datasource) {
        var url = urllib.parse(datasource.url);
        if (url.protocol === 's3:' && url.host === config.BUCKET) {
            return graphistryS3Downloader(url).then(function (blob) {
                return unzipBufferIfCompressed(blob);
            });
        } else {
            throw new Error('Fetching datasouces: protocol not yet supported' + url.href);
        }
    });

    return Q.all(qBlobs).then(function (blobs) {
        _.each(blobs, function (blob, i) {
            dataset.datasources[i].data = blob;
        });

        return dataset;
    });
}


// Generates `amount` number of random points
function createPoints(amount, dim) {
    // Allocate 2 elements for each point (x, y)
    var points = [];

    for (var i = 0; i < amount; i++) {
        points.push([Math.random() * dim[0], Math.random() * dim[1]]);
    }

    return points;
}


function createEdges(amount, numNodes) {
    var edges = [];
    // This may create duplicate edges. Oh well, for now.
    for (var i = 0; i < amount; i++) {
        var source = (i % numNodes),
            target = (i + 1) % numNodes;

        edges.push([source, target]);
    }

    return edges;
}


function loadRandom(graph, dataset) {
    var cfg = dataset.Metadata.config;
    var points = createPoints(cfg.npoints, cfg.dimensions);
    var edges = createEdges(cfg.nedges, cfg.npoints);

    return graph.setPoints(points).then(function() {
        graph.setColorMap('test-colormap2.png');
        return graph.setEdges(edges);
    });
}


function loadRectangle(graph, dataset) {
    var cfg = dataset.Metadata.config;
    logger.trace('Loading rectangle', cfg.rows, cfg.columns);

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




function loadGeo(graph, dataset) {
    logger.trace('Loading Geo');

    return Q(MatrixLoader.loadGeo(dataset.body))
     .then(function(geoData) {
        var processedData = MatrixLoader.processGeo(geoData, 0.3);

        logger.debug('Processed %d/%d nodes/edges', processedData.points.length, processedData.edges.length);

        return graph.setPoints(processedData.points)
            .then(function () {
                return graph.setPointLabels(processedData.points.map(function (v, i) {
                    return '<b>' + i + '</b><hr/>' + v[0].toFixed(4) + ', ' + v[1].toFixed(4);
                }));
            })
            .then(_.constant(processedData));
    })
    .then(function (processedData) {

        var position = function (points, edges) {
            return edges.map(function (pair){
                var start = points[pair[0]];
                var end = points[pair[1]];
                return [start[0], start[1], end[0], end[1]];
            });
        };
        var k = 6; // need to be <= # supported colors, currently 9
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
        logger.trace('Done setting geo points, edges');
        return graph;
    });
}


/**
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, dataset) {
    logger.debug('Loading dataset %s', dataset.body);

    var v = MatrixLoader.loadBinary(dataset.body);
    var graphFile = v;
    if (typeof($) !== 'undefined') {
        $('#filenodes').text('Nodes: ' + v.numNodes);
        $('#fileedges').text('Edges: ' + v.numEdges);
    }

    var points = createPoints(graphFile.numNodes, graph.dimensions);

    return graph.setPoints(points)
    .then(function () {
        return graph.setEdges(graphFile.edges);
    })
    .then(function () {
        return graph;
    });
}


module.exports = {
    createPoints: createPoints,
    createEdges: createEdges,
    loadDatasetIntoSim: loadDatasetIntoSim,
    datasetURLFromQuery: function datasetURLFromQuery(query) {
        return query.dataset ? urllib.parse(decodeURIComponent(query.dataset)) : undefined;
    },
    datasetConfigFromQuery: function datasetConfigFromQuery(query) {
        function hasParam(param) { return param !== undefined && param !== 'undefined'; }
        var config = {};

        config.scene    = hasParam(query.scene)    ? query.scene    : 'default';
        config.controls = hasParam(query.controls) ? query.controls : 'default';
        config.mapper   = hasParam(query.mapper)   ? query.mapper   : 'default';
        config.device   = hasParam(query.device)   ? query.device   : 'default';
        config.vendor   = hasParam(query.vendor)   ? query.vendor   : 'default';
        config.type     = hasParam(query.type)     ? query.type     : 'default';
        return config;
    },
    downloadDataset: function downloadDataset(config) {
        logger.info('scene:%s  controls:%s  mapper:%s  device:%s',
            config.scene, config.controls, config.mapper, config.device);
        var url = urllib.parse(config.url);

        return downloader[url.protocol](url).then(function (data) {
            return {body: data, metadata: config};
        }).fail(log.makeQErrorHandler(logger, 'Failure while retrieving dataset'));
    }
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax:
