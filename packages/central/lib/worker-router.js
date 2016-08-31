/// <reference path="../typings/node/node.d.ts"/>
/// <reference path="../typings/underscore/underscore.d.ts"/>
/// <reference path="../typings/rx/rx.d.ts"/>
'use strict';

var Rx          = require('rxjs');
var Observable  = Rx.Observable;

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

var os          = require('os');
var _           = require('underscore');
var request     = require('request');
var MongoClient = require('mongodb').MongoClient;

var config      = require('@graphistry/config')();

var Log         = require('@graphistry/common').logger;
var logger      = Log.createLogger('central', 'central/lib/worker-router.js');

var mongoClientConnect = Rx.Observable.bindNodeCallback(MongoClient.connect.bind(MongoClient));
var dbObs = ((config.ENVIRONMENT === 'local') ?
    (Rx.Observable.empty()) :
    (mongoClientConnect(config.MONGO_SERVER, {auto_reconnect: true})
        .map(function(database) { return  database.db(config.DATABASE); }))
).publishReplay(1);

dbObs.connect();

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


var VIZ_SERVER_HOST = get_likely_local_ip();
var nextLocalWorker = 0;

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

            return Rx.Observable
                .bindNodeCallback(workerServers.toArray.bind(workerServers))()
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

                    return Rx.Observable
                        .bindNodeCallback(nodeCollection.toArray.bind(nodeCollection))()
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

    return Rx.Observable
        .bindNodeCallback(request.get.bind(request))(cfg)
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

export function pickWorker(cb) {

    const ips = Observable.defer(() => {

        if (config.ENVIRONMENT !== 'local') {
            return getIPs().flatMap(({ servers, workers }) => {
                return Observable.from(combineWorkerInfo(servers, workers))
            });
        }

        var numWorkers = config.VIZ_LISTEN_PORTS.length;
        var port = config.VIZ_LISTEN_PORTS[nextLocalWorker];

        nextLocalWorker = (nextLocalWorker + 1) % numWorkers;

        logger.debug('Using local hostname/port', VIZ_SERVER_HOST, port);

        return Observable.of({ port, hostname: VIZ_SERVER_HOST });
    });

    // `concatMap` ensures we subscribe to each successive handshakeIp
    // Observable sequentially. Since we unsubscribe as soon as we receive the
    // first valid result, we don't execute any more handshakes than we need to.
    return ips.concatMap(
        (workerNfo) => handshakeIp(workerNfo),
        (workerNfo, success) => success ? workerNfo : false
    )
    // Skip events until workerNfo isn't false
    .skipWhile((workerNfo) => workerNfo === false)
    // Coerce any errors into a format we can digest
    .catch((err) => Observable.throw({
        type: 'unhandled',
        message: 'assign_worker error',
        error: err || new Error('Unexpected error while assigning workers.'),
    }))
    // take the first workerNfo to succeed
    .take(1)
    // throw an error if the source completes without yielding a workerNfo
    .single()
    // If `last` throws an error, coerce it into a format we can digest, otherwise re-throw.
    .catch((err) => {
        if (!err || err.type !== 'unhandled') {
            err = {
                type: 'exhausted', message: 'assign_worker exhausted search (too many users?)',
                error: new Error('Too many users, please contact help@graphistry.com for private access.')
            };
        }
        return Observable.throw(err);
    })
    .do({
        next(worker) {
            // If we get a worker, we know everything succeeded.
            logger.debug("Assigning worker on %s, port %d", worker.hostname, worker.port);
        },
        error({ type, error, message }) {
            // If we get a message, log it and send it back.
            if (type === 'exhausted') {
                logger.error(message);
            } else {
                logger.error(error, message);
            }
        }
    });
}

export function pickWorkerCB(cb) {
    return pickWorker().subscribe(
        (worker) => cb(null, worker),
        ({ type, error, message }) => cb(error)
    );
}
