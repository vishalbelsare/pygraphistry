import { getDataSourceFactory } from 'viz-shared/middleware';
import { FalcorPubSubDataSink } from '@graphistry/falcor-socket-datasource';

export function socketRoutes(services, socket) {
    const { handshake: { query = {} }} = socket;
    const getDataSource = getDataSourceFactory(services);
    const sink = new FalcorPubSubDataSink(
        {
            on: socket.on.bind(socket),
            off: socket.removeListener.bind(socket),
            emit: socket.emit.bind(socket),
        },
        () => getDataSource({ ...query })
    );

    return ([{
        event: 'falcor-operation',
        handler: sink.response
    }]);
}
