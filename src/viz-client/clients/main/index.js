import SocketIO from 'socket.io-client';
import { Observable, Scheduler } from 'rxjs';
import { handleVboUpdates } from 'viz-client/streamGL/client';
import { Model, LocalDataSink, RemoteDataSource } from 'viz-client/falcor';

export function initialize(options, debug) {
    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    console.info(`${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`)

    console.info(`Connecting to ${window.graphistryPath || 'local'}`);

    let workbook = options.workbook;

    if (workbook == null) {
        const { workbooks } = getAppCache();
        if (workbooks && workbooks.open) {
            const { value } = workbooks.open;
            workbook = value && value[value.length - 1] || null;
        }
    }

    return initSocket(options, workbook).map((socket) => ({
        ...options,
        socket,
        handleVboUpdates,
        model: getAppModel(options, socket)
    }));
}

function initSocket(options, workbook) {

    const whiteListedQueryParams = [
        'bg', 'view', 'type', 'scene',
        'device', 'mapper', 'vendor', 'usertag',
        'dataset', 'workbook', 'controls', 'viztoken',
        'workerid', 'sessionid'
    ];

    const socketQuery = whiteListedQueryParams.reduce((params, key) => {
        if (options.hasOwnProperty(key)) {
            params[key] = options[key];
        }
        return params;
    }, {});

    const socket = SocketIO.Manager({
        path: `${window.graphistryPath || ''}/socket.io`, reconnection: false,
        query: { ...socketQuery, workbook, falcorClient: true }
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

function getAppModel(options, socket) {
    const model = new Model({
        recycleJSON: true,
        // materialized: true,
        cache: getAppCache(),
        treatErrorsAsValues: true,
        scheduler: Scheduler.async,
        allowFromWhenceYouCame: true
    });
    model._source = new RemoteDataSource(socket, model);
    model.sink = new LocalDataSink(model.asDataSource());
    return model;
}

function getAppCache() {
    return window.__INITIAL_CACHE__ || {};
}
