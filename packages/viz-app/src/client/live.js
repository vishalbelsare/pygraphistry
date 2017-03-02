import io from 'socket.io-client';
// import { handleVboUpdates } from './vbos';
import { handleVboUpdates } from './streamgl-vbos';
import Socket from 'socket.io-client/lib/socket';
import * as Scheduler from 'rxjs/scheduler/async';
import { Model } from '@graphistry/falcor-model-rxjs';
import { LocalDataSink, RemoteDataSource } from './falcor';

const whiteListedQueryParams = [
    'bg', 'view', 'type', 'scene', 'device',
    'mapper', 'vendor', 'usertag', 'dataset',
    'workbook', 'controls', 'viztoken', 'workerid', 'clientId'
];

function congfigureLive(options) {

    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    console.info(`[VizApp] ${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`);
    console.info(`Connecting to ${window.graphistryPath || 'local'}`);

    if (window.graphistryClientId) {
        const splunkSearch = `search (host=staging* OR host=labs*) (level=60 OR level=50 OR level=40) source="/var/log/graphistry-json/*.log" metadata.userInfo.cid="${window.graphistryClientId}"`;
        const params = {
            q: splunkSearch,
            'display.page.search.mode':'verbose',
            'earliest': '',
            'latest': ''
        };
        const paramString = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
        console.info(`Access splunk logs for this session at https://splunk.graphistry.com:3000/en-US/app/search/search?${paramString}`);
    } else {
        console.info('window does not have property graphistryClientId');
    }

    const model = new Model({
        recycleJSON: true,
        scheduler: Scheduler.async,
        allowFromWhenceYouCame: true,
        cache: window.__INITIAL_CACHE__ // eslint-disable-line no-underscore-dangle
    });

    const socket = io.Manager({
        reconnection: false,
        perMessageDeflate: false,
        path: `${window.graphistryPath || ''}/socket.io`,
        query: whiteListedQueryParams.reduce((params, key) => {
            if (options.hasOwnProperty(key)) {
                params[key] = options[key];
            }
            return params;
        }, {})
    }).socket('/');

    socket.binaryType = 'arraybuffer';
    socket.io.engine.binaryType = 'arraybuffer';
    model._source = new RemoteDataSource(socket, model);
    model.sink = new LocalDataSink(model.asDataSource());

    const socketIoEmit = socket.emit;
    socket.emit = function emitWithoutCompression() {
        return socketIoEmit.apply(this.compress(false), arguments);
    };

    return { ...options, model, socket, handleVboUpdates };
}

export { congfigureLive };
export default congfigureLive;
