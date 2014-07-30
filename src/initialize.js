"use strict";

var renderConfig = require("../dist/render-config.sc.mod.js"),
    renderer     = require("./renderer.js"),
    ui           = require("./ui.js"),
    proxyUtils = require("./proxyutils.js");




// canvas * {camera2d, camera3d} * socket -> ()
// Bind remote renderer to canvas
function initialize(canvas, camera, socket) {

    if (!canvas || !camera || !socket) {
        var err = "need canvas/camera/socket";
        console.error(err, new Error().stack);
        throw new Error(err);
    }

    var gl = renderer.init(canvas);
    renderer.setGlOptions(gl, renderConfig.options);
    var programs = renderer.createPrograms(gl, renderConfig.programs);
    var buffers = renderer.createBuffers(gl, renderConfig.models);
    renderer.setCamera(gl, programs, camera);


    var glBufferStoreSize = 0;
    var lastHandshake = new Date().getTime();

    var lastData = null;

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
                    renderer.render(gl, programs, buffers, renderConfig, data.numVertices);

                    glBufferStoreSize = Math.max(glBufferStoreSize, data.numVertices);
                } catch (e) {
                    console.error("bah", e, new Error().stack);
                }
            };

            oReq.send(null);
        } catch (e) {
            console.error("bah", e, new Error().stack);
        }
    });

    socket.on("error", function(reason) {
        ui.error("Connection error (reason: " + reason + ")");
    });
    socket.on("disconnect", function(reason) {
        ui.error("Disconnected (reason: " + reason + ")");
    });

    return {
        gl: gl,
        programs: programs,
        buffers: buffers,
        renderFrame: function () {
            if (lastData) {
                renderer.setCamera(gl, programs, camera);
                renderer.render(gl, renderConfig, programs, buffers, lastData.numVertices);
            } else {
                console.warn("no data vbo yet");
            }
        }
    };
}

// canvas * {camera2d, camera3d} * ?socket -> ()
module.exports = initialize;