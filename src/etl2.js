'use strict';

var _        = require('underscore');
var Q        = require('q');
var urllib   = require('url');
var crypto   = require('crypto');
var sprintf  = require('sprintf-js').sprintf;

var config   = require('config')();
var s3       = require('common/s3.js');
var Log      = require('common/logger.js');
var apiKey   = require('common/api.js');
var Cache    = require('common/cache.js');
var logger   = Log.createLogger('etlworker:etl2');
var tmpCache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);



var supportedAgents = ['pygraphistry'];


// Request.files -> Object
function parseParts(parts) {
    return _.object(_.map(parts, function (content, key) {
        var buf = content[0].buffer;
        if (key == 'metadata') {
            return ['metadata', JSON.parse(buf.toString('utf8'))];
        } else {
            return [key, buf];
        }
    }));
}


// Object * Object -> Q(Object)
function etl(msg, params) {
    var folder = params.agent + '/' + crypto.randomBytes(16).toString('hex');
    var desc = {
        agent: params.agent,
        agentVersion: params.agentVersion,
        apiVersion: params.apiVersion,
        created: Date.now(),
        creator: apiKey.decrypt(params.key),
        name: msg.metadata.name,
        nodes: msg.metadata.nodes,
        edges: msg.metadata.edges
    };

    var qDatasources = _.map(msg.metadata.datasources, function (datasource) {
        var url = datasource.url;
        if (datasource.type == 'vgraph' && urllib.parse(url).protocol === null) {
            var buffer = msg[url];
            var sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
            var key = sprintf('%s/%s.vgraph', folder, sha1);
            return uploadBuffer(buffer, key).then(function (url) {
                var extra = {
                    size: buffer.length,
                    sha1: sha1,
                    url: url
                };
                return _.extend({}, datasource, extra);
            });
        } else {
            return Q(datasource);
        }
    });

    return Q.all(qDatasources).then(function (datasources) {
        desc.datasources = datasources;
        logger.debug('Dataset', desc);
        var nodeCount = _.pluck(desc.nodes, 'count').join('+');
        var edgeCount = _.pluck(desc.edges, 'count').join('+');
        return uploadJSON(desc, sprintf('%s/dataset.json', folder)).then(function (url) {
            return {name: url, nodeCount: nodeCount, edgeCount: edgeCount};
        });
    });
}


// Buffer * String -> Q(String)
function uploadBuffer(buf, key) {
    var opts = {
        ContentType: 'application/octet-stream',
        ContentEncoding: 'gzip',
        shouldCompress: false
    };
    return uploadAndCache(buf, key, opts);
}


// Object * String -> Q(String)
function uploadJSON(obj, key) {
    var opts = {
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        shouldCompress: true
    };
    return uploadAndCache(JSON.stringify(obj), key, opts);
}


// [String+Buffer] * String * Object -> Q(String)
function uploadAndCache(data, key, opts) {
    function s3Upload(data, key, cache) {
        return s3.upload(config.S3, config.BUCKET, {name: key}, data, opts).then(function() {
            return sprintf('s3://%s/%s', config.BUCKET, key);
        });
    }

    function cacheLocally(data, key) {
        // Wait a couple of seconds to make sure our cache has a
        // more recent timestamp than S3
        var res = Q.defer();
        setTimeout(function () {
            logger.debug('Caching dataset locally');
            var url = sprintf('s3://%s/%s', config.BUCKET, key);
            var qSaved = tmpCache.put(urllib.parse(url), data).then(_.constant(url));
            res.resolve(qSaved);
        }, 2000);
        return res.promise;
    }

    if (config.ENVIRONMENT === 'local') {
        logger.debug('Attempting to upload dataset');
        return s3Upload(data, key, opts)
            .fail(function (err) {
                logger.error(err, 'S3 Upload failed');
            }).then(cacheLocally.bind(null, data, key),
                    cacheLocally.bind(null, data, key)); // Cache locally regardless of result
    } else {
        // On prod/staging ETL fails if upload fails
        logger.debug('Uploading dataset');
        return s3Upload(data, key, opts)
            .then(cacheLocally.bind(null, data, key))
            .fail(function (err) {
                logger.error(err, 'S3 Upload failed');
            });
    }
}


// Request * Response * Object -> Q(Object)
function process(req, res, params) {
    logger.info('ETL2: Got request, params:', params);

    if (!_.contains(supportedAgents, params.agent)) {
        throw new Error('Unsupported agent: ' + params.agent);
    }

    var msg = parseParts(req.files);

    logger.debug('Message parts', _.keys(msg));
    logger.debug('Message metadata', msg.metadata);
    return etl(msg, params).then(function(info) {
        res.send({
            success: true, dataset: info.name,
            viztoken: apiKey.makeVizToken(params.key, info.name)
        });
        return info;
    });
}


module.exports = {
    process: process
};
