"use strict";

var _ = require("underscore");
var debug = require("debug")("StreamGL:renderer");

/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Internal helpers
////////////////////////////////////////////////////////////////////////////////


/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<string, Object.<string, GLint>>} */
var attrLocations = {};
/**
 * Wraps gl.getAttribLocation and caches the result, returning the cached result on subsequent
 * calls for the same attribute in the same program.
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {WebGLProgram} program - the program the attribute is part of
 * @param {string} programName - the name of the program
 * @param {string} attribute - the name of the attribute in the shader source code
 */
var getAttribLocationFast = function(gl, program, programName, attribute) {
    if(typeof attrLocations[programName] !== "undefined" &&
        typeof attrLocations[programName][attribute] !== "undefined") {
        debug("Get attribute %s: using fast path", attribute);
        return attrLocations[programName][attribute];
    }

    debug("Get attribute %s: using slow path", attribute);
    attrLocations[programName] = attrLocations[programName] || {};
    attrLocations[programName][attribute] = gl.getAttribLocation(program, attribute);
    return attrLocations[programName][attribute];
};


/** The program currently in use by GL
 * @type {?WebGLProgram} */
var activeProgram = null;
var useProgram = function(gl, program) {
    if(activeProgram !== program) {
        debug("Use program: on slow path");
        gl.useProgram(program);
        activeProgram = program;
        return true;
    }
    debug("Use program: on fast path");

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
 * @type {Object.<string, RendererOptions.render.bindings>} */
var programBindings = {};
/**
 * Binds all of a programs attributes to elements of a/some buffer(s)
 * @param {WebGLRenderingContext} gl - the WebGL context containing the program and buffers
 * @param {WebGLProgram} program - The WebGL program to bind
 * @param {Object} bindings - The config settings object for this program's bindings
 * @param {Object.<string, WebGLBuffer>} buffers - Mapping of created buffer names to WebGL buffers
 * @param {Object} modelSettings - The "models" object from the rendering config
 */
var bindProgram = function(gl, program, programName, bindings, buffers, modelSettings) {
    useProgram(gl, program);

    // FIXME: If we don't rebind every frame, but bind another program, then the bindings of the
    // first program are lost. Shouldn't they persist unless we change them for the program?
    // If the program is already bound using the current binding preferences, no need to continue
    //if(programBindings[programName] === bindings) {
        //debug("Not binding program %s because already bound", programName);
        //return false;
    //}
    debug("Binding program %s", programName);

    _.each(bindings, function(binding, attribute) {
        bindBuffer(gl, buffers[binding[0]]);

        var element = modelSettings[binding[0]][binding[1]];
        var location = getAttribLocationFast(gl, program, programName, attribute);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
            element.stride, element.offset);

        gl.enableVertexAttribArray(location);

        programBindings[programName] = bindings;
    });
};


/** A dictionary mapping buffer names to current sizes
 * @type {Object.<string, number>} */
var bufferSizes = {};


////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////


exports.numVertices = 0;


exports.createContext = function(canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var gl = null;
    gl = canvas.getContext("webgl", {antialias: true, premultipliedAlpha: false});
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
        debug("Compiling program %s", programName);
        var program = gl.createProgram();

        //// Create, compile and attach the shaders
        var vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, programOptions.sources.vertex);
        gl.compileShader(vertShader);
        if(!(gl.isShader(vertShader) && gl.getShaderParameter(vertShader, gl.COMPILE_STATUS))) {
            throw new Error("Could not compile shader. Log: '" + gl.getShaderInfoLog(vertShader) +
                "'\nSource:\n" + programOptions.sources.vertex);
        }
        gl.attachShader(program, vertShader);

        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, programOptions.sources.fragment);
        gl.compileShader(fragShader);
        if(!(gl.isShader(fragShader) && gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))) {
            throw new Error("Could not compile shader. Log: '" + gl.getShaderInfoLog(fragShader) +
                "'\nSource:\n" + programOptions.sources.fragment);
        }
        gl.attachShader(program, fragShader);

        //// Link and validate the program
        gl.linkProgram(program);
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Could not link program '" + programName + "'. Log:\n" +
                gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            throw new Error("Could not link GL program '" + programName + "'");
        }

        gl.validateProgram(program);
        if(!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
            console.error(gl.getProgramParameter(program, gl.VALIDATE_STATUS));
            throw new Error("Could not validate GL program '" + programName + "'");
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


/**
 * Given an object mapping buffer names to ArrayBuffer data, load all of them into the GL context
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {Object.<string, WebGLBuffer>} buffers - the buffer object returned by createBuffers()
 * @param {Object.<string, ArrayBuffer>} bufferData - a mapping of buffer name -> new data to load
 * into that buffer
 */
exports.loadBuffers = function(gl, buffers, bufferData) {
    _.each(bufferData, function(data, bufferName) {
        debug("Loading buffer data for buffer %s (data type: %s, length: %s bytes)",
            bufferName, data.constructor.name, data.byteLength);

        if(typeof buffers[bufferName] === "undefined") {
            console.error("Asked to load data for buffer '%s', but no buffer by that name exists locally",
                bufferName);
            return false;
        }

        exports.loadBuffer(gl, buffers[bufferName], bufferName, data);
    });
};


exports.loadBuffer = function(gl, buffer, bufferName, data) {
    bindBuffer(gl, buffer);

    if(typeof bufferSizes[bufferName] === "undefined") {
        bufferSizes[bufferName] = 0;
    }
    if(data.byteLength <= 0) {
        debug("Warning: asked to load data for buffer '%s', but data length is 0", bufferName);
        return;
    }

    try{
        if(bufferSizes[bufferName] >= data.byteLength) {
            debug("Reusing existing GL buffer data store to load data for buffer %s (current size: %d, new data size: %d)",
                bufferName, bufferSizes[bufferName], data.byteLength);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        } else {
            debug("Creating new buffer data store for buffer %s (new size: %d)",
                bufferName, data.byteLength);
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
