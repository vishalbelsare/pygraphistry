'use strict';

const Q = require('q'),
    _ = require('underscore');

const RenderBase = require('./RenderBase.js');
const glMatrix = require('gl-matrix');
const util = require('./util.js');

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz:render:rendergl');

//[string] * document * canvas * int * [number, number] * {<string>: bool} -> Promise Renderer

/**
 * @param document
 * @param canvas
 * @param {Number[]} bgColor
 * @param dimensions
 * @param visible
 * @returns {Promise<Renderer>}
 */
const create = Q.promised((document, canvas, bgColor, dimensions, visible = {}) => {
    const renderer = RenderBase.create();
    renderer.document = document;
    renderer.canvas = canvas;

    // The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
    // set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    if (gl === null) {
        throw new Error('Could not initialize WebGL');
    }

    // Set up WebGL settings
    gl.enable(gl.BLEND);
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.GL_POINT_SPRITE | 0x8861); //34913
    gl.enable(gl.VERTEX_PROGRAM_POINT_SIZE | 0x8642);
    gl.enable(gl.POINT_SMOOTH | 0x0b10);
    gl.clearColor(bgColor);
    // Lines should be 1px wide
    gl.lineWidth(1);

    // Populate the renderer object with default values, empty containers, etc.
    renderer.gl = gl;
    renderer.canvas = canvas;

    renderer.elementsPerPoint = 2;
    renderer.numPoints = 0;
    renderer.numEdges = 0;
    renderer.numMidPoints = 0;
    renderer.numMidEdges = 0;
    renderer.colorTexture = null;

    // For each module function that takes a renderer as the first argument, bind a version
    // to this renderer object, with the renderer argument curried in.
    renderer.setCamera2d = setCamera2d.bind(this, renderer);
    renderer.createBuffer = createBuffer.bind(this, renderer);
    renderer.render = render.bind(this, renderer);
    renderer.createProgram = createProgram.bind(this, renderer);
    renderer.setVisible = setVisible.bind(this, renderer);
    renderer.isVisible = isVisible.bind(this, renderer);
    renderer.setColorMap = setColorMap.bind(this, renderer);
    renderer.finish = finish.bind(this, renderer);

    renderer.visible.points = true;
    renderer.visible.edges = true;
    renderer.visible.midpoints = false;
    renderer.visible.midedges = false;
    renderer.setVisible(visible);

    return Q.all(
        ['point', 'edge', 'midpoint', 'midedge', 'midedge-textured'].map(name =>
            renderer.createProgram(name + '.vertex', name + '.fragment')
        )
    )
        .spread(
            (
                pointProgram,
                edgeProgram,
                midpointProgram,
                midedgeProgram,
                midedgeTexturedProgram
            ) => {
                renderer.programs.points = pointProgram;
                renderer.programs.edges = edgeProgram;
                renderer.programs.midpoints = midpointProgram;
                renderer.programs.midedges = midedgeProgram;
                renderer.programs.midedgestextured = midedgeTexturedProgram;

                // TODO: Enlarge the camera by the (size of gl points / 2) so that points are fully
                // on screen even if they're at the edge of the graph.
                return renderer.setCamera2d(
                    -0.01,
                    dimensions[0] + 0.01,
                    -0.01,
                    dimensions[1] + 0.01
                );
            }
        )
        .then(renderer => renderer);
});

function createProgram(renderer, vertexShaderID, fragmentShaderID) {
    const gl = renderer.gl;

    const pragObj = {};

    pragObj.renderer = renderer;
    pragObj.glProgram = gl.createProgram();
    pragObj.bindVertexAttrib = bindVertexAttrib.bind(this, pragObj);
    pragObj.use = function() {
        gl.useProgram(pragObj.glProgram);
    };
    pragObj.attributes = {};

    return Q.all([
        util.getShaderSource(vertexShaderID + '.glsl'),
        util.getShaderSource(fragmentShaderID + '.glsl')
    ]).spread((vertShaderSource, fragShaderSource) => {
        function compileShader(program, shaderSource, shaderType) {
            const sanitizedShaderSource =
                (typeof window === 'undefined' ? '#version 120\n' : '') +
                shaderSource.replace(/(precision [a-z]* float;)/g, '#ifdef GL_ES\n$1\n#endif\n');

            const shader = renderer.gl.createShader(shaderType);
            renderer.gl.shaderSource(shader, sanitizedShaderSource);
            renderer.gl.compileShader(shader);
            if (!renderer.gl.getShaderParameter(shader, renderer.gl.COMPILE_STATUS)) {
                const err = new Error(
                    'Error compiling WebGL shader (shader type: ' + shaderType + ')'
                );
                logger.error(err, renderer.gl.getShaderInfoLog(shader));
                throw err;
            }
            if (!renderer.gl.isShader(shader)) {
                throw new Error('After compiling shader, WebGL is reporting it is not valid');
            }
            renderer.gl.attachShader(program.glProgram, shader);

            return shader;
        }

        pragObj.vertexShader = compileShader(pragObj, vertShaderSource, gl.VERTEX_SHADER);
        pragObj.fragmentShader = compileShader(pragObj, fragShaderSource, gl.FRAGMENT_SHADER);

        gl.linkProgram(pragObj.glProgram);
        return pragObj;
    });
}

