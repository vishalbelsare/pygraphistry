/// <reference path="../typings/underscore/underscore.d.ts"/>
'use strict';

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

var urlModule    = require('url');
var debug        = require('debug')('graphistry:StreamGL:client');
var $            = window.$;
var Rx           = require('rx');
                   require('./rx-jquery-stub');
var _            = require('underscore');
var io           = require('socket.io-client');

var renderer     = require('./renderer.js');


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
    //string * {<name> -> int} * name -> Subject ArrayBuffer
    return function (socketID, bufferByteLengths, bufferName) {
        debug('fetching', bufferName);

        var res = new Rx.Subject();

        var query = { id: socketID };
        query[queryKey] = bufferName;

        var fetchUrlObj = _.extend({}, workerUrl);
        fetchUrlObj.pathname =
            fetchUrlObj.pathname +
            (fetchUrlObj.pathname.substr(-1) !== '/' ? '/' : '') +
            endpoint;
        fetchUrlObj.query = query;

        var fetchUrl = urlModule.format(fetchUrlObj);

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open('GET', fetchUrl, true);
        oReq.responseType = 'arraybuffer';

        var now = Date.now();
        oReq.onload = function () {
            try {
                debug('got texture/vbo data', bufferName, Date.now() - now, 'ms');

                var arrayBuffer = oReq.response; // Note: not oReq.responseText
                var blength = bufferByteLengths[bufferName];
                debug('Buffer length (%s): %d', bufferName, blength);
                var trimmedArray = new Uint8Array(arrayBuffer, 0, blength);

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
    return names.filter(function (name) {
        return newVersions.hasOwnProperty(name) && (originalVersions[name] !== newVersions[name]);
    });
}


/**
 * Fetches the URL for the viz server to use
 */
function requestWorker(args) {

    var attempt = 0;

    return Rx.Observable.return().flatMap(function () {
            //wrap so can retry if claim race failure
            debug('Asking /vizaddr');
            return $.ajaxAsObservable({
                url: '/vizaddr/graph?' + args,
                dataType: 'json'
            });
        })
        .flatMap(function(reply) {

            attempt++;

            var ret = Rx.Observable.return(reply);
            return attempt === 1 ?  ret : (ret.delay(1000));

        })
        .map(function (reply) {

            if (!reply.data || reply.data.error) { //FIXME Check success value
                console.error('vizaddr returned error', reply, (reply.data||{}).error);
                var msg;
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


// URL query params whitelist for the worker API
var validWorkerParams = ['dataset', 'scene', 'device', 'controls',
    'mapper', 'type', 'vendor', 'usertag'];


function connect(vizType, urlParams) {
    debug('Connecting to visualization server');
    if (!vizType) {
        throw new Error('need vizType');
    }

    // For compatibility with old way of specifying dataset
    if ('datasetname' in urlParams) {
        urlParams.dataset = urlParams.datasetname;
    }

    // Get URL query params to send over to the worker via socket
    var validUrlParams = _.chain(urlParams)
        .pick(validWorkerParams)
        .mapObject(function(val) { return encodeURIComponent(val); })
        .value();

    var vizAddrArgs = _.chain(validUrlParams)
        .pairs()
        .map(function (param) { return param.join('='); })
        .value()
        .join('&');

    var attempt = 0;
    var latestError;

    return requestWorker(vizAddrArgs)
        .flatMap(function (uri) {
            return Rx.Observable.return()
                .do(function () {
                    attempt++;
                    if (attempt === 3) {
                        console.error('Last attempt failed');
                        alert('Stopping all attempts to connect.');
                        throw new Error(latestError);
                    }
                })
                .flatMap(function() {
                    uri.query = _.extend({}, validUrlParams, uri.query);

                    var socketUrl = _.extend({}, uri);
                    socketUrl.pathname =
                        socketUrl.pathname +
                        (socketUrl.pathname.substr(-1) !== '/' ? '/' : '') +
                        'socket.io';

                    debug('Got worker URI', urlModule.format(socketUrl));

                    var socket = io.Manager(socketUrl.protocol + '//' + socketUrl.host, {
                            query: socketUrl.query,
                            path: socketUrl.pathname,
                            reconnection: false
                        }).socket('/');
                    socket.io.engine.binaryType = 'arraybuffer';

                    // FIXME Cannot trigger this handler when testing. Bug?
                    socket.io.on('connect_error', function (err) {
                        console.error('error, socketio failed connect', err);
                        latestError = 'Failed to connect to GPU worker. Try refreshing the page...';

                        // FIXME: Cannot throw exception in callback. Must wrap in Rx
                        throw new Error(latestError);
                    });

                    debug('Stream client websocket connected to visualization server', vizType);

                    return Rx.Observable.fromCallback(socket.emit.bind(socket, 'viz'))(vizType)
                        .do(function (v) {
                            debug('notified viz type', v);
                        })
                        .map(function (res) {
                            if (res && res.success) {
                                return {uri: uri, socket: socket};
                            } else {
                                latestError = (res||{}).error || 'Connection rejected by GPU worker. Try refreshing the page...';
                                console.error('Viz rejected (likely due to multiple claimants)');
                                throw new Error (latestError);
                            }
                        });
                })
                .retry(3);
        });
}


//socket * canvas * {?is3d: bool}
function createRenderer(socket, canvas, urlParams) {
    debug('Getting render-config from server', urlParams);
    return Rx.Observable.fromCallback(socket.emit, socket)('render_config', null)
        .map(function (res) {
            if (res && res.success) {
                debug('Received render-config from server', res.renderConfig);
                return res.renderConfig;
            } else {
                throw new Error((res||{}).error || 'Cannot get render_config');
            }
        }).map(function (renderConfig) {
            var renderState = renderer.init(renderConfig, canvas, urlParams);
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
 *
 * @return {Rx.BehaviorSubject} {'init', 'start', 'received', 'rendered'} Rx subject that fires every time a frame is rendered.
 */
function handleVboUpdates(socket, uri, renderState) {
    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, bufferByteLengths, bufferName
    var fetchBuffer = makeFetcher(uri, 'vbo', 'buffer');

    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, textureByteLengths, textureName
    var fetchTexture = makeFetcher(uri, 'texture', 'texture');

    var bufferNames = renderer.getServerBufferNames(renderState.get('config').toJS());
    var textureNames = renderer.getServerTextureNames(renderState.get('config').toJS());

    debug('Server buffers/textures', bufferNames, textureNames);

    var lastHandshake = Date.now();
    var vboUpdates = new Rx.BehaviorSubject('init');

    var previousVersions = {buffers: {}, textures: {}};
    var vboUpdateStep = 0;

    socket.on('vbo_update', function (data, handshake) {

        var thisStep = {step: vboUpdateStep++, data: data.step};

        $('#graph-node-count').text(data.elements.pointculled || data.elements.uberpointculled);
        var numEdges = (data.elements.edgeculled || data.elements.edgeculledindexed ||
                        data.elements.edgeculledindexedclient || data.elements.indexeddummy) / 2;
        $('#graph-edge-count').text(numEdges);

        try {
            debug('1. VBO update', thisStep);
            vboUpdates.onNext('start');

            var now = new Date().getTime();
            debug('2. got VBO update message', now - lastHandshake, data, 'ms', thisStep);

            var changedBufferNames  = getUpdatedNames(bufferNames,  previousVersions.buffers,  data.versions ? data.versions.buffers : null);
            var changedTextureNames = getUpdatedNames(textureNames, previousVersions.textures, data.versions ? data.versions.textures : null);


            socket.emit('planned_binary_requests', {buffers: changedBufferNames, textures: changedTextureNames});

            debug('3. changed buffers/textures', previousVersions, data.versions, changedBufferNames, changedTextureNames, thisStep);

            var readyBuffers = new Rx.ReplaySubject(1);
            var readyTextures = new Rx.ReplaySubject(1);

            var readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();
            readyToRender
                .subscribe(function () {
                    debug('6. All buffers and textures received, completing', thisStep);
                    handshake(Date.now() - lastHandshake);
                    lastHandshake = Date.now();
                    vboUpdates.onNext('received');
                },
                function (err) { console.error('6 err. readyToRender error', err, (err||{}).stack, thisStep); });

            var bufferVBOs = Rx.Observable.zipArray(
                [Rx.Observable.return()]
                    .concat(changedBufferNames.map(fetchBuffer.bind('', socket.io.engine.id, data.bufferByteLengths))))
                .take(1);

            bufferVBOs
                .subscribe(function (vbos) {
                    vbos.shift();

                    debug('4a. Got VBOs:', vbos.length, thisStep);
                    var bindings = _.object(_.zip(changedBufferNames, vbos));

                    debug('5a. got all VBO data', Date.now() - now, 'ms', bindings, thisStep);
                    socket.emit('received_buffers'); //TODO fire preemptively based on guess

                    try {
                        _.each(data.elements, function (num, itemName) {
                            renderer.setNumElements(renderState, itemName, num);
                        });
                        renderer.loadBuffers(renderState, bindings);
                        readyBuffers.onNext();
                    } catch (e) {
                        console.error('5a err. Render error on loading data into WebGL:', e, e.stack, thisStep);
                    }

                },
                function (err) { console.error('bufferVBOs error', err, (err||{}).stack, thisStep); });

            var textureLengths =
                _.object(_.pairs(_.pick(data.textures, changedTextureNames))
                    .map(function (pair) {
                        var name = pair[0];
                        var nfo = pair[1];
                        return [name, nfo.bytes]; }));

            var texturesData = Rx.Observable.zipArray(
                [Rx.Observable.return()]
                    .concat(changedTextureNames.map(fetchTexture.bind('', socket.io.engine.id, textureLengths))))
                .take(1);

            texturesData.subscribe(function (textures) {
                textures.shift();

                var textureNfos = changedTextureNames.map(function (name, i) {
                    return _.extend(data.textures[name], {buffer: textures[i]});
                });

                var bindings = _.object(_.zip(changedTextureNames, textureNfos));

                debug('4b. Got textures', textures, thisStep);
                renderer.loadTextures(renderState, bindings);

                readyTextures.onNext();
            }, function (err) { console.error('5b.readyToRender error', err, (err||{}).stack, thisStep); });

            _.keys(data.versions).forEach(function (mode) {
                previousVersions[mode] = previousVersions[mode] || {};
                _.keys(data.versions[mode]).forEach(function (name) {
                    previousVersions[mode][name] = (data.versions[mode] || {})[name] || previousVersions[mode][name];
                });
            });

        } catch (e) {
            debug('ERROR vbo_update', e, e.stack, thisStep);
        }
    });

    socket.emit('begin_streaming');

    return vboUpdates;
}

module.exports = {
    connect: connect,
    createRenderer: createRenderer,
    handleVboUpdates: handleVboUpdates
};
