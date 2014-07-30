"use strict";

var $            = require("jquery"),
    renderConfig = require("render-config"),
    renderer     = require("./renderer.js"),
    Cameras      = require("../../../../superconductorjs/src/Camera.js"),
    interaction  = require("./interaction.js"),
    initialize   = require("./initialize.js"),
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

    var binding = initialize(canvas, camera, socket, renderConfig);


    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(renderConfig, binding.gl, binding.programs, newCamera);
            renderer.render(renderConfig, binding.gl, binding.programs, binding.buffers);
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
