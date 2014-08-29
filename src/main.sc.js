"use strict";

var $            = require("jquery"),
    renderConfig = require("render-config"),
    renderer     = require("./renderer.js"),
    Cameras      = require("../../../../superconductorjs/src/Camera.js"),
    interaction  = require("./interaction.js"),
    proxyUtils   = require("./proxyutils.js"),
    ui           = require("./ui.js");


// global["debugjs"] = require("debug");


function init (canvas) {

    var camera = new Cameras.Camera2d({
            left: -0.15,
            right: 5,
            bottom: 5, // (5 * (1 / (700/700))) - 0.15,
            top: -0.15 // - 0.15
        });

    var socket = io.connect("http://localhost:" + proxyUtils.MAIN_PORT,
        {reconnection: false, transports: ["websocket"]});

    var gl = renderer.init(canvas);
    renderer.setGlOptions(gl, renderConfig.options);
    var programs = renderer.createPrograms(gl, renderConfig.programs);
    var buffers = renderer.createBuffers(gl, renderConfig.models);
    renderer.setCamera(renderConfig, gl, programs, camera);

    var glBufferStoreSize = 0;
    var lastHandshake = new Date().getTime();
    var lastData = null;


    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(renderConfig, gl, programs, newCamera);
            renderer.render(renderConfig, gl, programs, buffers);
    });

    socket.on("vbo_update", function (data, handshake) {
        lastData = data;
        try {
            var now = new Date().getTime();
            console.log("got VBO update message", now - lastHandshake, "ms");

            //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
            var oReq = new XMLHttpRequest();
            oReq.open("GET", "http://localhost:" + proxyUtils.BINARY_PORT + "/vbo", true);
            oReq.responseType = "arraybuffer";

            oReq.onload = function () {
                try {
                    console.log("got VBO data", Date.now() - now, "ms");
                    handshake(Date.now() - now);
                    lastHandshake = Date.now();

                    var arrayBuffer = oReq.response; // Note: not oReq.responseText
                    var trimmedArray = new Uint8Array(
                        arrayBuffer,
                        0,
                        data.numVertices * (3 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT));

                    renderer.loadBuffer(gl, buffers.mainVBO, trimmedArray, data.numVertices <= glBufferStoreSize);
                    renderer.render(renderConfig, gl, programs, buffers, data.numVertices);

                    glBufferStoreSize = Math.max(glBufferStoreSize, data.numVertices);
                } catch (e) {
                    console.error("Error loading data into WebGL:", e, new Error().stack);
                }
            };

            oReq.send(null);
        } catch (e) {
            console.error("Error retrieving WebGL buffer data from server:", e, new Error().stack);
        }
    });

    socket.on("error", function(reason) {
        ui.error("Connection error (reason: " + reason + ")");
    });
    socket.on("disconnect", function(reason) {
        ui.error("Disconnected (reason: " + reason + ")");
    });
}

window.addEventListener("load", function(){
    init($("#simulation")[0]);
});
