'use strict';

var _           = require('underscore'),
    Immutable   = require('immutable'),
    debug       = require('debug')('StreamGL:renderer');


var Cameras     = require('../../../../superconductorjs/src/Camera.js');

/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Globals across renderer instances
////////////////////////////////////////////////////////////////////////////////

//keyed on instancing: 1 -> vertex, 2 -> line, 3 -> triangle, ...
//[ Uint32Array ]
var indexHostBuffers = [];
//[ glBuffer ]
var indexGlBuffers = [];


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
function getAttribLocationFast(gl, program, programName, attribute) {
    if(typeof attrLocations[programName] !== 'undefined' &&
        typeof attrLocations[programName][attribute] !== 'undefined') {
        debug('  Get attribute %s: using fast path', attribute);
        return attrLocations[programName][attribute];
    }

    debug('  Get attribute %s: using slow path', attribute);
    attrLocations[programName] = attrLocations[programName] || {};
    attrLocations[programName][attribute] = gl.getAttribLocation(program, attribute);
    return attrLocations[programName][attribute];
}


/** The program currently in use by GL
 * @type {?WebGLProgram} */
var activeProgram = null;
function useProgram(gl, program) {
    if(activeProgram !== program) {
        debug('Use program: on slow path');
        gl.useProgram(program);
        activeProgram = program;
        return true;
    }
    debug('Use program: on fast path');

    return false;
}


/** The currently bound buffer in GL
 * @type {?WebGLBuffer} */
var boundBuffer = null;
function bindBuffer(gl, buffer) {
    if(boundBuffer !== buffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        boundBuffer = buffer;
        return true;
    }
    return false;
}


/** The bindings object currently in effect on a program
 * @type {Object.<string, RendererOptions.render.bindings>} */
var programBindings = {};
/**
 * Binds all of a programs attributes to elements of a/some buffer(s)
 * @param {WebGLRenderingContext} gl - the WebGL context containing the program and buffers
 * @param {WebGLProgram} program - The WebGL program to bind
 * @param {Object} bindings - The config settings object for this program's bindings
 * @param {Object.<string, WebGLBuffer>} buffers - Mapping of created buffer names to WebGL buffers
 * @param {Object} modelSettings - The 'models' object from the rendering config
 */
function bindProgram(gl, program, programName, bindings, buffers, modelSettings) {
    useProgram(gl, program);

    // FIXME: If we don't rebind every frame, but bind another program, then the bindings of the
    // first program are lost. Shouldn't they persist unless we change them for the program?
    // If the program is already bound using the current binding preferences, no need to continue
    //if(programBindings[programName] === bindings) {
        //debug('Not binding program %s because already bound', programName);
        //return false;
    //}
    debug('Binding program %s', programName);

    _.each(bindings, function(binding, attribute) {

        var element = modelSettings[binding[0]][binding[1]];
        var datasource = element.datasource || 'SERVER';
        var glBuffer =
              datasource === 'SERVER'       ? buffers[binding[0]]
            : datasource === 'VERTEX_INDEX' ? indexGlBuffers[1]
            : datasource === 'EDGE_INDEX'   ? indexGlBuffers[2]
            : (function () { throw new Error('unknown datasource ' + datasource); }());

        debug('  bound buffer', attribute, binding, datasource, glBuffer, element.name);

        bindBuffer(gl, glBuffer);
        var location = getAttribLocationFast(gl, program, programName, attribute);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
            element.stride, element.offset);

        gl.enableVertexAttribArray(location);

        programBindings[programName] = bindings;
    });
}


/** A dictionary mapping buffer names to current sizes
 * @type {Object.<string, number>} */
var bufferSizes = {};


////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////

//opts : {?camera}
function init(config, canvas, opts) {
    config = Immutable.fromJS(config);

    var state = Immutable.Map({
        config: config,

        gl: undefined,
        programs:       Immutable.Map({}),
        buffers:        Immutable.Map({}),
        camera: undefined,

        //{item -> gl obj}
        textures:       Immutable.Map({}),
        fbos:           Immutable.Map({}),
        renderBuffers:  Immutable.Map({}),
        pixelreads:     {},

        boundBuffer: undefined,
        bufferSize: Immutable.Map({}),
        numElements: Immutable.Map({}),

        activeProgram: undefined,
        attrLocations: Immutable.Map({}),
        programBindings: Immutable.Map({}),

        activeIndices:  getActiveIndices(config)
    });

    debug('Active indices', state.get('activeIndices'));

    var gl = createContext(canvas);
    state = state.set('gl', gl);

    setGlOptions(state);

    state = createPrograms(state);
    state = createBuffers(state);

    var camera = (opts||{}).camera || new Cameras.Camera2d(config.get('camera').get('init').get(0).toJS());
    setCamera(config.toJS(), gl, state.get('programs').toJS(), camera);
    state = state.set('camera', camera);

    var renderTargets = createRenderTargets(config, canvas, gl);
    _.pairs(renderTargets).forEach(function (pair) {
        state = state.set(pair[0], pair[1]);
    });

    return state;
}


function createContext(canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    var gl = null;
    gl = canvas.getContext('webgl', {antialias: true, premultipliedAlpha: false});
    if(gl === null) { throw new Error('Could not initialize WebGL'); }

    gl.viewport(0, 0, canvas.width, canvas.height);

    return gl;
}

//create for each item with a texture rendertarget, an offscreen fbo, texture, renderbuffer, and host buffer
function createRenderTargets(config, canvas, gl) {

    var neededTextures = _.keys(config.get('textures').toJS());


    var textures      = neededTextures.map(gl.createTexture.bind(gl)),
        fbos          = neededTextures.map(gl.createFramebuffer.bind(gl)),
        renderBuffers = neededTextures.map(gl.createRenderbuffer.bind(gl)),
        pixelreads    = neededTextures.map(
                function () { return new Uint8Array(canvas.width * canvas.height * 4); });

    //bind
    _.zip(textures, fbos, renderBuffers)
        .forEach(function (pair) {
            var texture     = pair[0],
                fbo         = pair[1],
                renderBuffer    = pair[2];

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            //NPOT dimensions: https://developer.mozilla.org/en-US/docs/Web/WebGL/Using_textures_in_WebGL
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, canvas.width, canvas.height);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);
        });

    return {
        textures:       Immutable.fromJS(_.object(_.zip(neededTextures, textures))),
        fbos:           Immutable.fromJS(_.object(_.zip(neededTextures, fbos))),
        renderBuffers:  Immutable.fromJS(_.object(_.zip(neededTextures, renderBuffers))),
        pixelreads:     _.object(_.zip(neededTextures, pixelreads))
    };
}


/**
 * Set global GL settings
 * @param {WebGLRenderingContext}
 */
function setGlOptions(state) {
    var gl = state.get('gl');
    var whiteList = {
        'enable': true,
        'disable': true,
        'blendFuncSeparate': true,
        'blendEquationSeparate': true,
        'depthFunc': true,
        'clearColor': true,
        'lineWidth': true
    };

    // FIXME: Make this work with Immutable.js' native iterators, rather than using toJS()
    var options = state.get('config').get('options').toJS();
    _.each(options, function(optionCalls, optionName) {
        if(whiteList[optionName] !== true ||
            typeof gl[optionName] !== 'function') {
            return;
        }

        optionCalls.forEach(function(optionArgs) {
            var newArgs = optionArgs.map(function(currentValue) {
                return typeof currentValue === 'string' ? gl[currentValue] : currentValue;
            });

            gl[optionName].apply(gl, newArgs);
        });
    });
}


