import url from 'url';
import { simpleflake } from 'simpleflakes';
import stringify from 'json-stable-stringify';
import { tagUser } from './support';
import { Observable, Subject } from 'rxjs';
import { loadWorkerModule } from './loadWorkerModule';

export function requisitionWorker({
        config, logger,
        app /*: Express */,
        server /*: RxHTTPServer */,
        socketServer /*: SocketIO */
    }) {

    let isLocked = false;
    let latestClientId = simpleflake().toJSON();

    const { requests } = server;
    const centralPort = config.HTTP_LISTEN_PORT;
    const centralAddr = config.HTTP_LISTEN_ADDRESS;
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
    const requestIsIndex = requestIsPathname('/index.html');

    const eltRequests = requests
        .filter(requestIsETL)
        .mergeMap(requisition(acceptETL, rejectETL));

    const claimRequests = requests
        .filter(requestIsClaim)
        .mergeMap(requisition(acceptClaim, rejectClaim));

    const indexRequests = requests
        .filter(requestIsIndex)
        .mergeMap(requisition(acceptIndex, rejectIndex));

    const claimThenIndexRequests = claimRequests
        .mergeMap(
            (claimId) => indexRequests,
            (claimId, [indexId, indexType, request, response]) => [
                claimId, indexId, indexType, request, response
            ]
        )
        .filter(([claimId, indexId]) => claimId === indexId)
        .map((arr) => arr.slice(1));

    return Observable
        .merge(
            eltRequests,
            indexRequests,
            claimThenIndexRequests
        )
        .switchMap(loadWorker)
        .scan(trackVizWorkerCaches, { caches: {} })
        .switchMap(({ worker }) => worker.multicast(
            () => new Subject(), (worker) => Observable.merge(
                worker.filter(({ type }) => type !== 'connection'),
                worker.filter(({ type }) => type === 'connection')
                    .pluck('socket')
                    .scan(disconnectPreviousSocket, null)
                    .distinctUntilChanged()
                    .do(logSocketHandshake)
                    .switchMap(mapSocketActivity)
        )))
        .mergeMap((event) => {
            const { isActive, ...restEventProps } = (event || {});
            if (isActive !== undefined) {
                isLocked = isActive;
                if (isActive === false) {
                    if (shouldExitOnDisconnect) {
                        return Observable.concat(
                            Observable.of({ isActive }),
                            Observable.throw({
                                exitCode: 0,
                                shouldExit: true,
                                ...restEventProps
                            })
                        );
                    } else {
                        // latestClientId = simpleflake().toJSON();
                        logger.info('Running locally, so not actually killing; setting setServing to false.');
                    }
                }
            }
            return Observable.of(event);
        });


    function requestIsPathname(pathname) {
        return function requestIsPathname({ request }) {
            return url.parse(request.url).pathname.endsWith(pathname);
        }
    }

    function requisition(accept, reject) {
        return function requisition({ request, response }) {
            if (workerIsLocked(request)) {
                logger.info('GPU worker already claimed');
                return reject({ request, response }).ignoreElements();
            } else if (requestIsIndex({ request })) {
                const { query = {} } = url.parse(request.url);
                latestClientId = query.clientId || latestClientId || simpleflake().toJSON();
            } else {
                latestClientId = simpleflake().toJSON();
            }
            isLocked = true;
            return accept({ request, response }, latestClientId);
        }
    }

    function workerIsLocked(request) {
        if (canLockWorker && isLocked) {
            if (requestIsIndex({ request })) {
                const { query = {} } = url.parse(request.url);
                if (query.clientId === latestClientId) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    function etlAccepted({ request, response }, clientId, callback) {
        callback(null, [clientId, 'etl', request, response]);
    }

    function etlRejected({ request, response }, callback) {
        return claimRejected({ response }, callback);
    }

    function claimAccepted({ response }, clientId, callback) {
        const buffer = new Buffer(stringify({ success: true, clientId }, 'utf8'));
        response.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': buffer.length
        });
        response.end(buffer, (err) => callback(err, clientId));
    }

    function claimRejected({ response }, callback) {
        const buffer = new Buffer(stringify({
            success: false, error: 'GPU worker already claimed' }), 'utf8');
        response.writeHead(502, {
            'Content-Type': 'application/json',
            'Content-Length': buffer.length
        });
        response.end(buffer, callback);
    }

    function indexAccepted({ request, response }, clientId, callback) {
        const path = url.parse(request.url).pathname;
        const clientType = path.substring(path.indexOf('/') + 1, path.lastIndexOf('/'));
        callback(null, [clientId, clientType, request, response]);
    }

    function redirectIndex({ request, response }, callback) {
        response.writeHead(302, {
            'Location': `http://${centralAddr}:${centralPort}${request.url}`
        });
        response.end(callback);
    }

    function loadWorker([activeClientId, clientType, request, response]) {
        return loadWorkerModule(clientType).map((workerModule) => [
            activeClientId, workerModule, request, response
        ]);
    }

    function trackVizWorkerCaches({ caches }, [activeClientId, workerModule, request, response]) {

        const sockets = awaitSocketConnection(activeClientId, request);

        const worker = workerModule(app, {
            ...server, requests: server.requests.startWith({ request, response })
        }, sockets, caches);

        return { caches, worker };
    }

    function awaitSocketConnection(activeClientId, request) {
        if (claimTimeout === -1) {
            return socketConnectionAsObservable(activeClientId, request);
        }
        return socketConnectionAsObservable(activeClientId, request)
            .timeout(claimTimeout * 1000)
            .catch(() => {
                isLocked = false;
                latestClientId = simpleflake().toJSON();
                logger.warn('Timeout to claim worker, setting self as unclaimed.');
                return Observable.empty();
            });
    }

    function socketConnectionAsObservable(activeClientId, request) {
        return Observable.create((subscriber) => {
            const handler = (socket) => {
                if (activeClientId === latestClientId) {
                    const { handshake: { query }} = socket;
                    const { query: options = {} } = request;
                    socket.handshake.query = { ...options, ...query };
                    subscriber.next(socket);
                    subscriber.complete();
                } else {
                    logger.warn('Late claimant, notifying client of error');
                    socket.disconnect();
                    subscriber.complete();
                }
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

    function logSocketHandshake(socket) {
        const query = socket.handshake.query;
        tagUser(query);
        // Store information about user. Retrievable by looking up the cid set by tagUser
        var cxinfo = { key: 'CONNECTIONINFO', ip: socket.request.connection.remoteAddress };
        if (query.viztoken) {
            cxinfo.viztoken = decodeURIComponent(query.viztoken);
        }
        if (query.usertag && query.usertag !== 'undefined') {
            cxinfo.tag = decodeURIComponent(query.usertag);
        }
        logger.info(cxinfo);
        logger.trace('waiting for user to pick app type');
    }

    function mapSocketActivity(socket) {

        const errorEvents = Observable
            .fromEvent(socket, 'error')
            .do((error) => logger.error(error, 'socket error'))
            // TODO: should we do anything with client socket errors besides log them?
            .ignoreElements();

        const disconnectEvents = Observable
            .fromEvent(socket, 'disconnect')
            .do(() => logger.info('a user successfully disconnected, exiting'))
            .mapTo({ isActive: false });

        return errorEvents
            .merge(disconnectEvents)
            .startWith({ isActive: true });
    }
}
