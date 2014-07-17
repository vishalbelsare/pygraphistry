"use strict";

exports.numVertices = 0;

exports.init = function(canvas) {
    // var canvas = canvas;

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var gl = canvas.getContext("webgl", {antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true});
    if(gl === null) { throw new Error("Could not initialize WebGL"); }

    // Set up WebGL settings
    gl.enable(gl.BLEND);
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 1.0);
    // Lines should be 1px wide
    gl.lineWidth(1);

    gl.viewport(0, 0, canvas.width, canvas.height);

    return gl;
};


exports.loadProgram = function(gl, vertexSource, fragmentSource) {
    var program = gl.createProgram();

    var vertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShader, vertexSource);
    gl.compileShader(vertShader);
    if(!gl.isShader(vertShader)) {throw new Error("Could not compile shader"); }
    gl.attachShader(program, vertShader);

    var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, fragmentSource);
    gl.compileShader(fragShader);
    if(!gl.isShader(fragShader)) {throw new Error("Could not compile shader"); }
    gl.attachShader(program, fragShader);


    gl.linkProgram(program);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Could not link program. " + gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        throw new Error("Could not link GL program");
    }

    gl.validateProgram(program);
    if(!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error(gl.getProgramParameter(program, gl.VALIDATE_STATUS));
        throw new Error("Could not validate GL program");
    }
    gl.useProgram(program);

    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    var posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 16, 0);

    var colorLoc = gl.getAttribLocation(program, "a_color");
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.UNSIGNED_BYTE, true, 16, 12);

    return program;
};


exports.loadBuffer = function(gl, buffer, reuseBuffer) {
    gl.flush();

    if(reuseBuffer === true) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer);
    } else {
        gl.bufferData(gl.ARRAY_BUFFER, buffer, gl.STREAM_DRAW);
    }
};


exports.setCamera = function(gl, program, camera) {
    var mvpLoc = gl.getUniformLocation(program, "u_mvp_matrix");
    gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
};


exports.render = function(gl, numVertices) {
    if(typeof numVertices !== "undefined") {
        exports.numVertices = numVertices;
    }
    if(exports.numVertices < 1) {
        return false;
    }

    gl.finish();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, exports.numVertices );

    var error = gl.getError();
    if(error !== gl.NONE) {
        console.error("WebGL error detected after rendering: " + error);
    }

    gl.finish();
};