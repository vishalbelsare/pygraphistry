#!/usr/bin/env node
'use strict';

var path        = require('path');
var debug       = require('debug')('graphistry:central:server');
var mongo       = require('mongodb');
var MongoClient = mongo.MongoClient;
var assert      = require('assert');
var Rx          = require('rx');
var os          = require('os');
var _           = require('underscore');
var config      = require('config')();
var etl         = require('./etl/etl.js');

debug("Config set to %j", config);

var express = require('express'),
    app = express(),
    http = require('http').Server(app);


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


function assign_worker(req, res) {
    var datasetname = req.query.datasetname;
    // need to route based on data size.
    // TODO: S3 -> mongo information. This will not work in production.
    if(config.ENVIRONMENT === 'production' || config.ENVIRONMENT === 'staging') {
        console.log("WARNING: fix this. Needs S3 -> Mongo integration for datablob sizes")
        datasetname = "uber";
        db.collection('data_info').findOne({"name": datasetname}, function(err, doc) {
            if (err) {
                debug(err);
                res.send('Problem with query');
                res.end();
                return;
            }
            if (doc) {
                // Query only for gpus that have been updated within 30 secs
                var d = new Date();
                d.setSeconds(d.getSeconds() - 30);

                // Get all GPUs that have free memory that can fit the data
                db.collection('gpu_monitor')
                      .find({'gpu_memory_free': {'$gt': doc.size},
                             'updated': {'$gt': d}, },
                             {'sort': [['gpu_memory_free', 'desc']]})
                      .toArray(function(err, ips) {

                    if (err) {
                        debug(err);
                        res.send('Problem with query');
                        res.end();
                        return;
                    }

                    // Are there no servers with enough space?
                    if (ips.length == 0) {
                        debug("All GPUs out of space!");
                        res.send('No servers can fit the data :/');
                        res.end();
                        return;
                    }

                    // Query only for workers that have been updated within 30 secs
                    var d = new Date();
                    d.setSeconds(d.getSeconds() - 30);

                    // Find all idle node processes
                    db.collection('node_monitor').find({'active': false,
                                                        'updated': {'$gt': d}})
                                                     .toArray(function(err, results) {

                        if (err) {
                            debug(err);
                            res.send('Problem with query');
                            res.end();
                            return;
                        }

                        // Are all processes busy or dead?
                        if (results.length == 0) {
                            debug('There is space on a server, but all workers in the fleet are busy or dead (have not pinged home in over 30 seconds).');
                            res.send('There is space on a server, but all workers in the fleet are busy or dead (have not pinged home in over 30 seconds)');
                            res.end();
                            return;
                        }

                        // Try each IP in order of free space
                        for (var i in ips) {
                            var ip = ips[i]['ip'];

                            for (var j in results) {
                                if (results[j]['ip'] != ip) continue;

                                // We found a match
                                var port = results[j]['port'];

                                // Todo: ping process first for safety
                                debug("Assigning client '%s' to viz server on %s, port %d with dataset %s", req.ip, ip, port, datasetname);
                                res.json({'hostname': ip,
                                          'port': port,
                                          'timestamp': Date.now()
                                          });
                                res.end();
                                return;
                            }
                        }
                    });
                });
            } else {
                res.send('Couldn\'t find that dataset');
                res.end();
                return;
            }
        });
    } else {
        debug("Assigning client '%s' to viz server on %s, port %d", req.ip, VIZ_SERVER_HOST, VIZ_SERVER_PORT);
        res.json({'hostname': VIZ_SERVER_HOST,
                  'port': VIZ_SERVER_PORT
                 });
    }
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
app.post('/etl', etl.post);

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