const setCamera2d = Q.promised((renderer, left, right, bottom, top) => {
    renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);

    const lr = 1 / (left - right),
        bt = 1 / (bottom - top);

    const mvpMatrix = glMatrix.mat2d.create();
    glMatrix.mat2d.scale(mvpMatrix, mvpMatrix, glMatrix.vec2.fromValues(-2 * lr, -2 * bt));
    glMatrix.mat2d.translate(
        mvpMatrix,
        mvpMatrix,
        glMatrix.vec2.fromValues((left + right) * lr, (top + bottom) * bt)
    );

    const mvpMat3 = glMatrix.mat3.create();
    glMatrix.mat3.fromMat2d(mvpMat3, mvpMatrix);

    ['points', 'edges', 'midpoints', 'midedges', 'midedgestextured'].forEach(name => {
        const program = renderer.programs[name].glProgram;
        renderer.gl.useProgram(program);
        const mvpLocation = renderer.gl.getUniformLocation(program, 'mvp');
        renderer.gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);
    });

    return renderer;
});

const colorMaps = [
    [[0, 0, 0]], //1
    [[255, 0, 0], [0, 0, 255]], //2
    [[141, 211, 199], [255, 255, 179], [190, 186, 218]],
    [[141, 211, 199], [255, 255, 179], [190, 186, 218], [251, 128, 114]],
    [[228, 26, 28], [55, 126, 184], [77, 175, 74], [152, 78, 163], [255, 127, 0]],
    [[228, 26, 28], [55, 126, 184], [77, 175, 74], [152, 78, 163], [255, 127, 0], [255, 255, 51]],
    [
        [228, 26, 28],
        [55, 126, 184],
        [77, 175, 74],
        [152, 78, 163],
        [255, 127, 0],
        [255, 255, 51],
        [166, 86, 40]
    ],
    [
        [228, 26, 28],
        [55, 126, 184],
        [77, 175, 74],
        [152, 78, 163],
        [255, 127, 0],
        [255, 255, 51],
        [166, 86, 40],
        [247, 129, 191]
    ],
    [
        [228, 26, 28],
        [55, 126, 184],
        [77, 175, 74],
        [152, 78, 163],
        [255, 127, 0],
        [255, 255, 51],
        [166, 86, 40],
        [247, 129, 191],
        [153, 153, 153]
    ],
    [
        [166, 206, 227],
        [31, 120, 180],
        [178, 223, 138],
        [51, 160, 44],
        [251, 154, 153],
        [227, 26, 28],
        [253, 191, 111],
        [255, 127, 0],
        [202, 178, 214],
        [106, 61, 154]
    ],
    [
        [166, 206, 227],
        [31, 120, 180],
        [178, 223, 138],
        [51, 160, 44],
        [251, 154, 153],
        [227, 26, 28],
        [253, 191, 111],
        [255, 127, 0],
        [202, 178, 214],
        [106, 61, 154],
        [255, 255, 153]
    ],
    [
        [166, 206, 227],
        [31, 120, 180],
        [178, 223, 138],
        [51, 160, 44],
        [251, 154, 153],
        [227, 26, 28],
        [253, 191, 111],
        [255, 127, 0],
        [202, 178, 214],
        [106, 61, 154],
        [255, 255, 153],
        [177, 89, 40]
    ]
];

/**
 * Fetch the image at the given URL and use it when coloring edges in the graph.
 */
