'use strict';

var _           = require('underscore');
// TODO: Upgrade to immutable v3 (from v2) -- breaking changes; our usage must be updated to match
var Immutable   = require('immutable');
var Rx          = require('rx');
var debug       = require('debug')('graphistry:StreamGL:renderer');
var Color       = require('color');

var cameras             = require('./camera.js');
var colorPicker         = require('./graphVizApp/colorpicker.js');


/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Globals across renderer instances
////////////////////////////////////////////////////////////////////////////////

/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<string, Object.<string, GLint>>} */
var attrLocations = {};

/** Cached dictionary of program.uniform: uniform locations
 * @type {Object.<string, Object.<string, GLint>>} */
var uniformLocations = {};

var lastRenderTarget = {};


////////////////////////////////////////////////////////////////////////////////
// Internal helpers
////////////////////////////////////////////////////////////////////////////////

//Factory behind getAttribLocationFast, getUniformLocationFast
function addressMemoizer(cache, cacheName, glLocationMethodName) {

    return function (gl, program, programName, address) {

        if (cache[programName] !== undefined && cache[programName][address] !== undefined) {
            debug('  Get %s %s: using fast path', cacheName, address);
            return cache[programName][address];
        }

        debug('  Get %s %s (for %s): using slow path', cacheName, address, programName);
        cache[programName] = cache[programName] || {};
        cache[programName][address] = gl[glLocationMethodName](program, address);
        if (cache[programName][address] === -1) {
            throw new Error('Error binding address ' + cacheName + '::' + programName + '::' + address);
        }

        return cache[programName][address];

    };
}


/**
 * Wraps gl.getAttribLocation and caches the result, returning the cached result on subsequent
 * calls for the same attribute in the same program.
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {WebGLProgram} program - the program the attribute is part of
 * @param {string} programName - the name of the program
 * @param {string} attribute - the name of the attribute in the shader source code
 */

var getAttribLocationFast = addressMemoizer(attrLocations, 'attribute', 'getAttribLocation');

/**
 * Wraps gl.getUniformLocation and caches the result, returning the cached result on subsequent
 * calls for the same uniform in the same program.
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {WebGLProgram} program - the program the attribute is part of
 * @param {string} programName - the name of the program
 * @param {string} uniform - the name of the uniform in the shader source code
 */
var getUniformLocationFast = addressMemoizer(uniformLocations, 'uniform', 'getUniformLocation');



/** The program currently in use by GL
 * @type {?WebGLProgram} */
var activeProgram = null;
function useProgram(gl, program) {
    if (activeProgram !== program) {
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
function bindBuffer(gl, glArrayType, buffer) {
    if (boundBuffer !== buffer) {
        gl.bindBuffer(glArrayType, buffer);
        boundBuffer = buffer;
        return true;
    }
    return false;
}


// Polyfill to get requestAnimationFrame cross browser.
// Falls back to setTimeout. Based on https://gist.github.com/paulirish/1579671
(function () {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] ||
                                      window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame) {
        console.warn('requestAnimationFrame not supported, falling back on setTimeout');
        window.requestAnimationFrame = function(callback) {
            var currTime = Date.now();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            lastTime = currTime + timeToCall;
            return window.setTimeout(function() {
                callback(currTime + timeToCall);
            }, timeToCall);
        };
    }

    if (!window.cancelAnimationFrame) {
        console.warn('cancelAnimationFrame not supported, falling back on clearTimeout');
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
    }
}());


/**
 * Binds all of a programs attributes to elements of a/some buffer(s)
 * @param {WebGLRenderingContext} gl - the WebGL context containing the program and buffers
 * @param {WebGLProgram} program - The WebGL program to bind
 * @param {Object} bindings - The config settings object for this program's attributes and uniforms
 * @param {Object.<string, WebGLBuffer>} buffers - Mapping of created buffer names to WebGL buffers
 * @param {Object} modelSettings - The 'models' object from the rendering config
 */
