import url from 'url';
import { simpleflake } from 'simpleflakes';
import stringify from 'json-stable-stringify';
import { tagUser } from './support';
import { Observable, Subject } from 'rxjs';
import { loadWorkerModule } from './loadWorkerModule';
import { logger as commonLogger } from '@graphistry/common';

import { HealthChecker } from './HealthChecker.js';
const healthcheck = HealthChecker();

export function requisitionWorker({
        config, logger,
        app /*: Express */,
        server /*: RxHTTPServer */,
        socketServer /*: SocketIO */
    }) {

    let isLocked = false;
    let latestClientId = null;

    const requests = server
        .requests
        .do(({request, response}) =>
            logger.trace({req: request, res: response}, 'viz-app server received a new request')
        )
        .share();

    const claimTimeout = config.WORKER_CONNECT_TIMEOUT;
    const canLockWorker = config.ENVIRONMENT !== 'local';
    // The names of these options imply that they mean the very same thing, and because danger is
    // our middle name, I don't know which one we actually use. So use both for good measure.
    const shouldExitOnDisconnect = (
        config.WORKER_RESTART ||
        !config.ALLOW_MULTIPLE_VIZ_CONNECTIONS
    );

    const acceptETL = Observable.bindNodeCallback(etlAccepted);
    const rejectETL = Observable.bindNodeCallback(etlRejected);
    const acceptIndex = Observable.bindNodeCallback(indexAccepted);
    const rejectIndex = Observable.bindNodeCallback(redirectIndex);
    const acceptClaim = Observable.bindNodeCallback(claimAccepted);
    const rejectClaim = Observable.bindNodeCallback(claimRejected);

    const requestIsETL = requestIsPathname('/etl');
    const requestIsClaim = requestIsPathname('/claim');
    const requestIsGraph = requestIsPathname('/graph.html');
    const requestIsHealthcheck = requestIsPathname('/vizapp/healthcheck');

    const healthcheckRequests = requests
        .filter(requestIsHealthcheck)
        .mergeMap(function ({ request, response }) {
            const health = healthcheck();
            logger.info({...health, request, response}, 'healthcheck');

            const buffer = new Buffer(stringify({...health.clear}), 'utf8');
            response.writeHead(health.clear.success ? 200 : 500, {
                'Content-Type': 'application/json',
                'Content-Length': buffer.length
            });
            response.end(buffer);
        });

    const eltRequests = requests
        .filter(requestIsETL)
        .mergeMap(requisition(acceptETL));

    const vizRequests = requests
        .filter(requestIsGraph)
        .mergeMap(requisition(acceptIndex));

    const requisitionRequests = requests
        .filter(requestIsClaim)
        .mergeMap(requisition(acceptClaim, rejectClaim))
        .let(requisitionByClaimOrTimeout);

    return Observable
        .merge(requisitionRequests, healthcheckRequests.ignoreElements())
        .switchMap(loadWorker)
        .scan(trackVizWorkerCaches, { caches: {} })
        .switchMap(({ worker }) => worker.multicast(
            () => new Subject(), (multicastedWorker) => Observable.merge(
                multicastedWorker.filter(({ type }) => type !== 'connection'),
                multicastedWorker.filter(({ type }) => type === 'connection')
                    .pluck('socket')
                    .scan(disconnectPreviousSocket, null)
                    .distinctUntilChanged()
                    .switchMap(mapSocketActivity)
        )))
        .catch((error) => {
            isLocked = false;
            latestClientId = simpleflake().toJSON();
            logger.debug( { err: error }, 'viz-server is no longer ative' );
            return Observable.of({ ...error, isActive: false });
        })
        .mergeMap((event) => {
            const { isActive } = (event || {});
            if (isActive !== undefined) {
                isLocked = isActive;
                if (isActive === false) {
                    logger.info('Exiting requisitionWorker because isActive is false.');
                    return Observable.concat(
                        Observable.of({ isActive }),
                        Observable.throw({
                            ...event, exitCode: 0,
                            shouldExit: shouldExitOnDisconnect
                        })
                    );
                }
            }
            return Observable.of(event);
        });

    function requestIsPathname(pathname) {
        return function checkRequestPathname({ request }) {
            return url.parse(request.url).pathname.endsWith(pathname);
        };
    }

    function requisitionByClaimOrTimeout(acceptedClaims) {
        const initialAppRequests = Observable.race(eltRequests, vizRequests);
        if (!canLockWorker) {
            return initialAppRequests.take(1).repeat();
        }
        return acceptedClaims.switchMap(
            (claimId) => initialAppRequests
                .filter(([indexId]) => claimId === indexId)
                .map((arr) => arr.slice(1))
                .timeout(claimTimeout * 1000)
                .catch((e) => {
                    logger.error({ err: e }, 'Timeout to claim worker.');
                    return Observable.throw({
                        error: e,
                        message: `Timeout to claim worker.`
                    });
                })
                .take(1)
        );
    }

    function requisition(accept, reject) {
        return function requisitionRequest({ request, response }) {
            if (reject && workerIsLocked(request)) {
                logger.info('GPU worker already claimed');
                return reject({ request, response }).ignoreElements();
            }
            // else if (requestIsIndex({ request })) {
            //     const { query = {} } = url.parse(request.url);
            //     latestClientId = query.clientId || latestClientId || simpleflake().toJSON();
            // } else {
            //     latestClientId = simpleflake().toJSON();
            // }

            const clientId = tagUser(request);
            // Save the client ID to the express app, so that other modules can access it easily.
            app.set('clientId', clientId);

            isLocked = true;
            return accept({ request, response }, clientId);
        };
    }

    function workerIsLocked(request) {
        if (canLockWorker && isLocked) {
            // if (requestIsIndex({ request })) {
            //     // const { query = {} } = url.parse(request.url);
            //     // if (query.clientId === latestClientId) {
            //     //     return false;
            //     // }
            //     return false;
            // }
            return true;
        }
        return false;
    }

    function etlAccepted({ request, response }, clientId, callback) {
        logger.info('ETL request accepted', { clientId });
        callback(null, [clientId, 'etl', request, response]);
    }

    function etlRejected({ request, response }, callback) {
        logger.info('ETL request rejected');
        return claimRejected({ response }, callback);
    }

    function claimAccepted({ response }, clientId, callback) {
        logger.info('Claim request accepted', { clientId });
        const buffer = new Buffer(stringify({ success: true, clientId }, 'utf8'));
        response.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': buffer.length
        });
        response.end(buffer, (err) => callback(err, clientId));
    }

    function claimRejected({ response }, callback) {
        logger.info('Claim request rejected');
        const buffer = new Buffer(stringify({
            success: false, error: 'GPU worker already claimed' }), 'utf8');
        response.writeHead(502, {
            'Content-Type': 'application/json',
            'Content-Length': buffer.length
        });
        response.end(buffer, callback);
    }

    function indexAccepted({ request, response }, clientId, callback) {
        logger.info('Index request accepted', { clientId });
        logger.debug({req: request, res: response}, 'Accepting graph.html request');
        const path = url.parse(request.url).pathname;
        const clientType = path.substring(path.indexOf('/') + 1, path.lastIndexOf('/'));
        callback(null, [clientId, clientType, request, response]);
    }

    function redirectIndex({ request, response }, callback) {
        logger.info('Index request rejected', { clientId });
        logger.warn({req: request, res: response}, 'Rejecting request for a "./graph.html" page');

        const buffer = new Buffer('Error: unable to load page because you are not assigned to this visualization server process. ' +
            'This can happen if the process is already handling an existing request, or because ' +
            "your connection's ID doesn't match match the authorized ID for this process.\n\n" +
            'This is most likely a transient problem. Please try reloading this page to try again.',
             'utf8');
        response.writeHead(502, {
            'Content-Type': 'application/json',
            'Content-Length': buffer.length
        });
        response.end(callback);
    }

    function loadWorker([activeClientId, clientType, request, response]) {
        logger.debug(
            {req: request, res: response, activeClientId, clientType},
            'Loading worker module'
        );
        return loadWorkerModule(clientType).map((workerModule) => [
            activeClientId, workerModule, request, response
        ]);
    }

    function trackVizWorkerCaches({ caches }, [activeClientId, workerModule, request, response]) {

        const sockets = socketConnectionAsObservable(activeClientId, request);

        const worker = workerModule(
            app,
            { ...server, requests: server.requests.startWith({ request, response }), },
            sockets,
            caches
        );

        return { caches, worker };
    }

    function socketConnectionAsObservable(activeClientId, request) {
        return Observable.create((subscriber) => {
            const handler = (socket) => {
                // if (activeClientId === latestClientId) {
                const { handshake: { query }} = socket;
                const { query: options = {} } = request;
                socket.handshake.query = { ...options, ...query };
                subscriber.next(socket);
                subscriber.complete();
                // } else {
                //     logger.warn('Late claimant, notifying client of error');
                //     socket.disconnect();
                //     subscriber.complete();
                // }
            };
            socketServer.on('connection', handler);
            return () => {
                socketServer.sockets.removeListener('connection', handler);
            };
        });
    }

    function disconnectPreviousSocket(previousSocket, socket) {
        if (canLockWorker) {
            if (previousSocket) {
                socket.disconnect();
                return previousSocket;
            }
        } else if (previousSocket) {
            logger.warn('Second user got routed to same worker, disconnecting previous socket.');
            previousSocket.disconnect();
        }
        return socket;
    }

    function mapSocketActivity(socket) {
        const errorEvents = Observable
            .fromEvent(socket, 'error')
            .do((error) => logger.error({ err: error, req: socket.request}, 'Socket error'))
            // TODO: should we do anything with client socket errors besides log them?
            .ignoreElements();

        const disconnectEvents = Observable
            .fromEvent(socket, 'disconnect')
            .do(() => logger.info({req: socket.request}, 'User disconnected from socket'))
            .mapTo({ isActive: false, message: 'A user successfully disconnected, exiting' });

        return errorEvents
            .merge(disconnectEvents)
            .startWith({ isActive: true });
    }
}
