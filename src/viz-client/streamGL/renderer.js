'use strict';

const _           = require('underscore');
// TODO: Upgrade to immutable v3 (from v2) -- breaking changes; our usage must be updated to match
const Immutable   = require('immutable');
const Rx          = require('rxjs/Rx');
const util        = require('./graphVizApp/util.js');
const debug       = require('debug')('graphistry:StreamGL:renderer');

const cameras             = require('./camera.js');


/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Globals across renderer instances
////////////////////////////////////////////////////////////////////////////////

/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<string, Object.<string, GLint>>} */
const attrLocations = {};

/** Cached dictionary of program.uniform: uniform locations
 * @type {Object.<string, Object.<string, GLint>>} */
const uniformLocations = {};

let lastRenderTarget = {};


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

const getAttribLocationFast = addressMemoizer(attrLocations, 'attribute', 'getAttribLocation');

/**
 * Wraps gl.getUniformLocation and caches the result, returning the cached result on subsequent
 * calls for the same uniform in the same program.
 * @param {WebGLRenderingContext} gl - the WebGL context
 * @param {WebGLProgram} program - the program the attribute is part of
 * @param {string} programName - the name of the program
 * @param {string} uniform - the name of the uniform in the shader source code
 */
const getUniformLocationFast = addressMemoizer(uniformLocations, 'uniform', 'getUniformLocation');



/** The program currently in use by GL
 * @type {?WebGLProgram} */
