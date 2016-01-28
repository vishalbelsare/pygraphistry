'use strict';

var urllib   = require('url');
var crypto   = require('crypto');
var _        = require('underscore');
var Q        = require('q');

var config   = require('config')();
var vgraph   = require('./vgraph.js');
var apiKey   = require('common/api.js');
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
        return cacheLocally()
            .then(function () { return s3Upload(binData, metadata) },
                  function () { return s3Upload(binData, metadata) })
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


// (Int -> ()) * Request * Response * Object -> Promise()
function process(req, res, params) {
    logger.info('ETL1 request submitted', params);

    return Q(req.body).then(function (msg) {
        return etl(msg)
            .then(function (info) {
                logger.info('ETL1 successful, dataset name is', info.name);

                res.send({
                    success: true, dataset: info.name,
                    viztoken: apiKey.makeVizToken(params.key, info.name)
                });

                return info;
            });
    });
}


module.exports = {
    process: process
};
