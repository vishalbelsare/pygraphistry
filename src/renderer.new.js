"use strict";


var setGlOptions = function(gl, options) {
    var glOptionFunctionWhitelist = {
        "enable": true,
        "disable": true,
        "blendFuncSeparate": true,
        "blendEquationSeparate": true,
        "depthFunc": true,
        "clearColor": true,
        "lineWidth": true
    };

    for(var optionName in options) {
        if(!options.hasOwnProperty(optionName) ||
            glOptionFunctionWhitelist[optionName] !== true ||
            typeof gl[optionName] !== "function") {
            continue;
        }

        for(var optionArgs in options[optionName]) {
            var newArgs = options[optionName][optionArgs].map(function(currentValue) {
                return typeof currentValue === "string" ? gl[currentValue] : currentValue;
            });
            gl[optionName].apply(gl, newArgs);
        }
    }
};


function forOwnProperties(obj, cb) {
    for(var prop in obj) {
        if(!obj.hasOwnProperty(prop)) {
            continue;
        }
        cb(obj[prop], prop, obj);
    }
}


var createPrograms = function(gl, programs) {
    var createdPrograms = {};

    for(var programName in programs) {
        if(!programs.hasOwnProperty(programName)) { continue; }
        var programOptions = programs[programName];

        var program = gl.createProgram();

        var vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, programOptions.sources.vertex);
        gl.compileShader(vertShader);
        if(!gl.isShader(vertShader)) {throw new Error("Could not compile shader"); }
        gl.attachShader(program, vertShader);

        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, programOptions.sources.fragment);
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

        createPrograms[programName] = program;
    }

    return createPrograms;
};


var createBuffers = function(gl, buffers) {
    var createdBuffers = {};

    for(var bufferName in buffers) {
        if(!buffers.hasOwnProperty(bufferName)) { continue; }
        var vbo = gl.createBuffer();
        createdBuffers[bufferName] = vbo;
    }

    return createdBuffers;
};


/**
 * Wraps gl.getAttribLocation and caches the result, returning the cached result on subsequent
 * calls for the same attribute in the same program.
 */
var getAttribLocationFast = (function() {
    var attrLocations = {};

    return function(gl, program, attribute) {
        if(typeof attrLocations[program] !== "undefined" &&
            typeof attrLocations[program][attribute] !== "undefined") {
            return attrLocations[program][attribute];
        }

        attrLocations[program] = attrLocations[program] || {};
        return attrLocations[program][attribute] = gl.getAttribLocation(program.glProgram, attribute);
    };
})();


var setCamera = function(gl, programs, camera) {
    forOwnProperties(programs, function(program) {
        gl.useProgram(program);
        var mvpLoc = gl.getUniformLocation(program, "u_mvp_matrix");
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
};


var bindVertexAttrib = function(gl, bindings, program, buffers, bufferOptions) {
    // TODO: Don't re-bind attributes if not necessary (what invalidates/changes vertex attribs?)
    forOwnProperties(bindings, function(binding, attributeName) {
        var buffer = buffers[binding.buffer];
        var element = bufferOptions[buffer].elements[binding.element];

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        var location = getAttribLocationFast(gl, program, attributeName);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, element.elements, gl[element.type],
            element.normalize, element.stride, element.offset);
    });
};


var render = function(gl, options, programs, buffers, bufferSizes) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    forOwnProperties(options.render, function(renderOptions) {
        var program = programs[renderOptions.program];
        gl.useProgram(program);

        bindVertexAttrib(gl, renderOptions.bindings, program, buffers, options.buffers);

        // TODO: Some way to relate this program to bufferSizes, so we can bail if <= 0 and so we
        // know the number of elements to render in gl.drawArrays
        gl.drawArrays(gl[renderOptions.drawType], 0, 0);

        // TODO: Disable vertex attributes when we're done?
    })

    gl.flush();
};


module.exports = {
    setGlOptions: setGlOptions,
    createPrograms: createPrograms,
    createBuffers: createBuffers,
    setCamera: setCamera,
    render: render
};