let activeProgram = null;
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
let boundBuffer = null;
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
{
    let lastTime = 0;
    const vendors = ['ms', 'moz', 'webkit', 'o'];
    for (let x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] ||
                                      window[vendors[x]+'CancelRequestAnimationFrame'];
    }

    if (!window.requestAnimationFrame) {
        console.warn('requestAnimationFrame not supported, falling back on setTimeout');
        window.requestAnimationFrame = function(callback) {
            const currTime = Date.now();
            const timeToCall = Math.max(0, 16 - (currTime - lastTime));
            lastTime = currTime + timeToCall;
            return window.setTimeout(() => {
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
}


/**
 * Wrapper functions to keep track of what attrib arrays are enabled.
 * Apparently WebGL isn't supposed to really care if you do this or not,
 * but documentation is lacking and it seems to be the source of
 * major performance issues.
 */
let enabledVertexAttribArrayCache = [];
function disableActiveVertexAttribArrays (gl) {
    _.each(enabledVertexAttribArrayCache, (location) => {
        gl.disableVertexAttribArray(location);
    });
    enabledVertexAttribArrayCache = [];
}

function enableVertexAttribArray (gl, location) {
    enabledVertexAttribArrayCache.push(location);
    gl.enableVertexAttribArray(location);
}



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

    const gl = state.get('gl');
    const uniforms = state.get('uniforms');
    const indexGlBuffers = state.get('indexGlBuffers');

    debug('Binding program %s', programName);

    disableActiveVertexAttribArrays(gl);

    useProgram(gl, program);


    _.each(bindings.attributes, (binding, attribute) => {
        const element = modelSettings[binding[0]][binding[1]];
        const glArrayType = element.index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
        const datasource = element.datasource;
        const glBuffer =
              datasource === 'HOST'         ? buffers[binding[0]]
            : datasource === 'DEVICE'       ? buffers[binding[0]]
            : datasource === 'VERTEX_INDEX' ? indexGlBuffers[1]
            : datasource === 'EDGE_INDEX'   ? indexGlBuffers[2]
            : datasource === 'CLIENT'       ? buffers[binding[0]]
            : (function () { throw new Error('unknown datasource ' + datasource); })();

        debug('  binding buffer', attribute, binding, datasource, glArrayType, glBuffer, element);
        const location = getAttribLocationFast(gl, program, programName, attribute);

        bindBuffer(gl, glArrayType, glBuffer);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
                                   element.stride, element.offset);

        enableVertexAttribArray(gl, location);
    });

    _.each(bindings.uniforms || {}, (binding, uniformName) => {

        debug('  binding uniform', binding, uniformName);

        const location = getUniformLocationFast(gl, program, programName, uniformName);
        const values = uniforms[itemName][uniformName];
        gl['uniform' + binding.uniformType].apply(gl, [location].concat(values));
    });

    _.each(bindings.textureBindings || {}, (binding, textureName) => {

        debug('  binding texture', binding, textureName, state.get('textures').get(binding));

        const location = getUniformLocationFast(gl, program, programName, textureName);
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
    const renderPipeline = new Rx.ReplaySubject(1);

    let state = Immutable.Map({
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

    resizeCanvas(state);

    canvas.addEventListener('webglcontextlost', () => {
        console.error('WebGL Context Loss');
    }, false);

    const pixelRatio = urlParams.pixelRatio || window.devicePixelRatio || 1;
    const gl = createContext(state, pixelRatio);
    state = state.set('gl', gl);
    setGlOptions(gl, state.get('options'));

    state = createPrograms(state);
    state = createBuffers(state);
    state = createUniforms(state);

    debug('precreated', state.toJS());
    const camera = createCamera(state, pixelRatio, urlParams);
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
    const flags = state.get('flags');
    flags[name] = bool;
}


function createContext(state, pixelRatio) {
    const canvas = state.get('canvas');
    const aa = pixelRatio <= 1; // Disable AA on retina display
    const glOptions = {antialias: aa, premultipliedAlpha: false};
    let gl = canvas.getContext('webgl', glOptions);
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
    const supportedExtensions = gl.getSupportedExtensions();
    debug('Supported extensions', supportedExtensions);
    return _.reduce(extensions, (obj, name) => {
        if (_.contains(supportedExtensions, name)) {
            return _.extend(obj, gl.getExtension(name));
        } else {
            ui.error('Fatal error: GL driver lacks support for', name);
            return obj;
        }
    }, {});
}
*/


function createCamera(state, pixelRatio, urlParams) {
    const canvas = state.get('canvas');
    const camConfig = state.get('config').get('camera');

    let bounds = camConfig.get('bounds');
    if (bounds === 'CANVAS') {
        bounds = Immutable.fromJS({
            left: 0, right: canvas.width,
            top: 0, bottom: canvas.height
        });
    }
    bounds = bounds.merge(_.pick(urlParams, 'left', 'right', 'top', 'bottom'));

    /** Allow &camera=3d to override camera type (defaults to 2d); currently deprecated/ignored. */
    const mode =
        urlParams && urlParams.camera ? (urlParams.camera === '3d' ? '3d' : '2d')
        : camConfig.get('type') === '3d' ? '3d'
        : '2d';

    const camera = new cameras.Camera2d(
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

    const items = state.get('config').get('items').toJS();
    const renderItems = _.chain(items).pick((i) => {
        return _.contains(i.triggers, trigger);
    }).map((i, name) => {
        return name;
    }).value();

    const orderedItems = state.get('config').get('render').toJS();
    return _.intersection(orderedItems, renderItems);
}

/*
 * Update the size of the canvas to match what is visible
 */
function resizeCanvas(state) {
    const canvas = state.get('canvas');
    const camera = state.get('camera');

    // window.devicePixelRatio should only be read on resize, when the gl backbuffer is
    // reallocated. All other code paths should use camera.pixelRatio!
    const pixelRatio = window.devicePixelRatio || 1;

    //Note that the size is *floored*, not *rounded*
    const width = Math.floor(canvas.clientWidth * pixelRatio);
    const height = Math.floor(canvas.clientHeight * pixelRatio);

    debug('Resize: old=(%d,%d) new=(%d,%d)', canvas.width, canvas.height, width, height);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;

        if (camera !== undefined) {
            camera.resize(width, height, pixelRatio);
            setCamera(state);
            render(state, 'resizeCanvas', 'renderSceneFull');
            render(state, 'resizeCanvas', 'picking');
            copyCanvasToTexture(state, 'steadyStateTexture');
        }
    }
}



// RenderState * canvas * string -> {x: int, y:int, width: float, height: float}
function getTextureDims(config, canvas, camera, name) {
    if (!name || name === 'CANVAS') {
        return {width: canvas.width, height: canvas.height};
    }

    const textureConfig = config.get ? config.get('textures').get(name).toJS() : config.textures[name];

    //Retina-quality
    const width =
        textureConfig.hasOwnProperty('width') ?
            Math.floor(0.01 * textureConfig.width.value * canvas.width)
        : Math.floor(canvas.width);
    const height =
        textureConfig.hasOwnProperty('height') ?
            Math.floor(0.01 * textureConfig.height.value * canvas.height)
        : Math.floor(canvas.height);

    return { width: width, height: height };
}


function initializeTexture(gl, texture, fbo, renderBuffer, width, height) {

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

}


// create for each texture rendertarget, an offscreen fbo, texture, renderbuffer, and host buffer
// note that not all textures are render targets (e.g., server reads)
function createRenderTargets (config, canvas, gl, camera) {

    const neededTextures =
        _.chain(
            config.get('render')
            .map((itemName) => config.get('items').get(itemName))
            .map((item) => item.get('renderTarget') || 'CANVAS')
            .filter((renderTarget) => renderTarget !== 'CANVAS')
            .toJS())
        .uniq()
        .value();

    const textures      = neededTextures.map(gl.createTexture.bind(gl)),
        fbos          = neededTextures.map(gl.createFramebuffer.bind(gl)),
        renderBuffers = neededTextures.map(gl.createRenderbuffer.bind(gl)),
        dimensions    = neededTextures.map(getTextureDims.bind('', config, canvas, camera)),
        pixelreads    = neededTextures.map(
            (ignore, i) => new Uint8Array(dimensions[i].width * dimensions[i].height * 4));

    // bind
    _.zip(textures, fbos, renderBuffers, dimensions)
        .forEach(([texture, fbo, renderBuffer, eachDimensions]) => {
            initializeTexture(gl, texture, fbo, renderBuffer, eachDimensions.width, eachDimensions.height);
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
    const names = getServerTextureNames(config.toJS());
    debug('standard texture names', names);
    const textures = names.map(gl.createTexture.bind(gl));
    return {textures: _.object(_.zip(names, textures))};
}

/**
 * Set global GL settings
 * @param {WebGLRenderingContext}
 */
function setGlOptions (gl, glOpts) {
    const whiteList = {
        'enable': true,
        'disable': true,
        'blendFuncSeparate': true,
        'blendEquationSeparate': true,
        'depthFunc': true,
        'clearColor': true,
        'lineWidth': true
    };

    _.each(glOpts || {}, (optionCalls, optionName) => {
        if(whiteList[optionName] !== true ||
            typeof gl[optionName] !== 'function') {
            return;
        }

        optionCalls.forEach((optionArgs) => {
            const newArgs = optionArgs.map((currentValue) => {
                return typeof currentValue === 'string' ? gl[currentValue] : currentValue;
            });
            gl[optionName].apply(gl, newArgs);
        });
    });
}


function createPrograms(state) {
    debug('Creating programs');
    const gl = state.get('gl');

    // for(const programName in programs) {
    const createdPrograms = state.get('config').get('programs').map((programOptions, programName) => {
        debug('Compiling program', programName);
        const program = gl.createProgram();

        //// Create, compile and attach the shaders
        const vertShader = gl.createShader(gl.VERTEX_SHADER);
        let sourceCode = programOptions.get('sources').get('vertex');
        let log;
        gl.shaderSource(vertShader, sourceCode);
        gl.compileShader(vertShader);
        if(!(gl.isShader(vertShader) && gl.getShaderParameter(vertShader, gl.COMPILE_STATUS))) {
            log = gl.getShaderInfoLog(vertShader);
            debug('Error in vertex shader', programName, log, sourceCode);
            throw new Error('Could not compile vertex shader "' + programName + '" (' + log + ')');
        }
        gl.attachShader(program, vertShader);

        const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
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
    const gl = state.get('gl');
    const models = state.get('config').get('models');

    const createdBuffers = models.map((bufferOpts, bufferName) => {
        debug('Creating buffer %s with options %o', bufferName, bufferOpts.toJS());
        state.get('bufferSizes')[bufferName] = 0;
        const vbo = gl.createBuffer();
        return vbo;
    }).cacheResult();

    const hostBuffers = state.get('hostBuffers');
    models.forEach((bufferOpts, bufferName) => {
        const options = _.values(bufferOpts.toJS())[0];
        if (options.datasource === 'HOST' || options.datasource === 'DEVICE') {
            hostBuffers[bufferName] = new Rx.ReplaySubject(1);
        }
    });

    return state.set('buffers', createdBuffers);
}


function createUniforms(state) {
    const items = state.get('config').get('items').toJS();
    const uniforms = _.object(_.map(items, (itemDef, itemName) => {
        const map = _.object(_.map(itemDef.uniforms, (binding, uniform) => {
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

    const gl = state.get('gl');

    const texture = state.get('textures').get(name);
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
 * @returns {Boolean} success flag
 */
function loadBuffers (state, bufferData) {
    const config = state.get('config').toJS();
    const buffers = state.get('buffers').toJS();

    _.each(bufferData, (data, bufferName) => {
        debug('Loading buffer data for buffer %s (data type: %s, length: %s bytes)',
              bufferName, data.constructor.name, data.byteLength);

        const model = _.values(config.models[bufferName])[0];
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
        return true;
    });
}

// Eagerly allocate a buffer for a given buffer name if one of that size
// doesn't already exist
function allocateBufferSize(state, bufferName, sizeInBytes) {
    const gl = state.get('gl');
    const config = state.get('config').toJS();
    const buffers = state.get('buffers').toJS();
    const bufferSizes = state.get('bufferSizes');

    const buffer = buffers[bufferName];
    const model = _.values(config.models[bufferName])[0];
    const glArrayType = model.index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    const glHint = model.hint || 'STREAM_DRAW';

    if(sizeInBytes > bufferSizes[bufferName]) {
        bindBuffer(gl, glArrayType, buffer);
        gl.bufferData(glArrayType, sizeInBytes, gl[glHint]);
        bufferSizes[bufferName] = sizeInBytes;
    }
}


function loadBuffer(state, buffer, bufferName, model, data) {
    const gl = state.get('gl');
    const bufferSizes = state.get('bufferSizes');

    if(typeof bufferSizes[bufferName] === 'undefined') {
        console.error('loadBuffer: No size for buffer', bufferName);
        return;
    }
    if(data.byteLength <= 0) {
        // console.warn('loadBuffer: Asked to load data for buffer \'%s\', but data length is 0', bufferName);
        return;
    }

    try{
        loadBufferBody(state, buffer, bufferName, model, data, bufferSizes, gl);
    } catch(glErr) {
        // This often doesn't get called on GL errors, since they seem to be thrown from the global
        // WebGL context, not at the point we call the command (above).
        console.error('Error: could not load data into buffer', bufferName, '. Error:', glErr);
        throw glErr;
    }
}

// Separated out because V8 can't optimize try-catch bodies.
function loadBufferBody(state, buffer, bufferName, model, data, bufferSizes, gl) {
    const glArrayType = model.index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
    const glHint = model.hint || 'STREAM_DRAW';
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
}


//Create new index array that extends old one
//GLContext * int * int * UInt32Array -> Uint32Array
function expandHostBuffer(gl, length, repetition, oldHostBuffer) {
    const longerBuffer = new Uint32Array(Math.round(length * repetition));

    //memcpy old (initial) indexes
    if (oldHostBuffer.length) {
        longerBuffer.set(oldHostBuffer);
    }

    // Tag first bit based on repetition (e.g., point, edge, etc)
    // Repetition of 1 has 0 on highest bit.
    // Repetition of 2 has 1 on highest bit.
    const highestBitMask = (1 << 31);
    let baseValue = 255;
    if (repetition === 1) {
        baseValue &= (~highestBitMask);
    } else if (repetition === 2) {
        baseValue |= highestBitMask;
    }

    let unshiftedIndex = (oldHostBuffer.length / repetition) + 1;
    for (let i = oldHostBuffer.length; i < longerBuffer.length; i += repetition) {
        const lbl = (unshiftedIndex << 8) | baseValue;

        for (let j = 0; j < repetition; j++) {
            longerBuffer[i + j] = lbl;
        }

        unshiftedIndex++;
    }

    return longerBuffer;
}

function updateIndexBuffer(state, length, repetition) {
    const gl = state.get('gl');
    const indexHostBuffers = state.get('indexHostBuffers');
    const indexGlBuffers = state.get('indexGlBuffers');

    length = Math.ceil(length);

    if (!indexHostBuffers[repetition]) {
        indexHostBuffers[repetition] = new Uint32Array([]);
    }
    if (!indexGlBuffers[repetition]) {
        indexGlBuffers[repetition] = gl.createBuffer();
        indexGlBuffers[repetition].repetition = repetition;
    }

    const oldHostBuffer = indexHostBuffers[repetition];

    if (oldHostBuffer.length < length * repetition) {

        const longerBuffer = expandHostBuffer(gl, length, repetition, indexHostBuffers[repetition]);
        indexHostBuffers[repetition] = longerBuffer;

        const glBuffer = indexGlBuffers[repetition];

        debug('Expanding index buffer', glBuffer, 'memcpy', oldHostBuffer.length/repetition, 'elts',
              'write to', length * repetition);


        bindBuffer(gl, gl.ARRAY_BUFFER, glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, longerBuffer, gl.STATIC_DRAW);
    }
}


/** A mapping of scene items to the number of elements that should be rendered for them */
function setNumElements(state, item, newNumElements) {
    state.get('numElements')[item] = newNumElements;
}

function setUniform(state, name, value) {
    const uniforms = state.get('uniforms');
    _.each(uniforms, (map) => {
        if (name in map) {
            map[name] = value;
        }
    });
}


function setCamera(state) {
    const config = state.get('config').toJS();
    const gl = state.get('gl');
    const programs = state.get('programs').toJS();
    const uniforms = state.get('uniforms');
    const camera = state.get('camera');

    const numVertices = state.get('numElements').pointculled || 0;

    // Set zoomScalingFactor uniform if it exists.
    _.each(uniforms, (map) => {
        if ('zoomScalingFactor' in map) {
            // TODO: Actually get number of nodes from the server
            const scalingFactor = camera.semanticZoom(numVertices);
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

    _.each(config.programs, (programConfig, programName) => {
        debug('Setting camera for program %s', programName);
        const program = programs[programName];
        useProgram(gl, program);

        const mvpLoc = getUniformLocationFast(gl, program, programName, programConfig.camera);
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
}

//if maybeDims provided, also resize texture if needed
function updateRenderTarget (state, renderTarget, maybeDims) {
    const gl = state.get('gl');

    const isChangedTarget = renderTarget !== lastRenderTarget;

    const isMaybeResized = renderTarget && (renderTarget !== 'CANVAS') && maybeDims;
    let isResized;
    if (isMaybeResized) {
        const pixelreads = state.get('pixelreads');
        const outbuffer = pixelreads[renderTarget];
        if (!outbuffer || outbuffer.length !== maybeDims.width * maybeDims.height * 4) {
            isResized = true;
        } else {
            isResized = false;
        }
    }

    if (isResized) {
            debug('resizing texture', renderTarget, maybeDims.width, maybeDims.height);
        const textures = state.get('textures').toJS();
        const texture = textures[renderTarget];
        const fbos = state.get('fbos').toJS();
        const fbo = fbos[renderTarget];
        const renderBuffers = state.get('renderBuffers').toJS();
        const renderBuffer = renderBuffers[renderTarget];

        initializeTexture(gl, texture, fbo, renderBuffer, maybeDims.width, maybeDims.height);
    }

    if (isChangedTarget || isResized) {
        debug('  rebinding renderTarget', renderTarget);
        gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget ? state.get('fbos').get(renderTarget) : null);
        lastRenderTarget = renderTarget;
    }

}

function copyCanvasToTexture(state, textureName) {
    const gl = state.get('gl');
    const textures = state.get('textures').toJS();
    const canvas = gl.canvas;

    updateRenderTarget(state, textureName);

    const texture = textures[textureName];
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

function setupFullscreenBuffer(state) {

    // Disable flipping texture if browser is safari.
    // TODO: Figure out exactly what causes this. NPOT Textures?
    if (navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1) {
        setUniform(state, 'flipTexture', 0.0);
    }

    const fullscreenBuffer = new Float32Array([
            1.0, 1.0, -1.0, 1.0, -1.0, -1.0,
            -1.0, -1.0, 1.0, -1.0, 1.0, 1.0
        ]);

    const numFullscreenElements = 6;

    setNumElements(state, 'fullscreen', numFullscreenElements);
    setNumElements(state, 'fullscreenDark', numFullscreenElements);
    loadBuffers(state, {'fullscreenCoordinates': fullscreenBuffer});
}


/**
 * Render one or more items as specified in render config's render array
 * Implemented by queueing up a rendering task, which will lazilly be handled by
 * the animation loop of the browser.
 * @param {Immutable} state - initialized renderer
 * @param {String} tag - Extra information to track who requested rendering for debugging/perf
 * @param {String} renderListTrigger - The trigger tag of the render items to execute
 * @param {[String]} renderListOverride - List of render items to execute
 * @param {Object} readPixelsOverride - Dimensions for readPixels
 * @param {Function<Boolean>} callback - Callback executed after readPixels
 */
function render(state, tag, renderListTrigger, renderListOverride, readPixelsOverride, callback) {
    const config      = state.get('config').toJS(),
        camera      = state.get('camera'),
        gl          = state.get('gl'),
        options     = state.get('options'),
        ext         = state.get('ext'),
        programs    = state.get('programs').toJS(),
        numElements = state.get('numElements'),
        buffers     = state.get('buffers').toJS();

    const toRender = getItemsForTrigger(state, renderListTrigger) || renderListOverride;
    if (toRender === undefined || toRender.length === 0) {
        console.warn('Nothing to render for tag', tag);
        if (callback) {
            callback(false);
        }
        return;
    }

    debug('==== Rendering a frame (tag: ' + tag +')', toRender);
    state.get('renderPipeline').onNext({start: toRender});

    // Update index buffers based on largest currently loaded buffer.
    const maxElements = Math.max(_.max(_.values(numElements)), 0);
    state.get('activeIndices')
        .forEach(updateIndexBuffer.bind('', state, maxElements));

    const itemToTarget = function (itemName) {
        const itemDef = config.items[itemName];
        if (!itemDef) {
            console.error('Trying to render unknown item', itemName);
        }
        return itemDef.renderTarget === 'CANVAS' ? null : itemDef.renderTarget;
    };

    const sortedItems = toRender.slice();
    sortedItems.sort((a,b) => {
        const aTarget = itemToTarget(a);
        const bTarget = itemToTarget(b);
        return aTarget < bTarget ? -1 : aTarget === bTarget ? 0 : 1;
    });

    const clearedFBOs = { };
    const texturesToRead = [];

    sortedItems.forEach((item) => {
        const numElementsForItem = state.get('numElements')[item];
        if (typeof numElementsForItem === 'undefined' || numElementsForItem === 0) {
            debug('Not rendering item "%s" because it doesn\'t have a non-zero numElements',
                item);
            return;
        }
        const texture = renderItem(state, config, camera, gl, options, ext,
                                 programs, buffers, clearedFBOs, item);
        if (texture) {
            texturesToRead.push(texture);
        }
    });

    if (texturesToRead.length > 0) {
        _.uniq(texturesToRead).forEach((renderTarget) => {
            debug('reading back texture', renderTarget);

            const dims = getTextureDims(config, gl.canvas, camera, renderTarget);
            const pixelreads = state.get('pixelreads');
            let texture = pixelreads[renderTarget];
            const readDims = readPixelsOverride || { x: 0, y: 0, width: dims.width, height: dims.height };

            updateRenderTarget(state, renderTarget, readDims);

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
        callback(true);
    }
}

// Helper to force GL Finish for debugging.
// const stubTexture = new Uint8Array(5 * 5 * 4);
// function readPixelStub(state) {
//     const gl          = state.get('gl');
//     const renderTarget = 'pointHitmapDownsampled';
//     updateRenderTarget(state, renderTarget);

//     const pixelreads = state.get('pixelreads');
//     const texture = stubTexture;
//     const readDims = {x: 0, y: 0, width: 5, height: 5};

//     gl.readPixels(readDims.x, readDims.y, readDims.width, readDims.height,
//                     gl.RGBA, gl.UNSIGNED_BYTE, texture);
// }

function setTextureUniforms(state, config, itemDef, renderTarget) {
    if (!renderTarget || renderTarget === 'CANVAS') {
        return;
    }

    const uniformsToSet = config.textures[renderTarget].uniforms;
    if (uniformsToSet) {
        _.each(uniformsToSet, (val, key) => {
            setUniform(state, key, val);
        });
    }
}


function renderItem(state, config, camera, gl, options, ext, programs, buffers, clearedFBOs, item) {
    const itemDef = config.items[item];
    const numElements = state.get('numElements')[item];
    const renderTarget = itemDef.renderTarget === 'CANVAS' ? null : itemDef.renderTarget;

    debug('Rendering item "%s" (%d elements)', item, numElements);


    //change viewport in case of downsampled target
    const dims = getTextureDims(config, gl.canvas, camera, renderTarget);
    updateRenderTarget(state, renderTarget, dims);
    gl.viewport(0, 0, dims.width, dims.height);

    //set uniforms for downsampled targets
    setTextureUniforms(state, config, itemDef, renderTarget);


    if (!clearedFBOs[renderTarget]) {
        debug('  clearing render target', renderTarget);

        const clearColor = ((itemDef.glOptions || {}).clearColor || options.clearColor)[0];
        gl.clearColor(...clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        clearedFBOs[renderTarget] = true;
    }

    setGlOptions(gl, _.omit(_.extend({}, state.get('options'), itemDef.glOptions), 'clearColor', 'lineWidth'));

    const depthFunc = ((itemDef.glOptions || {}).depthFunc || config.options.depthFunc)[0][0];
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
// RenderConfig -> [ string ]
function getServerBufferNames (config) {
    return getBufferNames(
        config,
        (modelAttr) => {
            return modelAttr.datasource === 'HOST' || modelAttr.datasource === 'DEVICE';
        });
}

// Get list of live buffers, where live means referenced by a renderitem
// Optional filter predicate
// RenderConfig * ?(ModelView -> Bool) -> [ String ]
function getBufferNames (config, optFilter) {

    const filterPred = optFilter || (() => true);

    const renderItems = config.render;
    const bufferNamesLists = renderItems.map((itemName) => {
        const iDef = config.items[itemName];
        const bindings = _.values(iDef.bindings);
        const elementIndex = iDef.index ? [iDef.index] : [];
        const otherBuffers = _.values(iDef.otherBuffers);
        const bufferList = bindings.concat(otherBuffers).concat(elementIndex);
        return bufferList
            .filter((binding) => {
                const modelName = binding[0];
                const attribName = binding[1];
                return filterPred(config.models[modelName][attribName]);
            }).map((binding) => {
                const modelName = binding[0];
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
        .filter((pair) => {
            const datasource = pair[1].datasource;
            return datasource === 'SERVER';
        })
        .pluck('0')
        .filter((name) => {
            const matchingItems = config.render.map((itemName) => {
                const matchingItemTextures = _.values(((config.items[itemName] || {}).textureBindings))
                    .filter((boundTexture) => {
                        return boundTexture === name;
                    });
                return matchingItemTextures.length;
            }).filter((hits) => hits);
            return matchingItems.length > 0;
        })
        .value();
}

// Immutable RenderOptions -> [ int ]
function getActiveIndices (config) {
    config = config.toJS();

    const renderItems = config.render;
    const activeIndexModesLists = renderItems.map((itemName) => {
        const bindings = config.items[itemName].bindings;
        return _.pairs(bindings)
            .map((bindingPair) => {
                const modelName = bindingPair[1][0];
                const attribName = bindingPair[1][1];
                const datasource = config.models[modelName][attribName].datasource;
                return datasource;
            })
            .map((datasource) => {
                return datasource === 'VERTEX_INDEX' ? 1
                    : datasource === 'EDGE_INDEX' ? 2
                    : 0;
            })
            .filter((repetition) => repetition > 0);
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
    getBufferNames: getBufferNames,
    allocateBufferSize: allocateBufferSize,
    updateIndexBuffer: updateIndexBuffer,
    setFlags: setFlags,
    resizeCanvas
};
