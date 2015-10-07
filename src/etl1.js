'use strict';

var urllib   = require('url');
var zlib     = require('zlib');
var crypto   = require('crypto');
var _        = require('underscore');
var Q        = require('q');

var config   = require('config')();
var vgraph   = require('./vgraph.js');
var Cache    = require('common/cache.js');
var s3       = require('common/s3.js');
var Log      = require('common/logger.js');
var logger   = Log.createLogger('etlworker:etl1');

var tmpCache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE);


// Convert JSON edgelist to VGraph then upload VGraph to S3 and local /tmp
// JSON
function etl(msg) {
    var name = decodeURIComponent(msg.name);
    logger.debug('ETL for', msg.name);

    var vg = vgraph.fromEdgeList(
        msg.graph,
        msg.labels,
        msg.bindings.sourceField,
        msg.bindings.destinationField,
        msg.bindings.idField,
        name
    );

    if (vg === undefined) {
        throw new Error('Invalid edgelist');
    }

    logger.info('VGraph created with', vg.nvertices, 'nodes and', vg.nedges, 'edges');

    return publish(vg, name).then(function () {
        return {name: name, nnodes: vg.nvertices, nedges: vg.nedges};
    });
}


// VGraph * String -> Promise[String]
function publish(vg, name) {
    var metadata = {name: name};
    var binData = vg.encode().toBuffer();

    function cacheLocally() {
        // Wait a couple of seconds to make sure our cache has a
        // more recent timestamp than S3
        var res = Q.defer();
        setTimeout(function () {
            logger.debug('Caching dataset locally');
            res.resolve(tmpCache.put(urllib.parse(name), binData));
        }, 2000);
        return res.promise;
    }

    if (config.ENVIRONMENT === 'local') {
        logger.debug('Attempting to upload dataset');
        return s3Upload(binData, metadata)
            .fail(function (err) {
                logger.error(err, 'S3 Upload failed');
            }).then(cacheLocally, cacheLocally) // Cache locally regardless of result
            .then(_.constant(name)); // We succeed iff cacheLocally succeeds
    } else {
        // On prod/staging ETL fails if upload fails
        logger.debug('Uploading dataset');
        return s3Upload(binData, metadata)
            .then(_.constant(name))
            .fail(function (err) {
                logger.error(err, 'S3 Upload failed');
            });
    }
}


// Buffer * {name: String, ...} -> Promise
function s3Upload(binaryBuffer, metadata) {
    return s3.upload(config.S3, config.BUCKET, metadata, binaryBuffer, {ContentEncoding: 'gzip'});
}


function req2data(req, params) {
    var encoding = params.apiVersion === 0 ? 'identity'
                                           : req.headers['content-encoding'] || 'identity';

    logger.info('ETL request submitted', params);

    var chunks = [];
    var result = Q.defer();

    req.on('data', function (chunk) {
        chunks.push(chunk);
    });

    req.on('end', function () {
        var data = Buffer.concat(chunks)

        logger.debug('Request bytes:%d, encoding:%s', data.length, encoding);

        if (encoding == 'identity') {
            result.resolve(data.toString());
        } else if (encoding === 'gzip') {
            result.resolve(Q.denodeify(zlib.gunzip)(data))
        } else if (encoding === 'deflate') {
            result.resolve(Q.denodeify(zlib.inflate)(data))
        } else {
            result.reject('Unknown encoding: ' + encoding)
        }
    });

    return result.promise;
}


function makeVizToken(key, datasetName) {
    var sha1 = crypto.createHash('sha1');
    sha1.update(key);
    sha1.update(datasetName);
    return sha1.digest('hex');
}

/*
function parseQueryParams(req) {
    var res = [];

    res.usertag = req.query.usertag || 'unknown';
    res.agent = req.query.agent || 'unknown';
    res.agentVersion = req.query.agentversion || '0.0.0';
    res.apiVersion = parseInt(req.query.apiversion) || 0;
    res.key = req.query.key;

    return res;
}


function vgraphEtl(k, req, res) {
    var params = parseQueryParams(req);
    req2data(req, params).then(function (data) {
        try {
            var buffer = new Buffer(data);
            var vg = vgraph.decodeVGraph(buffer);

            Q.all([
                publish(vg, vg.name),
                slackNotify(vg.name, params, vg.nvertices, vg.nedges)
            ]).spread(function () {
                res.send({
                    success: true, dataset: vg.name,
                    viztoken: makeVizToken(params.key, vg.name)
                });
                k(0);
            }).fail(makeFailHandler(res, k));
        } catch (err) {
            makeFailHandler(res, k)(err)
        }
    }).fail(makeFailHandler(res, k));
}
*/

// (Int -> ()) * Request * Response * Object -> Promise()
function process(req, res, params) {
    return req2data(req, params).then(function (data) {
        return etl(JSON.parse(data))
            .then(function (info) {
                logger.info('ETL successful, dataset name is', info.name);

                res.send({
                    success: true, dataset: info.name,
                    viztoken: makeVizToken(params.key, info.name)
                });

                return info;
            });
    });
}

module.exports = {
    process: process
};
