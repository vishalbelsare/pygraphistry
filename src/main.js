"use strict";

var $            = require("jquery"),
    renderer     = require("./renderer.js"),
    Cameras      = require("../../../../superconductorjs/src/Camera.js"),
    ui           = require("./ui.js"),
    interaction  = require("./interaction.js");
// This needs to be its own 'var' declaration or Browserify/brfs won't parse it (bug)
var fs           = require("fs");



function init(canvas) {
    var gl = renderer.init(canvas);

    // These two fs.readFileSync() calls are replaced by string literals at compile-time by brfs
    var vertexShaderSource = fs.readFileSync("./src/sc_vert.shader", "utf8").toString("ascii");
    var fragmentShaderSource = fs.readFileSync("./src/sc_frag.shader", "utf8").toString("ascii");
    var program = renderer.loadProgram(gl, vertexShaderSource, fragmentShaderSource);

    var camera = new Cameras.Camera2d({
        left: -0.15,
        right: 5,
        bottom: 5, // (5 * (1 / (700/700))) - 0.15,
        top: -0.15 // - 0.15
    });
    renderer.setCamera(gl, program, camera);

    interaction.setupDrag($(".sim-container"), camera)
        .merge(interaction.setupScroll($(".sim-container"), camera))
        .subscribe(function(newCamera) {
            renderer.setCamera(gl, program, camera);
            renderer.render(gl);
        })


    var glBufferStoreSize = 0;
    var socket = io.connect("http://localhost", {reconnection: false, transports: ['websocket']});
    socket.on("vbo_update", function (data) {
        console.log("got VBO update message");

        renderer.loadBuffer(gl, data.buffer, data.numVertices <= glBufferStoreSize);
        renderer.render(gl, data.numVertices);

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