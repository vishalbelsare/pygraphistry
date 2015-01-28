'use strict';

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

var debug        = require('debug')('graphistry:StreamGL:client');
var $            = window.$;
var Rx           = require('rx');
                   require('./rx-jquery-stub');
var _            = require('underscore');
var io           = require('socket.io-client');

var renderer     = require('./renderer.js');
var ui           = require('./ui.js');

//string * {socketHost: string, socketPort: int} -> (... -> ...)
// where fragment == 'vbo?buffer' or 'texture?name'
function makeFetcher (fragment, url) {
    //string * {<name> -> int} * name -> Subject ArrayBuffer
    return function (socketID, bufferByteLengths, bufferName) {

        debug('fetching', bufferName);

        var res = new Rx.Subject();

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open('GET', url + '/' + fragment + '=' + bufferName + '&id=' + socketID, true);
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
                ui.error('Render error on loading data into WebGL:', e, e.stack);
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
 * Gets the URL param for the dataset
 */
function getUrlParameters() {
    var sPageURL = window.location.search.substring(1);
    var sURLVariables = sPageURL.split('&');
    var params = {};
    for (var i = 0; i < sURLVariables.length; i++){
        var sParameterName = sURLVariables[i].split('=');
        params[sParameterName[0]] = sParameterName[1];
    }

    return params;
}


/**
 * Fetches the URL for the viz server to use
 */
function getVizServerParams(args) {
    return $.ajaxAsObservable({
            url: '/vizaddr/graph?' + args,
            dataType: 'json'
        })
        .map(function(reply) {
            debug('Got viz server params');

            console.log('routed in ' + ( Date.now() - parseFloat(reply.data.timestamp) ) + ' ms');

            return {
                'hostname': reply.data.hostname,
                'port': reply.data.port,
                'url': '//' + reply.data.hostname + ':' + reply.data.port
            };
        })
        .take(1);
}


function connect(vizType) {
    debug('Connecting to visualization server');
    if (!vizType) {
        throw new Error('need vizType');
    }

    // Get URL query params to send over to the worker via socket
    var workerParams = ['dataset', 'scene', 'device', 'controls'];
    var params = getUrlParameters();

    // For compatibility with old way of specifying dataset
    if ('datasetname' in params) {
        params.dataset = params.datasetname;
    }

    var workersArgs = _.map(workerParams, function (param) {
        return param + '=' + params[param];
    }).join('&');
    console.log('Args', workersArgs);


    return getVizServerParams(workersArgs)
        .flatMap(function(params) {

            debug('got params', params);

            var socket = io(params.url, { query: workersArgs,
                                          reconnection: false,
                                          transports: ['websocket']
                                        });

            socket.io.engine.binaryType = 'arraybuffer';

            debug('Stream client websocket connected to visualization server', vizType);

            return Rx.Observable.fromNodeCallback(socket.emit.bind(socket, 'viz'))(vizType)
                .do(function () {
                    debug('notified viz type');
                })
                .map(_.constant({params: params, socket: socket}));
        });
}


function createRenderer(socket, canvas) {
    var rcObsv = Rx.Observable.fromCallback(socket.on, socket, function(renderConf) {
            debug('Received render-config from server', renderConf[0]);
            var renderState = renderer.init(renderConf[0], canvas);
            debug('Renderer created');

            return renderState;
        })('render_config');

    debug('Getting render-config from server');
    socket.emit('get_render_config');

    return rcObsv;
}


/**
 * Sets up event loop to receive VBO update messages from the server, load them onto the GPU and
 * render them.
 *
 * @param  {socket.io socket} socket - socket.io socket created when we connected to the server.
 * @param  {renderer} renderState    - The renderer object returned by renderer.create().
 *
 * @return {Rx.BehaviorSubject} {'start', 'received', 'rendered'} Rx subject that fires every time a frame is rendered.
 */
function handleVboUpdates(socket, renderState) {
    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, bufferByteLengths, bufferName
    var fetchBuffer = makeFetcher('vbo?buffer', socket.io.uri);

    //string * {<name> -> int} * name -> Subject ArrayBuffer
    //socketID, textureByteLengths, textureName
    var fetchTexture = makeFetcher('texture?texture', socket.io.uri);

    var buffers = renderState.get('buffers').toJS();
    var bufferNames = renderer.getServerBufferNames(renderState.get('config').toJS());
    var textureNames = renderer.getServerTextureNames(renderState.get('config').toJS());

    debug('Server buffers/textures', bufferNames, textureNames);

    var lastHandshake = Date.now();
    var renderedFrame = new Rx.BehaviorSubject(0);

    var previousVersions = {buffers: {}, textures: {}};
    socket.on('vbo_update', function (data, handshake) {
        try {
            debug('VBO update');
            renderedFrame.onNext('start');

            var now = new Date().getTime();
            debug('got VBO update message', now - lastHandshake, data, 'ms');

            var changedBufferNames  = getUpdatedNames(bufferNames,  previousVersions.buffers,  data.versions ? data.versions.buffers : null);
            var changedTextureNames = getUpdatedNames(textureNames, previousVersions.textures, data.versions ? data.versions.textures : null);

            socket.emit('planned_binary_requests', {buffers: changedBufferNames, textures: changedTextureNames});

            debug('changed buffers/textures', previousVersions, data.versions, changedBufferNames, changedTextureNames);

            var readyBuffers = new Rx.ReplaySubject(1);
            var readyTextures = new Rx.ReplaySubject(1);

            var readyToRender = Rx.Observable.zip(readyBuffers, readyTextures, _.identity).share();
            readyToRender.subscribe(function () {
                    debug('All buffers and textures received, completing');
                    handshake(Date.now() - lastHandshake);
                    lastHandshake = Date.now();
                    renderedFrame.onNext('received');
                    renderer.render(renderState);
                    renderedFrame.onNext('rendered');
                });

            var bufferVBOs = Rx.Observable.zipArray(
                [Rx.Observable.return()]
                    .concat(changedBufferNames.map(fetchBuffer.bind('', socket.io.engine.id, data.bufferByteLengths))))
                .take(1);

            bufferVBOs
                .subscribe(function (vbos) {
                    vbos.shift();

                    debug('Got VBOs:', vbos.length);
                    var bindings = _.object(_.zip(changedBufferNames, vbos));

                    debug('got all VBO data', Date.now() - now, 'ms', bindings);
                    socket.emit('received_buffers'); //TODO fire preemptively based on guess

                    try {
                        renderer.loadBuffers(renderState, buffers, bindings);
                        renderer.setNumElements(data.elements);
                        readyBuffers.onNext();
                    } catch (e) {
                        ui.error('Render error on loading data into WebGL:', e, e.stack);
                    }

                });

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

                debug('Got textures', textures);
                renderer.loadTextures(renderState, bindings);

                readyTextures.onNext();
            });

            _.keys(data.versions).forEach(function (mode) {
                previousVersions[mode] = previousVersions[mode] || {};
                _.keys(data.versions[mode]).forEach(function (name) {
                    previousVersions[mode][name] = (data.versions[mode] || {})[name] || previousVersions[mode][name];
                });
            });

        } catch (e) {
            debug('ERROR vbo_update', e, e.stack);
        }
    });

    socket.emit('begin_streaming');

    return renderedFrame;
}

module.exports = {
    connect: connect,
    createRenderer: createRenderer,
    handleVboUpdates: handleVboUpdates
};
