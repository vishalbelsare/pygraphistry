import { Observable } from 'rxjs';
import { fromPathsOrPathValues } from '@graphistry/falcor-path-syntax';

export function sendFalcorUpdate(socket, getDataSource) {
    const send = Observable.bindCallback(socket.emit.bind(socket));
    return function sendFalcorUpdate(...paths) {
        const dataSource = getDataSource({ ...socket.handshake });
        paths = fromPathsOrPathValues(paths);
        return dataSource.get(paths).mergeMap(({ jsonGraph }) => send('falcor-update', {
            paths, jsonGraph
        }));
    }
}
