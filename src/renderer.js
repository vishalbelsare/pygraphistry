"use strict";


var newRenderer = require("./renderer.new.js");
var scOptions = require("render-config");

exports.numVertices = 0;

exports.init = function(canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var gl = null;
    gl = canvas.getContext("webgl", {antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true});
    if(gl === null) { throw new Error("Could not initialize WebGL"); }

    gl.viewport(0, 0, canvas.width, canvas.height);

    newRenderer.setGlOptions(gl, scOptions.glOptions);

    return gl;
};


exports.loadProgram = function(gl) {
    var programs = newRenderer.createPrograms(gl, scOptions.programs);
    // var program = programs.main;

    // gl.useProgram(program);

    // var buffers = newRenderer.createBuffers(gl, scOptions.buffers);
    // var vbo = buffers["mainVBO"];

    // gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    // var posLoc = gl.getAttribLocation(program, "a_position");
    // gl.enableVertexAttribArray(posLoc);
    // gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 16, 0);

    // var colorLoc = gl.getAttribLocation(program, "a_color");
    // gl.enableVertexAttribArray(colorLoc);
    // gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 16, 12);

    return programs;
};


exports.createBuffers = function(gl) {
    return newRenderer.createBuffers(gl, scOptions.buffers);
};


exports.loadBuffer = function(gl, buffer, data, reuseBuffer) {
    gl.flush();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    if(reuseBuffer === true) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    } else {
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    }
};


exports.setCamera = function(gl, programs, camera) {
    newRenderer.setCamera(gl, programs, camera);
};


exports.render = function(gl, programs, buffers, numVertices) {
    exports.numVertices = typeof numVertices !== "undefined" ? numVertices : exports.numVertices;
    if(exports.numVertices < 1) {
        return false;
    }

    newRenderer.render(gl, scOptions, programs, buffers, exports.numVertices);

    // gl.finish();
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // gl.drawArrays(gl.TRIANGLE_STRIP, 0, exports.numVertices );

    // if(gl.getError() !== gl.NONE) {console.error("WebGL error detected after rendering:",error);}
    // gl.finish();
};