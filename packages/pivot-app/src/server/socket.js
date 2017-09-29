import createLogger from 'pivot-shared/logger';
import { FalcorPubSubDataSink } from '@graphistry/falcor-socket-datasource';

const log = createLogger(__filename);

export function configureSocketListeners(io, getDataSource) {
    io.removeAllListeners('connection');
    io.on('connection', (socket) => {
        const { handshake: { query = {} }} = socket;
        const sink = new FalcorPubSubDataSink(socket, () => getDataSource({
            user: { userId: query.userId }
        }));

        socket.on(sink.event, sink.response);
        socket.on('disconnect', onDisconnect);

        function onDisconnect() {
            socket.removeListener(sink.event, sink.response);
            socket.removeListener('disconnect', onDisconnect);
            log.info(`User ${query.userId} successfully disconnected.`);
        }
    });
}

export default configureSocketListeners;