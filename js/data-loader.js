'use strict';

var http = require('http');
var https = require('https');
var Q = require('q');
var _ = require('underscore');
var config  = require('config')();
var zlib = require('zlib');
var urllib = require('url');
var util = require('./util.js');
var Cache = require('common/cache.js');

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz', 'graph-viz/js/data-loader.js');

var VGraphLoader = require('./libs/VGraphLoader.js');

var loaders = {
    'default': VGraphLoader.load,
    'vgraph': VGraphLoader.load,
    'jsonMeta': loadJSONMeta
};

var downloaders = {
    'http:': httpDownloader.bind(undefined, http),
    'https:': httpDownloader.bind(undefined, https),
    's3:': s3Downloader,
    'null': s3Downloader // For legacy compatibility
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
function s3Downloader(url) {
    var params = {
        Bucket: url.host || config.BUCKET,  // Defaults to Graphistry's bucket
        Key: decodeURIComponent(url.pathname.replace(/^\//,'')) // Strip leading slash if there is one
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
            var mtime = new Date(data.LastModified);
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


// Parse the json dataset description, download then load data.
function loadJSONMeta(graph, rawDataset) {
    var dataset = JSON.parse(rawDataset.body.toString('utf8'));
    return downloadDatasources(dataset).then(function (dataset) {
        if (dataset.datasources.length !== 1) {
            throw new Error('For now only datasets with one single datasource are supported');
        }
        if (dataset.datasources[0].type !== 'vgraph') {
            throw new Error('For now only datasources of type "vgraph" are supported');
        }

        var data = dataset.datasources[0].data;
        return VGraphLoader.load(graph, {body: data, metadata: dataset});
    });
}


// Download all datasources in dataset
function downloadDatasources(dataset) {
    var qBlobs = _.map(dataset.datasources, function (datasource) {
        var url = urllib.parse(datasource.url);
        if (_.contains(_.keys(downloaders), url.protocol)) {
            return downloaders[url.protocol](url).then(function (blob) {
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


module.exports = {
    loadDatasetIntoSim: loadDatasetIntoSim,
    datasetURLFromQuery: function datasetURLFromQuery(query) {
        if (!query.dataset) { return undefined; }
        return urllib.parse(decodeURIComponent(query.dataset));
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

        return downloaders[url.protocol](url).then(function (data) {
            return {body: data, metadata: config};
        }).fail(log.makeQErrorHandler(logger, 'Failure while retrieving dataset'));
    }
};

// vim: set et ff=unix ts=8 sw=4 fdm=syntax:
