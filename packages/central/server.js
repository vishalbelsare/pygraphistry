#!/usr/bin/env node
'use strict';

var path        = require('path');
var debug       = require('debug')('graphistry:central:server');
var mongo       = require('mongodb');
var MongoClient = mongo.MongoClient;
var assert      = require('assert');
var Rx          = require('rx');
var Q           = require('q');
var os          = require('os');
var fs          = require('fs');
var path        = require('path')
var _           = require('underscore');
var config      = require('config')();
var etl         = require('./etl/etl.js');

debug("Config set to %j", config);

var express     = require('express');
var compression    = require('compression');
var app         = express();
var http        = require('http').Server(app);
var bodyParser  = require('body-parser');
var request     = require('request');


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
app.options('/etl', function(req, res) {
    res.sendStatus(200);
});

var db;


var MAIN_STATIC_PATH    = path.resolve(__dirname, 'assets');
var GRAPH_STATIC_PATH   = path.resolve(require('graph-viz').staticFilePath(), 'assets');
var HORIZON_STATIC_PATH = path.resolve(require('horizon-viz').staticFilePath(), 'assets');
var UBER_STATIC_PATH   = path.resolve(require('uber-viz').staticFilePath(), 'assets');
var SPLUNK_STATIC_PATH   = path.resolve(require('splunk-viz').staticFilePath(), 'assets');

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
    var public_iface = _.map(os.networkInterfaces(), function(ifaces) {
        return _.filter(ifaces, function(iface) {
            return (!iface.internal) && (iface.family === 'IPv4');
        });
    });

    public_iface = _.flatten(public_iface, true);

    return (public_iface.length > 0) ? public_iface[0].address : 'localhost';
}


//string -> Observable {ips: ..., results: ...}
function getIPs(datasetname) {

    var infoCollection = db.collection('data_info');

    return Rx.Observable.fromNodeCallback(
            infoCollection.findOne.bind(infoCollection))({"name": datasetname})
        .flatMap(function (doc) {
            if (!doc) { throw new Error('no pings doc'); }

            // Query only for gpus that have been updated within 30 secs
            var d = new Date();
            d.setSeconds(d.getSeconds() - 30);

            var res = new Rx.Subject();

            var monitorCollection = db.collection('gpu_monitor')
                .find({'gpu_memory_free': {'$gt': doc.size},
                       'updated':         {'$gt': d}},
                      {'sort': [['gpu_memory_free', 'desc']]});

            return Rx.Observable.fromNodeCallback(monitorCollection.toArray.bind(monitorCollection))();
        })
        .flatMap(function (ips) {
            if (!ips.length) { throw new Error('All GPUs out of space!'); }

            // Query only for workers that have been updated within 30 secs
            var d = new Date();
            d.setSeconds(d.getSeconds() - 30);

            // Find all idle node processes
            var nodeCollection = db.collection('node_monitor').find({'active': false,
                                                    'updated': {'$gt': d}});

            return Rx.Observable.fromNodeCallback(nodeCollection.toArray.bind(nodeCollection))()
                .map(function (results) {
                    if (!results.length) {
                        var msg = 'There is space on a server, but all workers in the fleet are busy or dead (have not pinged home in over 30 seconds).';
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
    var cfg = {url: url, json: true, timeout: 500};
    debug('Trying worker', cfg);
    return Rx.Observable.fromNodeCallback(request.get.bind(request))(cfg)
        .pluck(1)
        .map(function (resp) {
            debug('Worker response', resp);
            return resp.success;
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


function assign_worker(req, res) {
    var datasetname = req.query.dataset;

    var ips;
    // need to route based on data size.
    // TODO: S3 -> mongo information. This will not work in production.
    if(config.ENVIRONMENT === 'production' || config.ENVIRONMENT === 'staging') {
        console.log("WARNING: fix this. Needs S3 -> Mongo integration for datablob sizes")

        ips = getIPs(datasetname)
            .flatMap(function (o) {
                return Rx.Observable.fromArray(listIps(o));
            });
    } else {
        debug('Using local hostname/port');
        ips = Rx.Observable.return({hostname: VIZ_SERVER_HOST, port: VIZ_SERVER_PORT});
    }

    var ip = ips
        .flatMap(function (workerNfo) {
            return handshakeIp(workerNfo)
                .filter(_.identity)
                .map(_.constant(workerNfo));
        })
        .take(1);

    var count = 0;
    ip.do(function (worker) {
            debug("Assigning client '%s' to viz server on %s, port %d with dataset %s",
                req.ip, worker.hostname, worker.port, datasetname);
            res.json(worker);
        })
        .subscribe(
            function () { count++; },
            function (err) {
                console.error('assign_worker error', err, (err || {}).stack);
                res.json({error: {v: 'assign_worker error'}});
            },
            function () {
                if (!count) {
                    console.error('assign_worker exhausted search');
                    res.json({error: 'none available'});
                }
            });

}

function logClientError(req, res) {
    var writeError = function (msg) {
        debug('Logging client error', msg);
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
app.post('/etl', bodyParser.json({type: '*', limit: '64mb'}), etl.post);

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
