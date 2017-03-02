import glMatrix from 'gl-matrix';
import { Observable } from 'rxjs';
import { Renderer } from './Renderer';

import pointVertex from '../shaders/point.vertex.glsl';
import pointFragment from '../shaders/point.fragment.glsl';
import edgeVertex from '../shaders/edge.vertex.glsl';
import edgeFragment from '../shaders/edge.fragment.glsl';
import midpointVertex from '../shaders/midpoint.vertex.glsl';
import midpointFragment from '../shaders/midpoint.fragment.glsl';
import midedgeVertex from '../shaders/midedge.vertex.glsl';
import midedgeFragment from '../shaders/midedge.fragment.glsl';
import midedgeTexturedVertex from '../shaders/midedge-textured.vertex.glsl';
import midedgeTexturedFragment from '../shaders/midedge-textured.fragment.glsl';

export class GLRenderer extends Renderer {

    static programs = {
        points: [pointVertex, pointFragment],
        edges: [edgeVertex, edgeFragment],
        midpoints: [midpointVertex, midpointFragment],
        midedges: [midedgeVertex, midedgeFragment],
        midedgestextured: [midedgeTexturedVertex, midedgeTexturedFragment]
    };

    static colorMaps = [
        [[0,0,0]], //1
        [[255,0,0],[0,0,255]], //2
        [[141,211,199],[255,255,179],[190,186,218]],
        [[141,211,199],[255,255,179],[190,186,218], [251,128,114]],
        [[228,26,28], [55,126,184], [77,175,74], [152,78,163], [255,127,0]],
        [[228,26,28], [55,126,184], [77,175,74], [152,78,163], [255,127,0], [255,255,51]],
        [[228,26,28], [55,126,184], [77,175,74], [152,78,163], [255,127,0], [255,255,51], [166,86,40]],
        [[228,26,28], [55,126,184], [77,175,74], [152,78,163], [255,127,0], [255,255,51], [166,86,40], [247,129,191]],
        [[228,26,28], [55,126,184], [77,175,74], [152,78,163], [255,127,0], [255,255,51], [166,86,40], [247,129,191], [153,153,153]],
        [[166,206,227], [31,120,180], [178,223,138], [51,160,44], [251,154,153], [227,26,28], [253,191,111], [255,127,0], [202,178,214], [106,61,154]],
        [[166,206,227], [31,120,180], [178,223,138], [51,160,44], [251,154,153], [227,26,28], [253,191,111], [255,127,0], [202,178,214], [106,61,154], [255,255,153]],
        [[166,206,227], [31,120,180], [178,223,138], [51,160,44], [251,154,153], [227,26,28], [253,191,111], [255,127,0], [202,178,214], [106,61,154], [255,255,153], [177,89,40]]
    ];

    constructor(document, canvas, bgColor, dimensions, visible = {}) {
        super(document);

        this.canvas = canvas;

        // The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
        // set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        this.gl = this.initWebGL(canvas, bgColor);
        this.elementsPerPoint = 2;
        this.numPoints = 0;
        this.numEdges = 0;
        this.numMidPoints = 0;
        this.numMidEdges = 0;
        this.colorTexture = null;

        this.setVisible({
            points: true,
            edges: true,
            midpoints: false,
            midedges: false,
            ... visible
        });

        this.programs = this.createPrograms(GLRenderer.programs);

        // TODO: Enlarge the camera by the (size of gl points / 2) so that points are fully
        // on screen even if they're at the edge of the graph.
        this.setCamera2d(-0.01, dimensions[0] + 0.01, -0.01, dimensions[1] + 0.01);
    }

