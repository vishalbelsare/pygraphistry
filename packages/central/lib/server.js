/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/underscore/underscore.d.ts"/>
/// <reference path="../typings/rx/rx.d.ts"/>
'use strict';

require('source-map-support').install();

var Rx          = require('rxjs/Rx');

Rx.Observable.return = function (value) {
    return Rx.Observable.of(value);
};

Rx.Subject.prototype.onNext = Rx.Subject.prototype.next;
Rx.Subject.prototype.onError = Rx.Subject.prototype.error;
Rx.Subject.prototype.onCompleted = Rx.Subject.prototype.complete;
Rx.Subject.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscriber.prototype.onNext = Rx.Subscriber.prototype.next;
Rx.Subscriber.prototype.onError = Rx.Subscriber.prototype.error;
Rx.Subscriber.prototype.onCompleted = Rx.Subscriber.prototype.complete;
Rx.Subscriber.prototype.dispose = Rx.Subscriber.prototype.unsubscribe;

Rx.Subscription.prototype.dispose = Rx.Subscription.prototype.unsubscribe;

import FalcorServer from 'falcor-express';
import { FalcorRouter } from './falcor-router';
import { ensureValidUrl } from './support/ensureValidUrl';

var fs          = require('fs');
var path        = require('path');
var url         = require('url');
var util        = require('util');

var _           = require('underscore');
var Q           = require('q');
var express     = require('express');
var io          = require('socket.io-client'); //for etl setup
var proxy       = require('express-http-proxy');
var rewrite     = require('express-urlrewrite');
var compression = require('compression');
var request     = require('request');
var bodyParser  = require('body-parser');

var app         = express();
var http        = require('http').Server(app);

var config      = require('config')();

var Log         = require('common/logger.js');
var logger      = Log.createLogger('central', 'central/lib/server.js');

var router = require('./worker-router.js');

var apiKey      = require('common/api.js');

// Tell Express to trust reverse-proxy connections from localhost, linklocal, and private IP ranges.
// This allows Express to expose the client's real IP and protocol, not the proxy's.
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
app.use(compression());

var MAIN_STATIC_PATH    = path.resolve(__dirname, '../assets');
var GRAPH_STATIC_PATH   = path.resolve(require('graph-viz').staticFilePath(), 'assets');

var STREAMGL_DIST_PATH  = require.resolve('StreamGL');
STREAMGL_DIST_PATH = path.resolve(STREAMGL_DIST_PATH.slice(0, STREAMGL_DIST_PATH.lastIndexOf('/')), 'dist');

var HTTP_SERVER_LISTEN_ADDRESS = config.HTTP_LISTEN_ADDRESS;
var HTTP_SERVER_LISTEN_PORT = config.HTTP_LISTEN_PORT;

function logClientError(req, res) {
    var writeError = function (msg) {

        if (msg.err && msg.err.stack) {
            msg.err.stackArray = Log.getFullErrorStack(msg.err.stack);
        }

        if(config.ENVIRONMENT === 'local') {
            msg.ip = req.ip;
            logger.error(msg, 'Client Error');
            /* jshint -W064 */
            return Q();
            /* jshint +W064 */
        }
        var logFile = path.resolve('/', 'var', 'log', 'clients' ,'clients.log');
        return Q.denodeify(fs.appendFile)(logFile, JSON.stringify(msg) + '\n')
            .fail(Log.makeQErrorHandler(logger, 'Error writing client error'));
    };

    try {
        writeError(req.body).done(function () {
            res.status(200).end();
        });
    } catch (err) {
        logger.error(err, 'Error reading client error');
        res.status(500).end();
    }
}

/**
 * Handles a `/vizaddr` HTTP request by finding a viz worker server process, reserving it for the
 * the user, and returning the worker's address to the user so she can connect to it.
 */
function assignWorker(req, res) {
    const metadataFields = ['dataset', 'debugId'];
    Log.addMetadataField(_.pick(req.query, metadataFields));

    router.pickWorkerCB(function (err, worker) {
        if (err) {
            logger.error(err, 'Error while assigning visualization worker');
            return res.json({
                success: false,
                error: (err||{}).message || 'Error while assigning visualization worker.'
            });
        }
        logger.debug('Assigning client a worker', req.ip, worker);

        // Get the request URL so that we can construct a worker URL from it
        var baseUrl = ensureValidUrl(url.parse(req.originalUrl), {host: req.get('Host')});

        var workerPort = (config.PINGER_ENABLED) ? baseUrl.port : worker.port;
        var workerPath = (config.PINGER_ENABLED) ?
            util.format('%sworker/%s/', config.BASE_PATH, encodeURIComponent(worker.port)) :
            util.format('%s', config.BASE_PATH);

        var workerUrl = ensureValidUrl({
                hostname: baseUrl.hostname,
                port: workerPort,
                pathname: workerPath,
                query: {}
            });

        res.json({success: true, timestamp: worker.timestamp, uri: workerUrl});
        Log.clearMetadataField(metadataFields);
    });
}


