/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/underscore/underscore.d.ts"/>
/// <reference path="../typings/rx/rx.d.ts"/>
'use strict';

var fs          = require('fs');
var path        = require('path');
var url         = require('url');
var util        = require('util');

var debug       = require('debug')('graphistry:central:server');
var _           = require('underscore');
var Rx          = require('rx');
var Q           = require('q');
var express     = require('express');
var io          = require('socket.io-client'); //for etl setup
var proxy       = require('express-http-proxy');
var compression = require('compression');
var request     = require('request');
var bodyParser  = require('body-parser');

var app         = express();
var http        = require('http').Server(app);

var config      = require('config')();
var router = require('./worker-router.js');


debug('Config set to %j', config);

app.use(compression());

//needed for splunk API
//TODO can we tighten so only for API?
var allowCrossOrigin = function  (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,X-Splunk-Form-Key,X-CSRFToken');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,PATCH,POST,DELETE');
    next();
};
app.use(allowCrossOrigin);


app.options('/api/v0.2/splunk/html/graph.fragment.html', function(req, res) {
    res.sendStatus(200);
});
app.options('/api/v0.2/splunk/html/index.fragment.html', function(req, res) {
    res.sendStatus(200);
});


var MAIN_STATIC_PATH    = path.resolve(__dirname, 'assets');
var GRAPH_STATIC_PATH   = path.resolve(require('graph-viz').staticFilePath(), 'assets');
var HORIZON_STATIC_PATH = path.resolve(require('horizon-viz').staticFilePath(), 'assets');
var UBER_STATIC_PATH    = path.resolve(require('uber-viz').staticFilePath(), 'assets');
var SPLUNK_STATIC_PATH  = path.resolve(require('splunk-viz').staticFilePath(), 'assets');

var HTTP_SERVER_LISTEN_ADDRESS = config.HTTP_LISTEN_ADDRESS;
var HTTP_SERVER_LISTEN_PORT = config.HTTP_LISTEN_PORT;


function logClientError(req, res) {
    var writeError = function (msg) {
        //debug('Logging client error', msg);
        if(config.ENVIRONMENT === 'local') {
            if (msg.content) {
                console.error('[Client]', msg.content);
            } else {
                console.error('[Client]', JSON.stringify(msg, null, 2));
            }
            /* jshint -W064 */
            return Q();
            /* jshint +W064 */
        }
        var logFile = path.resolve('/', 'var', 'log', 'clients' ,'clients.log');
        return Q.denodeify(fs.appendFile)(logFile, JSON.stringify(msg) + '\n')
            .fail(function (err) {
                console.error('Error writing client error', err, (err||{}).stack);
            });
    };

    var data = '';

    req.on('data', function (chunk) {
        data += chunk;
    });

    req.on('end', function () {
        try {
            writeError(JSON.parse(data)).done(function () {
                res.status(200).end();
            });
        } catch(err) {
            console.error('Error logging client error', err, (err||{}).stack);
            res.status(500).end();
        }
    });
}


/**
 * Converts ad-hoc URL object(s) (i.e., one we constructed by hand, possibly incomplete or
 * invalid) into as complete a URL object as node's URL module can muster. This is done by
 * converting the ad-hoc URL to a formatted string, then re-parsing it into a URL object.
 *
 * @param {...Object} url - One or more URL-like objects. Multiple arguments will be combined into
 * a single URL object, with later arguments overwriting earlier ones.
 *
 * @returns {Object} A valid Node.js URL object.
 */
function ensureValidUrl() {
    var args = [{}];
    for(var i in arguments) { args.push(arguments[i]); }

    var adHocUrl = _.extend.apply(_, args);

    return url.parse(url.format(adHocUrl), true, true);
}


/**
 * Handles a `/vizaddr` HTTP request by finding a viz worker server process, reserving it for the
 * the user, and returning the worker's address to the user so she can connect to it.
 */
function assignWorker(req, res) {
    router.pickWorker(function (err, worker) {
        if (err) {
            console.error('Error while assigning visualization worker:', err);
            return res.json({
                success: false,
                error: (err||{}).message || 'Error while assigning visualization worker.'
            });
        }
        debug('Assigning client a worker', req.ip, worker);

        // Get the request URL so that we can construct a worker URL from it
        var baseUrl = ensureValidUrl(url.parse(req.originalUrl), {host: req.get('Host')});

        var workerPort = (config.ENVIRONMENT === 'local') ? worker.port : baseUrl.port;
        var workerPath = (config.ENVIRONMENT === 'local') ?
            util.format('%s/', config.BASE_URL) :
            util.format('%s/%s/', config.BASE_URL, encodeURIComponent(worker.port));
//            util.format('%s/%s/%s',
//                config.BASE_URL,
//                encodeURIComponent(worker.hostname),
//                encodeURIComponent(worker.port));

        var workerUrl = ensureValidUrl({
                hostname: baseUrl.hostname,
                port: workerPort,
                pathname: workerPath,
                query: {}
            });

        return res.json({success: true, timestamp: worker.timestamp, uri: workerUrl});
    });
}


