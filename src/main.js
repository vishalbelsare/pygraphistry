"use strict";

/*
    Client networking layer for connecting a local canvas to remote layout engine
*/

var debug        = require("debug")("StreamGL:main");

var renderConfig = require("render-config"),
    renderer     = require("./renderer.js"),
    interaction  = require("./interaction.js"),
    ui           = require("./ui.js"),
    proxyUtils = require('./proxyutils.js');


//DOM * ?{?meter, ?camera, ?socket} ->
//  {
//      renderFrame: () -> (),
//      setCamera: camera -> (),
//      disconnect: () -> (),
//      socket
//  }
function init (canvas, opts) {
    opts = opts || {};

    console.log('connected')

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    var meter = opts.meter || {tick: function(){}, pause: function(){}};

    var socket = opts.socket;
    if (!socket) {
        socket = io.connect("http://localhost", {reconnection: false, transports: ["websocket"]});
        socket.io.engine.binaryType = "arraybuffer";
    } else if (!socket.io || !socket.io.engine || !(socket.io.engine == 'arraybuffer')) {
        console.warn('Expected binary socket');
    }

    var renderState = renderer.init(renderConfig, canvas, opts);
    var gl = renderState.get("gl");
    var programs = renderState.get("programs").toJS();
    var buffers = renderState.get("buffers").toJS();
    var camera = renderState.get("camera");

    var disconnect = socket.disconnect.bind(socket);

    var lastHandshake = Date.now();

    socket.on("vbo_update", function (data, handshake) {
        console.log("VBO update");

        var now = new Date().getTime();
        console.log("got VBO update message", now - lastHandshake, "ms");

        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open("GET", "http://localhost:" + proxyUtils.BINARY_PORT + "/vbo", true);
        oReq.responseType = "arraybuffer";

        oReq.onload = function () {
            try {
                console.log("got VBO data", Date.now() - now, "ms");

                var arrayBuffer = oReq.response; // Note: not oReq.responseText
                var trimmedArray = new Uint8Array(
                    arrayBuffer,
                    0,
                    data.numVertices * (3 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT));

                renderer.loadBuffers(gl, buffers, {mainVBO: trimmedArray.buffer});
                renderer.setNumElements(data.elements);
                renderer.render(renderConfig, gl, programs, buffers);

                handshake(Date.now() - lastHandshake);
                lastHandshake = Date.now();
                meter.tick();

            } catch (e) {
                ui.error("Render error on loading data into WebGL:", e, new Error().stack);
            }
        };

        oReq.send(null);
    });


    socket.on("error", function(reason) {
        meter.pause();
    });
    socket.on("disconnect", function(reason){
        meter.pause();
    });

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