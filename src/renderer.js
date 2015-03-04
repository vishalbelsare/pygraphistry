'use strict';

var _           = require('underscore');
// TODO: Upgrade to immutable v3 (from v2) -- breaking changes; our usage must be updated to match
var Immutable   = require('immutable');
var Rx          = require('rx');
var debug       = require('debug')('graphistry:StreamGL:renderer');

var cameras             = require('./camera.js');
var localAttribHandler  = require('./localAttribHandler.js');
var bufferProxy         = require('./bufferproxy.js').bufferProxy;
var picking             = require('./picking.js');
var semanticZoom        = require('./semanticZoom.js');



/** @module Renderer */


////////////////////////////////////////////////////////////////////////////////
// Globals across renderer instances
////////////////////////////////////////////////////////////////////////////////

//keyed on instancing: 1 -> vertex, 2 -> line, 3 -> triangle, ...
//[ Uint32Array ]
var indexHostBuffers = [];
//[ glBuffer ]
var indexGlBuffers = [];

//User supplied buffers (auto-initialized to empty)
//{ <name> -> TypedArray }
var localHostBuffers = {};
//{ <name> -> glBuffer }
var localGlBuffers = {};

/** A dictionary mapping buffer names to current sizes
 * @type {Object.<string, number>} */
var bufferSizes = {};

/** Cached dictionary of program.attribute: attribute locations
 * @type {Object.<string, Object.<string, GLint>>} */
var attrLocations = {};


/** Cached dictionary of program.uniform: uniform locations
 * @type {Object.<string, Object.<string, GLint>>} */
var uniformLocations = {};


////////////////////////////////////////////////////////////////////////////////
// Internal helpers
////////////////////////////////////////////////////////////////////////////////

