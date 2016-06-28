'use strict';

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

const urlModule    = require('url');
const debug        = require('debug')('graphistry:StreamGL:client');
const $            = window.$;
const Rx           = require('rxjs/Rx');
                     require('./rx-jquery-stub');
const _            = require('underscore');
const io           = require('socket.io-client');

const renderer     = require('./renderer.js');
const caption      = require('./caption.js');
const Command      = require('./graphVizApp/command.js');


/**
 * Creates a function which fetches takes an object ID, and fetches the object of that type, with
 * that ID, from the viz worker.
 *
 * @param {Url} workerUrl - The base address to the worker to fetch from (for example,
 *     `localhost:8000` or `example.com/worker/10000`).
 * @param {String} endpoint - The name of the REST API endpoint which is responsible for serving
 *     objects of this type (for example, `vbo`).
 * @param {String} queryKey - The key used in the query string constructed to fetch objects from
 *     the server (for example, `buffer` will construct a URL like
 *     `example.com/worker/10000/vbo?buffer=...`). The value will be the object ID, and passed in
 *     when calling the returned function.
 */
function makeFetcher (workerUrl, endpoint, queryKey) {
    /**
     * @param {String} socketID
     * @param {Object.<Number>} bufferByteLengths
     * @param {String} bufferName
     * @returns Observable<ArrayBuffer>
     */
    return (socketID, bufferByteLengths, bufferName) => {
        debug('fetching', bufferName);

        const res = new Rx.Subject();

        const query = { id: socketID };
        query[queryKey] = bufferName;

        const fetchUrlObj = _.extend({}, workerUrl);
        fetchUrlObj.pathname =
            fetchUrlObj.pathname +
            (fetchUrlObj.pathname.substr(-1) !== '/' ? '/' : '') +
            endpoint;
        fetchUrlObj.query = query;

        const fetchUrl = urlModule.format(fetchUrlObj);

        // https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        const oReq = new XMLHttpRequest();
        oReq.open('GET', fetchUrl, true);
        oReq.responseType = 'arraybuffer';
        oReq.timeout = 10000;
        oReq.ontimeout = function () {
            debug('Fetch buffer timeout');
            res.onNext(new Uint8Array(0));
        };

        const now = Date.now();
        oReq.onload = () => {
            try {
                debug('got texture/vbo data', bufferName, Date.now() - now, 'ms');

                const arrayBuffer = oReq.response; // Note: not oReq.responseText
                const bufferLength = bufferByteLengths[bufferName];
                debug('Buffer length (%s): %d', bufferName, bufferLength);
                const trimmedArray = new Uint8Array(arrayBuffer, 0, bufferLength);

                res.onNext(trimmedArray);

            } catch (e) {
                console.error('Render error on loading data into WebGL:', e, e.stack);
            }
        };

        oReq.send(null);

        return res.take(1);
    };
}


// Filter for server resource names that have changed (or not previously present)
//[ String ] * ?{?<name>: int} * ?{?<name>: int} -> [ String ]
function getUpdatedNames (names, originalVersions, newVersions) {
    if (!originalVersions || !newVersions) {
        return names;
    }
    return names.filter((name) =>
        newVersions.hasOwnProperty(name) && (originalVersions[name] !== newVersions[name]));
}


/**
 * Fetches the URL for the viz server to use
 */
function requestWorker(args) {

    let attempt = 0;

    return Rx.Observable.return().flatMap(
        () => {
            // wrap so can retry if claim race failure
            debug('Asking /vizaddr');
            return $.ajaxAsObservable({
                url: '/vizaddr/graph?' + args,
                dataType: 'json'
            });
        })
        .flatMap((reply) => {

            attempt++;

            const ret = Rx.Observable.return(reply);
            return attempt === 1 ? ret : (ret.delay(1000));

        })
        .map((reply) => {

            if (!reply.data || reply.data.error) { // FIXME Check success value
                console.error('vizaddr returned error', reply, (reply.data||{}).error);
                let msg;
                if (reply.data && reply.data.error) {
                    msg = reply.data.error;
                } else {
                    msg = 'Cannot connect to visualization server (vizaddr)';
                }

                throw new Error(msg);
            }

            reply.data.uri.pathname = _.isString(reply.data.uri.pathname) ? reply.data.uri.pathname : '';

            reply.data.uri.protocol = window.location.protocol;

            console.info('Assigned to viz worker at URL %s', urlModule.format(reply.data.uri));
            return reply.data.uri;
        })
        .retry(3)
        .take(1);
}


