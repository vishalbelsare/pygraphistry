import SocketIO from 'socket.io-client';
import { Model, RemoteDataSource } from '../falcor';
import { handleVboUpdates } from '../streamGL/client';
import { falcorUpdateHandler } from '../startup/falcorUpdateHandler';
import { Observable, Scheduler } from 'rxjs';

export function initialize(options, debug) {

    const appModel = getAppModel(options);
    return appModel
        .get(`workbooks.open.id`)
        .mergeMap(
            ({ json }) => initSocket(options, json.workbooks.open.id),
            ({ json }, socket) => ({ model: appModel, socket })
        )
        .mergeMap(({ model, socket }) =>
            falcorUpdateHandler(model, Observable.fromEvent(
                socket, 'updateFalcorCache'
            ))
            .ignoreElements()
            .startWith({ ...options, model, socket, handleVboUpdates })
        );
}

function initSocket(options, workbook) {

    const socket = SocketIO.Manager({
        path: `/socket.io`, reconnection: false,
        query: { ...options, workbook, falcorClient: true }
    }).socket('/');

    socket.io.engine.binaryType = 'arraybuffer';

    const socketConnected = Observable.fromEvent(socket, 'connect');
    const socketErrorConnecting = Observable.merge(
        Observable.fromEvent(socket, 'error'),
        Observable.fromEvent(socket, 'connect_error'),
    )
    .mergeMap((e) => Observable.throw(e));

    return socketConnected
        .take(1).mapTo(socket)
        .merge(socketErrorConnecting);
}

function getAppModel(options) {
    return new Model({
        cache: getAppCache(),
        scheduler: Scheduler.asap,
        allowFromWhenceYouCame: true,
        source: new RemoteDataSource('/graph/model.json', {
            crossDomain: false, withCredentials: false
        }, options)
    });
}

function getAppCache() {
    return window.__INITIAL_CACHE__ || {};
}
