import { Observable } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';
import { fromPathsOrPathValues } from '@graphistry/falcor-path-syntax';
const logger = commonLogger.createLogger('viz-worker/services/sendFalcorUpdate.js');

export function sendFalcorUpdate(socket, getDataSource) {
    const send = Observable.bindCallback(socket.emit.bind(socket));
    return function sendFalcorUpdate(...paths) {
        const dataSource = getDataSource({ ...socket.handshake });
        paths = fromPathsOrPathValues(paths);
        return dataSource.get(paths).do(({ jsonGraph }) => {
            logger.trace(`sending initial post-socket update`, jsonGraph);
            send('falcor-update', {
                paths, jsonGraph
            });
        }).mapTo(0);
    }
}