function createPrograms(state) {
    debug('Creating programs');
    var gl = state.get('gl');

    // for(var programName in programs) {
    var createdPrograms = state.get('config').get('programs').map(function(programOptions, programName) {
        debug('Compiling program', programName);
        var program = gl.createProgram();

        //// Create, compile and attach the shaders
        var vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, programOptions.get('sources').get('vertex'));
        gl.compileShader(vertShader);
        if(!(gl.isShader(vertShader) && gl.getShaderParameter(vertShader, gl.COMPILE_STATUS))) {
            throw new Error('Could not compile shader. Log: "' + gl.getShaderInfoLog(vertShader) +
                '"\nSource:\n' + programOptions.get('sources').get('vertex'));
        }
        gl.attachShader(program, vertShader);

        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, programOptions.get('sources').get('fragment'));
        gl.compileShader(fragShader);
        if(!(gl.isShader(fragShader) && gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))) {
            throw new Error('Could not compile shader. Log: "' + gl.getShaderInfoLog(fragShader) +
                '"\nSource:\n' + programOptions.get('sources').get('fragment'));
        }
        gl.attachShader(program, fragShader);

        //// Link and validate the program
        gl.linkProgram(program);
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Could not link program \'' + programName + '\'. Log:\n' +
                gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            throw new Error('Could not link GL program \'' + programName + '\'');
        }

        gl.validateProgram(program);
        if(!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
            console.error(gl.getProgramParameter(program, gl.VALIDATE_STATUS));
            throw new Error('Could not validate GL program \'' + programName + '\'');
        }

        return program;
    }).cacheResult();
    // We need cacheResult() or Immutable.js will re-run the map on every access, recreating all
    // the GL programs from scratch on every access. This calls ensures the map is run only once.

    return state.set('programs', createdPrograms);
}


function createBuffers(state) {
    var gl = state.get('gl');

    var createdBuffers = state.get('config').get('models').map(function(bufferOpts, bufferName) {
        debug('Creating buffer %s', bufferName);
        var vbo = gl.createBuffer();
        return vbo;
    }).cacheResult();

    return state.set('buffers', createdBuffers);
}


/**
 * Given an object mapping buffer names to ArrayBuffer data, load all of them into the GL context
 * @param {RendererState} state - renderer instance
 * @param {Object.<string, WebGLBuffer>} buffers - the buffer object returned by createBuffers()
 * @param {Object.<string, ArrayBuffer>} bufferData - a mapping of buffer name -> new data to load
 * into that buffer
 */
function loadBuffers(state, buffers, bufferData) {
    _.each(bufferData, function(data, bufferName) {
        debug('Loading buffer data for buffer %s (data type: %s, length: %s bytes)',
            bufferName, data.constructor.name, data.byteLength);

        if(typeof buffers[bufferName] === 'undefined') {
            console.error('Asked to load data for buffer \'%s\', but no buffer by that name exists locally',
                bufferName, buffers);
            return false;
        }

        loadBuffer(state, buffers[bufferName], bufferName, data);
    });
}


function loadBuffer(state, buffer, bufferName, data) {
    var gl = state.get('gl');
    if(typeof bufferSizes[bufferName] === 'undefined') {
        bufferSizes[bufferName] = 0;
    }
    if(data.byteLength <= 0) {
        debug('Warning: asked to load data for buffer \'%s\', but data length is 0', bufferName);
        return;
    }

    state.get('activeIndices')
        .forEach(updateIndexBuffer.bind('', gl, data.byteLength / 4));

    try{

        bindBuffer(gl, buffer);

        if(bufferSizes[bufferName] >= data.byteLength) {
            debug('Reusing existing GL buffer data store to load data for buffer %s (current size: %d, new data size: %d)',
                bufferName, bufferSizes[bufferName], data.byteLength);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
        } else {
            debug('Creating new buffer data store for buffer %s (new size: %d)',
                bufferName, data.byteLength);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
            bufferSizes[bufferName] = data.byteLength;
        }
    } catch(glErr) {
        // This often doesn't get called on GL errors, since they seem to be thrown from the global
        // WebGL context, not at the point we call the command (above).
        console.error('Error: could not load data into buffer', bufferName, '. Error:', glErr);
        throw glErr;
    }
}


