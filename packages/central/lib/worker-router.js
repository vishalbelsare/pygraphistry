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
var _           = require('lodash');
var MongoClient = require('mongodb').MongoClient;

var config      = require('@graphistry/config')();

var Log         = require('@graphistry/common').logger;
var logger      = Log.createLogger('central', 'central/lib/worker-router.js');

var mongoClientConnect = Rx.Observable.bindNodeCallback(MongoClient.connect.bind(MongoClient));
var dbObs = ((config.ENVIRONMENT === 'local') ?
    (Rx.Observable.empty()) :
    (mongoClientConnect(config.MONGO_SERVER, {auto_reconnect: true})
        .map(function(database) { return database.db(config.DATABASE); }))
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


function getWorkers() {
    // The absolute Date that defines the time threshild between fresh/stale pings
    var freshDate = new Date(Date.now() - (config.GPU_PING_TIMEOUT * 1000));

    return dbObs.flatMap(function(db) {
        // Find all idle node processes
        var nodeCollection = db.collection('node_monitor').find({
            'active': false,
            'updated': {'$gt': freshDate}
        });

        return Rx.Observable
            .bindNodeCallback(nodeCollection.toArray.bind(nodeCollection))()
            .map(function (results) {
                if (!results.length) {
                    logger.warn({workerQuery: results}, 'Found 0 records for inactive workers in the database');
                    var msg = "Server at maximum capacity, and your request can't be serviced at this time. Please contact help@graphistry.com for private access. (Reason: query for registered, inactive workers returned no results.)";
                    throw new Error(msg);
                } else {
                    logger.info({ workerQuery: results}, 'Found available workers');
                    return results;
                }
            });
    });
}


// Tracks when we last assigned a client to a worker
export const workerLastAssigned = {};

function checkIfWorkerAssigned(workerNfo) {
    const workerAssignmentTimeout = config.WORKER_CONNECT_TIMEOUT;
    const workerId = workerNfo.hostname + ':' + workerNfo.port;

    if(!workerLastAssigned[workerId]) {
        markWorkerAsAssigned(workerNfo);
        return Rx.Observable.return(false);
    } else {
        const assignedElapsed = (new Date()) - workerLastAssigned[workerId];
        if(assignedElapsed > workerAssignmentTimeout) {
            markWorkerAsAssigned(workerNfo);
            return Rx.Observable.return(false);
        } else {
            return Rx.Observable.return(true);
        }
    }
}


function markWorkerAsAssigned(workerNfo) {
    const workerId = workerNfo.hostname + ':' + workerNfo.port;
    workerLastAssigned[workerId] = new Date();
}



/**
 * Finds an available viz worker process, reserves it temporarily (prevent re-assignignment for a
 * short period of time), and calls the callback with the address of the assigned worker, or an
 * error if this process was unsuccessful.
 */

export function pickWorker() {
    const ips = Observable.defer(() => {
        if(config.PINGER_ENABLED) {
            return getWorkers()
                .do((workers) => logger.debug({workers: workers, workerLastAssigned: workerLastAssigned}, 'Queried database for available workers to pick for routing request'))
                .flatMap((workers) => Observable.from(workers))
                .map((worker) => {
                    return { hostname: worker.ip, port: worker.port, timestamp: worker.updated };
                });
        } else {
            var numWorkers = config.VIZ_LISTEN_PORTS.length;
            var port = config.VIZ_LISTEN_PORTS[nextLocalWorker];

            nextLocalWorker = (nextLocalWorker + 1) % numWorkers;

            logger.debug('Using local hostname/port', VIZ_SERVER_HOST, port);

            return Observable.of({ port, hostname: VIZ_SERVER_HOST });
        }
    });

    // `concatMap` ensures we subscribe to each successive handshakeIp
    // Observable sequentially. Since we unsubscribe as soon as we receive the
    // first valid result, we don't execute any more handshakes than we need to.
    return ips.concatMap(
                (workerNfo) => checkIfWorkerAssigned(workerNfo),
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
                logger.debug('Assigning worker on %s, port %d', worker.hostname, worker.port);
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
