#!/usr/bin/env node
'use strict';

var os          = require('os');
var fs          = require('fs');
var path        = require('path')


var debug       = require('debug')('graphistry:central:server');
var mongo       = require('mongodb');
var MongoClient = mongo.MongoClient;
var assert      = require('assert');
var Rx          = require('rx');
var Q           = require('q');
var _           = require('underscore');
var config      = require('config')();

debug("Config set to %j", config);

var express     = require('express');
var compression = require('compression');
var app         = express();
var http        = require('http').Server(app);
var bodyParser  = require('body-parser');
var request     = require('request');

//for etl setup
var io = require('socket.io-client');


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
var db;


var MAIN_STATIC_PATH    = path.resolve(__dirname, 'assets');
var GRAPH_STATIC_PATH   = path.resolve(require('graph-viz').staticFilePath(), 'assets');
var HORIZON_STATIC_PATH = path.resolve(require('horizon-viz').staticFilePath(), 'assets');
var UBER_STATIC_PATH    = path.resolve(require('uber-viz').staticFilePath(), 'assets');
var SPLUNK_STATIC_PATH  = path.resolve(require('splunk-viz').staticFilePath(), 'assets');

var HTTP_SERVER_LISTEN_ADDRESS = config.HTTP_LISTEN_ADDRESS;
var HTTP_SERVER_LISTEN_PORT = config.HTTP_LISTEN_PORT;

// FIXME: Get real viz server IP:port from DB
var VIZ_SERVER_HOST = get_likely_local_ip();
var VIZ_SERVER_PORT = config.VIZ_LISTEN_PORT;
debug("Will route clients to viz server at %s:%d", VIZ_SERVER_HOST, VIZ_SERVER_PORT);


/**
 * Uses a naive heuristic to find this machines IP address
 * @return {string} the IP address as a string
 */
function get_likely_local_ip() {

    if (config.ENVIRONMENT === 'local') {
        return config.VIZ_LISTEN_ADDRESS;
    }


    var public_iface = _.map(os.networkInterfaces(), function(ifaces) {
        return _.filter(ifaces, function(iface) {
            return (!iface.internal) && (iface.family === 'IPv4');
        });
    });

    public_iface = _.flatten(public_iface, true);

    return (public_iface.length > 0) ? public_iface[0].address : 'localhost';
}


//string -> Observable {ips: ..., results: ...}
function getIPs() {
    // The absolute Date that defines the time threshild between fresh/stale pings
    var freshDate = new Date(Date.now() - (config.GPU_PING_TIMEOUT * 1000));

    // Find all the server running workers, sort by available GPU memory
    var workerServers = db.collection('gpu_monitor').find(
            {'updated': {'$gt': freshDate}},
            {'sort': [['gpu_memory_free', 'desc']]}
        );

    return Rx.Observable
        .fromNodeCallback(workerServers.toArray, workerServers)()
        .flatMap(function (ips) {
            if (ips.length < 1) {
                debug('No worker currently registered to this cluster.');
                return Rx.Observable.throw(new Error(
                    'There are no worker currently registered to this cluster. Please contact help@graphistry.com for further assistance.'));
            }

            // Find all idle node processes
            var nodeCollection = db.collection('node_monitor').find({
                'active': false,
                'updated': {'$gt': freshDate}
            });

            return Rx.Observable.fromNodeCallback(nodeCollection.toArray, nodeCollection)()
                .map(function (results) {
                    if (!results.length) {
                        debug('All workers are currently busy');
                        var msg = "All workers are currently busy, and your request can't be serviced at this time. Please contact help@graphistry.com for private access. (Reason: could not find an available worker in the worker ping database.)";
                        throw new Error(msg);
                    }
                    return {ips: ips, results: results};
                });
        });
}



//{hostname, port} -> Observable bool
//TODO protocol as part of handshake (http vs https)
function handshakeIp (workerNfo) {
    var url = 'http://' + workerNfo.hostname + ':' + workerNfo.port + '/claim';
    var cfg = {url: url, json: true, timeout: 250};
    debug('Trying worker', cfg, workerNfo);
    return Rx.Observable.fromNodeCallback(request.get.bind(request))(cfg)
        .pluck(1)
        .map(function (resp) {
            debug('Worker response', resp);
            return !!resp.success;
        })
        .catch(function catchHandshakeHTTPErrors(err) {
            console.warn('Handshake error: encountered a HTTP error attempting to handshake "%s". Catching error and reporting unsuccessful handshake to caller. Error message: %s',
                url, err);
            return Rx.Observable.return(false);
        });
}

// ... -> [{hostname,port,timestamp}]
function listIps (o) {

    var workers = [];

    // Try each IP in order of free space
    var ips = o.ips;
    var results = o.results;
    for (var i in ips) {
        var ip = ips[i]['ip'];

        for (var j in results) {

            if (results[j]['ip'] != ip) {
                continue;
            }

            workers.push(
                {'hostname': ip,
                 'port': results[j]['port'],
                 'timestamp': Date.now()
                });
        }
    }

    return workers;//{i: 0, workers: workers, worker: null};
}

