'use strict';

var Q           = require('q');
var _           = require('underscore');
var sprintf     = require('sprintf-js').sprintf;
var bodyParser  = require('body-parser');
var multer      = require('multer');

var config      = require('@graphistry/config')();
var Log         = require('@graphistry/common').logger;
var slack       = require('@graphistry/common').slack;
var apiKey      = require('@graphistry/common').api;
var etl1        = require('./etl1.js');
var etl2        = require('./etl2.js');
var logger      = Log.createLogger('etlworker:index');

import express from 'express';
import stringify from 'json-stable-stringify';
import { parse as parseURL } from 'url';
import { Observable, Subject, Subscription } from 'rxjs';

import { HealthChecker } from './HealthChecker.js';
const healthcheck = HealthChecker();

// Express.App * Socket -> ()
export function etlWorker(app, server, sockets, caches) {
    
    app.get('/etl/healthcheck', function(req, res) {
        const health = healthcheck();
        logger.info({...health, req, res}, 'healthcheck');
        res.status(health.clear.success ? 200 : 500).json({...health.clear});
    });
    

    const { requests } = server;
    return requests
        .mergeMap(filterETLRequests)
        .startWith({ isActive: true }) 
        //.timeout(...) //config var
        //.do(... done or crashed ...)
}

function filterETLRequests({ request, response } = {}) {

    const { method = '' } = request;

    if (method.toLowerCase() !== 'post') {
        return Observable.of({ request, response });
    }

    const url = parseURL(request.url);
    if (url.pathname !== '/etl') {
        return Observable.of({ request, response });
    }

    return handleETLRequest({
        request, response
    })
    .mergeMap(sendETLResponse)
    .mergeMap(notifyOfETLResult);
}

const queryParser = express.query();
const JSONParser = bodyParser.json({ limit: '384mb' }); // This is the uncompressed size
const formParser = multer({
        storage: multer.memoryStorage()
    })
    .fields(Array
        .from({ length: 16 })
        .map((n, k) => ({ name: `data${k}`, maxCount: 1 }))
        .concat(     { name: 'metadata', maxCount: 1 })
    );

function processETL(request, response) {

    const params = parseQueryParams(request);
    const handlers = {
        '0': etl1.processRequest,
        '1': etl1.processRequest,
        '2': etl2.processRequest
    };
    const apiVersion = params.apiVersion || 0;
    const handler = handlers[apiVersion];

    if (handler === undefined) {
        return Observable.of({
            response,
            success: false,
            error: new Error(`Unsupported API version: ${apiVersion}`)
        });
    }

    return handler(request, params).map((info) => ({
            info, params, response,
            success: true, dataset: info.name,
            viztoken: apiKey.makeVizToken(params.key, info.name)
        }))
        .catch((error) => {
            logger.debug('Failed worker, tearing down');
            return Observable.of({
                error,
                response,
                success: false,
                message: 'ETL post fail'
            });
        });
}

// Request -> Object
function parseQueryParams({ query = {}} = {}) {

    var res = {};

    res.usertag = query.usertag || 'unknown';
    res.agent = query.agent || 'unknown';
    res.agentVersion = query.agentversion || '0.0.0';
    res.apiVersion = parseInt(query.apiversion) || 0;
    res.key = query.key;

    return res;
}

// String * String * Sting * Object -> ()
function notifySlackAndSplunk(name, nodeCount, edgeCount, params) {
    function makeUrl(server) {
        var type = params.apiVersion == 2 ? 'jsonMeta' : 'vgraph';
        var domain;
        switch (server) {
            case 'staging':
                domain = 'http://staging.graphistry.com';
                break;
            case 'labs':
                domain = 'http://labs.graphistry.com';
                break;
            case 'localhost':
                domain = 'http://localhost:3000';
                break;
            default:
                domain = 'http://%s.graphistry.com';
        }
        var url = sprintf('%s/graph/graph.html?type=%s&dataset=%s&info=true',
                          domain, type, name);
        return sprintf('<%s|%s>', url, server);
    }
    function isInternal(key) {
        var suffix = 'graphistry.com';
        return key.slice(-suffix.length) === suffix;
    }

    var key = '';
    if (params.key) {
        try {
            key += apiKey.decrypt(params.key);
        } catch (err) {
            logger.error(err, 'Could not decrypt key');
            key += ' COULD NOT DECRYPT';
        }
    } else {
        key = 'n/a';
    }

    var links = sprintf('View on %s or %s or %s', makeUrl('labs'), makeUrl('staging'), makeUrl('localhost'));
    var title = sprintf('*New dataset:* `%s`', name);
    var tag = sprintf('`%s`', params.usertag.split('-')[0]);

    var msg = {
        channel: '#datasets',
        username: key,
        text: '',
        attachments: JSON.stringify([{
            fallback: 'New dataset: ' + name,
            text: title + '\n' + links,
            color: isInternal(key) ? 'good' : 'bad',
            fields: [
                { title: 'Nodes', value: nodeCount, short: true },
                { title: 'Edges', value: edgeCount, short: true },
                { title: 'API', value: params.apiVersion, short: true },
                { title: 'Machine Tag', value: tag, short: true },
                { title: 'Agent', value: params.agent, short: true },
                { title: 'Version', value: params.agentVersion, short: true }
            ],
            mrkdwn_in: ['text', 'pretext', 'fields']
        }])
    };

    // Log info forwarded to Slack so we can access it in Splunk
    logger.info({
        user: key,
        internal: isInternal(key),
        dataset: name,
        tag: tag,
        params: _.pick(params, ['apiVersion', 'agent', 'agentVersion']),
        nodes: nodeCount,
        edges: edgeCount,
    }, 'New dataset');

    return Q.denodeify(slack.post)(msg)
        .fail(function (err) {
            logger.error(err, 'Error posting on slack');
        });
}

function handleETLRequest({ request = {}, response } = {}) {

    const parseQuery = Observable.bindCallback(
        queryParser, () => ({ request, response })
    );

    const parseJSON = Observable.bindCallback(
        JSONParser, () => ({ request, response })
    );

    const parseForm = Observable.bindCallback(
        formParser, () => ({ request, response })
    );

    return parseQuery(request, response)
        .mergeMap(({ request, response }) => parseJSON(request, response))
        .mergeMap(({ request, response }) => parseForm(request, response))
        .mergeMap(({ request, response }) => processETL(request, response));
}

function sendETLResponse({ response, success, error, params, info, ...rest }) {

    logger.debug('Worker finished, exiting');

    const data = success ?
        { success: true, ...rest } :
        { success: false, msg: error.message };
    const buffer = new Buffer(stringify(data, 'utf8'));
    const responseEnd = Observable.bindNodeCallback(response.end.bind(response));

    response.writeHead(302, {
        'Content-Type': 'application/json',
        'Content-Length': buffer.length
    });

    return responseEnd(buffer)
        .map(() => ({ success, error, params, info, ...rest }))
        .catch((error) => Observable.of({
            error, success: false,
            isActive: false, exitCode: 1,
            message: 'Error sending ETL Response'
        }))
}

function notifyOfETLResult({ success, error, params, info, ...rest }) {

    const notifyAPIOnSuccessObs = !success ?
        Observable.empty() :
        Observable.defer(() => Observable.from(
            notifySlackAndSplunk(info.name, info.nodeCount, info.edgeCount, params)
        )).ignoreElements();

    const reportIsActiveObs = !error ?
        Observable.of({ isActive: false }) :
        Observable.of({ ...rest, error, exitCode: 1, isActive: false });

    return notifyAPIOnSuccessObs.concat(reportIsActiveObs);
}
