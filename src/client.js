'use strict';

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

var debug        = require('debug')('StreamGL:main'),
    Rx           = require('rx');

var renderConfig = require('render-config'),
    renderer     = require('./renderer.js'),
    ui           = require('./ui.js'),
    proxyUtils   = require('./proxyutils.js');


//string -> Subject ArrayBuffer
function fetchBuffer (bufferByteLengths, bufferName) {

        var res = new Rx.Subject();

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open('GET', 'http://localhost:' + proxyUtils.BINARY_PORT + '/vbo?buffer=' + bufferName, true);
        oReq.responseType = 'arraybuffer';

        var now = Date.now();
        oReq.onload = function () {
            try {
                console.log('got VBO data', bufferName, Date.now() - now, 'ms');

                var arrayBuffer = oReq.response; // Note: not oReq.responseText
                var trimmedArray = new Uint8Array(arrayBuffer, 0, bufferByteLengths[bufferName]);

                res.onNext(trimmedArray);

            } catch (e) {
                ui.error('Render error on loading data into WebGL:', e, new Error().stack);
            }
        };

        oReq.send(null);

        return res.take(1);
}


//DOM * ?{?meter, ?camera, ?socket} ->
//  {
//      renderFrame: () -> (),
//      setCamera: camera -> (),
//      disconnect: () -> (),
//      socket
//  }
function init (canvas, opts) {
    debug('initializing networking client');
    opts = opts || {};

    console.log('connected');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var meter = opts.meter || {tick: function(){}, pause: function(){}};

    var socket = opts.socket;
    if (!socket) {
        socket = io.connect('http://localhost', {reconnection: false, transports: ['websocket']});
        socket.io.engine.binaryType = 'arraybuffer';
    } else if (!socket.io || !socket.io.engine || socket.io.engine !== 'arraybuffer') {
        console.warn('Expected binary socket');
    }

    var renderState = renderer.init(renderConfig, canvas, opts);
    var gl = renderState.get('gl');
    var programs = renderState.get('programs').toJS();
    var buffers = renderState.get('buffers').toJS();
    var camera = renderState.get('camera');

    var lastHandshake = Date.now();

    socket.on('vbo_update', function (data, handshake) {
        console.log('VBO update');

        var now = new Date().getTime();
        console.log('got VBO update message', now - lastHandshake, data.bufferByteLengths, data.elements, 'ms');

        var bufferNames = renderer.getActiveBufferNames(renderConfig);
        console.log('  Active buffers', bufferNames);

        var bufferVBOs = Rx.Observable.zipArray(bufferNames.map(fetchBuffer.bind('', data.bufferByteLengths))).take(1);

        bufferVBOs
            .subscribe(function (vbos) {

                console.log('Got VBOs:', vbos.length);
                var bindings = {};
                bufferNames.forEach(function (name, i) {
                    console.debug('Binding:', name, i);
                    bindings[name] = vbos[i];
                });

                console.log('got all VBO data', Date.now() - now, 'ms', bindings);
                socket.emit('received_buffers'); //TODO fire preemptitively based on guess

                try {
                    renderer.loadBuffers(gl, buffers, bindings);
                    renderer.setNumElements(data.elements);
                    renderer.render(renderConfig, gl, programs, buffers);

                    handshake(Date.now() - lastHandshake);
                    lastHandshake = Date.now();
                    meter.tick();
                } catch (e) {
                    ui.error('Render error on loading data into WebGL:', e, new Error().stack);
                }

            });
    });


    socket.on('error', meter.pause.bind(meter));
    socket.on('disconnect', meter.pause.bind(meter));

    //////

    return {
        //on events: error, disconnect
        socket: socket,

        camera: camera,
        disconnect: socket.disconnect.bind(socket),
        setCamera: renderer.setCamera.bind(renderer, renderConfig, gl, programs),

        //call to render with current camera
        renderFrame: function () {
            renderer.setCamera(renderConfig, gl, programs, camera);
            renderer.render(renderConfig, gl, programs, buffers);
        }
    };
}

module.exports = init;