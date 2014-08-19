"use strict";

var _ = require("underscore");

/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Internal helpers
////////////////////////////////////////////////////////////////////////////////


/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<WebGLProgram, Object.<string, GLint>>} */
var attrLocations = {};
/**
 * Wraps gl.getAttribLocation and caches the result, returning the cached result on subsequent
 * calls for the same attribute in the same program.
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {WebGLProgram} program - the program the attribute is part of
 * @param {string} attribute - the name of the attribute in the shader source code
 */
var getAttribLocationFast = function(gl, program, attribute) {
    if(typeof attrLocations[program] !== "undefined" &&
        typeof attrLocations[program][attribute] !== "undefined") {
        return attrLocations[program][attribute];
    }

    attrLocations[program] = attrLocations[program] || {};
    attrLocations[program][attribute] = gl.getAttribLocation(program, attribute);
    return attrLocations[program][attribute];
};


/** The program currently in use by GL
 * @type {?WebGLProgram} */
var activeProgram = null;
var useProgram = function(gl, program) {
    if(activeProgram !== program) {
        gl.useProgram(program);
        activeProgram = program;
        return true;
    }

    return false;
};


/** The currently bound buffer in GL
 * @type {?WebGLBuffer} */
var boundBuffer = null;
var bindBuffer = function(gl, buffer) {
    if(boundBuffer !== buffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        boundBuffer = buffer;
        return true;
    }
    return false;
};


/** The bindings object currently in effect on a program
 * @type {Object.<WebGLProgram, RendererOptions.render.bindings>} */
var programBindings = {};
/**
 * Binds all of a programs attributes to elements of a/some buffer(s)
 * @param {WebGLRenderingContext} gl - the WebGL context containing the program and buffers
 * @param {WebGLProgram} program - The WebGL program to bind
 * @param {Object} bindings - The config settings object for this program's bindings
 * @param {Object.<string, WebGLBuffer>} buffers - Mapping of created buffer names to WebGL buffers
 * @param {Object} modelSettings - The "models" object from the rendering config
 */
var bindProgram = function(gl, program, bindings, buffers, modelSettings) {
    useProgram(gl, program);

    // If the program is already bound using the current binding preferences, no need to continue
    if(programBindings[program] === bindings) { return false; }

    _.each(bindings, function(binding, attribute) {
        bindBuffer(gl, buffers[binding[0]]);

        var element = modelSettings[binding[0]][binding[1]];
        var location = getAttribLocationFast(gl, program, attribute);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
            element.stride, element.offset);
    });
};


/** A dictionary mapping buffer names to current sizes
 * @type {Object.<string, number>} */
var bufferSizes = {};


////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////


exports.numVertices = 0;


exports.init = function(canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var gl = null;
    gl = canvas.getContext("webgl", {antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true});
    if(gl === null) { throw new Error("Could not initialize WebGL"); }

    gl.viewport(0, 0, canvas.width, canvas.height);

    return gl;
};


/**
 * Set global GL settings
 * @param {WebGLRenderingContext}
 */
exports.setGlOptions = function(gl, options) {
    var whiteList = {
        "enable": true,
        "disable": true,
        "blendFuncSeparate": true,
        "blendEquationSeparate": true,
        "depthFunc": true,
        "clearColor": true,
        "lineWidth": true
    };

    // for(var optionName in options) {
    _.each(options, function(optionCalls, optionName) {
        if(whiteList[optionName] !== true ||
            typeof gl[optionName] !== "function") {
            return;
        }

        optionCalls.forEach(function(optionArgs) {
            var newArgs = optionArgs.map(function(currentValue) {
                return typeof currentValue === "string" ? gl[currentValue] : currentValue;
            });

            gl[optionName].apply(gl, newArgs);
        });
    });
};


exports.createPrograms = function(gl, programs) {
    var createdPrograms = {};

    // for(var programName in programs) {
    _.each(programs, function(programOptions, programName) {
        var program = gl.createProgram();

        //// Create, compile and attach the shaders
        var vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, programOptions.sources.vertex);
        gl.compileShader(vertShader);
        if(!(gl.isShader(vertShader) && gl.getShaderParameter(vertShader, gl.COMPILE_STATUS))) {
            throw new Error("Could not compile shader. Log: " + gl.getShaderInfoLog(vertShader));
        }
        gl.attachShader(program, vertShader);

        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, programOptions.sources.fragment);
        gl.compileShader(fragShader);
        if(!(gl.isShader(fragShader) && gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))) {
            throw new Error("Could not compile shader. Log: " + gl.getShaderInfoLog(fragShader));
        }
        gl.attachShader(program, fragShader);

        //// Link and validate the program
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

        //// Activate all the program's attributes as vertex attribute arrays
        for(var i = 0; i < programOptions.attributes.length; i++) {
            var location = getAttribLocationFast(gl, program, programOptions.attributes[i]);
            gl.enableVertexAttribArray(location);
        }

        createdPrograms[programName] = program;
    });

    return createdPrograms;
};


exports.createBuffers = function(gl, buffers) {
    var createdBuffers = {};

    _.each(buffers, function(bufferOpts, bufferName) {
        var vbo = gl.createBuffer();
        createdBuffers[bufferName] = vbo;
    });

    return createdBuffers;
};



exports.loadBuffer = function(gl, buffer, data, bufferName) {
    gl.flush();
    bindBuffer(gl, buffer);

    if(typeof bufferSizes[bufferName] === "undefined") {
        bufferSizes[bufferName] = 0;
    }

    if(data.byteLength <= 0) {
        return;
    }

    try{
        if(bufferSizes[bufferName] >= data.byteLength) {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
            bufferSizes[bufferName] = data.byteLength;
        }
    } catch(glErr) {
        // This often doesn't get called on GL errors, since they seem to be thrown from the global
        // WebGL context, not at the point we call the command (above).
        console.error("Error: could not load data into buffer", bufferName, ". Error:", glErr);
        throw glErr;
    }
};


exports.setCamera = function(config, gl, programs, camera) {
    _.each(config.programs, function(programConfig, programName) {
        var program = programs[programName];
        useProgram(gl, program);

        var mvpLoc = gl.getUniformLocation(program, programConfig.camera);
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
};


exports.render = function(config, gl, programs, buffers, numVertices) {
    exports.numVertices = typeof numVertices !== "undefined" ? numVertices : exports.numVertices;
    if(exports.numVertices < 1) {
        return false;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    _.each(config.scene.render, function(target) {
        var renderItem = config.scene.items[target];
        bindProgram(gl, programs[renderItem.program], renderItem.bindings, buffers, config.models);
        gl.drawArrays(gl[renderItem.drawType], 0, exports.numVertices);
    });

    gl.flush();
};
