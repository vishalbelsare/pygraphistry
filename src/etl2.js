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
var logger   = Log.createLogger('etlworker:etl2');



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
        view: msg.metadata.view,
        types: msg.metadata.types,
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
                }
                return _.extend({}, datasource, extra);
            });
        } else {
            return Q(datasource);
        }
    });

    return Q.all(qDatasources).then(function (datasources) {
        desc.datasources = datasources;
        logger.debug('Dataset', desc);
        return uploadJSON(desc, sprintf('%s/dataset.json', folder)).then(function (url) {
            return {name: url, nnodes: '?', nedges: '?'};
        });
    });
}


// Buffer * String -> Q(String)
function uploadBuffer(buf, key) {
    var opts = {
        ContentType: 'application/octet-stream',
        ContentEncoding: 'gzip',
        should_compress: false
    };
    return s3.upload(config.S3, config.BUCKET, {name: key}, buf, opts).then(function() {
        return sprintf('s3://%s/%s', config.BUCKET, key);
    });
}


// Object * String -> Q(String)
function uploadJSON(obj, key) {
    var opts = {
        ContentType: 'application/json',
        ContentEncoding: 'gzip',
        should_compress: true
    };
    return s3.upload(config.S3, config.BUCKET, {name: key}, JSON.stringify(obj), opts).then(function() {
        return sprintf('s3://%s/%s', config.BUCKET, key);
    });
}


// Request * Response * Object -> Q(Object)
function process(req, res, params) {
    if (!_.contains(supportedAgents, params.agent)) {
        throw new Error('Unsupported agent: ' + params.agent);
    }


    var msg = parseParts(req.files);
    logger.info('ETL2: got metadata', msg.metadata);
    return etl(msg, params);
}


module.exports = {
    process: process
};