const setColorMap = Q.promised((renderer, imageURL, maybeClusters) => {
    // TODO: Allow a user to clear the color map by passing in a null here or something
    const gl = renderer.gl;

    return util.getImage(imageURL).then(texImg => {
        let imageData;
        try {
            if (typeof window === 'undefined') {
                logger.trace('FIXME: no fancy setColorMap in node');
            } else if (maybeClusters) {
                logger.trace('Clustering colors');

                const canvas = renderer.document.createElement('canvas');
                canvas.width = texImg.width;
                canvas.height = texImg.height;

                const ctx = canvas.getContext('2d');
                if (ctx.createImageData) {
                    imageData = ctx.createImageData(texImg.width, texImg.height);
                } else {
                    imageData = {
                        data: new Uint8Array(texImg.width * texImg.height * 4)
                    };
                }

                //default to white/transparent
                for (let x = 0; x < texImg.width; x++) {
                    for (let y = 0; y < texImg.height; y++) {
                        const i = 4 * (y * texImg.width + x);
                        imageData.data[i] = 255;
                        imageData.data[i + 1] = 255;
                        imageData.data[i + 2] = 255;
                        imageData.data[i + 3] = 0;
                    }
                }

                //point box around each start point to its cluster
                //FIXME: unsafe in case of overplotting; better to have a labeled edgelist..
                const colors = colorMaps[maybeClusters.clusters.centers.length - 1];
                maybeClusters.edges.forEach((pair, i) => {
                    const clusterIdx = maybeClusters.clusters.labeling[i];
                    // const cluster = maybeClusters.clusters.centers[clusterIdx];
                    const startPoint = maybeClusters.points[pair[0]];

                    const color = colors[clusterIdx];

                    const col = startPoint[0] * texImg.width;
                    const row = startPoint[1] * texImg.height;

                    const range = 3;

                    for (let a = -range; a < range; a++) {
                        for (let b = -range; b < range; b++) {
                            let idx =
                                (Math.floor(row + a) * texImg.width + Math.floor(col + b)) * 4;
                            idx = Math.max(0, Math.min(texImg.width * texImg.height * 4, idx)); //clamp

                            imageData.data[idx] = color[0];
                            imageData.data[idx + 1] = color[1];
                            imageData.data[idx + 2] = color[2];
                            imageData.data[idx + 3] = 255;
                        }
                    }
                });
            } else {
                logger.debug('Using preset colors from %s', imageURL);
            }
        } catch (e) {
            log.makeQErrorHandler(logger, 'bad cluster load')(e);
        }

        renderer.colorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, renderer.colorTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            imageData ? imageData : texImg
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);

        logger.trace('Finished setting colormap');
    });
});

//async (may trigger a write)
const createBuffer = Q.promised((renderer, data) => {
    logger.trace(
        'Creating gl buffer of type %s. Constructor: %o',
        typeof data,
        (data || {}).constructor
    );

    const buffer = renderer.gl.createBuffer();
    const bufObj = {
        buffer: buffer,
        gl: renderer.gl,
        len: typeof data === 'number' ? data : data.byteLength
    };

    bufObj.delete = Q.promised(() => {
        renderer.gl.deleteBuffer(buffer);
        return renderer;
    });
    bufObj.write = write.bind(this, bufObj);

    if (data) {
        return bufObj.write(data);
    } else {
        return bufObj;
    }
});

const write = Q.promised((buffer, data) => {
    buffer.gl.bindBuffer(buffer.gl.ARRAY_BUFFER, buffer.buffer);
    buffer.gl.bufferData(buffer.gl.ARRAY_BUFFER, data, buffer.gl.DYNAMIC_DRAW);
    buffer.gl.finish();
    return buffer;
});

/**
 * Shortcut method to find the location of an attribute, bind a buffer, and then set the
 * attribute to the buffer
 *
 * @param program - the program object with the attribute you want to bind to the buffer
 * @param buffer - the buffer you want to bind to the attribute
 * @param {string} attribute - the name of the attribute you wish to bind
 * @param {number} elementsPerItem - the number of elements to use for each rendered item (e.g.,
 * use two floats per point). Passed directly to gl.vertexAttribPointer() as 'size' argument.
 * @param glType - the WebGL type of the array (e.g., gl.FLOAT)
 * @param {boolean} normalize - should the data be normalized before being processed by shaders
 * @param {number} stride - the number of bytes between item elements (normally
 * elementsPerItem * sizeof(type))
 * @param {number} offset - the number of bytes from the start of the buffer to begin reading
 */
function bindVertexAttrib(
    program,
    buffer,
    attribute,
    elementsPerItem,
    glType,
    normalize,
    stride,
    offset
) {
    const gl = program.renderer.gl;
    // TODO: cache this, because getAttribLocation is a CPU/GPU synchronization
    const location = gl.getAttribLocation(program.glProgram, attribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, elementsPerItem, glType, normalize, stride, offset);

    return program;
}