// URL query params white-list for the worker API
const validWorkerParams = [
    'workbook', 'view', 'dataset', 'scene', 'device', 'controls', 'mapper', 'type', 'vendor',
    'usertag', 'viztoken', 'debugId'
];


function connect (vizType, urlParams) {
    debug('Connecting to visualization server');
    if (!vizType) {
        throw new Error('need vizType');
    }

    // For compatibility with old way of specifying dataset
    if (urlParams.hasOwnProperty('datasetname')) {
        urlParams.dataset = urlParams.datasetname;
    }

    // Get URL query params to send over to the worker via socket
    const validUrlParams = _.chain(_.extend({}, urlParams, {debugId: window.graphistryDebugId}))
        .pick(validWorkerParams)
        .mapObject((val) => encodeURIComponent(val))
        .value();

    const vizAddrArgs = _.chain(validUrlParams)
        .pairs()
        .map((param) => param.join('='))
        .value()
        .join('&');

    let attempt = 0,
        latestError;

    return requestWorker(vizAddrArgs)
        .flatMap((uri) => {
            return Rx.Observable.return()
                .do(() => {
                    attempt++;
                    if (attempt === 3) {
                        console.error('Last attempt failed');
                        alert('Stopping all attempts to connect.');
                        throw new Error(latestError);
                    }
                })
                .flatMap(() => {
                    uri.query = _.extend({}, validUrlParams, uri.query);

                    const socketUrl = _.extend({}, uri);
                    socketUrl.pathname =
                        socketUrl.pathname +
                        (socketUrl.pathname.substr(-1) !== '/' ? '/' : '') +
                        'socket.io';

                    debug('Got worker URI', urlModule.format(socketUrl));

                    const socket = io.Manager(socketUrl.protocol + '//' + socketUrl.host,
                        {
                            query: socketUrl.query,
                            path: socketUrl.pathname,
                            reconnection: false
                        }).socket('/');
                    socket.io.engine.binaryType = 'arraybuffer';

                    // FIXME Cannot trigger this handler when testing. Bug?
                    socket.io.on('connect_error', (err) => {
                        console.error('error, socketio failed connect', err);
                        latestError = 'Failed to connect to GPU worker. Try refreshing the page...';

                        // FIXME: Cannot throw exception in callback. Must wrap in Rx
                        throw new Error(latestError);
                    });

                    debug('Stream client websocket connected to visualization server', vizType);

                    const fallbackErrorMessage = 'Connection rejected by GPU worker. Try refreshing the page...';

                    const vizCommand = new Command('Notify viz type', 'viz', socket);
                    return vizCommand.sendWithObservableResult(vizType)
                        .do((v) => {
                            debug('notified viz type', v);
                        })
                        .map((res) => {
                            if (res && res.success) {
                                return {uri, socket};
                            } else {
                                latestError = (res||{}).error || fallbackErrorMessage;
                                console.error('Viz rejected (likely due to multiple claimants)');
                                throw new Error (latestError);
                            }
                        });
                })
                .retry(3);
        });
}


//socket * canvas * {?is3d: bool}
function createRenderer (socket, canvas, urlParams) {
    debug('Getting render-config from server', urlParams);
    const renderConfigCommand = new Command('Getting render config', 'render_config', socket);
    return renderConfigCommand.sendWithObservableResult(null)
        .map((res) => {
            if (res && res.success) {
                debug('Received render-config from server', res.renderConfig);
                return res.renderConfig;
            } else {
                throw new Error((res||{}).error || 'Cannot get render_config');
            }
        }).map((renderConfig) => {
            const renderState = renderer.init(renderConfig, canvas, urlParams);
            debug('Renderer created');
            return renderState;
        });
}


/**
 * Sets up event loop to receive VBO update messages from the server, load them onto the GPU and
 * render them.
 *
 * @param  {socket.io socket} socket - socket.io socket created when we connected to the server.
 * @param  {string} uri              - The URI for the server's websocket endpoint.
 * @param  {renderer} renderState    - The renderer object returned by renderer.create().
 * @return {BehaviorSubject} {'init', 'start', 'received', 'rendered'} Rx subject that fires every time a frame is rendered.
 */