app.get('/vizaddr/graph', function(req, res) {
    assignWorker(req, res);
});

app.get('/vizaddr/horizon', function(req, res) {
    assignWorker(req, res);
});


// Serve the StreamGL client library
app.get('*/StreamGL.js', function(req, res) {
    res.sendFile(require.resolve('StreamGL/dist/StreamGL.js'));
});
app.get('*/StreamGL.map', function(req, res) {
    res.sendFile(require.resolve('StreamGL/dist/StreamGL.map'));
});

// Serve horizon static assets
app.use('/horizon', express.static(HORIZON_STATIC_PATH));
// Serve graph static assets
app.use('/graph', function (req, res, next) {
    return express.static(GRAPH_STATIC_PATH)(req, res, next);
});
// Serve uber static assets
app.use('/uber',   express.static(UBER_STATIC_PATH));
// Serve splunk static assets
app.use('/api/v0.2/splunk',   express.static(SPLUNK_STATIC_PATH));

// Temporarly handle ETL request from Splunk
app.post('/etl', bodyParser.json({type: '*', limit: '64mb'}), function (req, res) {
    debug('etl request');
    router.pickWorker(function (err, worker) {
        debug('picked etl worker', req.ip, worker);

        if (err) {
            console.error('Error while assiging an ETL worker', err);
            return res.send({
                success: false,
                msg: 'Error while assigning an ETL worker:' + err.message
            });
        }

        // Note: we specifically do not respect reverse proxy stuff, since we're presumably running
        // inside the cluster, and direct connections are more efficient.
        var redirect = 'http://' + worker.hostname + ':' + worker.port + '/';
        debug('create socket', redirect);
        var socket = io(redirect, {forceNew: true, reconnection: false, transports: ['websocket']});
        //socket.io.engine.binaryType = 'arraybuffer';

        socket.on('connect_error', function (err) {
            console.error('error, socketio failed connect', err);
        });

        socket.on('connect', function () {
            debug('connected socket, initializing app', redirect);
            socket.emit('viz', 'etl', function (resp) {
                debug('initialized, notifying client');
                if (!resp.success) {
                    console.error('failed initializing worker', resp);
                    return res.json({success: false, msg: 'failed connecting to work'});
                }
                var newEndpoint = redirect + 'etl';
                debug('telling client to redirect', newEndpoint);

                req.pipe(request(newEndpoint)).pipe(res);
                //res.redirect(307, newEndpoint);
            });
            debug('waiting for worker to initialize');
        });

    });

});

// Store client errors in a log file (indexed by Splunk)
app.post('/error', bodyParser.json({type: '*', limit: '64mb'}), logClientError);

// Default '/' static assets
app.use('/', express.static(MAIN_STATIC_PATH));

// Default '/' static assets
app.use('/graphistry', express.static(MAIN_STATIC_PATH));


app.get('/horizon', function(req, res) {
    debug('redirecting to horizon');
    res.redirect('/horizon/src/demo/index.html' + (req.query.debug !== undefined ? '?debug' : ''));
});

app.get('/uber', function(req, res) {
    debug('redirecting to graph');
    res.redirect('/uber/index.html' + (req.query.debug !== undefined ? '?debug' : ''));
});


function start() {
    return Rx.Observable.return()
        .do(function () {
            if (config.ENVIRONMENT === 'local') {
                var from = '/worker/' + config.VIZ_LISTEN_PORT + '/';
                var to = 'http://localhost:' + config.VIZ_LISTEN_PORT;
                debug('setting up proxy', from, to);
                app.use(from, proxy(to, {
                    forwardPath: function(req) {
                        return url.parse(req.url).path.replace(new RegExp('worker/' + config.VIZ_LISTEN_PORT + '/'),'/');
                    }
                }));
            }
        })
        .flatMap(function () {
            return Rx.Observable.fromNodeCallback(http.listen.bind(http, HTTP_SERVER_LISTEN_PORT))(HTTP_SERVER_LISTEN_ADDRESS);
        });
}





module.exports = {
    start: start,
    config: {
        listenIP: HTTP_SERVER_LISTEN_ADDRESS,
        listenPort: HTTP_SERVER_LISTEN_PORT
    }
};
