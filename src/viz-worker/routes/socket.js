import { getDataSourceFactory } from 'viz-shared/middleware';
import { FalcorPubSubDataSink } from '@graphistry/falcor-socket-datasource';

export function socketRoutes(services, socket) {
    const { handshake: { query = {} }} = socket;
    const getDataSource = getDataSourceFactory(services);
    const sink = new FalcorPubSubDataSink(socket, () => getDataSource({
        ...query
    }, true));

    return [{
        event: 'falcor-operation',
        handler: sink.response
    }];
}