function handleVboUpdates (socket, uri, renderState) {
    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, bufferByteLengths, bufferName
    const fetchBuffer = makeFetcher(uri, 'vbo', 'buffer');

    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, textureByteLengths, textureName
    const fetchTexture = makeFetcher(uri, 'texture', 'texture');

    const bufferNames = renderer.getServerBufferNames(renderState.get('config').toJS());
    const textureNames = renderer.getServerTextureNames(renderState.get('config').toJS());

    debug('Server buffers/textures', bufferNames, textureNames);

    let lastHandshake = Date.now();
    const vboUpdates = new Rx.BehaviorSubject('init');

    const previousVersions = {buffers: {}, textures: {}};
    let vboUpdateStep = 0;

    const vboVersions = new Rx.BehaviorSubject(previousVersions);

    socket.on('vbo_update', (data, handshake) => {
        debug('0. socket vbo update');

        const thisStep = {step: vboUpdateStep++, data: data.step};

        caption.renderCaptionFromData(data);

        try {
            debug('1. VBO update', thisStep);
            vboUpdates.onNext('start');

            const now = new Date().getTime();
            debug('2. got VBO update message', now - lastHandshake, data, 'ms', thisStep);

            const changedBufferNames  = getUpdatedNames(bufferNames,
                previousVersions.buffers, data.versions ? data.versions.buffers : null);
            const changedTextureNames = getUpdatedNames(textureNames,
                previousVersions.textures, data.versions ? data.versions.textures : null);


            socket.emit('planned_binary_requests', {buffers: changedBufferNames, textures: changedTextureNames});

            debug('3. changed buffers/textures', previousVersions, data.versions, changedBufferNames, changedTextureNames, thisStep);

            const readyBuffers = new Rx.ReplaySubject(1);
            const readyTextures = new Rx.ReplaySubject(1);

            const readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();
            readyToRender
                .subscribe(() => {
                    debug('6. All buffers and textures received, completing', thisStep);
                    handshake(Date.now() - lastHandshake);
                    lastHandshake = Date.now();
                    vboUpdates.onNext('received');
                },
                (err) => { console.error('6 err. readyToRender error', err, (err||{}).stack, thisStep); });

            const bufferVBOs = Rx.Observable.combineLatest(
                [Rx.Observable.return()]
                    .concat(changedBufferNames.map(fetchBuffer.bind('', socket.io.engine.id, data.bufferByteLengths))))
                .take(1);

            bufferVBOs
                .subscribe((vbos) => {
                    vbos.shift(); // Remove empty stub observable from the beginning

                    debug('4a. Got VBOs:', vbos.length, thisStep);
                    const bindings = _.object(_.zip(changedBufferNames, vbos));

                    debug('5a. got all VBO data', Date.now() - now, 'ms', bindings, thisStep);
                    //TODO may be able to move this early
                    socket.emit('received_buffers');

                    try {
                        _.each(data.elements, (num, itemName) => {
                            renderer.setNumElements(renderState, itemName, num);
                        });
                        renderer.loadBuffers(renderState, bindings);
                        readyBuffers.onNext();
                    } catch (e) {
                        console.error('5a err. Render error on loading data into WebGL:', e, e.stack, thisStep);
                    }

                },
                (err) => { console.error('bufferVBOs error', err, (err||{}).stack, thisStep); });

            const textureLengths =
                _.object(_.pairs(_.pick(data.textures, changedTextureNames))
                    .map((pair) => {
                        const name = pair[0];
                        const nfo = pair[1];
                        return [name, nfo.bytes]; }));

            const texturesData = Rx.Observable.combineLatest(
                [Rx.Observable.return()]
                    .concat(changedTextureNames.map(fetchTexture.bind('', socket.io.engine.id, textureLengths))))
                .take(1);

            texturesData.subscribe((textures) => {
                textures.shift();

                const textureNfos = changedTextureNames.map((name, i) => {
                    return _.extend(data.textures[name], {buffer: textures[i]});
                });

                const bindings = _.object(_.zip(changedTextureNames, textureNfos));

                debug('4b. Got textures', textures, thisStep);
                renderer.loadTextures(renderState, bindings);

                readyTextures.onNext();
            }, (err) => { console.error('5b.readyToRender error', err, (err||{}).stack, thisStep); });

            _.keys(data.versions).forEach((mode) => {
                previousVersions[mode] = previousVersions[mode] || {};
                _.keys(data.versions[mode]).forEach((name) => {
                    previousVersions[mode][name] = (data.versions[mode] || {})[name] || previousVersions[mode][name];
                });
            });

            vboVersions.onNext(previousVersions);

        } catch (e) {
            debug('ERROR vbo_update', e, e.stack, thisStep);
        }
    });

    socket.emit('begin_streaming');

    return {
        vboUpdates: vboUpdates,
        vboVersions: vboVersions
    };
}

module.exports = {
    connect: connect,
    createRenderer: createRenderer,
    handleVboUpdates: handleVboUpdates
};