//Create new index array that extends old one
//GLContext * int * int * UInt32Array -> Uint32Array
function expandHostBuffer(gl, length, repetition, oldHostBuffer) {

    var longerBuffer = new Uint32Array(Math.round(length * repetition * 1.25));

    //memcpy old (initial) indexes
    if (oldHostBuffer.length) {
        var dstU8 = new Uint8Array(longerBuffer.buffer, 0, oldHostBuffer.length * 4);
        var srcU8 = new Uint8Array(oldHostBuffer.buffer);
        dstU8.set(srcU8);
    }

    for (var i = oldHostBuffer.length; i < longerBuffer.length; i += repetition) {
        var lbl = (i / repetition) + 1;
        for (var j = 0; j < repetition; j++) {
            longerBuffer[i + j] = lbl;
        }
    }

    return longerBuffer;

}

function updateIndexBuffer(gl, length, repetition) {

    if (!indexHostBuffers[repetition]) {
        indexHostBuffers[repetition] = new Uint32Array([]);
    }
    if (!indexGlBuffers[repetition]) {
        indexGlBuffers[repetition] = gl.createBuffer();
        indexGlBuffers[repetition].repetition = repetition;
    }

    var oldHostBuffer = indexHostBuffers[repetition];

    if (oldHostBuffer.length < length * repetition) {

        var longerBuffer = expandHostBuffer(gl, length, repetition, indexHostBuffers[repetition]);
        indexHostBuffers[repetition] = longerBuffer;

        var glBuffer = indexGlBuffers[repetition];

        debug('Expanding index buffer', glBuffer, 'memcpy', oldHostBuffer.length/repetition, 'elts', 'write to', length * repetition);

        bindBuffer(gl, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, longerBuffer, gl.STREAM_DRAW);
    }
}




