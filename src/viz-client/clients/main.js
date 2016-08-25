import SocketIO from 'socket.io-client';
import { Model, RemoteDataSource } from '../falcor';
import { handleVboUpdates } from '../streamGL/client';
import { falcorUpdateHandler } from '../startup/falcorUpdateHandler';
import { Observable, Scheduler } from 'rxjs';

export function initialize(options, debug) {

    const socket = SocketIO.Manager({
        path: `/socket.io`, reconnection: false,
        query: { ...options, falcorClient: true }
    }).socket('/');

    socket.io.engine.binaryType = 'arraybuffer';

    const socketConnected = Observable.fromEvent(socket, 'connect');
    const socketErrorConnecting = Observable.merge(
        Observable.fromEvent(socket, 'error'),
        Observable.fromEvent(socket, 'connect_error'),
    )
    .mergeMap((e) => Observable.throw(e));

    return socketConnected
        .merge(socketErrorConnecting)
        .take(1)
        .mergeMap(() => {
            const model = getAppModel(options);
            const updateFalcorEvents = Observable.fromEvent(
                socket, 'updateFalcorCache', ({ data }) => data
            );
            return falcorUpdateHandler(model, updateFalcorEvents)
                .ignoreElements()
                .startWith({ ...options, model, socket, handleVboUpdates })
        });
}

function getAppModel(options) {
    return new Model({
        cache: getAppCache(),
        scheduler: Scheduler.asap,
        source: new RemoteDataSource('/graph/model.json', {
            crossDomain: false, withCredentials: false
        }, options),
        onChangesCompleted: !__DEV__ ? null : function () {
            window.__INITIAL_STATE__ = this.getCache();
        }
    });
}

function getAppCache() {
    return window.__INITIAL_STATE__ || {};
}