// resp: JSON {success: bool, error} + {success: true, hostname, port}
function assign_worker(req, res) {
    pickWorker(function (err, worker) {
        if (err) {
            console.error('Error while assigning visualization worker:', err);
            return res.json({
                success: false,
                error: (err||{}).message || 'Error while assigning visualization worker.'
            });
        }
        debug('Assigning client a worker', req.ip, worker);
        return res.json(_.extend({success: true}, worker));
    });
}

//(exn * {hostname, port} -> ()) -> ()
function pickWorker (k) {

    var ips;

    if(config.ENVIRONMENT === 'production' || config.ENVIRONMENT === 'staging') {
        ips = getIPs()
            .flatMap(function (o) {
                return Rx.Observable.fromArray(listIps(o));
            });
    } else {
        debug('Using local hostname/port', VIZ_SERVER_HOST, VIZ_SERVER_PORT);
        ips = Rx.Observable.return({hostname: VIZ_SERVER_HOST, port: VIZ_SERVER_PORT});
    }


    // Create a controlled Observable of IPs so that it only emits an item when we ask it to,
    // instead of emitting them all at once. (Warning: keep a reference to the Observable right
    // after `controlled` is applied, as further operators will mask the `request()` method.)
    var ipsControlled = ips.controlled();
    // Emit one IP to start
    ipsControlled.request(1);

    var ip = ipsControlled
        .flatMap(function (workerNfo) {
            return handshakeIp(workerNfo)
                .map(function(success) { return (success) ? workerNfo : false; });
        })
        .filter(function filterWorkerAndRequest(workerNfo) {
            // If we're going to reject this worker, also request the next one
            return !!(workerNfo || (ipsControlled.request(1) && false));
        })
        .take(1);

    var count = 0;
    ip.do(function (worker) {
            debug("Assigning worker on %s, port %d", worker.hostname, worker.port);
            k(null, worker);
        })
        .subscribe(
            function () { count++; },
            function (err) {
                console.error('assign_worker error', err, (err || {}).stack);
                k(err || new Error('Unexpected error while assigning workers.'));
            },
            function () {
                if (!count) {
                    console.error('assign_worker exhausted search (too many users?)');
                    k(new Error('Too many users, please contact help@graphistry.com for private access.'));
                }
            });
}

function logClientError(req, res) {
    var writeError = function (msg) {
        //debug('Logging client error', msg);
        if(config.ENVIRONMENT === 'local') {
            if (msg.content) {
                console.error('[Client]', msg.content);
            } else {
                console.error('[Client]', JSON.stringify(msg, null, 2));
            }
            return Q();
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

app.get('/vizaddr/graph', function(req, res) {
    assign_worker(req, res);
});

app.get('/vizaddr/horizon', function(req, res) {
    assign_worker(req, res);
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
    pickWorker(function (err, worker) {
        debug('picked etl worker', req.ip, worker);

        if (err) {
            console.error('Error while assiging an ETL worker', err);
            return res.send({
                success: false,
                msg: 'Error while assigning an ETL worker:' + err.message
            });
        }

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


app.get('/horizon', function(req, res) {
    debug('redirecting to horizon')
    res.redirect('/horizon/src/demo/index.html' + (req.query.debug !== undefined ? '?debug' : ''));
});

app.get('/uber', function(req, res) {
    debug('redirecting to graph')
    res.redirect('/uber/index.html' + (req.query.debug !== undefined ? '?debug' : ''));
});


function start() {
    return Rx.Observable.return()
        .flatMap(function () {
            if(config.ENVIRONMENT === 'local') {
                return Rx.Observable.return();
            } else {
                return Rx.Observable.fromNodeCallback(
                    MongoClient.connect.bind(MongoClient, config.MONGO_SERVER))({auto_reconnect: true})
                    .do(function (database) {
                        db = database.db(config.DATABASE);
                    });
            }
        })
        .flatMap(function () {
            return Rx.Observable.fromNodeCallback(http.listen.bind(http, HTTP_SERVER_LISTEN_PORT))(HTTP_SERVER_LISTEN_ADDRESS);
        });
}


if(require.main === module) {
    start().subscribe(
        function () {
            console.log('\n[server.js] Server listening on %s:%d', HTTP_SERVER_LISTEN_ADDRESS, HTTP_SERVER_LISTEN_PORT);
        },
        function (err) {
            console.error("[server.js] Fatal error: could not start server on address %s, port %s. Exiting...",
                HTTP_SERVER_LISTEN_ADDRESS, HTTP_SERVER_LISTEN_PORT);

            process.exit(1);
        }
    );
}


module.exports = {
    start: start,
    config: {
        listenIP: HTTP_SERVER_LISTEN_ADDRESS,
        listenPort: HTTP_SERVER_LISTEN_PORT
    }
};