function setCamera(config, gl, programs, camera) {
    _.each(config.programs, function(programConfig, programName) {
        debug('Setting camera for program %s', programName);
        var program = programs[programName];
        useProgram(gl, program);

        var mvpLoc = gl.getUniformLocation(program, programConfig.camera);
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
}


/** A mapping of scene items to the number of elements that should be rendered for them */
var numElements = {};
function setNumElements(newNumElements) {
    numElements = newNumElements;
}


/**
 * Render one or more items as specified in render config's scene.render array
 * @param {Renderer} state - initialized renderer
 * @param {(string[])} [renderListOverride] - optional override of the scene.render array
 */
var lastRenderTarget = {};
function render(state, renderListOverride) {
    debug('========= Rendering a frame');

    var config      = state.get('config').toJS(),
        gl          = state.get('gl'),
        programs    = state.get('programs').toJS(),
        buffers     = state.get('buffers').toJS();

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var toRender = renderListOverride || config.scene.render;
    _.each(toRender, function(item) {

        if(typeof numElements[item] === 'undefined' || numElements[item] < 1) {
            debug('Not rendering item "%s" because it doesn\'t have any elements (set in numElements)',
                item);
            return false;
        }

        debug('Rendering item "%s" (%d elements)', item, numElements[item]);

        var renderItem = config.scene.items[item];
        var renderTarget = renderItem.renderTarget === 'CANVAS' ? null : renderItem.renderTarget;
        if (renderTarget !== lastRenderTarget) {
            debug('  changing fbo');
            gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget ? state.get('fbos').get(renderTarget) : null);
            lastRenderTarget = renderTarget;
        }

        bindProgram(gl, programs[renderItem.program], renderItem.program, renderItem.bindings, buffers, config.models);
        gl.drawArrays(gl[renderItem.drawType], 0, numElements[item]);

        if (renderTarget && (renderTarget !== 'CANVAS')) {
            debug('  reading back texture', item);
            var pixelreads = state.get('pixelreads')[renderTarget];
            if (pixelreads.length < gl.canvas.width * gl.canvas.height * 4) {
                state.get('pixelreads')[item] = pixelreads =
                    new Uint8Array(gl.canvas.width * gl.canvas.height * 4);
            }
            gl.readPixels(0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelreads);
        }

    });

    gl.flush();
}

//returns idx or -1
function hitTest(state, texture, x, y) {
    var canvas = state.get('gl').canvas;
    var map = state.get('pixelreads')[texture];
    var remapped = new Uint32Array(map.buffer);
    var idx = (canvas.height - y) * canvas.width + x;
    var combined = remapped[idx];

    //swizzle because point shader is funny
    var r = (combined >> 16) & 255;
    var g = (combined >> 8) & 255;
    var b = combined & 255;
    var a = (combined >> 24) & 255;
    combined = (r << 24) | (g << 16) | (b << 8) | a;

    if (combined) {
        debug('hit', texture, x, y, '->', idx, '->', combined,
           '(', combined >> 24, (combined >> 16) & 255, (combined >> 8) & 255, combined & 255, ')');
    }
    return combined - 1;
}


//hit test by sampling for a hit on circle's perimeter
//returns idx or -1
function hitTestCircumference(state, texture, x, y, r) {
    for (var attempt = 0; attempt < r * 2 * Math.PI; attempt++) {
        var attemptX = x + r * Math.round(Math.cos(attempt / r));
        var attemptY = y + r * Math.round(Math.sin(attempt / r));
        var hit = hitTest(state, texture, attemptX, attemptY);
        if (hit > -1) {
            return hit;
        }
    }
    return -1;
}

//hit test by sampling for closest hit in area radius r (default to 0)
//returns idx or -1
function hitTestN(state, texture, x, y, r) {

    if (!r) {
        return hitTest(state, texture, x, y);
    }

    //look up to r px away
    for (var offset = 0; offset < r; offset++) {
        var hitOnCircle = hitTestCircumference(state, texture, x, y, offset);
        if (hitOnCircle > -1) {
            return hitOnCircle;
        }
    }
    return -1;
}

// Get names of buffers needed from server
// RenderOptions -> [ string ]
function getServerBufferNames (config) {

    var renderItems = config.scene.render;
    var bufferNamesLists = renderItems.map(function (itemName) {
        var bindings = config.scene.items[itemName].bindings;
        return _.pairs(bindings)
            .filter(function (bindingPair) {
                var modelName = bindingPair[1][0];
                var attribName = bindingPair[1][1];
                var datasource = config.models[modelName][attribName].datasource || 'SERVER';
                return datasource === 'SERVER';
            })
            .map(function (bindingPair) {
                var modelName = bindingPair[1][0];
                return modelName;
            });
    });

    return _.uniq(_.flatten(bufferNamesLists));
}

// Immutable RenderOptions -> [ int ]
function getActiveIndices (config) {
    config = config.toJS();

    var renderItems = config.scene.render;
    var activeIndexModesLists = renderItems.map(function (itemName) {
        var bindings = config.scene.items[itemName].bindings;
        return _.pairs(bindings)
            .map(function (bindingPair) {
                var modelName = bindingPair[1][0];
                var attribName = bindingPair[1][1];
                debug('bindingPair', bindingPair);
                debug('datasource', config.models[modelName][attribName].datasource);
                var datasource = config.models[modelName][attribName].datasource || 'SERVER';
                return datasource;
            })
            .map(function (datasource) {
                return datasource === 'VERTEX_INDEX' ? 1
                    : datasource === 'LINE_INDEX' ? 2
                    : 0;
            })
            .filter(function (repetition) { return repetition > 0; });
    });

    return _.uniq(_.flatten(activeIndexModesLists));
}


module.exports = {
    init: init,
    createContext: createContext,
    setGlOptions: setGlOptions,
    createPrograms: createPrograms,
    createBuffers: createBuffers,
    loadBuffers: loadBuffers,
    loadBuffer: loadBuffer,
    setCamera: setCamera,
    setNumElements: setNumElements,
    render: render,
    getServerBufferNames: getServerBufferNames,
    hitTest: hitTestN
};