    initWebGL(canvas, bgColor) {

        const gl = canvas.getContext('webgl', {
            antialias: true,
            premultipliedAlpha: false
        });

        if(gl === null) {
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
        gl.enable(gl.POINT_SMOOTH | 0x0B10);
        gl.clearColor(bgColor);
        // Lines should be 1px wide
        gl.lineWidth(1);

        return gl;
    }

    createPrograms(shaders) {

        const { gl } = this;
        const programs = {};

        for (const name in shaders) {
            const [vertexShader, fragmentShader] = shaders[name];
            programs[name] = new GLProgram(gl, vertexShader, fragmentShader);
        }

        return programs;
    }

    createProgram(vertexShader, fragmentShader) {
        return new GLProgram(this.gl, vertexShader, fragmentShader);
    }

    setCamera2d(left, right, bottom, top) {

        const { gl, programs } = this;
        const { mat2d, mat3, vec2 } = glMatrix;

        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);

        const mvpMatrix = mat2d.create();
        mat2d.scale(mvpMatrix, mvpMatrix, vec2.fromValues(-2 * lr, -2 * bt));
        mat2d.translate(mvpMatrix, mvpMatrix, vec2.fromValues((left + right) * lr, (top + bottom) * bt));

        const mvpMat3 = mat3.create();
        mat3.fromMat2d(mvpMat3, mvpMatrix);

        for (const programName in programs) {
            const { glProgram: program } = programs[programName];
            gl.useProgram(program);
            const mvpLocation = gl.getUniformLocation(program, 'mvp');
            gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);
        }

