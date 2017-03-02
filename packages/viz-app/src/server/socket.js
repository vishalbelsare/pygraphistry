import { Observable } from 'rxjs';
import { FalcorPubSubDataSink } from '@graphistry/falcor-socket-datasource';
import { logger as commonLogger } from '@graphistry/common';
import { createLogger } from '@graphistry/common/logger';

const logger = createLogger('viz-app:server:socket-io');

function configureSocket(io, config, getDataSource) {
    return function handleSocketConnection(req, res) {
        return socketConnectionAsObservable(io, req)
            .let(timeoutSocketConnectionIfNotRunningLocally(config))
            .mergeMap(addSocketEventListeners(req, getDataSource))
            .map(enrichLogsAndEmitSocketWithMetadata)
    }
}

export { configureSocket };
export default configureSocket;

function socketConnectionAsObservable(io, request) {
    return Observable.create((subscriber) => {
        io.on('connection', connectionHandler);
        return () => io.sockets.removeListener('connection', connectionHandler);
        function connectionHandler(socket) {
            const { handshake: { query }} = socket;
            const { query: options = {} } = request;
            socket.handshake.query = { ...options, ...query };
            subscriber.next(socket);
            subscriber.complete();
        }
    });
}

function timeoutSocketConnectionIfNotRunningLocally(config) {
    return function timeoutIfNotRunningLocally(source) {
        if (config.ENVIRONMENT === 'local') {
            return source;
        }
        return source
            .timeout(config.SOCKET_CLAIM_TIMEOUT * 1000)
            .do(() => logger.info('Socket connected before timeout'))
            .catch((err) => {
                logger.error({ err }, 'Worker socket connection timeout.');
                return Observable.throw({
                    err, message: `Worker socket connection timeout.`
                });
            })
            .take(1);
    }
}

function addSocketEventListeners(req, getDataSource) {
    return function addEventListeners(socket) {

        const sink = new FalcorPubSubDataSink(socket, () => getDataSource(req));

        const falcorEvents = Observable.fromEvent(socket, sink.event)
            // .do(() => console.log('received client falcor socket event'))
            .do(sink.response);

        const errorEvents = Observable.fromEvent(socket, 'error').mergeMap((err) => {
            logger.error({ err: err, req: socket.request }, 'Socket error');
            return Observable.throw({
                err, req, message: 'Socket error'
            });
        });

        const disconnectEvents = Observable.fromEvent(socket, 'disconnect').mergeMap(() => {
            logger.info({ req }, 'User disconnected from socket');
            return Observable.throw({
                message: "A user successfully disconnected, exiting"
            });
        });

        return Observable
            .merge(falcorEvents, errorEvents, disconnectEvents)
            .ignoreElements().startWith(socket);
    }
}

function enrichLogsAndEmitSocketWithMetadata(socket) {

    const { request: { connection: { remoteAddress }},
            handshake: { query: { dataset, debugId, usertag }}} = socket;

    const metadata = { dataset, debugId };
    commonLogger.addMetadataField(metadata);

    logger.info({ req: { ...socket.handshake, ...socket.request }, remoteAddress }, 'Connection Info');

    return { socket, metadata };
}
