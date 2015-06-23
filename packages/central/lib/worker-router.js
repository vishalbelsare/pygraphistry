/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/underscore/underscore.d.ts"/>
/// <reference path="../typings/rx/rx.d.ts"/>
'use strict';

var os          = require('os');
var _           = require('underscore');
var Rx          = require('rx');
var debug       = require('debug')('graphistry:central:worker-router');
var request     = require('request');
var MongoClient = require('mongodb').MongoClient;

var config      = require('config')();

var Log         = require('common/logger.js');
var logger      = Log.createLogger('central:worker-router');

var mongoClientConnect = Rx.Observable.fromNodeCallback(MongoClient.connect, MongoClient);
var dbObs = (config.ENVIRONMENT === 'local') ?
    (Rx.Observable.return()) :
    (mongoClientConnect(config.MONGO_SERVER, {auto_reconnect: true})
        .map(function(database) { return  database.db(config.DATABASE); })
        .shareReplay(1));


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


// FIXME: Get real viz server IP:port from DB
var VIZ_SERVER_HOST = get_likely_local_ip();
var VIZ_SERVER_PORT = config.VIZ_LISTEN_PORT;


/**
 * Gets all the currently registered viz worker servers, and all currently registered viz worker
 * processes.
 *
 * @returns {Rx.Observable<servers, workers>} An Observable with a single item, an object with a
 * `servers` property containing the list of all viz servers, and a `workers` property, containing
 * the list of all worker process.
 */
function getIPs() {
    // The absolute Date that defines the time threshild between fresh/stale pings
    var freshDate = new Date(Date.now() - (config.GPU_PING_TIMEOUT * 1000));

    return dbObs.flatMap(function(db) {
            // Find all the server running workers, sort by available GPU memory
            var workerServers = db.collection('gpu_monitor').find(
                    {'updated': {'$gt': freshDate}},
                    {'sort': [['gpu_memory_free', 'desc']]}
                );

            return Rx.Observable.fromNodeCallback(workerServers.toArray, workerServers)()
                .flatMap(function (ips) {
                    if (ips.length < 1) {
                        logger.info('No worker currently registered to this cluster.');
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
                                logger.info('All workers are currently busy');
                                var msg = "All workers are currently busy, and your request can't be serviced at this time. Please contact help@graphistry.com for private access. (Reason: could not find an available worker in the worker ping database.)";
                                throw new Error(msg);
                            }
                            return {servers: ips, workers: results};
                        });
                });
        });
}


/**
 * Queries a worker's to see if it is available. If it's available, the query has the side effect of
 * reserving the worker for a short period of time, making it unavailable for assignment during this
 * period.
 *
 * @param {Object.<hostname, port>} workerNfo - The worker to query.
 *
 * @returns {Rx.Observable<bool>} an Observable with a single item: a bool indicating if this worker
 * is available (and, consequently, has been reserved for the current user.)
 */
function handshakeIp (workerNfo) {
    var url = 'http://' + workerNfo.hostname + ':' + workerNfo.port + '/claim';
    var cfg = {url: url, json: true, timeout: 250};
    logger.info('Trying worker', cfg, workerNfo);
    return Rx.Observable.fromNodeCallback(request.get.bind(request))(cfg)
        .pluck(1)
        .map(function (resp) {
            logger.debug('Worker response', resp);
            return !!resp.success;
        })
        .catch(function catchHandshakeHTTPErrors(err) {
            logger.warn(err, 'Handshake error: encountered a HTTP error attempting to handshake "%s". Catching error and reporting unsuccessful handshake to caller.',
                url);
            return Rx.Observable.return(false);
        });
}


/**
 * Given a list of servers and workers, combines them to return a list of worker info (hostname,
 * port, ping timestamp), sorted in order of free space.
 */
function combineWorkerInfo (servers, workers) {
    var workerInfo = [];

    // Try each IP in order of free space
    for (var i in servers) {
        var ip = servers[i]['ip'];

        for (var j in workers) {
            if (workers[j]['ip'] != ip) {
                continue;
            }

            workerInfo.push(
                {'hostname': ip,
                 'port': workers[j]['port'],
                 'timestamp': Date.now()
                });
        }
    }

    return workerInfo; //{i: 0, workers: workers, worker: null};
}


/**
 * Finds an available viz worker process, reserves it temporarily (prevent re-assignignment for a
 * short period of time), and calls the callback with the address of the assigned worker, or an
 * error if this process was unsuccessful.
 */
function pickWorker (cb) {
    var ips;

    if(config.ENVIRONMENT !== 'local') {
        ips = getIPs()
            .flatMap(function (o) {
                return Rx.Observable.fromArray(combineWorkerInfo(o.servers, o.workers));
            });
    } else {
        logger.debug('Using local hostname/port', VIZ_SERVER_HOST, VIZ_SERVER_PORT);
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
            if(!workerNfo) {
                ipsControlled.request(1);
                return false;
            } else {
                return workerNfo;
            }
        })
        .take(1);

    var count = 0;
    ip.do(function (worker) {
            logger.debug("Assigning worker on %s, port %d", worker.hostname, worker.port);
            cb(null, worker);
        })
        .subscribe(
            function () { count++; },
            function (err) {
                logger.exception(err, 'assign_worker error');
                cb(err || new Error('Unexpected error while assigning workers.'));
            },
            function () {
                if (!count) {
                    logger.error('assign_worker exhausted search (too many users?)');
                    cb(new Error('Too many users, please contact help@graphistry.com for private access.'));
                }
            });
}


module.exports = {
    pickWorker: pickWorker
};