//Factory behind getAttribLocationFast, getUniformLocationFast
function addressMemoizer(cache, cacheName, glLocationMethodName) {

    return function (gl, program, programName, address) {

        if(typeof cache[programName] !== 'undefined' &&
            typeof cache[programName][address] !== 'undefined') {
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
 * @param {Object} bindings - The config settings object for this program's attributes and uniforms
 * @param {Object.<string, WebGLBuffer>} buffers - Mapping of created buffer names to WebGL buffers
 * @param {Object} modelSettings - The 'models' object from the rendering config
 */
function bindProgram(state, program, programName, bindings, buffers, modelSettings) {
    bindings = bindings || {};
    bindings.attributes = bindings.attributes || {};
    bindings.uniforms = bindings.uniforms || {};

    var gl = state.get('gl');

    debug('Binding program %s', programName);

    useProgram(gl, program);

    // FIXME: If we don't rebind every frame, but bind another program, then the bindings of the
    // first program are lost. Shouldn't they persist unless we change them for the program?
    // If the program is already bound using the current binding preferences, no need to continue
    //if(programBindings[programName] === bindings) {
        //debug('Not binding program %s because already bound', programName);
        //return false;
    //}
    _.each(bindings.attributes, function(binding, attribute) {

        var element = modelSettings[binding[0]][binding[1]];
        var datasource = element.datasource;
        var glBuffer =
              datasource === 'HOST'         ? buffers[binding[0]]
            : datasource === 'DEVICE'       ? buffers[binding[0]]
            : datasource === 'VERTEX_INDEX' ? indexGlBuffers[1]
            : datasource === 'EDGE_INDEX'   ? indexGlBuffers[2]
            : datasource === 'CLIENT'       ?
                localGlBuffers[state.get('config').get('models').get(binding[0]).get(binding[1]).get('localName')]
            : (function () { throw new Error('unknown datasource ' + datasource); }());

        debug('  binding buffer', attribute, binding, datasource, glBuffer, element.name);


        bindBuffer(gl, glBuffer);
        var location = getAttribLocationFast(gl, program, programName, attribute);

        gl.vertexAttribPointer(location, element.count, gl[element.type], element.normalize,
            element.stride, element.offset);

        gl.enableVertexAttribArray(location);

    });


    _.each(bindings.uniforms || {}, function (binding, uniformName) {

        debug('  binding uniform', binding, uniformName);

        var location = getUniformLocationFast(gl, program, programName, uniformName);

        gl['uniform' + binding.uniformType]
            .apply(gl, [location].concat(binding.values));
    });

    _.each(bindings.textureBindings || {}, function (binding, textureName) {

        debug('  binding texture', binding, textureName, state.get('textures').get(binding));

        var location = getUniformLocationFast(gl, program, programName, textureName);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, state.get('textures').get(binding));
        gl.uniform1i(location, 0);

    });


    programBindings[programName] = bindings;
}



////////////////////////////////////////////////////////////////////////////////
// Exports
////////////////////////////////////////////////////////////////////////////////


function init(config, canvas) {
    config = Immutable.fromJS(config);


    var renderPipeline = new Rx.ReplaySubject(1);

    var state = Immutable.Map({
        config: config,
        canvas: canvas,

        gl: undefined,
        programs:       Immutable.Map({}),
        defaultItems:   undefined,
        buffers:        Immutable.Map({}),
        //TODO make immutable
        hostBuffers:    {},
        camera:         undefined,

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

        activeIndices:  getActiveIndices(config),
        activeLocalAttributes: localAttribHandler.getActiveLocalAttributes(config),

        //Observable {?start: [...], ?rendered: [...]}
        renderPipeline: renderPipeline,

        //Observable [...]
        rendered: renderPipeline.pluck('rendered').filter(_.identity)

    });

    debug('Active indices', state.get('activeIndices'));
    debug('Active attributes', state.get('activeLocalAttributes'));

    state = state.set('defaultItems', getDefaultItems(state));

    var gl = createContext(state);
    state = state.set('gl', gl);
    setGlOptions(state);

    state = createPrograms(state);
    state = createBuffers(state);

    debug('precreated', state.toJS());
    var camera = createCamera(state);
    state = state.set('camera', camera);
    setCamera(state);

    resizeCanvas(state);
    window.addEventListener('resize', function () {
        resizeCanvas(state);
    });

    debug('state pre', state.toJS());
    state = state.mergeDeep(createRenderTargets(config, canvas, gl));

    debug('state pre b', state.toJS());
    state = state.mergeDeep(createStandardTextures(config, canvas, gl));

    debug('created', state.toJS());
    return state;
}


function createContext(state) {
    var gl = null;
    var canvas = state.get('canvas');

    gl = canvas.getContext('webgl', {antialias: true, premultipliedAlpha: false});
    if(gl === null) {
        gl = canvas.getContext('experimental-webgl', {antialias: true, premultipliedAlpha: false});
    }
    if(gl === null) { throw new Error('Could not initialize WebGL'); }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    return gl;
}


function createCamera(state) {
    var camera;
    var canvas = state.get('canvas');
    var camConfig = state.get('config').get('camera');

    var bounds = camConfig.get('bounds');
    if (bounds === 'CANVAS') {
        bounds = Immutable.fromJS({
            left: 0, right: canvas.width,
            top: 0, bottom: canvas.height
        });
    }

    if (camConfig.get('type') === '2d') {
        var nearPlane = camConfig.get('nearPlane');
        var farPlane = camConfig.get('farPlane');
        camera = new cameras.Camera2d(bounds.get('left'), bounds.get('right'),
                                      bounds.get('top'), bounds.get('bottom'),
                                      nearPlane, farPlane);
    } else {
        throw new Error ('Unknown camera type');
    }

    return camera;
}

/*
 * Return the items to render when no override is given to render()
 */
function getDefaultItems(state) {
    var items = state.get('config').get('items').toJS();
    var renderItems = _.chain(items).pick(function (i) {
        return i.trigger === 'renderScene';
    }).map(function (i, name) {
        return name;
    }).value();

    var orderedItems = state.get('config').get('render').toJS();
    return _.intersection(orderedItems, renderItems);
}

/*
 * Update the size of the canvas to match what is visible
 */
function resizeCanvas(state) {
    var canvas = state.get('canvas');
    var camera = state.get('camera');

    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    debug('Resize: old=(%d,%d) new=(%d,%d)', canvas.width, canvas.height, width, height);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        camera.resize(width, height);
        setCamera(state);
        render(state);
    }
}


//RenderState * canvas * string -> {x: int, y:int, width: float, height: float}
function getTextureDims(config, canvas, name) {
    if (!name || name === 'CANVAS') {
        return {width: canvas.width, height: canvas.height};
    }

    var textureConfig = config.get ? config.get('textures').get(name).toJS() : config.textures[name];

    var width =
        textureConfig.hasOwnProperty('width') ?
            Math.round(0.01 * textureConfig.width.value * canvas.width)
        : canvas.width;
    var height =
        textureConfig.hasOwnProperty('height') ?
            Math.round(0.01 * textureConfig.height.value * canvas.height)
        : canvas.height;

    return { width: width, height: height };
}

// create for each texture rendertarget, an offscreen fbo, texture, renderbuffer, and host buffer
// note that not all textures are render targets (e.g., server reads)
function createRenderTargets(config, canvas, gl) {

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
        dimensions    = neededTextures.map(getTextureDims.bind('', config, canvas)),
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

    var hostBuffers = state.get('hostBuffers');
    _.keys(state.get('config').get('models').toJS()).forEach(function(bufferName) {
        hostBuffers[bufferName] = new Rx.ReplaySubject(1);
    });

    return state.set('buffers', createdBuffers);
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
        state.get('hostBuffers')[bufferName].onNext(data);

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

    state.get('activeLocalAttributes')
        .forEach(
            localAttribHandler.updateLocalAttributesBuffer.bind('',
                {host: localHostBuffers, gl: localGlBuffers},
                {bindBuffer: bindBuffer, expandHostBuffer: expandHostBuffer},
                gl,
                data.byteLength / 4));


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
            longerBuffer[i + j] = (lbl << 8) | 255;
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




function setCamera(state) {
    var config = state.get('config').toJS();
    var gl = state.get('gl');
    var programs = state.get('programs').toJS();
    var camera = state.get('camera');

    _.each(config.programs, function(programConfig, programName) {
        debug('Setting camera for program %s', programName);
        var program = programs[programName];
        useProgram(gl, program);

        var mvpLoc = gl.getUniformLocation(program, programConfig.camera);
        gl.uniformMatrix4fv(mvpLoc, false, camera.getMatrix());
    });
}


// Wrapper for setCamera which takes an Immutable renderState (returned by init()) and a camera
function setCameraIm(renderState, camera) {
    var newState = renderState.set('camera', camera);
    setCamera(newState);
    return newState;
}



/** A mapping of scene items to the number of elements that should be rendered for them */
var numElements = {};
function setNumElements(newNumElements) {
    numElements = newNumElements;
}


/**
 * Render one or more items as specified in render config's render array
 * @param {Renderer} state - initialized renderer
 * @param {(string[])} [renderListOverride] - optional override of the render array
 */
var lastRenderTarget = {};
function render(state, renderListOverride, readPixelsOverride) {
    debug('========= Rendering a frame');

    var config      = state.get('config').toJS(),
        camera      = state.get('camera'),
        gl          = state.get('gl'),
        programs    = state.get('programs').toJS(),
        buffers     = state.get('buffers').toJS();

    var clearedFBOs = { };

    var toRender = renderListOverride || state.get('defaultItems');

    state.get('renderPipeline').onNext({start: toRender});

    _.each(toRender, function(item) {
        if(typeof numElements[item] === 'undefined' || numElements[item] < 1) {
            debug('Not rendering item "%s" because it doesn\'t have any elements (set in numElements)',
                item);
            return false;
        }

        debug('Rendering item "%s" (%d elements)', item, numElements[item]);

        var renderItem = config.items[item];
        var renderTarget = renderItem.renderTarget === 'CANVAS' ? null : renderItem.renderTarget;

        //change viewport in case of downsampled target
        var dims = getTextureDims(config, gl.canvas, renderTarget);
        gl.viewport(0, 0, dims.width, dims.height);

        if (renderTarget !== lastRenderTarget) {
            debug('  changing fbo', renderTarget);
            gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget ? state.get('fbos').get(renderTarget) : null);
            lastRenderTarget = renderTarget;
        }

        if (!clearedFBOs[renderTarget]) {
            debug('  clearing render target', renderTarget);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            clearedFBOs[renderTarget] = true;
        }

        // Set zoomScalingFactor uniform if it exists.
        var scalingFactor = semanticZoom.pointZoomScalingFactor(camera.width, camera.height, numElements[item]);
        if (renderItem.uniforms && renderItem.uniforms.zoomScalingFactor) {
            renderItem.uniforms.zoomScalingFactor.values = [scalingFactor];
        }

        bindProgram(
            state, programs[renderItem.program], renderItem.program,
            {
                attributes: renderItem.bindings,
                uniforms: renderItem.uniforms,
                textureBindings: renderItem.textureBindings
            },
            buffers, config.models);

        debug('Done binding, drawing now...');
        gl.drawArrays(gl[renderItem.drawType], 0, numElements[item]);

        if (renderTarget !== null && renderItem.readTarget) {
            console.log('  reading back texture', item, renderTarget);

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
        }

    });

    state.get('renderPipeline').onNext({rendered: toRender});

    gl.flush();
}


// Get names of buffers needed from server
// RenderOptions -> [ string ]
function getServerBufferNames (config) {

    var renderItems = config.render;
    var bufferNamesLists = renderItems.map(function (itemName) {
        var bindings = config.items[itemName].bindings;
        return _.pairs(bindings)
            .filter(function (bindingPair) {
                var modelName = bindingPair[1][0];
                var attribName = bindingPair[1][1];
                var datasource = config.models[modelName][attribName].datasource;
                return (datasource === 'HOST' || datasource === 'DEVICE');
            })
            .map(function (bindingPair) {
                var modelName = bindingPair[1][0];
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
                debug('bindingPair', bindingPair);
                debug('datasource', config.models[modelName][attribName].datasource);
                var datasource = config.models[modelName][attribName].datasource;
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

// State -> string -> {read: int -> 'a, write: int * 'a -> ()}
var localAttributeProxy = function (state) {
    return bufferProxy(state.get('gl'), localHostBuffers, localGlBuffers);
};


module.exports = {
    init: init,
    createContext: createContext,
    setGlOptions: setGlOptions,
    createPrograms: createPrograms,
    createBuffers: createBuffers,
    loadBuffers: loadBuffers,
    loadBuffer: loadBuffer,
    loadTextures: loadTextures,
    setCameraIm: setCameraIm,
    setNumElements: setNumElements,
    render: render,
    getServerBufferNames: getServerBufferNames,
    getServerTextureNames: getServerTextureNames,
    hitTest: picking.hitTestN,
    localAttributeProxy: localAttributeProxy
};
