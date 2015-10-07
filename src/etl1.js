'use strict';

var urllib   = require('url');
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


function makeVizToken(key, datasetName) {
    var sha1 = crypto.createHash('sha1');
    sha1.update(key);
    sha1.update(datasetName);
    return sha1.digest('hex');
}


// (Int -> ()) * Request * Response * Object -> Promise()
function process(req, res, params) {
    logger.info('ETL request submitted', params);
    var data = req.body
    logger.debug('Request bytes:%d (deflated)', data.length);

    return Q(data).then(function (msg) {
        return etl(msg)
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
