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
        });

    var glBufferStoreSize = 0;
    var socket = io.connect("http://localhost", {reconnection: false, transports: ['websocket']});

    var lastHandshake = new Date().getTime();
    socket.on("vbo_update", function (data, handshake) {
        var now = new Date().getTime();
        console.log("got VBO update message", now - lastHandshake, "ms");
        lastHandshake = now;


        //https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Sending_and_Receiving_Binary_Data?redirectlocale=en-US&redirectslug=DOM%2FXMLHttpRequest%2FSending_and_Receiving_Binary_Data
        var oReq = new XMLHttpRequest();
        oReq.open("GET", "http://localhost:1337/vbo", true);
        oReq.responseType = "arraybuffer";
        oReq.onload = function (oEvent) {
            var gotCompressedVBO = new Date().getTime();
            console.log("got VBO data", gotCompressedVBO - now, "ms");

            handshake(now - lastHandshake);

            var arrayBuffer = oReq.response; // Note: not oReq.responseText
            //var byteArray = new Uint8Array(arrayBuffer);
            var trimmedArray = new Uint8Array(
                arrayBuffer,
                0,
                data.numVertices * (3 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint8Array.BYTES_PER_ELEMENT));

            renderer.loadBuffer(gl, trimmedArray, data.numVertices <= glBufferStoreSize);
            renderer.render(gl, data.numVertices);
            glBufferStoreSize = Math.max(glBufferStoreSize, data.numVertices);
        };
        oReq.send(null);
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