/**
 * Enable or disable the drawing of elements in the scene. Elements are one of: points, edges,
 * midpoints, midedges.
 *
 * @param renderer - the renderer object created with GLRunner.create()
 * @param {Object} visible - An object with keys for 0 or more objects to set the visibility
 * for. Each value should be true or false.
 * @returns the renderer object passed in, with visibility options updated
 */
function setVisible(renderer, visible) {
    _.extend(renderer, { visible: visible });

    return renderer;
}

/**
 * Determines if the element passed in should be visible in image
 *
 * @param renderer - the renderer object created with GLRunner.create()
 * @param element - the name of the element to check visibility for
 *
 * @returns a boolean value determining if the object should be visible (false by default)
 */
function isVisible(renderer, element) {
    // TODO: check the length of the associated buffer to see if it's >0; return false if not.
    return renderer.visible[element] || false;
}

/**
 * Simple wrapper for gl.finish() (allows other Render* classes to override if not using GL)
 *
 * @param renderer - the renderer object created with GLRunner.create()
 * @return the return value of the gl.finish() call
 */
function finish(renderer) {
    return renderer.gl.finish();
}

const render = Q.promised(renderer => {
    const gl = renderer.gl;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // If there are no points in the graph, don't render anything
    if (renderer.numPoints < 1) {
        return renderer;
    }

    if (renderer.numEdges > 0) {
        if (renderer.isVisible('edges')) {
            renderer.programs.edges.use();
            renderer.programs.edges.bindVertexAttrib(
                renderer.buffers.springs,
                'curPos',
                renderer.elementsPerPoint,
                gl.FLOAT,
                false,
                renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
                0
            );
            gl.drawArrays(gl.LINES, 0, renderer.numEdges * 2);
        }

        if (renderer.isVisible('midedges')) {
            if (renderer.colorTexture === null) {
                renderer.programs.midedges.use();
                renderer.programs.midedges.bindVertexAttrib(
                    renderer.buffers.midSprings,
                    'curPos',
                    renderer.elementsPerPoint,
                    gl.FLOAT,
                    false,
                    renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
                    0
                );
                gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
            } else {
                renderer.programs.midedgestextured.use();
                renderer.programs.midedgestextured.bindVertexAttrib(
                    renderer.buffers.midSprings,
                    'curPos',
                    renderer.elementsPerPoint,
                    gl.FLOAT,
                    false,
                    renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
                    0
                );
                renderer.programs.midedgestextured.bindVertexAttrib(
                    renderer.buffers.midSpringsColorCoord,
                    'aColorCoord',
                    renderer.elementsPerPoint,
                    gl.FLOAT,
                    false,
                    renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
                    0
                );
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, renderer.colorTexture);
                gl.uniform1i(
                    gl.getUniformLocation(renderer.programs.midedgestextured.glProgram, 'uSampler'),
                    0
                );
                gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
            }
        }
    }

    if (renderer.isVisible('points')) {
        renderer.programs.points.use();
        renderer.programs.points.bindVertexAttrib(
            renderer.buffers.curPoints,
            'curPos',
            renderer.elementsPerPoint,
            gl.FLOAT,
            false,
            renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
            0
        );
        renderer.programs.points.bindVertexAttrib(
            renderer.buffers.pointSizes,
            'pointSize',
            1,
            gl.UNSIGNED_BYTE,
            false,
            0,
            0
        );
        renderer.programs.points.bindVertexAttrib(
            renderer.buffers.pointColors,
            'pointColor',
            4,
            gl.UNSIGNED_BYTE,
            true,
            Uint32Array.BYTES_PER_ELEMENT,
            0
        );
        gl.drawArrays(gl.POINTS, 0, renderer.numPoints);
    }

    if (renderer.isVisible('midpoints')) {
        renderer.programs.midpoints.use();
        renderer.programs.midpoints.bindVertexAttrib(
            renderer.buffers.curMidPoints,
            'curPos',
            renderer.elementsPerPoint,
            gl.FLOAT,
            false,
            renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
            0
        );
        gl.drawArrays(gl.POINTS, 0, renderer.numMidPoints);
    }

    gl.finish();

    return renderer;
});

export {
    create,
    createProgram,
    setColorMap,
    setCamera2d,
    createBuffer,
    write,
    bindVertexAttrib,
    setVisible,
    isVisible,
    render
};
