import io from 'socket.io-client';
import { handleVboUpdates } from './vbos';
import * as Scheduler from 'rxjs/scheduler/async';
import { Model } from '@graphistry/falcor-model-rxjs';
import { LocalDataSink, RemoteDataSource, whitelistClientAPIRoutes } from './falcor';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger(__filename);

const whiteListedQueryParams = [
    'bg', 'view', 'type', 'scene', 'device',
    'mapper', 'vendor', 'usertag', 'dataset',
    'workbook', 'controls', 'viztoken', 'workerid', 'clientId'
];

function congfigureLive(options) {

    const buildDate = (new Date(__BUILDDATE__)).toLocaleString();
    const buildNum = __BUILDNUMBER__ === undefined ? 'Local build' : `Build #${__BUILDNUMBER__}`;
    logger.trace(`[VizApp] ${buildNum} of ${__GITBRANCH__}@${__GITCOMMIT__} (on ${buildDate})`);
    logger.trace(`Connecting to ${window.graphistryPath || 'local'}`);

    if (window.graphistryClientId) {
        const splunkSearch = `search (host=staging* OR host=labs*) (level=60 OR level=50 OR level=40) source="/var/log/graphistry-json/*.log" metadata.userInfo.cid="${window.graphistryClientId}"`;
        const params = {
            q: splunkSearch,
            'display.page.search.mode':'verbose',
            'earliest': '',
            'latest': ''
        };
        const paramString = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
        logger.trace(`Access splunk logs for this session at https://splunk.graphistry.com:3000/en-US/app/search/search?${paramString}`);
    } else {
        logger.warn('window does not have property graphistryClientId');
    }

    const model = new Model({
        recycleJSON: true,
        scheduler: Scheduler.async,
        comparator: rootComparator,
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
    model.sink = new LocalDataSink(whitelistClientAPIRoutes(model));

    const socketIoEmit = socket.emit;
    socket.emit = function emitWithoutCompression() {
        return socketIoEmit.apply(this.compress(false), arguments);
    };

    return { ...options, model, socket, handleVboUpdates };
}

export { congfigureLive };
export default congfigureLive;

function rootComparator(node, message) {
    var cTime, cType = node && node.$type;
    var mTime, mType = message && message.$type;
    if (cType) {
        // If the cache has a type, but the message is a primitive,
        // the message might be the primitive response from the datasource.
        // If so, return true, so we don't update the back-reference versions.
        if (!mType) { return node.value === message; }
        // If their types are different, then isDistinct = true
        if (cType !== mType) { return false; }
        // If the message is older than the cache node, then isDistinct = false
        if ((mTime = message.$timestamp) < (cTime = node.$timestamp)) { return true; }
        // If the message has a timestamp but the cache doesn't, then isDistinct = true
        if (mTime !== undefined && cTime === undefined) { return false; }
        // If $expires is different, then isDistinct = true
        if (node.$expires !== message.$expires) { return false; }
        // If they're both refs, compare their paths
        if (cType === 'ref' && mType === cType) {
            var nRef = node.value;
            var nLen = nRef.length;
            var mRef = message.value;
            // If their lengths are different, then isDistinct = true
            if (nLen !== mRef.length) { return false; }
            while (~--nLen) {
                // If their paths are different, then isDistinct = true
                if (nRef[nLen] !== mRef[nLen]) { return false; }
            }
            // The refs are equal, so isDistinct = false
            return true;
        }
        // If everything else matches, compare their values
        return node.value === message.value;
    }
    // If cache doesn't have a type but the message does, they must be different.
    // If neither have a type, they must be primitives, so compare the raw values.
    return mType ? false : node === message;
}
