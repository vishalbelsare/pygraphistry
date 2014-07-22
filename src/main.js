"use strict";

var $            = require("jquery"),
    renderer     = require("./renderer.js"),
    Cameras      = require("../../../../superconductorjs/src/Camera.js"),
    ui           = require("./ui.js"),
    interaction  = require("./interaction.js");

// global["debugjs"] = require("debug");


function init(canvas) {
    var gl = renderer.init(canvas);

    var programs = renderer.loadProgram(gl);
    var buffers = renderer.createBuffers(gl);

    var camera = new Cameras.Camera2d({
        left: -0.15,
        right: 5,
        bottom: 5, // (5 * (1 / (700/700))) - 0.15,
        top: -0.15 // - 0.15
    });
    renderer.setCamera(gl, programs, camera);
    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(gl, programs, newCamera);
            renderer.render(gl, programs, buffers);
        });


    var glBufferStoreSize = 0;

    var socket = io.connect("http://localhost", {reconnection: false, transports: ["websocket"]});

    var lastHandshake = new Date().getTime();
    socket.on("vbo_update", function (data, handshake) {
        var now = new Date().getTime();
        handshake(now - lastHandshake);
        console.log("got VBO update message", now - lastHandshake, "ms");
        lastHandshake = now;

        renderer.loadBuffer(gl, buffers.mainVBO, data.buffer, data.numVertices <= glBufferStoreSize);
        renderer.render(gl, programs, buffers, data.numVertices);

        glBufferStoreSize = Math.max(glBufferStoreSize, data.numVertices);
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