function bindProgram(state, program, programName, itemName, bindings, buffers, modelSettings) {
    bindings = bindings || {};
    bindings.attributes = bindings.attributes || {};
    bindings.uniforms = bindings.uniforms || {};

    var gl = state.get('gl');
    var uniforms = state.get('uniforms');
    var indexGlBuffers = state.get('indexGlBuffers');

    debug('Binding program %s', programName);

    useProgram(gl, program);

    _.each(bindings.attributes, function(binding, attribute) {
        var element = modelSettings[binding[0]][binding[1]];
        var glArrayType = element.index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        var datasource = element.datasource;
        var glBuffer =
              datasource === 'HOST'         ? buffers[binding[0]]
            : datasource === 'DEVICE'       ? buffers[binding[0]]
            : datasource === 'VERTEX_INDEX' ? indexGlBuffers[1]
            : datasource === 'EDGE_INDEX'   ? indexGlBuffers[2]
            : datasource === 'CLIENT'       ? buffers[binding[0]]
            : (function () { throw new Error('unknown datasource ' + datasource); }());

        debug('  binding buffer', attribute, binding, datasource, glArrayType, glBuffer, element);

        bindBuffer(gl, glArrayType, glBuffer);
        var location = getAttribLocationFast(gl, program, programName, attribute);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
                               element.stride, element.offset);

        gl.enableVertexAttribArray(location);
    });


    _.each(bindings.uniforms || {}, function (binding, uniformName) {

        debug('  binding uniform', binding, uniformName);

        var location = getUniformLocationFast(gl, program, programName, uniformName);
        var values = uniforms[itemName][uniformName];
        gl['uniform' + binding.uniformType].apply(gl, [location].concat(values));
    });

    _.each(bindings.textureBindings || {}, function (binding, textureName) {

        debug('  binding texture', binding, textureName, state.get('textures').get(binding));

        var location = getUniformLocationFast(gl, program, programName, textureName);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.get('textures').get(binding));
        gl.uniform1i(location, 0);

    });
}



////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////


//config * canvas
function init(config, canvas, urlParams) {
    config = Immutable.fromJS(config);
    var renderPipeline = new Rx.ReplaySubject(1);

    var state = Immutable.Map({
        config: config,
        canvas: canvas,

        gl: undefined,
        ext: undefined,
        programs:       Immutable.Map({}),
        buffers:        Immutable.Map({}),
        bufferSizes:    {},

        //TODO make immutable
        hostBuffers:    {},
        // Non-replay subject because in our animationFrame loop,
        // we can't use RxJS
        hostBuffersCache: {},
        camera:         undefined,

        //{item -> gl obj}
        textures:       Immutable.Map({}),
        fbos:           Immutable.Map({}),
        renderBuffers:  Immutable.Map({}),
        pixelreads:     {},
        uniforms:       undefined,
        options:        config.get('options').toJS(),

        boundBuffer:    undefined,
        bufferSize:     Immutable.Map({}),
        numElements:    {},
        flags: {interpolateMidPoints: true},

        //keyed on instancing: 1 -> vertex, 2 -> line, 3 -> triangle, ...
        indexHostBuffers: {}, // {Uint32Array}
        indexGlBuffers: {}, // {GlBuffer}

        activeIndices:  getActiveIndices(config),

        //Observable {?start: [...], ?rendered: [...]}
        renderPipeline: renderPipeline,

        //Observable [...]
        rendered: renderPipeline.pluck('rendered').filter(_.identity)
    });

    if (urlParams.bg) {
        try {
            var hex = decodeURIComponent(urlParams.bg);
            var color = new Color(hex);
            state.get('options').clearColor = [colorPicker.renderConfigValueForColor(color)];
        } catch (e) {
            console.error('Invalid color', e, urlParams.bg);
        }
    }

    resizeCanvas(state, urlParams);
    window.addEventListener('resize', function () {
        resizeCanvas(state, urlParams);
    });

    var gl = createContext(state);
    state = state.set('gl', gl);
    setGlOptions(gl, state.get('options'));

    state = createPrograms(state);
    state = createBuffers(state);
    state = createUniforms(state);

    debug('precreated', state.toJS());
    var camera = createCamera(state, urlParams);
    state = state.set('camera', camera);
    setCamera(state);

    debug('state pre', state.toJS());
    state = state.mergeDeep(createRenderTargets(config, canvas, gl, camera));

    debug('state pre b', state.toJS());
    state = state.mergeDeep(createStandardTextures(config, canvas, gl));

    debug('created', state.toJS());
    return state;
}

