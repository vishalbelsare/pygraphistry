import { Observable } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';
import { fromPathsOrPathValues } from '@graphistry/falcor-path-syntax';
const logger = commonLogger.createLogger('viz-worker/services/sendFalcorUpdate.js');

export function sendFalcorUpdate(socket, getDataSource) {
    const send = Observable.bindCallback(socket.emit.bind(socket));
    return function sendFalcorUpdate({
        paths: _paths = [],
        invalidated: _invalidated = []
    }) {
        const dataSource = getDataSource({ ...socket.handshake });
        _paths = fromPathsOrPathValues(_paths);
        _invalidated = fromPathsOrPathValues(_invalidated);
        return dataSource.get(_paths).do(({ paths, jsonGraph, invalidated = [] }) => {
            logger.trace(`sending initial post-socket update`, jsonGraph);
            send('falcor-update', {
                paths, jsonGraph, invalidated:
                    _invalidated.concat(invalidated)
            });
        }).mapTo(0);
    }
}
