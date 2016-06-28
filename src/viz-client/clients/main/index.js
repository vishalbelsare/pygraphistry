import { Model } from 'reaxtor';
import SocketIO from 'socket.io-client';
import { RemoteDataSource } from './RemoteDataSource';
import { Observable, Scheduler } from '@graphistry/rxjs';

export function initialize(options, debug) {

    const socket = SocketIO(`/socket.io`, {
        reconnection: false, query: {
            ...options, falcorClient: true
        }
    });

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
        .map((socket) => ({
            ...options, socket,
            model: getAppModel(options)
        }));
}

function getAppModel(options) {
    return new Model({
        cache: getAppCache(),
        scheduler: Scheduler.asap,
        source: new RemoteDataSource('/graph/model.json', {
            crossDomain: false, withCredentials: false
        }, options),
        // onChangesCompleted: function () {
        //     if (useLocalStorage && localStorage && localStorage.setItem) {
        //         localStorage.setItem('graphistry-app-cache', JSON.stringify(this.getCache()));
        //     }
        // }
    });
}

function getAppCache() {

    let { appCache } = window;

    if (!appCache && useLocalStorage && localStorage && localStorage.getItem) {
        const localStorageCache = localStorage.getItem('graphistry-app-cache');
        if (localStorageCache) {
            try {
                appCache = JSON.parse(localStorageCache);
            } catch (e) {
                appCache = {};
            }
        } else {
            appCache = {};
        }
    } else {
        appCache = {};
    }

    console.log(appCache);

    return appCache;
}