function setFlags(state, name, bool) {
    var flags = state.get('flags');
    flags[name] = bool;
}


function createContext(state) {
    var canvas = state.get('canvas');
    var glOptions = {antialias: true, premultipliedAlpha: false};
    var gl = canvas.getContext('webgl', glOptions);
    if (gl === null) {
        gl = canvas.getContext('experimental-webgl', glOptions);
    }
    if (gl === null) { throw new Error('Could not initialize WebGL'); }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    return gl;
}

/*
//Temp unused due to b8cf84ea158bf42821a019f8c115827fefeda7f6
function enableExtensions(gl, extensions) {
    var supportedExtensions = gl.getSupportedExtensions();
    debug('Supported extensions', supportedExtensions);
    return _.reduce(extensions, function (obj, name) {
        if (_.contains(supportedExtensions, name)) {
            return _.extend(obj, gl.getExtension(name));
        } else {
            ui.error('Fatal error: GL driver lacks support for', name);
            return obj;
        }
    }, {});
}
*/


function createCamera(state, urlParams) {
    var canvas = state.get('canvas');
    var pixelRatio = urlParams.pixelRatio || window.devicePixelRatio || 1;
    var camConfig = state.get('config').get('camera');

    var bounds = camConfig.get('bounds');
    if (bounds === 'CANVAS') {
        bounds = Immutable.fromJS({
            left: 0, right: canvas.width,
            top: 0, bottom: canvas.height
        });
    }
    bounds = bounds.merge(_.pick(urlParams, 'left', 'right', 'top', 'bottom'));

    /** Allow &camera=3d to override camera type (defaults to 2d); currently deprecated/ignored. */
    var mode =
        urlParams && urlParams.camera ? (urlParams.camera === '3d' ? '3d' : '2d')
        : camConfig.get('type') === '3d' ? '3d'
        : '2d';

    console.log('url', mode, urlParams);

    var camera = new cameras.Camera2d(
        bounds.get('left'), bounds.get('right'),
        bounds.get('top'), bounds.get('bottom'),
        camConfig.get('nearPlane'), camConfig.get('farPlane'),
        mode);

    console.info('Display\'s pixel ratio is', pixelRatio);
    camera.resize(canvas.width, canvas.height, pixelRatio);

    return camera;
}

/*
 * Return the items to render when no override is given to render()
 */
function getItemsForTrigger(state, trigger) {
    if (!trigger) {
        return undefined;
    }

    var items = state.get('config').get('items').toJS();
    var renderItems = _.chain(items).pick(function (i) {
        return _.contains(i.triggers, trigger);
    }).map(function (i, name) {
        return name;
    }).value();

    var orderedItems = state.get('config').get('render').toJS();
    return _.intersection(orderedItems, renderItems);
}

/*
 * Update the size of the canvas to match what is visible
 */
function resizeCanvas(state, urlParams) {
    var canvas = state.get('canvas');
    var camera = state.get('camera');

    // window.devicePixelRatio should only be read on resize, when the gl backbuffer is
    // reallocated. All other code paths should use camera.pixelRatio!
    var pixelRatio = window.devicePixelRatio || 1;

    var width = Math.round(canvas.clientWidth * pixelRatio);
    var height = Math.round(canvas.clientHeight * pixelRatio);

    debug('Resize: old=(%d,%d) new=(%d,%d)', canvas.width, canvas.height, width, height);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;

        if (camera !== undefined) {
            camera.resize(width, height, pixelRatio);
            setCamera(state);
            render(state, 'resizeCanvas', 'renderSceneFull');
        }
    }
}


