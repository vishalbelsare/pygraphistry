'use strict';

var _        = require('underscore');
var Q        = require('q');
var urllib   = require('url');
var Log      = require('common/logger.js');
var apiKey   = require('common/api.js');
var logger   = Log.createLogger('etlworker:etl2');



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


function etl(msg, params) {
    var desc = {
        agent: params.agent,
        agentVersion: params.agentVersion,
        apiVersion: params.apiVersion,
        created: Date.now(),
        creator: apiKey.decrypt(params.key),
        view: msg.metadata.view,
        types: msg.metadata.types,
    };

    desc.datasources = _.map(msg.metadata.datasources, function (datasource) {
        var url = datasource.url;
        if (datasource.type == 'vgraph' && urllib.parse(url).protocol === null) {
            return _.extend({}, datasource, {url: uploadBuffer(msg[url])});
        } else {
            return datasource;
        }
    });

    logger.info('Dataset', desc);
    return desc;
}


function uploadBuffer(buf) {
    return 'todo';
}


function process(req, res, params) {
    var msg = parseParts(req.files);
    logger.info('ETL2: got metadata', msg.metadata);
    etl(msg, params);

    throw new Error('Not implelemented yet');
}


module.exports = {
    process: process
};