        return this;
    }

    /**
     * Fetch the image at the given URL and use it when coloring edges in the graph.
     */
    setColorMap(imageURL, maybeClusters) {

        const { gl } = this;

        return loadImage(imageURL).map((image) => {

            let imageData = image;

            if (typeof window !== 'undefined' && maybeClusters) {

                const canvas = this.document.createElement('canvas');
                const { width, height } = image;
                const context = canvas.getContext('2d');

                canvas.width = width;
                canvas.height = height;
                imageData = context.createImageData ?
                    ctx.createImageData(image.width, image.height) :
                    { data: new Uint8Array(image.width * image.height * 4) };


                const { data } = imageData;
                //default to white/transparent
                for (let x = 0; x < width; x++) {
                    for (let y = 0; y < height; y++) {
                        const i = 4 * (y * width + x);
                        data[i] = 255;
                        data[i+1] = 255;
                        data[i+2] = 255;
                        data[i+3] = 0;
                    }
                }

                //point box around each start point to its cluster
                //FIXME: unsafe in case of overplotting; better to have a labeled edgelist..
                const { colorMaps } = GLRenderer;
                const { edges, points, clusters: { centers, labeling }} = maybeClusters;
                const colors = colorMaps[centers.length - 1];

                for (let i = -1, n = edges.length; ++i < n;) {

                    const edgePair = edges[i];
                    const startPoint = points[edgePair[0]];
                    const clusterIndex = labeling[i];
                    const clusterColor = colors[clusterIndex];

                    const col = startPoint[0] * width;
                    const row = startPoint[1] * height;
                    const range = 3;

                    for (let a = -range; a < range; ++a) {
                        for (let b = -range; b < range; ++b) {

                            const idx = Math.max(
                                0, Math.min(
                                    width * height * 4,
                                    ((Math.floor(row + a) * width) + Math.floor(col + b)) * 4));

                            data[idx] = clusterColor[0];
                            data[idx + 1] = clusterColor[1];
                            data[idx + 2] = clusterColor[2];
                            data[idx + 3] = 255;
                        }
                    }
                }
            }

            this.colorTexture = gl.createTexture();

            gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);

            return this;
        });
    }

    createBuffer(data) {
        const { gl } = this;
        const buffer = new GLBuffer(gl, gl.createBuffer());
        return Observable.of(data ? buffer.write(data) : buffer);
    }

    render() {

        const { gl, numPoints, numEdges } = this;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (numPoints < 1) {
            return this;
        }

        if (numEdges > 0) {
            if (this.isVisible('edges')) {
                this.renderEdges();
            }
            if (this.isVisible('midedges')) {
                this.renderMidEdges();
            }
        }

        if (this.isVisible('points')) {
            this.renderPoints();
        }

        if (this.isVisible('midpoints')) {
            this.renderMidPoints();
        }

        return this.finish();
    }

    renderEdges() {
        const { gl, numEdges, elementsPerPoint,
                programs: { edges }, buffers: { springs }} = this;
        edges.use();
        edges.bindVertexAttrib(springs, 'curPos',
                elementsPerPoint, gl.FLOAT, false,
                elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.drawArrays(gl.LINES, 0, numEdges * 2);
    }

    renderMidEdges() {
        const { gl, colorTexture, numMidEdges, elementsPerPoint,
                programs: { midedges, midedgestextured },
                buffers: { midSprings, midSpringsColorCoord }} = this;

        if (colorTexture == null) {
            midedges.use();
            midedges.bindVertexAttrib(midSprings, 'curPos',
                    elementsPerPoint, gl.FLOAT, false,
                    elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
            gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
        } else {
            midedgestextured.use();
            midedgestextured.bindVertexAttrib(midSprings, 'curPos',
                    elementsPerPoint, gl.FLOAT, false,
                    elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
            midedgestextured.bindVertexAttrib(midSpringsColorCoord, 'aColorCoord',
                    elementsPerPoint, gl.FLOAT, false,
                    elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, colorTexture);
            gl.uniform1i(gl.getUniformLocation(midedgestextured.glProgram, 'uSampler'), 0);
            gl.drawArrays(gl.LINES, 0, numMidEdges * 2);
        }
    }

    renderPoints() {
        const { gl, numPoints, elementsPerPoint, programs: { points },
                buffers: { curPoints, pointSizes, pointColors }} = this;
        points.use();
        points.bindVertexAttrib(curPoints, 'curPos',
            elementsPerPoint, gl.FLOAT, false,
            elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
        points.bindVertexAttrib(pointSizes, 'pointSize',
            1, gl.UNSIGNED_BYTE, false, 0, 0);
        points.bindVertexAttrib(pointColors, 'pointColor',
            4, gl.UNSIGNED_BYTE, true, Uint32Array.BYTES_PER_ELEMENT, 0);
        gl.drawArrays(gl.POINTS, 0, numPoints);
    }

    renderMidPoints() {
        const { gl, numMidPoints, elementsPerPoint,
                programs: { midpoints }, buffers: { curMidPoints }} = this;
        midpoints.use();
        midpoints.bindVertexAttrib(curMidPoints, 'curPos',
            elementsPerPoint, gl.FLOAT, false,
            elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.drawArrays(gl.POINTS, 0, numMidPoints);
    }

    finish() {
        this.gl.finish();
        return this;
    }
}

class GLBuffer {
    constructor(gl, buffer) {
        this.gl = gl;
        this.buffer = buffer;
    }
    delete() {
        const { gl, buffer } = this;
        gl.deleteBuffer(buffer);
        this.gl = this.buffer = null;
        return this;
    }
    write(data) {
        const { gl, buffer } = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.finish();
        return this;
    }
}

class GLProgram {
    constructor(gl, vertextShader, fragmentShader) {
        this.program = gl.createProgram();
        this.vertextShader = this.compileShader(gl, vertexShader, gl.VERTEX_SHADER);
        this.fragmentShader = this.compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);
    }
    use() {
        this.gl.useProgram(this.program);
    }
    /**
     * Shortcut method to find the location of an attribute, bind a buffer, and then set the
     * attribute to the buffer
     *
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
    bindVertexAttrib(buffer, attribute, elementsPerItem, glType, normalize, stride, offset) {
        const { gl, program } = this;
        // TODO: cache this, because getAttribLocation is a CPU/GPU synchronization
        const location = gl.getAttribLocation(program, attribute);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, elementsPerItem, glType, normalize, stride, offset);

        return program;
    }

    compileShader(gl, source, type) {

        const sanitizedShaderSource =
            (typeof(window) === 'undefined' ? '#version 120\n' : '') +
            source.replace(/(precision [a-z]* float;)/g,'#ifdef GL_ES\n$1\n#endif\n');

        const shader = gl.createShader(type);
        gl.shaderSource(shader, sanitizedShaderSource);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const err = new Error(`Error compiling WebGL shader (shader type: ${type})`);
            // logger.error(err, gl.getShaderInfoLog(shader));
            throw err;
        }

        if (!gl.isShader(shader)) {
            throw new Error('After compiling shader, WebGL is reporting it is not valid.');
        }

        gl.attachShader(this.program, shader);

        return shader;
    }
}

function loadImage(url) {
    return Observable.create((observer) => {
        let errorValue = null;
        let errorHappened = false;
        try {
            const image = new Image();
            image.onload = () => { observer.next(image); observer.complete(); };
            image.onerror = (e) => observer.error(e);
            image.src = url;
        } catch (e) {
            errorValue = e;
            errorHappened = true;
        } finally {
            if (errorHappened) {
                observer.error(errorValue);
            }
        }
        return () => {
            image.src = null;
            image.onload = null;
            image.onerror = null;
        };
    });
}