//RenderState * canvas * string -> {x: int, y:int, width: float, height: float}
function getTextureDims(config, canvas, camera, name) {
    if (!name || name === 'CANVAS') {
        return {width: canvas.width, height: canvas.height};
    }

    var textureConfig = config.get ? config.get('textures').get(name).toJS() : config.textures[name];
    // Do not downsample texture if retina is set
    var pixelRatio = textureConfig.retina ? 1 : camera.pixelRatio;

    var width =
        textureConfig.hasOwnProperty('width') ?
            Math.round(0.01 * textureConfig.width.value * canvas.width / pixelRatio)
        : Math.round(canvas.width / pixelRatio);
    var height =
        textureConfig.hasOwnProperty('height') ?
            Math.round(0.01 * textureConfig.height.value * canvas.height / pixelRatio)
        : Math.round(canvas.height / pixelRatio);

    return { width: width, height: height };
}

// create for each texture rendertarget, an offscreen fbo, texture, renderbuffer, and host buffer
// note that not all textures are render targets (e.g., server reads)
function createRenderTargets(config, canvas, gl, camera) {

    var neededTextures =
        _.chain(
            config.get('render')
            .map(function (itemName) { return config.get('items').get(itemName); })
            .map(function (item) { return item.get('renderTarget') || 'CANVAS'; })
            .filter(function (renderTarget) { return renderTarget !== 'CANVAS'; })
            .toJS())
        .uniq()
        .value();

    var textures      = neededTextures.map(gl.createTexture.bind(gl)),
        fbos          = neededTextures.map(gl.createFramebuffer.bind(gl)),
        renderBuffers = neededTextures.map(gl.createRenderbuffer.bind(gl)),
        dimensions    = neededTextures.map(getTextureDims.bind('', config, canvas, camera)),
        pixelreads    = neededTextures.map(
                function (_, i) {
                    return new Uint8Array(dimensions[i].width * dimensions[i].height * 4); });

    //bind
    _.zip(textures, fbos, renderBuffers, dimensions)
        .forEach(function (pair) {
            var texture     = pair[0],
                fbo         = pair[1],
                renderBuffer    = pair[2],
                dimensions  = pair[3];

            var width = dimensions.width;
            var height = dimensions.height;

            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                width, height,
                0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            //NPOT dimensions: https://developer.mozilla.org/en-US/docs/Web/WebGL/Using_textures_in_WebGL
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);
        });

    return {
        textures:       _.object(_.zip(neededTextures, textures)),
        fbos:           _.object(_.zip(neededTextures, fbos)),
        renderBuffers:  _.object(_.zip(neededTextures, renderBuffers)),
        pixelreads:     _.object(_.zip(neededTextures, pixelreads))
    };
}

// ... -> {<name>: glTexture}
function createStandardTextures(config, canvas, gl) {
    var names = getServerTextureNames(config.toJS());
    debug('standard texture names', names);
    var textures = names.map(gl.createTexture.bind(gl));
    return {textures: _.object(_.zip(names, textures))};
}

/**
 * Set global GL settings
 * @param {WebGLRenderingContext}
 */