// Proxy upload to task-like worker (etl, oneshot)
// String * String -> {success: bool, msg: 'Invalid API key'}
//   route: public route
//   workerName: vizserver dispatcher
function propagatePostToWorker (route, workerName) {
    // Temporarly handle ETL request from Splunk

    app.post(route, function (req, res) {

        logger.info({req: req.body}, 'ETL request', route);
        logger.debug({req: req}, ' ETL request debug');

        if (config.ENVIRONMENT !== 'local') {
            try {
                var who = apiKey.decrypt(req.query.key);
            } catch (err) {
                logger.error(err, 'Invalid API key for POST');
                return res.send({success: false, msg: 'Invalid API key'});
            }
        }

        router.pickWorkerCB(function (err, worker) {
            logger.debug('picked worker', req.ip, worker);

            if (err) {
                logger.error(err ,'Error while assiging a ' + route + ' worker');
                return res.send({
                    success: false,
                    msg: 'Error while assigning a ' + route + ' worker:' + err.message
                });
            }

            // Note: we specifically do not respect reverse proxy stuff, since we're presumably running
            // inside the cluster, and direct connections are more efficient.
            var redirect = 'http://' + worker.hostname + ':' + worker.port;
            logger.trace('create socket', redirect);
            var socket = io(redirect, {forceNew: true, reconnection: false, transports: ['websocket']});
            //socket.io.engine.binaryType = 'arraybuffer';

            socket.on('connect_error', function (err) {
                logger.error(err ,'Connect_error in socketio');
            });

            socket.on('connect', function () {
                logger.trace('connected socket, initializing app', redirect);
                socket.emit('viz', workerName, function (resp) {
                    logger.trace('initialized, notifying client');
                    if (!resp.success) {
                        logger.error('Failed initializing worker');
                        return res.json({success: false, msg: 'failed connecting to work'});
                    }
                    var newEndpoint = redirect + req.originalUrl;
                    logger.trace('piping to new endpoint', newEndpoint);
                    req.pipe(request(newEndpoint)).pipe(res);
                });
                logger.trace('waiting for worker to initialize');
            });

        });

    });
}


app.get('/vizaddr/graph', function(req, res) {
    assignWorker(req, res);
});

// Forward ETL requests to workers
propagatePostToWorker('/etl', 'etl');
propagatePostToWorker('/etlvgraph', 'etl');
propagatePostToWorker('/oneshot', 'oneshot');

// Store client errors in a log file (indexed by Splunk)
app.post('/error', bodyParser.urlencoded({extended: true, limit: '64kb'}), logClientError);

// Default '/' static assets
app.use('/graphistry', express.static(MAIN_STATIC_PATH));

// Default '/' static assets
app.use('/', express.static(MAIN_STATIC_PATH));

//https://.../api/encrypt?text=...
apiKey.init(app);

app.use(bodyParser.urlencoded({ extended: false }));

// middleware to handle Falcor get/put/post requests
app.use('/model.json', FalcorServer.dataSourceRoute(function(request, response) {
    return new FalcorRouter({ config, logger, request });
}));

app.use('/graph', express.static(GRAPH_STATIC_PATH, { fallthrough: true }));
app.use('/graph', express.static(STREAMGL_DIST_PATH, { fallthrough: true }));

app.use(rewrite('/dataset/:datasetName', '/graph/graph.html?dataset=:datasetName'));
app.use(rewrite('/dataset/:datasetName\\?*', '/graph/graph.html?dataset=:datasetName?$1'));
app.use(rewrite('/workbook/:workbookName', '/graph/graph.html?workbook=:workbookName'));
app.use(rewrite('/workbook/:workbookName\\?*', '/graph/graph.html?workbook=:workbookName?$1'));
app.use(rewrite('/workbook/:workbookName/view/:viewName', '/graph/graph.html?workbook=:workbookName&view=:viewName'));
app.use(rewrite('/workbook/:workbookName/view/:viewName\\?*', '/graph/graph.html?workbook=:workbookName&view=:viewName?$1'));


function start() {
    return Rx.Observable.return()
        .do(function () {
            if (config.ENVIRONMENT === 'local') {
                _.each(config.VIZ_LISTEN_PORTS, function (port) {
                    var from = '/worker/' + port + '/';
                    var to = 'http://localhost:' + port;
                    logger.info('setting up proxy', from, to);
                    app.use(from, proxy(to, {
                        forwardPath: function(req) {
                            return url.parse(req.url).path.replace(new RegExp('worker/' + port + '/'),'/');
                        }
                    }));
                });
            }
        })
        .flatMap(function () {
            return Rx.Observable.bindNodeCallback(
                http.listen.bind(http, HTTP_SERVER_LISTEN_PORT)
            )(HTTP_SERVER_LISTEN_ADDRESS);
        });
}


module.exports = {
    start: start,
    config: {
        listenIP: HTTP_SERVER_LISTEN_ADDRESS,
        listenPort: HTTP_SERVER_LISTEN_PORT
    },
    logger: logger
};
