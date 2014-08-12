"use strict";

var $            = require("jquery"),
    renderConfig = require("render-config"),
    renderer     = require("./renderer.js"),
    Cameras      = require("../../../../superconductorjs/src/Camera.js"),
    interaction  = require("./interaction.js"),
    ui           = require("./ui.js");


function init (canvas) {
    var camera = new Cameras.Camera2d({
            left: -0.15,
            right: 5,
            bottom: 5, // (5 * (1 / (700/700))) - 0.15,
            top: -0.15 // - 0.15
        });

    var socket = io.connect("http://localhost", {reconnection: false, transports: ["websocket"]});

    var gl = renderer.init(canvas);
    renderer.setGlOptions(gl, renderConfig.options);
    var programs = renderer.createPrograms(gl, renderConfig.programs);
    var buffers = renderer.createBuffers(gl, renderConfig.models);
    // var bufferSizes = {};
    renderer.setCamera(renderConfig, gl, programs, camera);

    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(renderConfig, gl, programs, newCamera);
            renderer.render(renderConfig, gl, programs, buffers);
        });

    var glBufferStoreSize = 0;
    var lastHandshake = Date.now();

    socket.on("vbo_update", function (data, handshake) {
        var elapsed = Date.now() - lastHandshake;
        console.log("got VBO update message", elapsed, "ms");


        // renderer.loadBuffer(gl, buffers.mainVBO, trimmedArray, data.numVertices <= glBufferStoreSize);
        // renderer.render(renderConfig, gl, programs, buffers, data.numVertices);

        // glBufferStoreSize = Math.max(glBufferStoreSize, data.numVertices);

        handshake(elapsed);
        lastHandshake = Date.now();
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