function setGlOptions(gl, glOpts) {
    var whiteList = {
        'enable': true,
        'disable': true,
        'blendFuncSeparate': true,
        'blendEquationSeparate': true,
        'depthFunc': true,
        'clearColor': true,
        'lineWidth': true
    };

    _.each(glOpts || {}, function(optionCalls, optionName) {
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
        var sourceCode = programOptions.get('sources').get('vertex');
        var log;
        gl.shaderSource(vertShader, sourceCode);
        gl.compileShader(vertShader);
        if(!(gl.isShader(vertShader) && gl.getShaderParameter(vertShader, gl.COMPILE_STATUS))) {
            log = gl.getShaderInfoLog(vertShader);
            debug('Error in vertex shader', programName, log, sourceCode);
            throw new Error('Could not compile vertex shader "' + programName + '" (' + log + ')');
        }
        gl.attachShader(program, vertShader);

        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        sourceCode = programOptions.get('sources').get('fragment');
        gl.shaderSource(fragShader, sourceCode);
        gl.compileShader(fragShader);
        if(!(gl.isShader(fragShader) && gl.getShaderParameter(fragShader, gl.COMPILE_STATUS))) {
            log = gl.getShaderInfoLog(fragShader);
            debug('Error in fragment shader', programName, log, sourceCode);
            throw new Error('Could not compile fragment shader "' + programName + '" (' + log + ')');
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
    var models = state.get('config').get('models');

    var createdBuffers = models.map(function(bufferOpts, bufferName) {
        debug('Creating buffer %s with options %o', bufferName, bufferOpts.toJS());
        state.get('bufferSizes')[bufferName] = 0;
        var vbo = gl.createBuffer();
        return vbo;
    }).cacheResult();

    var hostBuffers = state.get('hostBuffers');
    models.forEach(function(bufferOpts, bufferName) {
        var options = _.values(bufferOpts.toJS())[0];
        if (options.datasource === 'HOST' || options.datasource === 'DEVICE') {
            hostBuffers[bufferName] = new Rx.ReplaySubject(1);
        }
    });

    return state.set('buffers', createdBuffers);
}


function createUniforms(state) {
    var items = state.get('config').get('items').toJS();
    var uniforms = _.object(_.map(items, function (itemDef, itemName) {
        var map = _.object(_.map(itemDef.uniforms, function (binding, uniform) {
            return [uniform, binding.defaultValues];
        }));
        return [itemName, map];
    }));

    return state.set('uniforms', uniforms);
}


function loadTextures(state, bindings) {
    _.each(bindings, loadTexture.bind('', state));
}
function loadTexture(state, textureNfo, name) {

    debug('load texture', name, textureNfo);

    var gl = state.get('gl');

    var texture = state.get('textures').get(name);
    debug('  got texture', texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureNfo.width, textureNfo.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureNfo.buffer);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * Given an object mapping buffer/texture names to ArrayBuffer data, load all of them into the GL context
 * @param {RendererState} state - renderer instance
 * @param {Object.<string, ArrayBuffer>} bufferData - a mapping of buffer name -> new data to load
 * into that buffer
 */
function loadBuffers(state, bufferData) {
    var config = state.get('config').toJS();
    var buffers = state.get('buffers').toJS();

    _.each(bufferData, function(data, bufferName) {
        debug('Loading buffer data for buffer %s (data type: %s, length: %s bytes)',
              bufferName, data.constructor.name, data.byteLength);

        var model = _.values(config.models[bufferName])[0];
        if (model === undefined) {
            console.error('Asked to load data for buffer \'%s\', but corresponding model not found', bufferName);
            console.log('models: ', config.models);
            return false;
        }

        if(typeof buffers[bufferName] === 'undefined') {
            console.error('Asked to load data for buffer \'%s\', but no buffer by that name exists locally',
                          bufferName, buffers);
            return false;
        }

        loadBuffer(state, buffers[bufferName], bufferName, model, data);

        if (model.datasource === 'HOST' || model.datasource === 'DEVICE') {
            state.get('hostBuffers')[bufferName].onNext(data);
            state.get('hostBuffersCache')[bufferName] = data;
        }
    });
}


function loadBuffer(state, buffer, bufferName, model, data) {
    var gl = state.get('gl');
    var bufferSizes = state.get('bufferSizes');

    if(typeof bufferSizes[bufferName] === 'undefined') {
        console.error('loadBuffer: No size for buffer', bufferName);
        return;
    }
    if(data.byteLength <= 0) {
        // console.warn('loadBuffer: Asked to load data for buffer \'%s\', but data length is 0', bufferName);
        return;
    }

    state.get('activeIndices')
        .forEach(updateIndexBuffer.bind('', state, data.byteLength / 4));

    try{
        var glArrayType = model.index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        var glHint = model.hint || 'STREAM_DRAW';
        bindBuffer(gl, glArrayType, buffer);


        if(bufferSizes[bufferName] >= data.byteLength) {
            debug('Reusing existing GL buffer to load data for buffer %s (current size: %d, new data size: %d)',
                  bufferName, bufferSizes[bufferName], data.byteLength);
            gl.bufferSubData(glArrayType, 0, data);
        } else {
            debug('Creating new buffer data store for buffer %s (new size: %d, hint: %s)',
                  bufferName, data.byteLength, glHint);
            gl.bufferData(glArrayType, data, gl[glHint]);
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

    var longerBuffer = new Uint32Array(Math.round(length * repetition));

    //memcpy old (initial) indexes
    if (oldHostBuffer.length) {
        var dstU8 = new Uint8Array(longerBuffer.buffer, 0, oldHostBuffer.length * 4);
        var srcU8 = new Uint8Array(oldHostBuffer.buffer);
        dstU8.set(srcU8);
    }

    for (var i = oldHostBuffer.length; i < longerBuffer.length; i += repetition) {
        var lbl = (i / repetition) + 1;
        for (var j = 0; j < repetition; j++) {
            longerBuffer[i + j] = (lbl << 8) | 255;

            // Tag first bit based on repetition (e.g., point, edge, etc)
            // Repetition of 1 has 0 on highest bit.
            // Repetition of 2 has 1 on highest bit.
            var highestBitMask = (1 << 31);
            if (repetition === 1) {
                longerBuffer[i + j] &= (~highestBitMask);
            } else if (repetition === 2) {
                longerBuffer[i + j] |= highestBitMask;
            }
        }
    }

    return longerBuffer;
}

function updateIndexBuffer(state, length, repetition) {
    var gl = state.get('gl');
    var indexHostBuffers = state.get('indexHostBuffers');
    var indexGlBuffers = state.get('indexGlBuffers');

    length = Math.ceil(length);

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

        debug('Expanding index buffer', glBuffer, 'memcpy', oldHostBuffer.length/repetition, 'elts',
              'write to', length * repetition);

        bindBuffer(gl, gl.ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, longerBuffer, gl.STREAM_DRAW);
    }
}


/** A mapping of scene items to the number of elements that should be rendered for them */
function setNumElements(state, item, newNumElements) {
    state.get('numElements')[item] = newNumElements;
}

function setUniform(state, name, value) {
    var uniforms = state.get('uniforms');
    _.each(uniforms, function (map) {
        if (name in map) {
            map[name] = value;
        }
    });
}


function setCamera(state) {
    var config = state.get('config').toJS();
    var gl = state.get('gl');
    var programs = state.get('programs').toJS();
    var uniforms = state.get('uniforms');
    var camera = state.get('camera');

    var numVertices = state.get('numElements').pointculled || 0;

    // Set zoomScalingFactor uniform if it exists.
    _.each(uniforms, function (map) {
        if ('zoomScalingFactor' in map) {
            // TODO: Actually get number of nodes from the server
            var scalingFactor = camera.semanticZoom(numVertices);
            map.zoomScalingFactor = scalingFactor;
        }

        if ('maxScreenSize' in map) {
            map.maxScreenSize = Math.max(camera.width, camera.height);
        }

        if ('maxCanvasSize' in map) {
            map.maxCanvasSize = Math.max(gl.canvas.width, gl.canvas.height);
        }
    });

    //HACK: we should have line shaders, and pass this as a uniform
    if (numVertices) {
        // HACK: Checking if uber/geo. Should be handled as uniform
        if (!config.items.midedgetextured) {
            gl.lineWidth(camera.semanticZoomEdges(numVertices));
        }
    }

    _.each(config.programs, function(programConfig, programName) {
        debug('Setting camera for program %s', programName);
        var program = programs[programName];
        useProgram(gl, program);

        var mvpLoc = getUniformLocationFast(gl, program, programName, programConfig.camera);
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
}

function updateRenderTarget (state, renderTarget) {
    var gl = state.get('gl');
    if (renderTarget !== lastRenderTarget) {
        debug('  rebinding renderTarget');
        gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget ? state.get('fbos').get(renderTarget) : null);
        lastRenderTarget = renderTarget;
    }
}


function copyCanvasToTexture(state, textureName) {
    var gl = state.get('gl');
    var textures = state.get('textures').toJS();
    var canvas = gl.canvas;

    updateRenderTarget(state, textureName);

    var texture = textures[textureName];
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

function setupFullscreenBuffer(state) {

    // Disable flipping texture if browser is safari.
    // TODO: Figure out exactly what causes this. NPOT Textures?
    if (navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1) {
        setUniform(state, 'flipTexture', 0.0);
    }

    var fullscreenBuffer = new Float32Array([
            1.0, 1.0, -1.0, 1.0, -1.0, -1.0,
            -1.0, -1.0, 1.0, -1.0, 1.0, 1.0
        ]);

    var numFullscreenElements = 6;

    setNumElements(state, 'fullscreen', numFullscreenElements);
    loadBuffers(state, {'fullscreenCoordinates': fullscreenBuffer});
}


/**
 * Render one or more items as specified in render config's render array
 * Implemented by queueing up a rendering task, which will lazilly be handled by
 * the animation loop of the browser.
 * @param {Renderer} state - initialized renderer
 * @param {String} tag - Extra information to track who requested rendering for debugging/perf
 * @param {String} renderListTrigger - The trigger tag of the render items to execute
 * @param {[String]} renderListOverride - List of render items to execute
 * @param {Object} readPixelsOverride - Dimensions for readPixels
 * @param {Function} callback - Callback executed after readPixels
 */
function render(state, tag, renderListTrigger, renderListOverride, readPixelsOverride, callback) {
    var config      = state.get('config').toJS(),
        camera      = state.get('camera'),
        gl          = state.get('gl'),
        options     = state.get('options'),
        ext         = state.get('ext'),
        programs    = state.get('programs').toJS(),
        buffers     = state.get('buffers').toJS();

    var toRender = getItemsForTrigger(state, renderListTrigger) || renderListOverride;
    if (toRender === undefined || toRender.length === 0) {
        console.warn('Nothing to render for tag', tag);
        return;
    }

    debug('==== Rendering a frame (tag: ' + tag +')', toRender);
    state.get('renderPipeline').onNext({start: toRender});

    var itemToTarget = function (config, itemName) {
        var itemDef = config.items[itemName];
        if (!itemDef) {
            console.error('Trying to render unknown item', itemName);
        } else {
            return itemDef.renderTarget === 'CANVAS' ? null : itemDef.renderTarget;
        }
    };

    var sortedItems = toRender.slice();
    sortedItems.sort(function (a,b) {
        var aTarget = itemToTarget(config, a);
        var bTarget = itemToTarget(config, b);
        return aTarget < bTarget ? -1 : aTarget === bTarget ? 0 : 1;
    });

    var clearedFBOs = { };
    var texturesToRead = [];

    sortedItems.forEach(function(item) {
        var numElements = state.get('numElements')[item];
        if(typeof numElements === 'undefined' || numElements < 0) {
            // console.warn('Not rendering item "%s" because it doesn\'t have any elements (set in numElements)',
                // item);
            return false;
        }
        var texture = renderItem(state, config, camera, gl, options, ext,
                                 programs, buffers, clearedFBOs, item);
        if (texture) {
            texturesToRead.push(texture);
        }
    });

    if (texturesToRead.length > 0) {
        _.uniq(texturesToRead).forEach(function (renderTarget) {
            debug('reading back texture', renderTarget);

            updateRenderTarget(state, renderTarget);

            var dims = getTextureDims(config, gl.canvas, camera, renderTarget);
            var pixelreads = state.get('pixelreads');
            var texture = pixelreads[renderTarget];
            var readDims = readPixelsOverride || { x: 0, y: 0, width: dims.width, height: dims.height };

            if (!texture || texture.length !== readDims.width * readDims.height * 4) {
                debug('reallocating buffer', texture.length, readDims.width * readDims.height * 4);
                texture = new Uint8Array(readDims.width * readDims.height * 4);
                pixelreads[renderTarget] = texture;
            }

            gl.readPixels(readDims.x, readDims.y, readDims.width, readDims.height,
                            gl.RGBA, gl.UNSIGNED_BYTE, texture);
        });
    }

    state.get('renderPipeline').onNext({ tag: tag, rendered: toRender });

    gl.flush();

    // Call optional callback. Since Chrome implements gl.finish as gl.flush, there is no way to guarantee
    // that rendering is done. However, gl.readpixels does trigger a GPU/CPU sync, so the callback can be used
    // to process the results of readpixels.
    if (callback) {
        callback();
    }
}


function renderItem(state, config, camera, gl, options, ext, programs, buffers, clearedFBOs, item) {
    var itemDef = config.items[item];
    var numElements = state.get('numElements')[item];
    var renderTarget = itemDef.renderTarget === 'CANVAS' ? null : itemDef.renderTarget;

    debug('Rendering item "%s" (%d elements)', item, numElements);

    updateRenderTarget(state, renderTarget);

    //change viewport in case of downsampled target
    var dims = getTextureDims(config, gl.canvas, camera, renderTarget);
    gl.viewport(0, 0, dims.width, dims.height);

    if (!clearedFBOs[renderTarget]) {
        debug('  clearing render target', renderTarget);

        var clearColor = ((itemDef.glOptions || {}).clearColor || options.clearColor)[0];
        gl.clearColor.apply(gl, clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        clearedFBOs[renderTarget] = true;
    }

    setGlOptions(gl, _.omit(_.extend({}, state.get('options'), itemDef.glOptions), 'clearColor', 'lineWidth'));

    var depthFunc = ((itemDef.glOptions || {}).depthFunc || config.options.depthFunc)[0][0];
    gl.depthFunc(gl[depthFunc]);

    bindProgram(
        state, programs[itemDef.program], itemDef.program, item,
        {
            attributes: itemDef.bindings,
            uniforms: itemDef.uniforms,
            textureBindings: itemDef.textureBindings
        },
        buffers, config.models);

    debug('Done binding, drawing now...');
    if (itemDef.index) {
        gl.drawElements(gl[itemDef.drawType], numElements, gl.UNSIGNED_INT, 0);
    } else {
        gl.drawArrays(gl[itemDef.drawType], 0, numElements);
    }

    if (renderTarget !== null && itemDef.readTarget) {
        return renderTarget;
    } else {
        return undefined;
    }
}

// Get names of buffers needed from server
// RenderOptions -> [ string ]
function getServerBufferNames (config) {
    var renderItems = config.render;
    var bufferNamesLists = renderItems.map(function (itemName) {
        var iDef = config.items[itemName];
        var elementIndex = iDef.index ? [iDef.index] : [];
        var bindings = _.values(iDef.bindings).concat(elementIndex);
        return bindings.filter(function (binding) {
                var modelName = binding[0];
                var attribName = binding[1];
                var datasource = config.models[modelName][attribName].datasource;
                return (datasource === 'HOST' || datasource === 'DEVICE');
            }).map(function (binding) {
                var modelName = binding[0];
                return modelName;
            });
    });

    return _.uniq(_.flatten(bufferNamesLists));
}

// Get names of textures needed from server
// (Server texture and bound to an active item)
// RenderOptions -> [ string ]
function getServerTextureNames (config) {
    return _.chain(_.pairs(config.textures))
        .filter(function (pair) {
            var datasource = pair[1].datasource;
            return datasource === 'SERVER';
        })
        .pluck('0')
        .filter(function (name) {
            var matchingItems = config.render.map(function (itemName) {
                var matchingItemTextures = _.values(((config.items[itemName] || {}).textureBindings))
                    .filter(function (boundTexture) {
                        return boundTexture === name;
                    });
                return matchingItemTextures.length;
            }).filter(function (hits) { return hits; });
            return matchingItems.length > 0;
        })
        .value();
}

// Immutable RenderOptions -> [ int ]
function getActiveIndices (config) {
    config = config.toJS();

    var renderItems = config.render;
    var activeIndexModesLists = renderItems.map(function (itemName) {
        var bindings = config.items[itemName].bindings;
        return _.pairs(bindings)
            .map(function (bindingPair) {
                var modelName = bindingPair[1][0];
                var attribName = bindingPair[1][1];
                var datasource = config.models[modelName][attribName].datasource;
                return datasource;
            })
            .map(function (datasource) {
                return datasource === 'VERTEX_INDEX' ? 1
                    : datasource === 'EDGE_INDEX' ? 2
                    : 0;
            })
            .filter(function (repetition) { return repetition > 0; });
    });

    return _.uniq(_.flatten(activeIndexModesLists));
}


module.exports = {
    init: init,
    loadBuffers: loadBuffers,
    loadTextures: loadTextures,
    setCamera: setCamera,
    setNumElements: setNumElements,
    render: render,
    copyCanvasToTexture: copyCanvasToTexture,
    setupFullscreenBuffer: setupFullscreenBuffer,
    getServerBufferNames: getServerBufferNames,
    getServerTextureNames: getServerTextureNames,
    setFlags: setFlags
};
