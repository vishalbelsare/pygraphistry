"use strict";

/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<WebGLProgram, Object.<string, GLint>} */
var attrLocations = {};
/** The bindings object currently in effect on a program
 * @type {Object.<WebGLProgram, RendererOptions.render.bindings>} */
var programBindings = {};
/** The program currently in use by GL
 * @type {?WebGLProgram} */
var activeProgram = null;
/** The currently bound buffer in GL
 * @type {?WebGLBuffer} */
var boundBuffer = null;


function forOwnProperties(obj, cb) {
    for(var prop in obj) {
        if(!obj.hasOwnProperty(prop)) {
            continue;
        }
        cb(obj[prop], prop, obj);
    }
}


/**
 * Wraps gl.getAttribLocation and caches the result, returning the cached result on subsequent
 * calls for the same attribute in the same program.
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


var bindProgram = function(gl, program, bindings, buffers, bufferOptions) {
    if(activeProgram !== program) {
        gl.useProgram(activeProgram = program);
    }

    // If the program is already bound using the current binding preferences, no need to continue
    if(programBindings[program] === bindings) {
        return false;
    }

    // For each attribute in the program's bindings
    forOwnProperties(bindings, function(attributeBinding, attributeName) {
        var buffer = buffers[attributeBinding.buffer];
        if(boundBuffer !== buffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            boundBuffer = buffer;
        }

        var element = bufferOptions[attributeBinding.buffer].elements[attributeBinding.element];
        var location = getAttribLocationFast(gl, program, attributeName);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
            element.stride, element.offset);
    });
};



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


exports.setGlOptions = function(gl, options) {
    var glOptionFunctionWhitelist = {
        "enable": true,
        "disable": true,
        "blendFuncSeparate": true,
        "blendEquationSeparate": true,
        "depthFunc": true,
        "clearColor": true,
        "lineWidth": true
    };

    // for(var optionName in options) {
    forOwnProperties(options, function(optionCalls, optionName) {
        if(glOptionFunctionWhitelist[optionName] !== true ||
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
    forOwnProperties(programs, function(programOptions, programName) {
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

    for(var bufferName in buffers) {
        if(!buffers.hasOwnProperty(bufferName)) { continue; }
        var vbo = gl.createBuffer();
        createdBuffers[bufferName] = vbo;
    }

    return createdBuffers;
};


exports.loadBuffer = function(gl, buffer, data, reuseBuffer) {
    gl.flush();

    if(boundBuffer !== buffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        boundBuffer = buffer;
    }

    if(reuseBuffer === true) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    } else {
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    }
};


exports.setCamera = function(gl, programs, camera) {
    forOwnProperties(programs, function(program) {
        if(activeProgram !== program) {
            gl.useProgram(activeProgram = program);
        }

        var mvpLoc = gl.getUniformLocation(program, "u_mvp_matrix");
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
};


exports.render = function(gl, options, programs, buffers, numVertices) {
    exports.numVertices = typeof numVertices !== "undefined" ? numVertices : exports.numVertices;
    if(exports.numVertices < 1) {
        return false;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    forOwnProperties(options.render, function(renderOptions) {
        bindProgram(gl, programs[renderOptions.program], renderOptions.bindings, buffers, options.buffers);
        gl.drawArrays(gl[renderOptions.drawType], 0, exports.numVertices);
        // TODO: Disable vertex attributes when we're done?
    });

    gl.flush();
};