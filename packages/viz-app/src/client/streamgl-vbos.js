'use strict';

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

const urlModule    = require('url');
const debug        = require('debug')('graphistry:StreamGL:client');
const _            = require('underscore');

import {
    Observable, Subject,
    BehaviorSubject, ReplaySubject
} from 'rxjs';

/**
 *  Factory for creating a "fetch VBOs" function. You specify the worker's base URL, the name of the
 *  "fetch VBO" endpoint in the worker, and the type of VBO being fetched. It returns a function
 *  that can be called to do a XHR fetch a named buffer of the specified VBO type.
 *
 *  For example, if the server
 *
 *  @param   {Url}  workerUrl  The worker's address. For example, example.com/worker/10/
 *  @param   {String}  endpoint   The name of the worker's "fetch VBO" endpoint. For example. "vbo".
 *  This will be appended to the workerUrl to construct the fetch request's path.
 *  @param   {String}  queryKey   The type of VBO being fetched. For example, "buffer" or "texture".
 *  Fetch requests will have a query that includes "?<queryKey>=<bufferName>", for example,
 *  "?buffer=curMidPoints". This doesn't affect the JavaScript type of the data, it's just used for
 *  indicating to the server what VBO is being requested.
 *
 *  @return  {[type]}             [description]
 */
function makeFetcher (workerUrl, endpoint, queryKey) {
    return fetch;
    /**
     *  Does an XHR GET request for the <queryKey> VBO with the given name, returning an Uint8Array
     *  of the fetched data, trimmed to the size specified in bufferByteLengths.
     *
     * @param {String} socketID  The ID from the socket.io socket connected to the server. This is
     * included in the XHR fetch request's query, so that the server can match the XHR request with
     * a valid socket.io connection, for security/routing purposes.
     * @param {Object.<Number>} bufferByteLengths An object that maps buffer names to buffer sizes.
     * The fetched ArrayBuffer object will be trimmed to this size. (I don't know what this is for!)
     * @param {String} bufferName The name of the VBO being fetched. For example, if queryKey is
     * "texture", and "bufferName" is "background", the texture named "background" will be fetched.
     *
     * @returns Observable<ArrayBuffer>
     */
    function fetch(socketID, bufferByteLengths, bufferName) {
        debug('fetching', bufferName);

        const res = new Subject();

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
            debug('got texture/vbo data', bufferName, Date.now() - now, 'ms');
            let trimmedArray, bufferLength, errorCreatingBuffer = false;
            if (oReq.status < 200 || oReq.status >= 300) {
                return res.onNext(new Uint8Array(0));
            }
            try {
                bufferLength = bufferByteLengths[bufferName];
                const arrayBuffer = oReq.response; // Note: not oReq.responseText
                debug('Buffer length (%s): %d', bufferName, bufferLength);
                trimmedArray = new Uint8Array(arrayBuffer, 0, bufferLength);
            } catch (e) {
                errorCreatingBuffer = true;
                console.error(`Error creating buffer for ${bufferName} with length ${bufferLength}`, e, e.stack);
                res.onError(e);
            }
            if (!errorCreatingBuffer) {
                try {
                    res.onNext(trimmedArray);
                } catch (e) {
                    console.error('Render error on loading data into WebGL:', e, e.stack);
                }
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
 * Sets up event loop to receive VBO update messages from the server, load them onto the GPU and
 * render them.
 *
 * @param  {socket.io socket} socket - socket.io socket created when we connected to the server.
 * @param  {string} uri              - The URI for the server's websocket endpoint.
 * @param  {renderer} renderState    - The renderer object returned by renderer.create().
 * @return {BehaviorSubject} {'init', 'start', 'received', 'rendered'} Rx subject that fires every time a frame is rendered.
 */
function handleVboUpdates (socket, uri, renderState, sceneModel, renderer) {
    // The server sends `vbo_update` messages to us, containing the current revision number of each
    // of its buffers & textures, along with metadata for each of those VBOs (byte length and number
    // of elements for buffers; width, height, and byte length for textures).
    // This function listens for those message, then compares the server's VBO revision numbers to
    // our own. If they differ, it will do an XHR fetch for those named buffers from the server. It
    // then loads those buffers into the renderer (making use of the metadata included in the
    // `vbo_update` message for things like buffer size, properties, etc.)

    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, bufferByteLengths, bufferName
    const fetchBuffer = makeFetcher(uri, 'vbo', 'buffer');

    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, textureByteLengths, textureName
    const fetchTexture = makeFetcher(uri, 'texture', 'texture');

    // const bufferNames = renderer.getServerBufferNames(renderState.get('config').toJS());
    // const textureNames = renderer.getServerTextureNames(renderState.get('config').toJS());
    const bufferNames = renderState.config.server.buffers;
    const textureNames = renderState.config.server.textures;

    debug('Server buffers/textures', bufferNames, textureNames);

    let lastHandshake = Date.now();
    const vboUpdates = new BehaviorSubject('init');

    const previousVersions = {buffers: {}, textures: {}};
    let vboUpdateStep = 0;

    const vboVersions = new BehaviorSubject(previousVersions);

    socket.on('vbo_update', (data, handshake) => {
        debug('0. socket vbo update');

        const thisStep = {step: vboUpdateStep++, data: data.step};

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

            const readyBuffers = new ReplaySubject(1);
            const readyTextures = new ReplaySubject(1);

            const readyToRender = Observable.zip(readyBuffers, readyTextures, _.identity).share();
            readyToRender
                .do(() => {
                    debug('6. All buffers and textures received, completing', thisStep);
                    handshake(Date.now() - lastHandshake);
                    lastHandshake = Date.now();
                    vboUpdates.onNext('received');
                })
                .switchMap(() => {
                    const { elements = {}, bufferByteLengths = {} } = data;
                    const numPoints = elements.pointculled || elements.uberpointculled || 0;
                    const numEdges = (elements.edgeculled ||
                                      elements.edgeculledindexed ||
                                      elements.edgeculledindexedclient ||
                                      bufferByteLengths.logicalEdges / 4 || 0) * 0.5;
                    return sceneModel.withoutDataSource().set(
                        { path: ['renderer', 'edges', 'elements'], value: numEdges },
                        { path: ['renderer', 'points', 'elements'], value: numPoints }
                    );
                })
                .subscribe({
                    error(err) {
                        console.error('6 err. readyToRender error', err, (err||{}).stack, thisStep);
                    }
                });

            const bufferVBOs = Observable.combineLatest(
                [Observable.return()]
                    .concat(changedBufferNames.map(fetchBuffer.bind('', socket.io.engine.id, data.bufferByteLengths))))
                .take(1);

            bufferVBOs
                .subscribe((vbos) => {
                    vbos.shift(); // Remove empty stub observable from the beginning

                    debug('4a. Got VBOs:', vbos.length, thisStep);
                    const bindings = _.object(_.zip(changedBufferNames, vbos));

                    debug('5a. got all VBO data', Date.now() - now, 'ms', bindings, thisStep);
                    //TODO may be able to move this early
                    socket.emit('received_buffers', Date.now() - now);

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

            const texturesData = Observable.combineLatest(
                [Observable.return()]
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

export { handleVboUpdates };
