!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Grapher=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Q = _dereq_('Q');
var glMatrix = _dereq_('gl-matrix');
var events = _dereq_('./SimpleEvents.js');


    'use strict';

    var STEP_NUMBER_ON_CHANGE = 30;
    var elementsPerPoint = 2;


    /**
     * Create a new N-body graph and return a promise for the graph object
     *
     * @param simulator - the module of the simulator backend to use
     * @param renderer - the module of the rendering backend to use
     * @param document - parent document DOM
     * @param canvas - the canvas DOM element to draw the graph in
     * @param bgColor - [0--255,0--255,0--255,0--1]
     * @param [dimensions=\[1,1\]] - a two element array [width,height] used for internal posituin calculations.
     */
    function create(simulator, renderer, document, canvas, bgColor, dimensions, numSplits) {
        dimensions = dimensions || [1,1];
        numSplits = numSplits || 0;

        return renderer.create(document, canvas, bgColor, dimensions)
        .then(function(rend) {
            console.debug('CREATED RENDERER')
            return simulator.create(rend, dimensions, numSplits).then(function(sim) {
                console.debug('CREATED SIMULATOR')
                var graph = {
                    "renderer": rend,
                    "simulator": sim
                };
                graph.setPoints = setPoints.bind(this, graph);
                graph.setEdges = setEdges.bind(this, graph);
                graph.setPhysics = setPhysics.bind(this, graph);
                graph.setVisible = setVisible.bind(this, graph);
                graph.setLocked = setLocked.bind(this, graph);
                graph.setColorMap = setColorMap.bind(this, graph);
                graph.tick = tick.bind(this, graph);
                graph.stepNumber = 0;
                graph.dimensions = dimensions;
                graph.numSplits = numSplits;

                return graph;
            });
        });
    }


    function setPoints(graph, points) {
        // FIXME: If there is already data loaded, we should to free it before loading new data
        if(!(points instanceof Float32Array)) {
            points = _toTypedArray(points, Float32Array);
        }

        graph.__pointsHostBuffer = points;

        graph.stepNumber = 0;
        return graph.simulator.setPoints(points)
        .then(function() {
            return graph;
        });
    }


    var setEdges = Q.promised(function(graph, edges) {

        if (edges.length < 1)
            return Q.fcall(function() { return graph; });

        if (!(edges instanceof Uint32Array)) {
            edges = _toTypedArray(edges, Uint32Array);
        }

        console.debug("Number of edges:", edges.length / 2);

        var edgesFlipped = new Uint32Array(edges.length);
        for (var i = 0; i < edges.length; i++)
            edgesFlipped[i] = edges[edges.length - 1 - i];

        function encapsulate(edges) {

            var edgeList = new Array(edges.length / 2);
            for (var i = 0; i < edges.length; i++)
                edgeList[i / 2] = [edges[i], edges[i + 1]];

            edgeList.sort(function(a, b) {
                return a[0] < b[0] ? -1
                    : a[0] > b[0] ? 1
                    : a[1] - b[1];
            });

            var workItems = [];
            var current_source = edgeList[0][0];
            var workItem = [0, 1];
            edgeList.forEach(function (edge, i) {
                if (i == 0) return;
                if(edge[0] == current_source) {
                    workItem[1]++;
                } else {
                    workItems.push(workItem[0]);
                    workItems.push(workItem[1]);
                    current_source = edge[0];
                    workItem = [i, 1];
                }
            });
            workItems.push(workItem[0]);
            workItems.push(workItem[1]);

            //Cheesey load balancing
            //TODO benchmark
            workItems.sort(function (edgeList1, edgeList2) {
                return edgeList1.length - edgeList2.length;
            });

            var edgesFlattened = new Uint32Array(edges.length);
            for (var i = 0; i < edgeList.length; i++) {
                edgesFlattened[2 * i] = edgeList[i][0];
                edgesFlattened[2 * i + 1] = edgeList[i][1];
            }

            return {
                edgesTyped: edgesFlattened,
                numWorkItems: workItems.length,
                workItemsTyped: new Uint32Array(workItems)
            };
        }

        var forwardEdges = encapsulate(edges);
        var backwardsEdges = encapsulate(edgesFlipped);

        var nDim = graph.dimensions.length;
        var midPoints = new Float32Array((edges.length / 2) * graph.numSplits * nDim || 1);
        if (graph.numSplits) {
            for (var i = 0; i < edges.length; i+=2) {
                var src = edges[i];
                var dst = edges[i + 1];
                for (var d = 0; d < nDim; d++) {
                    var start = graph.__pointsHostBuffer[src * nDim + d];
                    var end = graph.__pointsHostBuffer[dst * nDim + d];
                    var step = (end - start) / (graph.numSplits + 1);
                    for (var q = 0; q < graph.numSplits; q++) {
                        midPoints[(i * graph.numSplits + q) * nDim + d] = start + step * (q + 1);
                    }
                }
            }
        }
        console.debug('Number of control points:', edges.length * graph.numSplits, graph.numSplits);

        return graph.simulator.setEdges(forwardEdges, backwardsEdges, midPoints)
        .then(function() { return graph; });
    });


    function setPhysics(graph, opts) {
        graph.stepNumber = STEP_NUMBER_ON_CHANGE;
        graph.simulator.setPhysics(opts);
    }


    function setVisible(graph, opts) {
        graph.renderer.setVisible(opts);
    }


    function setLocked(graph, opts) {
        //TODO reset step number?
        graph.simulator.setLocked(opts);
    }


    function setColorMap(graph, imageURL, maybeClusters) {
        return graph.renderer.setColorMap(imageURL, maybeClusters)
        .then(function() {
            return graph;
        });
    }


    // Turns an array of vec3's into a Float32Array with elementsPerPoint values for each element in
    // the input array.
    function _toTypedArray(array, cons) {
        var floats = new cons(array.length * elementsPerPoint);

        for(var i = 0; i < array.length; i++) {
            var ii = i * elementsPerPoint;
            floats[ii + 0] = array[i][0];
            floats[ii + 1] = array[i][1];
        }

        return floats;
    }


    function tick(graph) {
        events.fire("tickBegin");
            events.fire("simulateBegin");

            return graph.simulator.tick(graph.stepNumber++)
            .then(function() {
                events.fire("simulateEnd");
                events.fire("renderBegin");

                console.debug("RENDER")

                return graph.renderer.render();
            })
            .then(function() {
                console.debug("RENDERED")
                events.fire("renderEnd");
                events.fire("tickEnd");

                return graph;
            });
        // }
    }


    module.exports = {
        "elementsPerPoint": elementsPerPoint,
        "create": create,
        "setPoints": setPoints,
        "setEdges": setEdges,
        "setColorMap": setColorMap,
        "tick": tick
    };

},{"./SimpleEvents.js":4,"Q":13,"gl-matrix":14}],2:[function(_dereq_,module,exports){
var Q = _dereq_('Q');
var glMatrix = _dereq_('gl-matrix');
var util = _dereq_('./util.js');

    'use strict';

    var create = Q.promised(function(document, canvas, bgColor, dimensions, visible) {
        visible = visible || {};

        var renderer = {document: document, canvas: canvas};

        // The dimensions of a canvas, by default, do not accurately reflect its size on screen (as
        // set in the HTML/CSS/etc.) This changes the canvas size to match its size on screen.
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        var gl = canvas.getContext("webgl", {antialias: true, premultipliedAlpha: false});
        if(gl === null) {
            throw new Error("Could not initialize WebGL");
        }

        // Set up WebGL settings
        gl.enable(gl.BLEND);
        // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor.apply(gl, bgColor);
        // Lines should be 1px wide
        gl.lineWidth(1);

        // Populate the renderer object with default values, empty containers, etc.
        renderer.gl = gl;
        renderer.canvas = canvas;
        renderer.buffers = {};
        renderer.programs = {};
        renderer.elementsPerPoint = 2;
        renderer.numPoints = 0;
        renderer.numEdges = 0;
        renderer.numMidPoints = 0;
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

        renderer.visible = {points: true, edges: true, midpoints: false, midedges: false};
        renderer.setVisible(visible);


        return Q.all(
            ['point', 'edge', 'midpoint', 'midedge', 'midedge-textured'].map(function (name) {
                return renderer.createProgram(name + '.vertex', name + '.fragment');
        }))
        .spread(function (pointProgram, edgeProgram, midpointProgram, midedgeProgram, midedgeTexturedProgram) {
            renderer.programs["points"] = pointProgram;
            renderer.programs["edges"] = edgeProgram;
            renderer.programs["midpoints"] = midpointProgram;
            renderer.programs["midedges"] = midedgeProgram;
            renderer.programs["midedgestextured"] = midedgeTexturedProgram;

            // TODO: Enlarge the camera by the (size of gl points / 2) so that points are fully
            // on screen even if they're at the edge of the graph.
            return renderer.setCamera2d(-0.01, dimensions[0] + 0.01, -0.01, dimensions[1] + 0.01);
        });
    });


    function createProgram(renderer, vertexShaderID, fragmentShaderID) {
        var gl = renderer.gl;

        var pragObj = {};

        pragObj.renderer = renderer;
        pragObj.glProgram = gl.createProgram();
        pragObj.bindVertexAttrib = bindVertexAttrib.bind(this, pragObj);
        pragObj.use = function() {
            gl.useProgram(pragObj.glProgram);
        }
        pragObj.attributes = {};

        return Q.all([
            util.getSource(vertexShaderID + ".glsl"),
            util.getSource(fragmentShaderID + ".glsl")
        ])
        .spread(function(vertShaderSource, fragShaderSource) {

            function compileShader(program, shaderSource, shaderType) {

                var sanitizedShaderSource = shaderSource.replace(
                    /(precision [a-z]* float;)/g,"#ifdef GL_ES\n$1\n#endif\n");

                var shader = renderer.gl.createShader(shaderType);
                renderer.gl.shaderSource(shader, sanitizedShaderSource);
                renderer.gl.compileShader(shader);
                if(!renderer.gl.getShaderParameter(shader, renderer.gl.COMPILE_STATUS)) {
                    throw new Error("Error compiling WebGL shader (shader type: " + shaderType + ")");
                }
                if(!renderer.gl.isShader(shader)) {
                    throw new Error("After compiling shader, WebGL is reporting it is not valid");
                }
                renderer.gl.attachShader(program.glProgram, shader);

                return shader;
            }

            pragObj.vertexShader   = compileShader(pragObj, vertShaderSource, gl.VERTEX_SHADER);
            pragObj.fragmentShader = compileShader(pragObj, fragShaderSource, gl.FRAGMENT_SHADER);

            gl.linkProgram(pragObj.glProgram);
            return pragObj;
        });
    }


    var setCamera2d = Q.promised(function(renderer, left, right, bottom, top) {
        renderer.gl.viewport(0, 0, renderer.canvas.width, renderer.canvas.height);

        var lr = 1 / (left - right),
            bt = 1 / (bottom - top);

        var mvpMatrix = glMatrix.mat2d.create();
        glMatrix.mat2d.scale(mvpMatrix, mvpMatrix, glMatrix.vec2.fromValues(-2 * lr, -2 * bt));
        glMatrix.mat2d.translate(mvpMatrix, mvpMatrix, glMatrix.vec2.fromValues((left+right)*lr, (top+bottom)*bt));

        var mvpMat3 = glMatrix.mat3.create();
        glMatrix.mat3.fromMat2d(mvpMat3, mvpMatrix);

        ['points', 'edges', 'midpoints', 'midedges', 'midedgestextured'].forEach(function (name) {
            var program = renderer.programs[name].glProgram;
            renderer.gl.useProgram(program);
            var mvpLocation = renderer.gl.getUniformLocation(program, "mvp");
            renderer.gl.uniformMatrix3fv(mvpLocation, false, mvpMat3);
        })

        return renderer;
    });



    var colorMaps =
        [
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




    /**
     * Fetch the image at the given URL and use it when coloring edges in the graph.
     */
    var setColorMap = Q.promised(function(renderer, imageURL, maybeClusters) {
        // TODO: Allow a user to clear the color map by passing in a null here or something
        var gl = renderer.gl;

        return util.getImage(imageURL)
        .then(function(texImg) {

            var imageData;
            try {
            if (maybeClusters) {

                var canvas = document.createElement("canvas");
                canvas.width = texImg.width;
                canvas.height = texImg.height;

                var ctx = canvas.getContext("2d");
                if (ctx.createImageData) {
                    imageData = ctx.createImageData(texImg.width, texImg.height);
                } else {
                    imageData = {
                        data: new Uint8Array(texImg.width * texImg.height * 4)
                    }
                }

                //default to white/transparent
                for (var x = 0; x < texImg.width; x++) {
                    for (var y = 0; y < texImg.height; y++) {
                        var i = 4 * (y * texImg.width + x);
                        imageData.data[i] = 255;
                        imageData.data[i+1] = 255;
                        imageData.data[i+2] = 255;
                        imageData.data[i+3] = 0;
                    }
                }

                //point box around each start point to its cluster
                //FIXME: unsafe in case of overplotting; better to have a labeled edgelist..
                var colors = colorMaps[maybeClusters.clusters.centers.length - 1];
                maybeClusters.edges.forEach(function (pair, i) {
                    var clusterIdx = maybeClusters.clusters.labeling[i];
                    var cluster = maybeClusters.clusters.centers[clusterIdx];
                    var startPoint = maybeClusters.points[pair[0]];

                    var color = colors[clusterIdx];

                    var col = startPoint[0] * texImg.width;
                    var row = startPoint[1] * texImg.height;

                    var range = 3;

                    for (var a = -range; a < range; a++) {
                        for (var b = -range; b < range; b++) {

                            var idx = (Math.floor(row + a) * texImg.width + Math.floor(col+b)) * 4;
                            idx = Math.max(0, Math.min(texImg.width * texImg.height * 4, idx)); //clamp

                            imageData.data[idx] = color[0];
                            imageData.data[idx+1] = color[1];
                            imageData.data[idx+2] = color[2];
                            imageData.data[idx+3] = 255;
                        }
                    }
                });
            }
            } catch (e) {
                console.error('bad cluster load', e, e.stack);
            }



            renderer.colorTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, renderer.colorTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData ? imageData.data : texImg);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        });
    });


    var createBuffer = Q.promised(function(renderer, data) {
        console.debug('creating gl buffer', typeof(data), data.constructor)
        var buffer = renderer.gl.createBuffer();
        var bufObj = {
            "buffer": buffer,
            "gl": renderer.gl,
            "len": typeof(data) == 'number' ? data : data.length
        };

        bufObj.delete = Q.promised(function() {
            renderer.gl.deleteBuffer(buffer);
            return renderer;
        })
        bufObj.write = write.bind(this, bufObj);

        if(data) {
            return bufObj.write(data);
        } else {
            return bufObj;
        }
    });


    var write = Q.promised(function(buffer, data) {
        buffer.gl.bindBuffer(buffer.gl.ARRAY_BUFFER, buffer.buffer);
        buffer.gl.bufferData(buffer.gl.ARRAY_BUFFER, data, buffer.gl.DYNAMIC_DRAW);
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
    function bindVertexAttrib(program, buffer, attribute, elementsPerItem, glType, normalize, stride, offset) {
        var gl = program.renderer.gl;
        // TODO: cache this, because getAttribLocation is a CPU/GPU synchronization
        var location = gl.getAttribLocation(program.glProgram, attribute);

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
        util.extend(renderer.visible, visible);

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
        return (renderer.visible[element] || false);
    }


    var render = Q.promised(function(renderer) {
        var gl = renderer.gl;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // If there are no points in the graph, don't render anything
        if(renderer.numPoints < 1) {
            return renderer;
        }


        if(renderer.numEdges > 0) {
            if (renderer.isVisible("edges")) {
                console.debug('RENDER: EDGES')
                renderer.programs["edges"].use();
                renderer.programs["edges"].bindVertexAttrib(renderer.buffers.springs, "curPos",
                    renderer.elementsPerPoint, gl.FLOAT, false,
                    renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
                gl.drawArrays(gl.LINES, 0, renderer.numEdges * 2);
            }

            if (renderer.isVisible("midedges")) {
                console.debug('RENDER: MIDEDGES')
                if(renderer.colorTexture === null) {
                    renderer.programs["midedges"].use();
                    renderer.programs["midedges"].bindVertexAttrib(renderer.buffers.midSprings, "curPos",
                        renderer.elementsPerPoint, gl.FLOAT, false,
                        renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
                    gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
                } else {
                    renderer.programs["midedgestextured"].use();
                    renderer.programs["midedgestextured"].bindVertexAttrib(renderer.buffers.midSprings, "curPos",
                        renderer.elementsPerPoint, gl.FLOAT, false,
                        renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
                    renderer.programs["midedgestextured"].bindVertexAttrib(renderer.buffers.midSpringsColorCoord, "aColorCoord",
                        renderer.elementsPerPoint, gl.FLOAT, false,
                        renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, renderer.colorTexture);
                    gl.uniform1i(gl.getUniformLocation(renderer.programs["midedgestextured"].glProgram, "uSampler"), 0);
                    gl.drawArrays(gl.LINES, 0, renderer.numMidEdges * 2);
                }

            }
        }

        if (renderer.isVisible("points")) {
                console.debug('RENDER: POINTS')
            renderer.programs["points"].use();
            renderer.programs["points"].bindVertexAttrib(renderer.buffers.curPoints, "curPos",
                renderer.elementsPerPoint, gl.FLOAT, false,
                renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0)
            gl.drawArrays(gl.POINTS, 0, renderer.numPoints);
        }

        if (renderer.isVisible("midpoints")) {
                console.debug('RENDER: MIDPOINTS')
            renderer.programs["midpoints"].use();
            renderer.programs["midpoints"].bindVertexAttrib(renderer.buffers.curMidPoints, "curPos",
                renderer.elementsPerPoint, gl.FLOAT, false,
                renderer.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 0);
            gl.drawArrays(gl.POINTS, 0, renderer.numMidPoints);
        }

        gl.finish();

        return renderer;
    });


    module.exports = {
        "create": create,
        "createProgram": createProgram,
        "setColorMap": setColorMap,
        "setCamera2d": setCamera2d,
        "createBuffer": createBuffer,
        "write": write,
        "bindVertexAttrib": bindVertexAttrib,
        "setVisible": setVisible,
        "isVisible": isVisible,
        "render": render
    };

},{"./util.js":12,"Q":13,"gl-matrix":14}],3:[function(_dereq_,module,exports){

var Q = _dereq_('Q');
var util = _dereq_('./util.js');
var cljs = _dereq_('./cl.js');

if (typeof(window) == 'undefined') {
    webcl = _dereq_('node-webcl');
}



    "use strict";

    Q.longStackSupport = true;
    var randLength = 73;


    function create(renderer, dimensions, numSplits, locked) {
        return cljs.create(renderer.gl)
        .then(function(cl) {
            console.debug('CREATE CL (from gl)')
            // Compile the WebCL kernels
            return util.getSource("apply-forces.cl")
            .then(function(source) {
                console.debug('GOT SOURCE')
                return cl.compile(source, ["apply_points", "apply_springs", "apply_midpoints", "apply_midsprings"]);
            })
            .then(function(kernels) {
                console.debug('COMPILED')
                var simObj = {
                    "renderer": renderer,
                    "cl": cl,
                    "pointKernel": kernels["apply_points"],
                    "edgesKernel": kernels["apply_springs"],
                    "midPointKernel": kernels["apply_midpoints"],
                    "midEdgesKernel": kernels["apply_midsprings"],
                    "elementsPerPoint": 2
                };
                simObj.tick = tick.bind(this, simObj);
                simObj.setPoints = setPoints.bind(this, simObj);
                simObj.setEdges = setEdges.bind(this, simObj);
                simObj.setLocked = setLocked.bind(this, simObj);
                simObj.setPhysics = setPhysics.bind(this, simObj);
                simObj.resetBuffers = resetBuffers.bind(this, simObj);

                simObj.dimensions = dimensions;
                simObj.numSplits = numSplits;
                simObj.numPoints = 0;
                simObj.numEdges = 0;
                simObj.locked = util.extend(
                    {lockPoints: false, lockMidpoints: true, lockEdges: false, lockMidedges: true},
                    (locked || {})
                );

                simObj.buffers = {
                    nextPoints: null,
                    randValues: null,
                    curPoints: null,
                    forwardsEdges: null,
                    forwardsWorkItems: null,
                    backwardsEdges: null,
                    backwardsWorkItems: null,
                    springsPos: null,
                    midSpringsPos: null,
                    midSpringsColorCoord: null
                };

                console.debug("WebCL simulator created");
                return simObj
            }, function (err) {
                console.error('Could not compile sim', err)
            });
        }, function (err) {
            console.error('Could not create sim', err);
            return err;
        })

    }


    /**
     * Given an array of (potentially null) buffers, delete the non-null buffers and set their
     * variable in the simulator buffer object to null.
     */
    var resetBuffers = function(simulator, buffers) {
        var validBuffers = buffers.filter(function(val) { return !(!val); });
        if(validBuffers.length == 0) {
            return Q(null);
        }

        // Search for the buffer in the simulator's buffer object, and set it to null there
        validBuffers.forEach(function(buffToDelete) {
            for(var buff in simulator.buffers) {
                if(simulator.buffers.hasOwnProperty(buff) && simulator.buffers[buff] == buffToDelete) {
                    simulator.buffers[buff] = null;
                }
            }
        });

        validBuffers.map(function(buffToDelete) {
            buffToDelete.delete();
        })

        return Q.all(validBuffers);
    };


    /**
     * Set the initial positions of the points in the NBody simulation
     * @param simulator - the simulator object created by SimCL.create()
     * @param {Float32Array} points - a typed array containing two elements for every point, the x
     * position, proceeded by the y position
     *
     * @returns a promise fulfilled by with the given simulator object
     */
    function setPoints(simulator, points) {
        if(points.length < 1) {
            throw new Error("The points buffer is empty");
        }
        if(points.length % simulator.elementsPerPoint !== 0) {
            throw new Error("The points buffer is an invalid size (must be a multiple of " + simulator.elementsPerPoint + ")");
        }

        return simulator.resetBuffers([
            simulator.buffers.nextPoints,
            simulator.buffers.randValues,
            simulator.buffers.curPoints
        ])
        .then(function() {
            simulator.numPoints = points.length / simulator.elementsPerPoint;
            simulator.renderer.numPoints = simulator.numPoints;

            console.debug("Number of points:", simulator.renderer.numPoints);

            // Create buffers and write initial data to them, then set
            return Q.all([
                    simulator.renderer.createBuffer(points, 'curPoints'),
                    simulator.cl.createBuffer(points.byteLength, 'nextPoints'),
                    simulator.cl.createBuffer(randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'randValues')
                ]);
        })
        .spread(function(pointsVBO, nextPointsBuffer, randBuffer) {
            console.debug('made most points')
            simulator.buffers.nextPoints = nextPointsBuffer;

            simulator.renderer.buffers.curPoints = pointsVBO;

            // Generate an array of random values we will write to the randValues buffer
            simulator.buffers.randValues = randBuffer;
            var rands = new Float32Array(randLength * simulator.elementsPerPoint);
            for(var i = 0; i < rands.length; i++) {
                rands[i] = Math.random();
            }

            return Q.all([
                simulator.cl.createBufferGL(pointsVBO, 'curPoints'),
                simulator.buffers.randValues.write(rands)]);
        })
        .spread(function(pointsBuf, randValues) {
            simulator.buffers.curPoints = pointsBuf;

            var localPosSize = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
            console.debug("SETTING POINT 0", "FIXME: dyn alloc __local, not hardcode in kernel");
            return simulator.pointKernel.setArgs([
                    webcl.type ? [simulator.numPoints] : new Uint32Array([simulator.numPoints]),
                    simulator.buffers.curPoints.buffer,
                    simulator.buffers.nextPoints.buffer,
                    webcl.type ? [1] : new Uint32Array([localPosSize]),
                    webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
                    webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
                    webcl.type ? [-0.00001] : new Float32Array([-0.00001]),
                    webcl.type ? [0.2] : new Float32Array([0.2]),
                    simulator.buffers.randValues.buffer,
                    webcl.type ? [0] : new Uint32Array([0])
                ],
                webcl.type ? [
                    webcl.type.UINT,
                    null, null,
                    webcl.type.LOCAL_MEMORY_SIZE,
                    webcl.type.FLOAT,
                    webcl.type.FLOAT,
                    webcl.type.FLOAT,
                    webcl.type.FLOAT,
                    null,
                    webcl.type.UINT
                ] : undefined);
        })
        .then(function() {
            return simulator;
        });
    }


    /**
     * Sets the edge list for the graph
     *
     * @param simulator - the simulator object to set the edges for
     * @param {edgesTyped: {Uint32Array}, numWorkItems: uint, workItemsTyped: {Uint32Array} } forwardsEdges -
     *        Edge list as represented in input graph.
     *        edgesTyped is buffer where every two items contain the index of the source
     *        node for an edge, and the index of the target node of the edge.
     *        workItems is a buffer where every two items encode information needed by
     *         one thread: the index of the first edge it should process, and the number of
     *         consecutive edges it should process in total.
     * @param {edgesTyped: {Uint32Array}, numWorkItems: uint, workItemsTypes: {Uint32Array} } backwardsEdges -
     *        Same as forwardsEdges, except reverse edge src/dst and redefine workItems/numWorkItems corresondingly.
     * @param {Float32Array} midPoints - dense array of control points (packed sequence of nDim structs)
     * @returns {Q.promise} a promise for the simulator object
     */
    function setEdges(simulator, forwardsEdges, backwardsEdges, midPoints) {
        //edges, workItems
        var elementsPerEdge = 2; // The number of elements in the edges buffer per spring
        var elementsPerWorkItem = 2;

        if(forwardsEdges.edgesTyped.length < 1) {
            throw new Error("The edge buffer is empty");
        }
        if(forwardsEdges.edgesTyped.length % elementsPerEdge !== 0) {
            throw new Error("The edge buffer size is invalid (must be a multiple of " + elementsPerEdge + ")");
        }
        if(forwardsEdges.workItemsTyped.length < 1) {
            throw new Error("The work items buffer is empty");
        }
        if(forwardsEdges.workItemsTyped.length % elementsPerWorkItem !== 0) {
            throw new Error("The work item buffer size is invalid (must be a multiple of " + elementsPerWorkItem + ")");
        }

        return simulator.resetBuffers([
            simulator.buffers.forwardsEdges,
            simulator.buffers.forwardsWorkItems,
            simulator.buffers.backwardsEdges,
            simulator.buffers.backwardsWorkItems,
            simulator.buffers.springsPos,
            simulator.buffers.midSpringsPos,
            simulator.buffers.midSpringsColorCoord
        ])
        .then(function() {
            // Init constant
            simulator.numEdges = forwardsEdges.edgesTyped.length / elementsPerEdge;
            simulator.renderer.numEdges = simulator.numEdges;
            simulator.numForwardsWorkItems = forwardsEdges.workItemsTyped.length / elementsPerWorkItem;
            simulator.numBackwardsWorkItems = backwardsEdges.workItemsTyped.length / elementsPerWorkItem;

            simulator.numMidPoints = midPoints.length / simulator.elementsPerPoint;
            simulator.renderer.numMidPoints = simulator.numMidPoints;
            simulator.numMidEdges = simulator.numMidPoints + simulator.numEdges;
            simulator.renderer.numMidEdges = simulator.numMidEdges;

            // Create buffers
            return Q.all([
                simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength, 'forwardsEdges'),
                simulator.cl.createBuffer(forwardsEdges.workItemsTyped.byteLength, 'forwardsWorkItems'),
                simulator.cl.createBuffer(backwardsEdges.edgesTyped.byteLength, 'backwardsEdges'),
                simulator.cl.createBuffer(backwardsEdges.workItemsTyped.byteLength, 'backwardsWorkItems'),
                simulator.cl.createBuffer(midPoints.byteLength, 'nextMidPoints'),
                simulator.renderer.createBuffer(simulator.numEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'springs'),
                simulator.renderer.createBuffer(midPoints, 'curMidPoints'),
                simulator.renderer.createBuffer(simulator.numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSprings'),
                simulator.renderer.createBuffer(simulator.numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSpringsColorCoord')]);
        })
        .spread(function(forwardsEdgesBuffer, forwardsWorkItemsBuffer, backwardsEdgesBuffer,
                         backwardsWorkItemsBuffer, nextMidPointsBuffer, springsVBO,
                         midPointsVBO, midSpringsVBO, midSpringsColorCoordVBO) {
            // Bind buffers
            simulator.buffers.forwardsEdges = forwardsEdgesBuffer;
            simulator.buffers.forwardsWorkItems = forwardsWorkItemsBuffer;
            simulator.buffers.backwardsEdges = backwardsEdgesBuffer;
            simulator.buffers.backwardsWorkItems = backwardsWorkItemsBuffer;
            simulator.buffers.nextMidPoints = nextMidPointsBuffer;

            simulator.renderer.buffers.springs = springsVBO;
            simulator.renderer.buffers.curMidPoints = midPointsVBO;
            simulator.renderer.buffers.midSprings = midSpringsVBO;
            simulator.renderer.buffers.midSpringsColorCoord = midSpringsColorCoordVBO;

            return Q.all([
                simulator.cl.createBufferGL(springsVBO, 'springsPos'),
                simulator.cl.createBufferGL(midPointsVBO, 'curMidPoints'),
                simulator.cl.createBufferGL(midSpringsVBO, 'midSpringsPos'),
                simulator.cl.createBufferGL(midSpringsColorCoordVBO, 'midSpringsColorCoord'),
                simulator.buffers.forwardsEdges.write(forwardsEdges.edgesTyped),
                simulator.buffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
                simulator.buffers.backwardsEdges.write(backwardsEdges.edgesTyped),
                simulator.buffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
            ]);
        })
        .spread(function(springsBuffer, midPointsBuf, midSpringsBuffer, midSpringsColorCoordBuffer) {
            simulator.buffers.springsPos = springsBuffer;
            simulator.buffers.midSpringsPos = midSpringsBuffer;
            simulator.buffers.curMidPoints = midPointsBuf;
            simulator.buffers.midSpringsColorCoord = midSpringsColorCoordBuffer;


            /*
            console.error("TRY COPY");

            return Q().then(function () {
                //return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
                return true;
            }).then(function () {
                console.error("SUCCED COPY")
            }, function (err) {
                console.error("FAIL COPY", err, err.stack)
            })
*/



            var localPosSize = Math.min(simulator.cl.maxThreads, simulator.numMidPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
            var midPointArgs = simulator.midPointKernel.setArgs([
                    webcl.type ? [simulator.numMidPoints] : new Uint32Array([simulator.numMidPoints]),
                    webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]),
                    simulator.buffers.curMidPoints.buffer,
                    simulator.buffers.nextMidPoints.buffer,

                    webcl.type ? [localPosSize] : new Uint32Array([localPosSize]),

                    webcl.type ? [simulator.dimensions[0]] : new Float32Array([simulator.dimensions[0]]),
                    webcl.type ? [simulator.dimensions[1]] : new Float32Array([simulator.dimensions[1]]),
                    webcl.type ? [-0.00001] : new Float32Array([-0.00001]),
                    webcl.type ? [0.2] : new Float32Array([0.2]),

                    simulator.buffers.randValues.buffer,
                    webcl.type ? [0] : new Uint32Array([0])],
                webcl.type ? [
                    webcl.type.UINT, webcl.type.UINT, null, null,
                    webcl.type.LOCAL_MEMORY_SIZE, webcl.type.FLOAT, webcl.type.FLOAT, webcl.type.FLOAT,webcl.type.FLOAT,
                null, webcl.type.UINT] : null);

            console.debug('EDGES KERNEL 0')
            var edgeArgs = simulator.edgesKernel.setArgs(
                [   null, //forwards/backwards picked dynamically
                    null, //forwards/backwards picked dynamically
                    null, //simulator.buffers.curPoints.buffer then simulator.buffers.nextPoints.buffer
                    null, //simulator.buffers.nextPoints.buffer then simulator.buffers.curPoints.buffer
                    simulator.buffers.springsPos.buffer,
                    webcl.type ? [1.0] : new Float32Array([1.0]),
                    webcl.type ? [0.1] : new Float32Array([0.1]),
                    null],
                webcl.type ? [null, null, null, null, null,
                    webcl.type.FLOAT, webcl.type.FLOAT]
                    : null);

            console.debug("MID EDGES 0")
            var midEdgeArgs = simulator.midEdgesKernel.setArgs([
                webcl.type ? [simulator.numSplits] : new Uint32Array([simulator.numSplits]),        // 0:
                simulator.buffers.forwardsEdges.buffer,        // 1: only need one direction as guaranteed to be chains
                simulator.buffers.forwardsWorkItems.buffer,    // 2:
                simulator.buffers.curPoints.buffer,            // 3:
                simulator.buffers.nextMidPoints.buffer,        // 4:
                simulator.buffers.curMidPoints.buffer,         // 5:
                simulator.buffers.midSpringsPos.buffer,        // 6:
                simulator.buffers.midSpringsColorCoord.buffer, // 7:
                webcl.type ? [1.0] : new Float32Array([1.0]),  // 8:
                webcl.type ? [0.1] : new Float32Array([0.1]),  // 9:
                null
            ],
                webcl.type ? [
                    webcl.type.UINT, null, null, null, null, null, null, null,
                    webcl.type.FLOAT, webcl.type.FLOAT, /*webcl.type.UINT*/null
                ] : null);

            return Q.all(midPointArgs, edgeArgs, midEdgeArgs);
        })
        .then(function() {
            return simulator;
        });
    }


    function setLocked(simulator, cfg) {
        cfg = cfg || {};
        util.extend(simulator.locked, cfg);
    }



    var totCfg = {};

    function setPhysics(simulator, cfg) {
        // TODO: Instead of setting these kernel args immediately, we should make the physics values
        // properties of the simulator object, and just change those properties. Then, when we run
        // the kernels, we set the arg using the object property (the same way we set stepNumber.)

        cfg = cfg || {};

        for (var i in cfg) {
            totCfg[i] = cfg[i];
        }
        console.debug('UPDATING PHYSICS', totCfg, '(delta:', cfg, ')');

        if(cfg.charge || cfg.gravity) {
            var charge = cfg.charge ? (webcl.type ? [cfg.charge] : new Float32Array([cfg.charge])) : null;
            var charge_t = cfg.charge ? cljs.types.float_t : null;

            var gravity = cfg.gravity ? (webcl.type ? [cfg.gravity] : new Float32Array([cfg.gravity])) : null;
            var gravity_t = cfg.gravity ? cljs.types.float_t : null;

            console.debug("SETTING POINT 1")
            simulator.pointKernel.setArgs(
                [null, null, null, null, null, null, charge, gravity, null, null],
                [null, null, null, null, null, null, charge_t, gravity_t, null, null]);

            simulator.midPointKernel.setArgs(
                [null, null, null, null, null, null, null, charge, gravity, null, null],
                [null, null, null, null, null, null, null, charge_t, gravity_t, null, null]);

        }

        if(cfg.edgeDistance || cfg.edgeStrength) {
            var edgeDistance = cfg.edgeDistance ? (webcl.type ? [cfg.edgeDistance] : new Float32Array([cfg.edgeDistance])) : null;
            var edgeDistance_t = cfg.edgeDistance ? cljs.types.float_t : null;

            var edgeStrength = cfg.edgeStrength ? (webcl.type ? [cfg.edgeStrength] : new Float32Array([cfg.edgeStrength])) : null;
            var edgeStrength_t = cfg.edgeStrength ? cljs.types.float_t : null;

            console.debug("EDGES KERNEL 1")
            simulator.edgesKernel.setArgs(
                [null, null, null, null, null, edgeStrength, edgeDistance, null],
                [null, null, null, null, null, edgeStrength_t, edgeDistance_t, null]);

            console.debug("MID EDGES 1")
            simulator.midEdgesKernel.setArgs(
                // 0   1     2     3     4     5     6     7     8               9               10
                [null, null, null, null, null, null, null, null, edgeStrength,   edgeDistance,   null],
                [null, null, null, null, null, null, null, null, edgeStrength_t, edgeDistance_t, null]);
        }
    }


    function tick(simulator, stepNumber) {

        function edgeKernelSeq (edges, workItems, numWorkItems, fromPoints, toPoints) {

            var bufs = [edges, workItems, fromPoints, toPoints, simulator.buffers.springsPos];

            return Q()
                .then(function () {
                    simulator.edgesKernel.setArgs(
                        [edges.buffer, workItems.buffer, fromPoints.buffer, toPoints.buffer, null,
                         null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                        webcl.type ? [null, null, null, null, null,
                         null, null, cljs.types.uint_t] : null);
                }).then(function () {
                    return Q.all(bufs.map(function (buf) { return buf.acquire(); }));
                }).then(function () {
                    //return Q(console.error("SKIP EDGE"))
                    console.debug('edge call', cljs.types.uint_t, numWorkItems)
                    simulator.edgesKernel.call(numWorkItems, []);
                }).then(function () {
                    return Q.all(bufs.map(function (buf) { return buf.release(); }));
                })
        }

        // If there are no points in the graph, don't run the simulation
        if(simulator.numPoints < 1) {
            return Q(simulator);
        }

        ////////////////////////////
        // Run the points kernel
        return Q()
        .then(function () {
            console.debug('SETTING POINT 2')
            simulator.pointKernel.setArgs(
                [null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
        })
        .then(function () {
            console.debug('acquiring')
            return simulator.buffers.curPoints.acquire(); })
        .then(function() {
            console.debug('~~~~~run point', 'locked?', simulator.locked.lockPoints ? true : false)
            return simulator.locked.lockPoints ? false : simulator.pointKernel.call(simulator.numPoints, []);
        })
        .then(function () {
            return simulator.buffers.curPoints.release(); })
        .then(function () {
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints); },
            function (err) {
                console.error('bad run point call', err);
                return err;
            })
        .then(function() {
            console.debug('copied?')
            if(simulator.numEdges > 0) {
                if (simulator.locked.lockEdges) {
                    console.debug('~~~~~sim locked, SKIP')
                    return simulator;
                } else {
                    console.debug('EDGE SEQ locked? false');
                    return edgeKernelSeq(
                        simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                        simulator.buffers.curPoints, simulator.buffers.nextPoints)
                    .then(function () {
                        console.debug('forward, now back')
                         return edgeKernelSeq(
                            simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints); },
                        function (err) {
                            console.error('bad edge seq call', err);
                            return err;
                        });
                }
            } else {
                return simulator;
            }
        })
        ////////////////////////////
        // Run the edges kernel
        .then(function () {
            console.debug('SET MIDPOINT')

            simulator.midPointKernel.setArgs(
                [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
        })
        .then(function() {
            console.debug('MIDPOINT READY')
            return Q.all([
                simulator.buffers.curMidPoints.acquire(),
                simulator.buffers.midSpringsColorCoord.acquire()
            ]);
        })
        .spread(function() {
            console.debug('CALL MIDPOINT', 'locked?', simulator.locked.lockMidpoints)
            return simulator.locked.lockMidpoints ? simulator : simulator.midPointKernel.call(simulator.numMidPoints, []);  // APPLY MID-FORCES
        })
        .then(function () {
            return Q.all([
                simulator.buffers.curMidPoints.release(),
                simulator.buffers.midSpringsColorCoord.release()
            ]);
        })
        .then(function() {
            //return console.error("SKIP COPY MID")
            console.debug('COPY MIDPOINT')


            /*
                var memSize = 1 << 5;
                var h_idata = new Uint8Array(memSize);
                for(var i = 0; i < memSize; i++) {
                    h_idata[i] = (i & 0xff);
                }
                var a, b;
                return Q.all([
                    simulator.cl.createBuffer(memSize, 'd_idata'),
                    simulator.cl.createBufferGL(simulator.renderer.createBuffer(h_idata, 'd_odata_base'), 'd_odata')])
                .spread(function (d_idata, d_odata) {
                    console.error('got')
                    a = d_idata;
                    b = d_odata;

                    return d_idata.write(h_idata);
                })
                .then(function () {
                    console.error("WROTE")
                    for(var i = 0; i < 1; i++) {
                        a.copyInto(b);
                    }
                    return;
                }, function (err) {
                    console.error('FAIL WRITE TEST', err, err.stack)
                })
                .then(function () {
                    console.error("PASS COPY TEST")

                }, function () {
                    console.error("FAILED COPY TEST")
                })
                .then(function () {


                });
            */

            return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);


        })
        .then(function () {
            console.debug('~~~~~MID EDGES 2', 'locked?', simulator.locked.lockMidedges)
            if (simulator.numEdges > 0 && !simulator.locked.lockMidedges) {
                simulator.midEdgesKernel.setArgs(
                    // 0   1     2     3     4     5     6     7     8     9     10
                    [null, null, null, null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
                return simulator.midEdgesKernel.call(simulator.numForwardsWorkItems, [])
                .then(function() {
                    return simulator;
                })
            } else {
                return simulator;
            }
        }, function (err) {
            console.error('badddd', err, err.stack)
        })
        .then(function() {
            console.debug('release midpoint')
            return Q.all([
                simulator.buffers.curMidPoints.release(),
                simulator.buffers.midSpringsColorCoord.release()
            ]);
        })
        .spread(function () {
            console.debug('q finish')
            simulator.cl.queue.finish(); //FIXME use callback arg
            return simulator;
        });
    }


    module.exports = {
        "create": create,
        "setLocked": setLocked,
        "setPoints": setPoints,
        "setEdges": setEdges,
        "tick": tick
    };

},{"./cl.js":5,"./util.js":12,"Q":13,"node-webcl":"fWqvvE"}],4:[function(_dereq_,module,exports){

    "use strict";
    var exports = {};

    // A module-level list of all the event listeners
    var listeners = {};


    exports.listen = function(event, callback) {
        var eventListeners = listeners[event] || [];
        eventListeners.push(callback);
        listeners[event] = eventListeners;
    };


    // TODO: add 'remove' function


    exports.fire = function(event, args) {
        var eventListeners = listeners[event] || [];

        for(var i in eventListeners) {
            eventListeners[i].call(this, args);
        }
    };


    module.exports = exports;

},{}],5:[function(_dereq_,module,exports){
var Q = _dereq_('q');
var events = _dereq_('./SimpleEvents.js');

if (typeof(window) == 'undefined') {
    webcl = _dereq_('node-webcl');
    console.debug = console.log;
}


var getClContext;
if (typeof(window) == 'undefined') {
    console.debug("NODECL")
    var CreateContext = function(webcl, gl, platform, devices) {
        return webcl.createContext({
            devices: devices,
            shareGroup: gl,
            platform: platform});
    };
    var CreateCL = function(webcl, gl) {
        if (typeof webcl === "undefined") {
            throw new Error("WebCL does not appear to be supported in your browser");
        } else if (webcl === null) {
            throw new Error("Can't access WebCL object");
        }
        var platforms = webcl.getPlatforms();
        if (platforms.length === 0) {
            throw new Error("Can't find any WebCL platforms");
        }
        var platform = platforms[0];
        var devices = platform.getDevices(webcl.DEVICE_TYPE_GPU).map(function(d) {
            var workItems = d.getInfo(webcl.DEVICE_MAX_WORK_ITEM_SIZES);
            return {
                device: d,
                computeUnits: workItems.reduce(function(a, b) {
                    return a * b;
                })
            };
        });
        devices.sort(function(a, b) {
            var nameA = a.device.getInfo(webcl.DEVICE_VENDOR);
            var nameB = b.device.getInfo(webcl.DEVICE_VENDOR);
            var vendor = "NVIDIA"
            if (nameA.indexOf(vendor) != -1 && nameB.indexOf(vendor) == -1) {
                return -1;
            } else if (nameB.indexOf(vendor) != -1 && nameA.indexOf(vendor) == -1) {
                return 1;
            } else {
                return b.computeUnits - a.computeUnits;
            }
        });
        var deviceWrapper;
        var err = devices.length ? null : new Error("No WebCL devices of specified type (" + webcl.DEVICE_TYPE_GPU + ") found");
        for (var i = 0; i < devices.length; i++) {
            var wrapped = devices[i];
            try {
                if (wrapped.device.getInfo(webcl.DEVICE_EXTENSIONS).search(/gl.sharing/i) == -1) {
                    console.log('  Skipping device due to no sharing', i, wrapped);
                    continue;
                }
                wrapped.context = CreateContext(webcl, gl, platform, [ wrapped.device ]);
                if (wrapped.context === null) {
                    throw Error("Error creating WebCL context");
                }
                wrapped.queue = wrapped.context.createCommandQueue(wrapped.device, 0);
            } catch (e) {
                console.debug("  Skipping device due to error", i, wrapped, e);
                err = e;
                continue;
            }
            deviceWrapper = wrapped;
            break;
        }
        if (!deviceWrapper) {
            throw err;
        }
        console.debug("  Device", deviceWrapper, deviceWrapper.device.getInfo(webcl.DEVICE_VENDOR));

        var res = {
            gl: gl,
            cl: webcl,
            context: deviceWrapper.context,
            device: deviceWrapper.device,
            queue: deviceWrapper.queue,
            maxThreads: deviceWrapper.device.getInfo(webcl.DEVICE_MAX_WORK_GROUP_SIZE),
            numCores: deviceWrapper.device.getInfo(webcl.DEVICE_MAX_COMPUTE_UNITS)
        };

        //FIXME ??
        res.compile = compile.bind(this, res);
        res.createBuffer = createBuffer.bind(this, res);
        res.createBufferGL = createBufferGL.bind(this, res);

        return res;

    };
    getClContext = function (gl) {
        return CreateCL(webcl, gl);
    }
} else {
    getClContext = function (gl) {
        if (typeof(webcl) === "undefined") {
            throw new Error("WebCL does not appear to be supported in your browser");
        }

        var cl = webcl;
        if (cl === null) {
            throw new Error("Can't access WebCL object");
        }

        var platforms = cl.getPlatforms();
        if (platforms.length === 0) {
            throw new Error("Can't find any WebCL platforms");
        }
        var platform = platforms[0];

        //sort by number of compute units and use first non-failing device
        var devices = platform.getDevices(cl.DEVICE_TYPE_ALL).map(function (d) {

            function typeToString (v) {
                return v == 2 ? 'CPU'
                    : v == 4 ? 'GPU'
                    : v == 8 ? 'ACCELERATOR'
                    : ('unknown type: ' + v);
            }

            var workItems = d.getInfo(cl.DEVICE_MAX_WORK_ITEM_SIZES);

            return {
                device: d,
                DEVICE_TYPE: typeToString(d.getInfo(cl.DEVICE_TYPE)),
                DEVICE_MAX_WORK_ITEM_SIZES: workItems,
                computeUnits: [].slice.call(workItems, 0).reduce(function (a, b) { return a * b; })
            };
        });
        devices.sort(function (a, b) { return b.computeUnits - a.computeUnits; });

        var deviceWrapper;
        var err = devices.length ?
            null : new Error("No WebCL devices of specified type (" + cl.DEVICE_TYPE_ALL + ") found");
        for (var i = 0; i < devices.length; i++) {
            var wrapped = devices[i];
            try {
                wrapped.context = _createContext(cl, gl, platform, [wrapped.device])
                if (wrapped.context === null) {
                    throw Error("Error creating WebCL context");
                }
                wrapped.queue = wrapped.context.createCommandQueue(wrapped.device, null);
            } catch (e) {
                console.debug("  Skipping device due to error", i, wrapped, e);
                err = e;
                continue;
            }
            deviceWrapper = wrapped;
            break;
        }
        if (!deviceWrapper) {
            throw err;
        }

        console.debug("  Device", deviceWrapper);

        var clObj = {
            "gl": gl,
            "cl": cl,
            "context": deviceWrapper.context,
            "device": deviceWrapper.device,
            "queue": deviceWrapper.queue,
            "maxThreads": deviceWrapper.device.getInfo(cl.DEVICE_MAX_WORK_GROUP_SIZE),
            "numCores": deviceWrapper.device.getInfo(cl.DEVICE_MAX_COMPUTE_UNITS)
        };

        clObj.compile = compile.bind(this, clObj);
        clObj.createBuffer = createBuffer.bind(this, clObj);
        clObj.createBufferGL = createBufferGL.bind(this, clObj);

        return clObj;
    };
}






// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.


    'use strict';

    var create = Q.promised(getClContext);


    // This is a separate function from create() in order to allow polyfill() to override it on
    // older WebCL platforms, which have a different way of creating a context and enabling CL-GL
    // sharing.
    var _createContext = function(cl, gl, platform, devices) {
        cl.enableExtension("KHR_GL_SHARING");
        return cl.createContext(gl, devices);
    }

    /**
     * Compile the WebCL program source and return the kernel(s) requested
     *
     * @param cl - the cljs instance object
     * @param {string} source - the source code of the WebCL program you wish to compile
     * @param {(string|string[])} kernels - the kernel name(s) you wish to get from the compiled program
     *
     * @returns {(kernel|Object.<string, kernel>)} If kernels was a single kernel name, returns a
     *          single kernel. If kernels was an array of kernel names, returns an object with each
     *          kernel name mapped to its kernel object.
     */
    var compile = Q.promised(function (cl, source, kernels) {
        var t0 = new Date().getTime();
        console.debug("COMPILING");
        try {
        var program = cl.context.createProgram(source);
        program.build([cl.device]);

        if (typeof kernels === "string") {
                var kernelObj = {};
                kernelObj.name = undefined;
                kernelObj.kernel = program.createKernel(kernels);
                kernelObj.cl = cl;
                kernelObj.call = call.bind(this, kernelObj);
                kernelObj.setArgs = setArgs.bind(this, kernelObj);

                return kernelObj;
        } else {
            var kernelObjs = {};

            for(var i = 0; i < kernels.length; i++) {
                var kernelName = kernels[i];
                var kernelObj = {};
                kernelObj.name = kernelName;
                kernelObj.kernel = program.createKernel(kernelName);
                kernelObj.cl = cl;
                kernelObj.call = call.bind(this, kernelObj);
                kernelObj.setArgs = setArgs.bind(this, kernelObj);

                kernelObjs[kernelName] = kernelObj;
            }

            console.debug('  /compiled', new Date().getTime() - t0);

            return kernelObjs;
        }
    } catch (e) {
        console.error('wat', e.stack);
        throw e;
    }

    });


    // Executes the specified kernel, with `threads` number of threads, setting each element in
    // `args` to successive position arguments to the kernel before calling.
    var call = Q.promised(function (kernel, threads, args, argTypes) {
        console.debug("CALL", kernel.name)
        var t0 = new Date().getTime();
        args = args || [];
        argTypes = argTypes || [];
        console.debug('call', args, argTypes)
        return kernel.setArgs(args, argTypes).then(function() {
            var workgroupSize = new Int32Array([threads]);
            events.fire("kernelStart");
            kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, workgroupSize.length, [], workgroupSize, []);
            kernel.cl.queue.finish();
            events.fire("kernelEnd");
            console.debug('  /called', new Date().getTime() - t0);
            return kernel;
        });
    });


    var setArgs = Q.promised(function (kernel, args, argTypes) {
        console.debug('SET ARGS', args, argTypes)
        var t0 = new Date().getTime();
        for (var i = 0; i < args.length; i++) {
            if(args[i] !== null) {
                kernel.kernel.setArg(i, args[i]);
            }
        }
        console.debug('  /all set', new Date().getTime() - t0);
        return kernel;
    });


    var createBuffer = Q.promised(function createBuffer(cl, size, name) {

        console.debug('CREATE buffer', name);

        var buffer = cl.context.createBuffer(cl.cl.MEM_READ_WRITE, size);
        if (buffer === null) {
            throw new Error("Could not create the WebCL buffer");
        } else {
            var bufObj = {
                "name": name,
                "buffer": buffer,
                "cl": cl,
                "size": size,
                "acquire": function() {
                    console.debug("  acquire lock", bufObj.name)
                    return Q(); },
                "release": function() {
                    console.debug("  release lock", bufObj.name)
                    return Q(); }
            };
            bufObj.delete = Q.promised(function() {
                bufObj.release();
                bufObj.size = 0;
                return null;
            });
            bufObj.write = write.bind(this, bufObj);
            bufObj.read = read.bind(this, bufObj);
            bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);
            return bufObj;
        }
    });


    // TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
    // effect.
    var createBufferGL = Q.promised(function (cl, vbo, name) {

        var t0 = new Date().getTime();

        console.debug('CREATE buffer GL', name);

        var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo.buffer);
        if (buffer === null) {
            throw new Error("Could not create WebCL buffer from WebGL buffer");
        } else {
            if (!buffer.getInfo) console.warn('  vbo, weird len', vbo.len)
            var bufObj = {
                "name": name,
                "buffer": buffer,
                "cl": cl,
                "size": buffer.getInfo ? buffer.getInfo(cl.cl.MEM_SIZE) : (vbo.len * Float32Array.BYTES_PER_ELEMENT),
                "acquire": Q.promised(function() {
                    console.debug("  acquire gl", bufObj.name)
                    var t0 = new Date().getTime();
                    cl.queue.enqueueAcquireGLObjects([buffer]);
                    console.debug('    /acquired', new Date().getTime() - t0);

                }),
                "release": Q.promised(function() {
                    console.debug("  release gl", bufObj.name);
                    var t0 = new Date().getTime();
                    cl.queue.enqueueReleaseGLObjects([buffer]);
                    console.debug('    /released', new Date().getTime() - t0);

                })
            };
            bufObj.delete = Q.promised(function() {
                return bufObj.release()
                .then(function() {
                    bufObj.release();
                    bufObj.size = 0;
                    return null;
                })
            });
            bufObj.write = write.bind(this, bufObj);
            bufObj.read = read.bind(this, bufObj);
            bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);

            console.debug('  /created', new Date().getTime() - t0);

            return bufObj;
        }
    });


    var copyBuffer = Q.promised(function (cl, source, destination) {
        console.debug('COPY BUFFER', source.name, destination.name, source.size, destination.size)
        var t0 = new Date().getTime();
        return Q()
            .then(function () { return source.acquire(); })
            .then(function () { return destination.acquire(); })
            .then(function () {
                cl.queue.enqueueCopyBuffer(source.buffer, destination.buffer, 0, 0, Math.min(source.size, destination.size));
                return source.release();
            })
            .then(function () { return destination.release(); })
            .then(function () {
                cl.queue.finish();
                console.debug('  /copied', new Date().getTime() - t0);

                return destination; });
    });


    var write = Q.promised(function write(buffer, data) {
        console.debug("WRITE", buffer.name)
        var t0 = new Date().getTime();
        return buffer.acquire()
            .then(function () {
                buffer.cl.queue.enqueueWriteBuffer(buffer.buffer, true, 0, data.byteLength, data);
                return buffer.release();
            })
            .then(function() {
                buffer.cl.queue.finish();
                console.debug('  /wrote', new Date().getTime() - t0);
                return buffer;
            });
    });


    var read = Q.promised(function (buffer, target) {
        console.erro("READ", buffer.name);
        var t0 = new Date().getTime();
        return buffer.acquire()
            .then(function() {
                var copySize = Math.min(buffer.size, target.length * target.BYTES_PER_ELEMENT);
                buffer.cl.queue.enqueueReadBuffer(buffer.buffer, true, 0, copySize, target);
                return buffer.release();
            })
            .then(function() {
                console.debug('  /read', new Date().getTime() - t0);
                return buffer;
            });
    });


    // Detects the WebCL platform we're running on, and modifies this module as needed.
    // Returns true if the the platform is out-of-date and needed to be polyfilled, and false if
    // the platform is up-to-date and no modification was needed.
    function polyfill() {
        // Detect if we're running on a current WebCL version
        if(typeof(window) != 'undefined' && typeof webcl.enableExtension == "function") {
            // If so, don't do anything
            return false;
        }

        console.debug("[cl.js] Detected old WebCL platform. Modifying functions to support it.");


        _createContext = function(cl, gl, platform, devices) {
            if (webcl.type) {
                return webcl.createContext({
                    devices: devices,
                    shareGroup: gl,
                    platform: platform});
            } else {
                var extension = cl.getExtension("KHR_GL_SHARING");
                if (extension === null) {
                    throw new Error("Could not create a shared CL/GL context using the WebCL extension system");
                }
                return extension.createContext({
                    platform: platform,
                    devices: devices,
                    deviceType: cl.DEVICE_TYPE_GPU,
                    sharedContext: null
                });
            }

        }


        call = Q.promised(function (kernel, threads, args, argTypes) {
            args = args || [];
            argTypes = argTypes || [];
            console.debug('CALL (poly)', kernel.name, args, argTypes)
            var t0 = new Date().getTime();
            return kernel.setArgs(args, argTypes).then(function() {
                //kernel.cl.queue.finish();
                var workgroupSize = typeof(window) == 'undefined' ? [threads] : new Int32Array([threads]);
                if (webcl.type) {
                    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, [threads], null);
                } else {
                    kernel.cl.queue.enqueueNDRangeKernel(kernel.kernel, null, workgroupSize, null);
                }
                console.debug('  enqueued')
                kernel.cl.queue.finish();
                console.debug('  /called', new Date().getTime() - t0);
                return kernel;
            });
        });

        setArgs = Q.promised(function (kernel, args, argTypes) {
            console.debug('SET ARGS (poly)', args ? args.length : 'no args', argTypes ? argTypes.length : 'no types')
            var t0 = new Date().getTime();
            try {
                for (var i = 0; i < args.length; i++) {
                    if (args[i]) {
                        kernel.kernel.setArg(i, args[i].length ? args[i][0] : args[i], argTypes[i] || undefined);
                    }
                }
            } catch (e) {
                console.error('wat', e, e.stack)
                throw new Error(e);
            }
            console.debug('  /set', new Date().getTime() - t0);
            return kernel;
        });

        if (typeof WebCLKernelArgumentTypes == 'undefined') {
            WebCLKernelArgumentTypes = webcl.type;
        }

        types = {
            char_t: WebCLKernelArgumentTypes.CHAR,
            double_t: WebCLKernelArgumentTypes.DOUBLE,
            float_t: WebCLKernelArgumentTypes.FLOAT,
            half_t: WebCLKernelArgumentTypes.HALF,
            int_t: WebCLKernelArgumentTypes.INT,
            local_t: WebCLKernelArgumentTypes.LOCAL_MEMORY_SIZE,
            long_t: WebCLKernelArgumentTypes.LONG,
            short_t: WebCLKernelArgumentTypes.SHORT,
            uchar_t: WebCLKernelArgumentTypes.UCHAR,
            uint_t: WebCLKernelArgumentTypes.UINT,
            ulong_t: WebCLKernelArgumentTypes.ULONG,
            ushort_t: WebCLKernelArgumentTypes.USHORT,
            float2_t: WebCLKernelArgumentTypes.VEC2,
            float3_t: WebCLKernelArgumentTypes.VEC3,
            float4_t: WebCLKernelArgumentTypes.VEC4,
            float8_t: WebCLKernelArgumentTypes.VEC8,
            float16_t: WebCLKernelArgumentTypes.VEC16
        };

        return true;
    }
    var types = {};
    var CURRENT_CL = !polyfill();


    module.exports = {
        "create": create,
        "compile": compile,
        "call": call,
        "setArgs": setArgs,
        "createBuffer": createBuffer,
        "createBufferGL": createBufferGL,
        "write": write,
        "types": types,
        "CURRENT_CL": CURRENT_CL
    };
},{"./SimpleEvents.js":4,"node-webcl":"fWqvvE","q":15}],6:[function(_dereq_,module,exports){
"use strict";

var MatrixLoader = _dereq_('./libs/load.js');
var kmeans = _dereq_('./libs/kmeans.js');


// Generates `amount` number of random points
function createPoints(amount, dim) {
    // Allocate 2 elements for each point (x, y)
    var points = [];

    for(var i = 0; i < amount; i++) {
        points.push([Math.random() * dim[0], Math.random() * dim[1]]);
    }

    return points;
}


function createEdges(amount, numNodes) {
    var edges = [];
    // This may create duplicate edges. Oh well, for now.
    for(var i = 0; i < amount; i++) {
        var source = (i % numNodes),
            target = (i + 1) % numNodes;

        edges.push([source, target]);
    }

    return edges;
}


function loadGeo(graph, graphFileURI) {
    var processedData;

    return MatrixLoader.loadGeo(graphFileURI)
    .then(function(geoData) {
        processedData = MatrixLoader.processGeo(geoData);

        console.debug('============PROCESSED')
        console.debug('nodes/edges', processedData.points.length, processedData.edges.length)

        return graph.setPoints(processedData.points);
    })
    .then(function() {

        var position = function (points, edges) {
            return edges.map(function (pair){
                var start = points[pair[0]];
                var end = points[pair[1]];
                return [start[0], start[1], end[0], end[1]];
            });
        };
        var k = 6; //need to be <= # supported colors, currently 9
        var steps =  50;
        var positions = position(processedData.points, processedData.edges);
        var clusters = kmeans(positions, k, steps); //[ [0--1]_4 ]_k

        return
            graph
                .setColorMap("test-colormap2.png", {clusters: clusters, points: processedData.points, edges: processedData.edges})
                then(function () {
                    return graph.setEdges(processedData.edges);
                });
    })
    .then(function() {
        console.debug("SET GEO POINTS, EDGES");
        return graph;
    }, function (err) {
        console.error('WAT', err, err.stack)
    });
}



function animator (document, promise) {

    var animating = false;

    var next = function (f) {
        var base = (typeof window == 'undefined' ? document : window);
        base.requestAnimationFrame(f);
    }


    var step = 0;
    var bound = -1;

    var res = {
        stopAnimation: function () {
            animating = false;
            return res;
        },
        startAnimation: function (maybeCb, maybeMaxSteps) {
            bound = maybeMaxSteps;
            animating = true;
            var run = function () {
                console.debug('===============STEPPING', step++)
                bound--;
                var t0 = new Date().getTime();
                promise().then(
                    function () {
                        console.debug("  /STEPPED", new Date().getTime() - t0, 'ms');
                        if (animating && bound != 0) {
                            next(run);
                        } else {
                            if (maybeCb) maybeCb();
                            else console.debug("ANIMATE DONE");
                        }
                    },
                    function () {
                        console.error("ERROR", err, err.stack);
                    });
            };
            next(run);
            return res;
        }
    }
    return res;
}



/**
 * Populate the data list dropdown menu with available data, and setup actions to load the data
 * when the user selects one of the options.
 *
 * @param clGraph - the NBody graph object created by NBody.create()
 */
function loadDataList(clGraph) {
    // Given a URI of a JSON data index, return an array of objects, with keys for display name,
    // file URI, and data size
    function getDataList(listURI) {
        return MatrixLoader.ls(listURI)
        .then(function (files) {
            var listing = [];

            files.forEach(function (file, i) {
                listing.push({
                    f: file.f,
                    base: file.f.split(/\/|\./)[file.f.split(/\/|\./).length - 3],
                    KB: file.KB,
                    size: file.KB > 1000 ? (Math.round(file.KB / 1000) + " MB") : (file.KB + " KB")
                });
            });

            return listing;
        });
    }

    var dataList = [];

    return getDataList("data/geo.json")
    .then(function(geoList){
        console.debug("  geolist")
        geoList = geoList.map(function(fileInfo) {
            fileInfo["base"] = fileInfo.base + ".geo";
            fileInfo["loader"] = loadGeo;
            return fileInfo;
        });

        dataList = dataList.concat(geoList);

        return getDataList("data/matrices.binary.json");
    })
    .then(function(matrixList){
        console.debug('  matrixlist');
        matrixList = matrixList.map(function(fileInfo) {
            fileInfo["base"] = fileInfo.base + ".mtx";
            fileInfo["loader"] = loadMatrix;
            return fileInfo;
        });

        dataList = dataList.concat(matrixList);

        return dataList;
    });
}


/**
 * Loads the matrix data at the given URI into the NBody graph.
 */
function loadMatrix(graph, graphFileURI) {
    var graphFile;

    return MatrixLoader.loadBinary(graphFileURI)
    .then(function (v) {
        graphFile = v;
        $('#filenodes').text('Nodes: ' + v.numNodes);
        $('#fileedges').text('Edges: ' + v.numEdges);

        var points = createPoints(graphFile.numNodes, graph.dimensions);

        return graph.setPoints(points);
    })
    .then(function() {
        return graph.setEdges(graphFile.edges);
    })
    .then(function() {
        return graph;
    });
}




module.exports = {
    createPoints: createPoints,
    createEdges: createEdges,
    animator: animator,
    loadGeo: loadGeo,
    loadDataList: loadDataList
};
},{"./libs/kmeans.js":8,"./libs/load.js":9}],7:[function(_dereq_,module,exports){
/*
 Copyright 2013 Daniel Wirtz <dcode@dcode.io>
 Copyright 2009 The Closure Library Authors. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS-IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

/**
 * @license Long.js (c) 2013 Daniel Wirtz <dcode@dcode.io>
 * Released under the Apache License, Version 2.0
 * see: https://github.com/dcodeIO/Long.js for details
 * 
 * Long.js is based on goog.math.Long from the Closure Library.
 * Copyright 2009 The Closure Library Authors. All Rights Reserved.
 * Released under the Apache License, Version 2.0
 * see: https://code.google.com/p/closure-library/ for details
 */

/**
 * Defines a Long class for representing a 64-bit two's-complement
 * integer value, which faithfully simulates the behavior of a Java "long". This
 * implementation is derived from LongLib in GWT.
 */
(function(global) {

    /**
     * Constructs a 64-bit two's-complement integer, given its low and high 32-bit
     * values as *signed* integers.  See the from* functions below for more
     * convenient ways of constructing Longs.
     *
     * The internal representation of a long is the two given signed, 32-bit values.
     * We use 32-bit pieces because these are the size of integers on which
     * Javascript performs bit-operations.  For operations like addition and
     * multiplication, we split each number into 16-bit pieces, which can easily be
     * multiplied within Javascript's floating-point representation without overflow
     * or change in sign.
     *
     * In the algorithms below, we frequently reduce the negative case to the
     * positive case by negating the input(s) and then post-processing the result.
     * Note that we must ALWAYS check specially whether those values are MIN_VALUE
     * (-2^63) because -MIN_VALUE == MIN_VALUE (since 2^63 cannot be represented as
     * a positive number, it overflows back into a negative).  Not handling this
     * case would often result in infinite recursion.
     * 
     * @exports Long
     * @class A Long class for representing a 64-bit two's-complement integer value.
     * @param {number} low The low (signed) 32 bits of the long.
     * @param {number} high The high (signed) 32 bits of the long.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to `false` (signed).
     * @constructor
     */
    var Long = function(low, high, unsigned) {
        
        /**
         * The low 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.low = low | 0;

        /**
         * The high 32 bits as a signed value.
         * @type {number}
         * @expose
         */
        this.high = high | 0;

        /**
         * Whether unsigned or not.
         * @type {boolean}
         * @expose
         */
        this.unsigned = !!unsigned;
    };

    // NOTE: Common constant values ZERO, ONE, NEG_ONE, etc. are defined below the from* methods on which they depend.

    // NOTE: The following cache variables are used internally only and are therefore not exposed as properties of the
    // Long class.
    
    /**
     * A cache of the Long representations of small integer values.
     * @type {!Object}
     */
    var INT_CACHE = {};

    /**
     * A cache of the Long representations of small unsigned integer values.
     * @type {!Object}
     */
    var UINT_CACHE = {};

    /**
     * Returns a Long representing the given (32-bit) integer value.
     * @param {number} value The 32-bit integer in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromInt = function(value, unsigned) {
        var obj, cachedObj;
        if (!unsigned) {
            value = value | 0;
            if (-128 <= value && value < 128) {
                cachedObj = INT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, value < 0 ? -1 : 0, false);
            if (-128 <= value && value < 128) {
                INT_CACHE[value] = obj;
            }
            return obj;
        } else {
            value = value >>> 0;
            if (0 <= value && value < 256) {
                cachedObj = UINT_CACHE[value];
                if (cachedObj) return cachedObj;
            }
            obj = new Long(value, (value | 0) < 0 ? -1 : 0, true);
            if (0 <= value && value < 256) {
                UINT_CACHE[value] = obj;
            }
            return obj;
        }
    };

    /**
     * Returns a Long representing the given value, provided that it is a finite
     * number.  Otherwise, zero is returned.
     * @param {number} value The number in question.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromNumber = function(value, unsigned) {
        unsigned = !!unsigned;
        if (isNaN(value) || !isFinite(value)) {
            return Long.ZERO;
        } else if (!unsigned && value <= -TWO_PWR_63_DBL) {
            return Long.MIN_SIGNED_VALUE;
        } else if (unsigned && value <= 0) {
            return Long.MIN_UNSIGNED_VALUE;
        } else if (!unsigned && value + 1 >= TWO_PWR_63_DBL) {
            return Long.MAX_SIGNED_VALUE;
        } else if (unsigned && value >= TWO_PWR_64_DBL) {
            return Long.MAX_UNSIGNED_VALUE;
        } else if (value < 0) {
            return Long.fromNumber(-value, false).negate();
        } else {
            return new Long((value % TWO_PWR_32_DBL) | 0, (value / TWO_PWR_32_DBL) | 0, unsigned);
        }
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low and high bits. Each is
     *  assumed to use 32 bits.
     * @param {number} lowBits The low 32 bits.
     * @param {number} highBits The high 32 bits.
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromBits = function(lowBits, highBits, unsigned) {
        return new Long(lowBits, highBits, unsigned);
    };

    /**
     * Returns a Long representing the 64bit integer that comes by concatenating the given low, middle and high bits.
     *  Each is assumed to use 28 bits.
     * @param {number} part0 The low 28 bits
     * @param {number} part1 The middle 28 bits
     * @param {number} part2 The high 28 (8) bits
     * @param {boolean=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @return {!Long}
     * @expose
     */
    Long.from28Bits = function(part0, part1, part2, unsigned) {
        // 00000000000000000000000000001111 11111111111111111111111122222222 2222222222222
        // LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH
        return Long.fromBits(part0 | (part1 << 28), (part1 >>> 4) | (part2) << 24, unsigned);
    };

    /**
     * Returns a Long representation of the given string, written using the given
     * radix.
     * @param {string} str The textual representation of the Long.
     * @param {(boolean|number)=} unsigned Whether unsigned or not. Defaults to false (signed).
     * @param {number=} radix The radix in which the text is written.
     * @return {!Long} The corresponding Long value.
     * @expose
     */
    Long.fromString = function(str, unsigned, radix) {
        if (str.length == 0) {
            throw(new Error('number format error: empty string'));
        }
        if (str === "NaN" || str === "Infinity" || str === "+Infinity" || str === "-Infinity") {
            return Long.ZERO;
        }
        if (typeof unsigned === 'number') { // For goog.math.Long compatibility
            radix = unsigned;
            unsigned = false;
        }
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }

        if (str.charAt(0) == '-') {
            return Long.fromString(str.substring(1), unsigned, radix).negate();
        } else if (str.indexOf('-') >= 0) {
            throw(new Error('number format error: interior "-" character: ' + str));
        }

        // Do several (8) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 8));

        var result = Long.ZERO;
        for (var i = 0; i < str.length; i += 8) {
            var size = Math.min(8, str.length - i);
            var value = parseInt(str.substring(i, i + size), radix);
            if (size < 8) {
                var power = Long.fromNumber(Math.pow(radix, size));
                result = result.multiply(power).add(Long.fromNumber(value));
            } else {
                result = result.multiply(radixToPower);
                result = result.add(Long.fromNumber(value));
            }
        }
        return result;
    };

    // NOTE: the compiler should inline these constant values below and then remove these variables, so there should be
    // no runtime penalty for these.
    
    // NOTE: The following constant values are used internally only and are therefore not exposed as properties of the
    // Long class.

    /**
     * @type {number}
     */
    var TWO_PWR_16_DBL = 1 << 16;

    /**
     * @type {number}
     */
    var TWO_PWR_24_DBL = 1 << 24;

    /**
     * @type {number}
     */
    var TWO_PWR_32_DBL = TWO_PWR_16_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_31_DBL = TWO_PWR_32_DBL / 2;

    /**
     * @type {number}
     */
    var TWO_PWR_48_DBL = TWO_PWR_32_DBL * TWO_PWR_16_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_64_DBL = TWO_PWR_32_DBL * TWO_PWR_32_DBL;

    /**
     * @type {number}
     */
    var TWO_PWR_63_DBL = TWO_PWR_64_DBL / 2;

    /**
     * @type {!Long}
     */
    var TWO_PWR_24 = Long.fromInt(1 << 24);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ZERO = Long.fromInt(0);

    /**
     * @type {!Long}
     * @expose
     */
    Long.ONE = Long.fromInt(1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.NEG_ONE = Long.fromInt(-1);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_SIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MAX_UNSIGNED_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0xFFFFFFFF | 0, true);

    /**
     * Alias of {@link Long.MAX_SIGNED_VALUE} for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MAX_VALUE = Long.MAX_SIGNED_VALUE;

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_SIGNED_VALUE = Long.fromBits(0, 0x80000000 | 0, false);

    /**
     * @type {!Long}
     * @expose
     */
    Long.MIN_UNSIGNED_VALUE = Long.fromBits(0, 0, true);

    /**
     * Alias of {@link Long.MIN_SIGNED_VALUE}  for goog.math.Long compatibility.
     * @type {!Long}
     * @expose
     */
    Long.MIN_VALUE = Long.MIN_SIGNED_VALUE;

    /**
     * @return {number} The value, assuming it is a 32-bit integer.
     * @expose
     */
    Long.prototype.toInt = function() {
        return this.unsigned ? this.low >>> 0 : this.low;
    };

    /**
     * @return {number} The closest floating-point representation to this value.
     * @expose
     */
    Long.prototype.toNumber = function() {
        if (this.unsigned) {
            return ((this.high >>> 0) * TWO_PWR_32_DBL) + (this.low >>> 0);
        }
        return this.high * TWO_PWR_32_DBL + (this.low >>> 0);
    };

    /**
     * @param {number=} radix The radix in which the text should be written.
     * @return {string} The textual representation of this value.
     * @override
     * @expose
     */
    Long.prototype.toString = function(radix) {
        radix = radix || 10;
        if (radix < 2 || 36 < radix) {
            throw(new Error('radix out of range: ' + radix));
        }
        if (this.isZero()) {
            return '0';
        }
        var rem;
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                // We need to change the Long value before it can be negated, so we remove
                // the bottom-most digit in this base and then recurse to do the rest.
                var radixLong = Long.fromNumber(radix);
                var div = this.div(radixLong);
                rem = div.multiply(radixLong).subtract(this);
                return div.toString(radix) + rem.toInt().toString(radix);
            } else {
                return '-' + this.negate().toString(radix);
            }
        }

        // Do several (6) digits each time through the loop, so as to
        // minimize the calls to the very expensive emulated div.
        var radixToPower = Long.fromNumber(Math.pow(radix, 6));
        rem = this;
        var result = '';
        while (true) {
            var remDiv = rem.div(radixToPower);
            var intval = rem.subtract(remDiv.multiply(radixToPower)).toInt();
            var digits = intval.toString(radix);
            rem = remDiv;
            if (rem.isZero()) {
                return digits + result;
            } else {
                while (digits.length < 6) {
                    digits = '0' + digits;
                }
                result = '' + digits + result;
            }
        }
    };

    /**
     * @return {number} The high 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getHighBits = function() {
        return this.high;
    };

    /**
     * @return {number} The high 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getHighBitsUnsigned = function() {
        return this.high >>> 0;
    };

    /**
     * @return {number} The low 32 bits as a signed value.
     * @expose
     */
    Long.prototype.getLowBits = function() {
        return this.low;
    };

    /**
     * @return {number} The low 32 bits as an unsigned value.
     * @expose
     */
    Long.prototype.getLowBitsUnsigned = function() {
        return this.low >>> 0;
    };

    /**
     * @return {number} Returns the number of bits needed to represent the absolute
     *     value of this Long.
     * @expose
     */
    Long.prototype.getNumBitsAbs = function() {
        if (this.isNegative()) { // Unsigned Longs are never negative
            if (this.equals(Long.MIN_SIGNED_VALUE)) {
                return 64;
            } else {
                return this.negate().getNumBitsAbs();
            }
        } else {
            var val = this.high != 0 ? this.high : this.low;
            for (var bit = 31; bit > 0; bit--) {
                if ((val & (1 << bit)) != 0) {
                    break;
                }
            }
            return this.high != 0 ? bit + 33 : bit + 1;
        }
    };

    /**
     * @return {boolean} Whether this value is zero.
     * @expose
     */
    Long.prototype.isZero = function() {
        return this.high == 0 && this.low == 0;
    };

    /**
     * @return {boolean} Whether this value is negative.
     * @expose
     */
    Long.prototype.isNegative = function() {
        return !this.unsigned && this.high < 0;
    };

    /**
     * @return {boolean} Whether this value is odd.
     * @expose
     */
    Long.prototype.isOdd = function() {
        return (this.low & 1) == 1;
    };

    /**
     * @return {boolean} Whether this value is even.
     */
    Long.prototype.isEven = function() {
        return (this.low & 1) == 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long equals the other.
     * @expose
     */
    Long.prototype.equals = function(other) {
        if (this.unsigned != other.unsigned && (this.high >>> 31) != (other.high >>> 31)) return false;
        return (this.high == other.high) && (this.low == other.low);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long does not equal the other.
     * @expose
     */
    Long.prototype.notEquals = function(other) {
        return !this.equals(other);
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than the other.
     * @expose
     */
    Long.prototype.lessThan = function(other) {
        return this.compare(other) < 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is less than or equal to the other.
     * @expose
     */
    Long.prototype.lessThanOrEqual = function(other) {
        return this.compare(other) <= 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than the other.
     * @expose
     */
    Long.prototype.greaterThan = function(other) {
        return this.compare(other) > 0;
    };

    /**
     * @param {Long} other Long to compare against.
     * @return {boolean} Whether this Long is greater than or equal to the other.
     * @expose
     */
    Long.prototype.greaterThanOrEqual = function(other) {
        return this.compare(other) >= 0;
    };

    /**
     * Compares this Long with the given one.
     * @param {Long} other Long to compare against.
     * @return {number} 0 if they are the same, 1 if the this is greater, and -1
     *     if the given one is greater.
     * @expose
     */
    Long.prototype.compare = function(other) {
        if (this.equals(other)) {
            return 0;
        }
        var thisNeg = this.isNegative();
        var otherNeg = other.isNegative();
        if (thisNeg && !otherNeg) return -1;
        if (!thisNeg && otherNeg) return 1;
        if (!this.unsigned) {
            // At this point the signs are the same
            return this.subtract(other).isNegative() ? -1 : 1;
        } else {
            // Both are positive if at least one is unsigned
            return (other.high >>> 0) > (this.high >>> 0) || (other.high == this.high && (other.low >>> 0) > (this.low >>> 0)) ? -1 : 1;
        }
    };

    /**
     * @return {!Long} The negation of this value.
     * @expose
     */
    Long.prototype.negate = function() {
        if (!this.unsigned && this.equals(Long.MIN_SIGNED_VALUE)) {
            return Long.MIN_SIGNED_VALUE;
        }
        return this.not().add(Long.ONE);
    };

    /**
     * Returns the sum of this and the given Long.
     * @param {Long} other Long to add to this one.
     * @return {!Long} The sum of this and the given Long.
     * @expose
     */
    Long.prototype.add = function(other) {
        // Divide each number into 4 chunks of 16 bits, and then sum the chunks.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 + b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 + b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 + b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 + b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns the difference of this and the given Long.
     * @param {Long} other Long to subtract from this.
     * @return {!Long} The difference of this and the given Long.
     * @expose
     */
    Long.prototype.subtract = function(other) {
        return this.add(other.negate());
    };

    /**
     * Returns the product of this and the given long.
     * @param {Long} other Long to multiply with this.
     * @return {!Long} The product of this and the other.
     * @expose
     */
    Long.prototype.multiply = function(other) {
        if (this.isZero()) {
            return Long.ZERO;
        } else if (other.isZero()) {
            return Long.ZERO;
        }

        if (this.equals(Long.MIN_VALUE)) {
            return other.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        } else if (other.equals(Long.MIN_VALUE)) {
            return this.isOdd() ? Long.MIN_VALUE : Long.ZERO;
        }

        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().multiply(other.negate());
            } else {
                return this.negate().multiply(other).negate();
            }
        } else if (other.isNegative()) {
            return this.multiply(other.negate()).negate();
        }
        // If both longs are small, use float multiplication
        if (this.lessThan(TWO_PWR_24) &&
            other.lessThan(TWO_PWR_24)) {
            return Long.fromNumber(this.toNumber() * other.toNumber(), this.unsigned);
        }

        // Divide each long into 4 chunks of 16 bits, and then add up 4x4 products.
        // We can skip products that would overflow.
        
        var a48 = this.high >>> 16;
        var a32 = this.high & 0xFFFF;
        var a16 = this.low >>> 16;
        var a00 = this.low & 0xFFFF;

        var b48 = other.high >>> 16;
        var b32 = other.high & 0xFFFF;
        var b16 = other.low >>> 16;
        var b00 = other.low & 0xFFFF;

        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32, this.unsigned);
    };

    /**
     * Returns this Long divided by the given one.
     * @param {Long} other Long by which to divide.
     * @return {!Long} This Long divided by the given one.
     * @expose
     */
    Long.prototype.div = function(other) {
        if (other.isZero()) {
            throw(new Error('division by zero'));
        } else if (this.isZero()) {
            return Long.ZERO;
        }
        if (this.equals(Long.MIN_SIGNED_VALUE)) {
            if (other.equals(Long.ONE) || other.equals(Long.NEG_ONE)) {
                return min;  // recall that -MIN_VALUE == MIN_VALUE
            } else if (other.equals(Long.MIN_VALUE)) {
                return Long.ONE;
            } else {
                // At this point, we have |other| >= 2, so |this/other| < |MIN_VALUE|.
                var halfThis = this.shiftRight(1);
                var approx = halfThis.div(other).shiftLeft(1);
                if (approx.equals(Long.ZERO)) {
                    return other.isNegative() ? Long.ONE : Long.NEG_ONE;
                } else {
                    var rem = this.subtract(other.multiply(approx));
                    var result = approx.add(rem.div(other));
                    return result;
                }
            }
        } else if (other.equals(Long.MIN_VALUE)) {
            return Long.ZERO;
        }
        if (this.isNegative()) {
            if (other.isNegative()) {
                return this.negate().div(other.negate());
            } else {
                return this.negate().div(other).negate();
            }
        } else if (other.isNegative()) {
            return this.div(other.negate()).negate();
        }

        // Repeat the following until the remainder is less than other:  find a
        // floating-point that approximates remainder / other *from below*, add this
        // into the result, and subtract it from the remainder.  It is critical that
        // the approximate value is less than or equal to the real value so that the
        // remainder never becomes negative.
        var res = Long.ZERO;
        var rem = this;
        while (rem.greaterThanOrEqual(other)) {
            // Approximate the result of division. This may be a little greater or
            // smaller than the actual value.
            var approx = Math.max(1, Math.floor(rem.toNumber() / other.toNumber()));

            // We will tweak the approximate result by changing it in the 48-th digit or
            // the smallest non-fractional digit, whichever is larger.
            var log2 = Math.ceil(Math.log(approx) / Math.LN2);
            var delta = (log2 <= 48) ? 1 : Math.pow(2, log2 - 48);

            // Decrease the approximation until it is smaller than the remainder.  Note
            // that if it is too large, the product overflows and is negative.
            var approxRes = Long.fromNumber(approx, this.unsigned);
            var approxRem = approxRes.multiply(other);
            while (approxRem.isNegative() || approxRem.greaterThan(rem)) {
                approx -= delta;
                approxRes = Long.fromNumber(approx, this.unsigned);
                approxRem = approxRes.multiply(other);
            }

            // We know the answer can't be zero... and actually, zero would cause
            // infinite recursion since we would make no progress.
            if (approxRes.isZero()) {
                approxRes = Long.ONE;
            }

            res = res.add(approxRes);
            rem = rem.subtract(approxRem);
        }
        return res;
    };

    /**
     * Returns this Long modulo the given one.
     * @param {Long} other Long by which to mod.
     * @return {!Long} This Long modulo the given one.
     * @expose
     */
    Long.prototype.modulo = function(other) {
        return this.subtract(this.div(other).multiply(other));
    };

    /**
     * @return {!Long} The bitwise-NOT of this value.
     * @expose
     */
    Long.prototype.not = function() {
        return Long.fromBits(~this.low, ~this.high, this.unsigned);
    };

    /**
     * Returns the bitwise-AND of this Long and the given one.
     * @param {Long} other The Long with which to AND.
     * @return {!Long} The bitwise-AND of this and the other.
     * @expose
     */
    Long.prototype.and = function(other) {
        return Long.fromBits(this.low & other.low, this.high & other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-OR of this Long and the given one.
     * @param {Long} other The Long with which to OR.
     * @return {!Long} The bitwise-OR of this and the other.
     * @expose
     */
    Long.prototype.or = function(other) {
        return Long.fromBits(this.low | other.low, this.high | other.high, this.unsigned);
    };

    /**
     * Returns the bitwise-XOR of this Long and the given one.
     * @param {Long} other The Long with which to XOR.
     * @return {!Long} The bitwise-XOR of this and the other.
     * @expose
     */
    Long.prototype.xor = function(other) {
        return Long.fromBits(this.low ^ other.low, this.high ^ other.high, this.unsigned);
    };

    /**
     * Returns this Long with bits shifted to the left by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the left by the given amount.
     * @expose
     */
    Long.prototype.shiftLeft = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var low = this.low;
            if (numBits < 32) {
                var high = this.high;
                return Long.fromBits(low << numBits, (high << numBits) | (low >>> (32 - numBits)), this.unsigned);
            } else {
                return Long.fromBits(0, low << (numBits - 32), this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount.
     * @expose
     */
    Long.prototype.shiftRight = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >> numBits, this.unsigned);
            } else {
                return Long.fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1, this.unsigned);
            }
        }
    };

    /**
     * Returns this Long with bits shifted to the right by the given amount, with
     * the new top bits matching the current sign bit.
     * @param {number} numBits The number of bits by which to shift.
     * @return {!Long} This shifted to the right by the given amount, with
     *     zeros placed into the new leading bits.
     * @expose
     */
    Long.prototype.shiftRightUnsigned = function(numBits) {
        numBits &= 63;
        if (numBits == 0) {
            return this;
        } else {
            var high = this.high;
            if (numBits < 32) {
                var low = this.low;
                return Long.fromBits((low >>> numBits) | (high << (32 - numBits)), high >>> numBits, this.unsigned);
            } else if (numBits == 32) {
                return Long.fromBits(high, 0, this.unsigned);
            } else {
                return Long.fromBits(high >>> (numBits - 32), 0, this.unsigned);
            }
        }
    };

    /**
     * @return {!Long} Signed long
     * @expose
     */
    Long.prototype.toSigned = function() {
        var l = this.clone();
        l.unsigned = false;
        return l;
    };

    /**
     * @return {!Long} Unsigned long
     * @expose
     */
    Long.prototype.toUnsigned = function() {
        var l = this.clone();
        l.unsigned = true;
        return l;
    };
    
    /**
     * @return {Long} Cloned instance with the same low/high bits and unsigned flag.
     * @expose
     */
    Long.prototype.clone = function() {
        return new Long(this.low, this.high, this.unsigned);
    };

    // Enable module loading if available
    if (typeof module != 'undefined' && module["exports"]) { // CommonJS
        module["exports"] = Long;
    } else if (typeof define != 'undefined' && define["amd"]) { // AMD
        define("Math/Long", [], function() { return Long; });
    } else { // Shim
        if (!global["dcodeIO"]) {
            global["dcodeIO"] = {};
        }
        global["dcodeIO"]["Long"] = Long;
    }

})(this);

},{}],8:[function(_dereq_,module,exports){
//kmeans
// [ [ float ]_r ]_p * int==k * int ->
// {labeling: [ int <= k ]_p, centers: [ [ float ]_r ]_k, assignments: [ [ {row: int, dist: float}] ]_k}

function kmeans (data, k, maxSteps) {
	if (k > data.length) throw 'k must be less than rank';

	//grab k random rows
	// [ [float] ]_(m>k) * k:int -> [ [float] ]_k
	// TODO k++ initializer
	function init (data, k) {
		var opts = [];
		for (var i = 0; i < data.length; i++) opts.push(i);

		var rows = [];
		for (var i = 0; i < k; i++)
			rows.push(opts.splice(Math.round(Math.random() * opts.length),1));

		return rows.map(function (idx) { return data[idx]; });
	}

	//euclidean: sqrt of sum of squares
	// [ float ]_k * [ float ]_k -> float
	function dist (row, center) {
		var sum = 0;
		for (var i = 0; i < row.length; i++)
			sum += Math.pow(row[i] - center[i], 2);
		return Math.sqrt(sum);
	}

	//closest cluster
	// [ float ]_r * [ [ float ]_r ]_k -> int
	function assign (row, centers) {
		var center = 0;
		var score = dist(row, centers[0]);
		for (var i = 1; i < centers.length; i++) {
			var attempt = dist(row, centers[i]);
			if (attempt < score) {
				center = i;
				score = attempt;
			}
		}
		return {cluster: center, score: score};
	}

	// relabel points and return whether any changed
	// [ _ ]_p * [ [ float ]_r ]_p * [ [ float ]_r ]_k -> {anyChanged: bool, clustering: [ [{row: int, dist: float}] ]_k
	function assignAll (labeling, rows, centers) {

		var anyChanged = false;
		var assignments = [];
		for (var i = 0; i < centers.length; i++) assignments.push([]);

		for (var p = 0; p < rows.length; p++) {
			var before = labeling[p];
			var assignment = assign(rows[p], centers);
			if (assignment.cluster != before) {
				anyChanged = true;
				labeling[p] = assignment.cluster;
			}
			assignments[assignment.cluster].push({row: p, dist: assignment.score});
		}
		return {anyChanged: anyChanged, clustering: assignments}
	}

	//update cluster k
	//return whether a value changed
	// [ int <= k ]_p * [ [ float ]_r ]_k * [ [ float ]_r ]_p * int<=k -> bool
	function recenterCluster (labeling, centers, data, k) {
		var anyChanged = false;
		var numHits = 0;
		for (var i = 0; i < labeling.length; i++) {
			if (labeling[i] == k) numHits++;
		}
		if (!numHits) {
			for (var f = 0; f < centers[0].length; f++) {
				var before = centers[k][f];
				centers[k][f] = 0;
				anyChanged |= before != 0;
			}
			return anyChanged;
		} else {
			for (var f = 0; f < centers[0].length; f++) {
				var before = centers[k][f];
				var sum = 0;
				for (var p = 0; p < labeling.length; p++)
					if (labeling[p] == k)
						sum += data[p][f];
				var newCenter = sum / numHits;
				centers[k][f] = newCenter;
				anyChanged |= before == newCenter;
			}
			return anyChanged;
		}
	}

	//update clusters
	//return whether any values changed
	// [ int <= k ]_p * [ [ float ]_r ]_k * [ [ float ]_r ]_p -> bool
	function recenterClusters (labeling, centers, data) {
		var anyChanged = false;
		for (var k = 0; k < centers.length; k++)
			anyChanged |= recenterCluster(labeling, centers, data, k);
		return anyChanged;
	}

	var centers = init(data,k);
	var labeling = new Array(data.length);
	for (var i = 0; i < data.length; i++) labeling[i] = 0;

	for (var i = 0; i < maxSteps; i++) {
//		console.error('10 labels', labeling.slice(0,10));
//		console.error('3 centers', [].concat.apply([],centers.slice(0,3).map(function (row) { return row.slice(0,2); })));
		var assignments = assignAll(labeling, data, centers);
//		console.error(assignments.clustering.slice(0,3));
		var assignChange = assignments.anyChanged;
		var clusterChange = recenterClusters(labeling, centers, data);
		var anyChanged = assignChange || clusterChange;
//		console.error('change', i, assignChange, clusterChange);
		if (!anyChanged) {
			break;
		}
	}

	var assignments = assignAll(labeling, data, centers); //under most recent clustering
	return {labeling: labeling, centers: centers, assignments: assignments.clustering};
}

module.exports = kmeans;
},{}],9:[function(_dereq_,module,exports){
var $ = _dereq_('jQuery');
var Q = _dereq_('Q');
var Long = _dereq_('./Long.js');

    "use strict";

    var exports = {
        ls: function (matrixJson) {
            //FIXME do not do as eval

            var parts = matrixJson.split('/');
            parts.pop();
            var base = parts.join('/') + '/';

            var file = typeof window == 'undefined' ?
                    Q.denodeify(_dereq_('fs').readFile)(matrixJson, {encoding: 'utf8'})
                :   Q($.ajax(matrixJson, {dataType: "text"}));

            return file
                .then(eval)
                .then(function (lst) {
                    return lst.map(function (f) {
                        return {KB: f.KB, 'f': base + f.f};
                    });
                });
        },


        loadBinary: function (file) { // -> Promise Binary
            var t0 = new Date().getTime();

            function Binary (buf) {
                return {
                    edges: new Uint32Array(buf.buffer, 4 * 4),
                    min: buf[0],
                    max: buf[1],
                    numNodes: buf[2],
                    numEdges: buf[3]
                };
            }

            var res = Q.defer();

            var xhr = new XMLHttpRequest();
            xhr.open('GET', file, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function(e) {
                res.resolve(Binary(new Uint32Array(this.response)));
                // console.log('binary load', new Date().getTime() - t0, 'ms');
            };
            xhr.send();

            return res.promise;
        },


        load: function (file) {
            var t0 = new Date().getTime();

            return Q($.ajax(file, {dataType: "text"}))
            .then(function (str) {
                // console.log('naive parse', new Date().getTime() - t0, 'ms');

                //http://bl.ocks.org/mbostock/2846454
                var nodes = [];
                var links = str
                  .split(/\n/g) // split lines
                  .filter(function(d) { return d.charAt(0) != "%"; }) // skip comments
                  .slice(1, -1) // skip header line, last line
                  .map(function(d) {
                    d = d.split(/\s+/g);
                    var source = d[0] - 1, target = d[1] - 1;
                    return {
                        source: nodes[source] || (nodes[source] = {index: source}),
                        target: nodes[target] || (nodes[target] = {index: target})
                    };
                });

                console.log('naive parse + transform', new Date().getTime() - t0, 'ms');

                return {
                  nodes: nodes,
                  links: links
                };
            });
        }, //load


        loadGeo: function(file) { // -> Promise Binary
            var t0 = new Date().getTime();

            console.debug("LOADING GEO", file);

            function Binary (buf) {
                var f32 = new Float32Array(buf.buffer);
                var i32 = new Int32Array(buf.buffer);
                var ui32 = buf;
                var struct32Length = 1 + 2 * (2 + 1 + 1);
                var struct8Length = 4 * (1 + 2 * (2 + 1 + 1));

                function toUTC(low, high) {
                    return new Date(Long.fromBits(low, high, true).toNumber());
                }

                return {
                    numEdges: buf.byteLength / struct8Length,
                    id: function (i) { return ui32[i * struct32Length]; },
                    startTime: function (i) {
                        var idx = i * struct32Length + 1;
                        return toUTC(i32[idx], i32[idx + 1]);
                    },
                    startLat: function (i) { return f32[i * struct32Length + 3]; },
                    startLng: function (i) { return f32[i * struct32Length + 4]; },
                    endTime: function (i) {
                        var idx = i * struct32Length + 5;
                        return toUTC(i32[idx], i32[idx + 1]);
                    },
                    endLat: function (i) { return f32[i * struct32Length + 7]; },
                    endLng: function (i) { return f32[i * struct32Length + 8]; }
                };
            }

            var res = Q.defer();

            if (typeof(window) == 'undefined') {
                console.error("node fs")
                return Q.denodeify(_dereq_('fs').readFile)(file)
                    .then(function (nodeBuffer) {
                        return Binary(new Uint32Array(nodeBuffer));
                    }, function (err) {
                        console.error("OOPS", err);
                    });
            } else {
                console.debug("geo browser")
                var xhr = new XMLHttpRequest();
                xhr.open('GET', file, true);
                xhr.responseType = 'arraybuffer';
                xhr.onload = function(e) {
                    res.resolve(Binary(new Uint32Array(this.response)));
                    // console.log('binary load', new Date().getTime() - t0, 'ms');
                };
                xhr.send();
            }

            return res.promise;
        },


        getGeoBounds: function (binary) {
            var minLat = Number.POSITIVE_INFINITY;
            var maxLat = Number.NEGATIVE_INFINITY;
            var minLng = Number.POSITIVE_INFINITY;
            var maxLng = Number.NEGATIVE_INFINITY;
            var avgLat = 0;
            var avgLng = 0;
            var sLat = 0;
            var sLng = 0;
            for (var i = 0; i < binary.numEdges; i++) {
                minLat = Math.min(Math.min(minLat, binary.startLat(i)), binary.endLat(i));
                maxLat = Math.max(Math.max(maxLat, binary.startLat(i)), binary.endLat(i));
                minLng = Math.min(Math.min(minLng, binary.startLng(i)), binary.endLng(i));
                maxLng = Math.max(Math.max(maxLng, binary.startLng(i)), binary.endLng(i));

                var newAvgLat = avgLat + (binary.startLat(i) + binary.endLat(i) - 2 * avgLat) / (i + 2);
                sLat = sLat
                    + (binary.startLat(i) - newAvgLat) * (binary.startLat(i) - avgLat)
                    + (binary.endLat(i) - newAvgLat) * (binary.endLat(i) - avgLat);
                avgLat = newAvgLat;

                var newAvgLng = avgLng + (binary.startLng(i) + binary.endLng(i) - 2 * avgLng) / (i + 2);
                sLng = sLng
                    + (binary.startLng(i) - newAvgLng) * (binary.startLng(i) - avgLng)
                    + (binary.endLng(i) - newAvgLng) * (binary.endLng(i) - avgLng);
                avgLng = newAvgLng;
            }
            var stdLat = Math.sqrt(sLat/(binary.numEdges - 1));
            var stdLng = Math.sqrt(sLng/(binary.numEdges - 1));

            // normalize_d(v_d) = (v_d + d.scale.c)/d.scale.x

            // Henceforth, whoever uses one-letter variable names for non-temporary variables owes
            // everybody else lunch
            return {
                lat: {min: minLat, max: maxLat, stats: {avg: avgLat, std: stdLat}, scale: {c: -(avgLat - 1.5 * stdLat), x: 3 * stdLat}},
                lng: {min: minLng, max: maxLng, stats: {avg: avgLng, std: stdLng}, scale: {c: -(avgLng - 1.5 * stdLng), x: 3 * stdLng}}
            };
        },


        /**
         * Takes geo data returned by loadGeo and returns an object containing and edge and points
         * array, with the points being properly normalized to be on [1,1] and
         */
        processGeo: function(geoData) {
            var points = [],
                edges = [],
                bounds = exports.getGeoBounds(geoData);

            for(var i = 0; i < geoData.numEdges; i++) {
                if(Math.random() < 0.7) {
                    continue;
                }
                points.push([(geoData.startLng(i) + bounds.lng.scale.c) / (bounds.lng.scale.x), (geoData.startLat(i) + bounds.lat.scale.c) / (bounds.lat.scale.x)]);
                points.push([(geoData.endLng(i) + bounds.lng.scale.c) / (bounds.lng.scale.x), (geoData.endLat(i) + bounds.lat.scale.c) / (bounds.lat.scale.x)]);
                edges.push([points.length - 2, points.length - 1]);
            }

            return {"points": points, "edges": edges};
        }
    };

    module.exports = exports;

},{"./Long.js":7,"Q":13,"fs":16,"jQuery":"nHrylo"}],10:[function(_dereq_,module,exports){
/**
 * @author mrdoob / http://mrdoob.com/
 */

var Stats = function () {

    var startTime = Date.now(), prevTime = startTime;
    var ms = 0, msMin = Infinity, msMax = 0;
    var fps = 0, fpsMin = Infinity, fpsMax = 0;
    var frames = 0, mode = 0;

    var container = document.createElement( 'div' );
    container.id = 'stats';
    container.addEventListener( 'mousedown', function ( event ) { event.preventDefault(); setMode( ++ mode % 2 ) }, false );
    container.style.cssText = 'width:80px;opacity:0.9;cursor:pointer';

    var fpsDiv = document.createElement( 'div' );
    fpsDiv.id = 'fps';
    fpsDiv.style.cssText = 'padding:0 0 3px 3px;text-align:left;background-color:#002';
    container.appendChild( fpsDiv );

    var fpsText = document.createElement( 'div' );
    fpsText.id = 'fpsText';
    fpsText.style.cssText = 'color:#0ff;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
    fpsText.innerHTML = 'FPS';
    fpsDiv.appendChild( fpsText );

    var fpsGraph = document.createElement( 'div' );
    fpsGraph.id = 'fpsGraph';
    fpsGraph.style.cssText = 'position:relative;width:74px;height:30px;background-color:#0ff';
    fpsDiv.appendChild( fpsGraph );

    while ( fpsGraph.children.length < 74 ) {

        var bar = document.createElement( 'span' );
        bar.style.cssText = 'width:1px;height:30px;float:left;background-color:#113';
        fpsGraph.appendChild( bar );

    }

    var msDiv = document.createElement( 'div' );
    msDiv.id = 'ms';
    msDiv.style.cssText = 'padding:0 0 3px 3px;text-align:left;background-color:#020;display:none';
    container.appendChild( msDiv );

    var msText = document.createElement( 'div' );
    msText.id = 'msText';
    msText.style.cssText = 'color:#0f0;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
    msText.innerHTML = 'MS';
    msDiv.appendChild( msText );

    var msGraph = document.createElement( 'div' );
    msGraph.id = 'msGraph';
    msGraph.style.cssText = 'position:relative;width:74px;height:30px;background-color:#0f0';
    msDiv.appendChild( msGraph );

    while ( msGraph.children.length < 74 ) {

        var bar = document.createElement( 'span' );
        bar.style.cssText = 'width:1px;height:30px;float:left;background-color:#131';
        msGraph.appendChild( bar );

    }

    var setMode = function ( value ) {

        mode = value;

        switch ( mode ) {

            case 0:
                fpsDiv.style.display = 'block';
                msDiv.style.display = 'none';
                break;
            case 1:
                fpsDiv.style.display = 'none';
                msDiv.style.display = 'block';
                break;
        }

    }

    var updateGraph = function ( dom, value ) {

        var child = dom.appendChild( dom.firstChild );
        child.style.height = value + 'px';

    }

    return {

        REVISION: 11,

        domElement: container,

        setMode: setMode,

        begin: function () {

            startTime = Date.now();

        },

        end: function () {

            var time = Date.now();

            ms = time - startTime;
            msMin = Math.min( msMin, ms );
            msMax = Math.max( msMax, ms );

            msText.textContent = ms + ' MS (' + msMin + '-' + msMax + ')';
            updateGraph( msGraph, Math.min( 30, 30 - ( ms / 200 ) * 30 ) );

            frames ++;

            if ( time > prevTime + 1000 ) {

                fps = Math.round( ( frames * 1000 ) / ( time - prevTime ) );
                fpsMin = Math.min( fpsMin, fps );
                fpsMax = Math.max( fpsMax, fps );

                fpsText.textContent = fps + ' FPS (' + fpsMin + '-' + fpsMax + ')';
                updateGraph( fpsGraph, Math.min( 30, 30 - ( fps / 100 ) * 30 ) );

                prevTime = time;
                frames = 0;

            }

            return time;

        },

        update: function () {

            startTime = this.end();

        }

    }

};


module.exports = Stats;
},{}],11:[function(_dereq_,module,exports){
var $ = _dereq_('jQuery'),
    NBody = _dereq_('./NBody.js'),
    RenderGL = _dereq_('./RenderGL.js'),
    SimCL = _dereq_('./SimCL.js'),
    MatrixLoader = _dereq_('./libs/load.js'),
    Q = _dereq_('q'),
    Stats = _dereq_('./libs/stats.js'),
    events = _dereq_('./SimpleEvents.js'),
    kmeans = _dereq_('./libs/kmeans.js'),
    demo = _dereq_('./demo.js')



    "use strict";

    var graph = null,
        numPoints = 1000,//1024,//2048,//16384,
        num,
        numEdges = numPoints,
        dimensions = [1,1]; //[960,960];


    function setup() {
        console.log("Running Naive N-body simulation");

        return NBody.create(SimCL, RenderGL, document, $("#simulation")[0], [0,0,0,0], dimensions, 3)
        .then(function(createdGraph) {
            graph = createdGraph;
            console.log("N-body graph created.");

            var points = demo.createPoints(numPoints, dimensions);
            var edges = demo.createEdges(numEdges, numPoints);

            return Q.all([
                graph.setPoints(points),
                points,
                edges,
            ]);
        })
        .spread(function(graph, points, edges) {
            graph.setColorMap("test-colormap2.png");
            return graph.setEdges(edges);
        })
        .then(function(graph) {
            var fpsTotal = new Stats();
            fpsTotal.setMode(0);
            $("#fpsTotal").append(fpsTotal.domElement);
            events.listen("tickBegin", function() { fpsTotal.begin(); });
            events.listen("tickEnd", function() { fpsTotal.end(); });

            var fpsSim = new Stats();
            fpsSim.setMode(1);
            $("#fpsSim").append(fpsSim.domElement);
            events.listen("simulateBegin", function() { fpsSim.begin(); });
            events.listen("simulateEnd", function() { fpsSim.end(); });

            var fpsRender = new Stats();
            fpsRender.setMode(1);
            $("#fpsRender").append(fpsRender.domElement);
            events.listen("renderBegin", function() { fpsRender.begin(); });
            events.listen("renderEnd", function() { fpsRender.end(); });

            var animButton = $("#anim-button");
            var stepButton = $("#step-button");

            var animation = demo.animator(document, graph.tick);

            function startAnimation() {

                animButton.text("Stop");
                stepButton.prop("disabled", true);

                animButton.off().on("click", function() {
                    animation.stopAnimation();
                    stepButton.prop("disabled", false);
                    animButton.text("Animate");
                    animButton.off().on("click", startAnimation);
                });

                animation.startAnimation();
            }
            animButton.on("click", startAnimation);

            stepButton.on("click", function() {

                animation.stopAnimation();

                stepButton.prop("disabled", true);

                graph.tick()
                .then(function() {
                    stepButton.prop("disabled", false);
                });
            });

            animButton.prop("disabled", false);
            stepButton.prop("disabled", false);

            //return graph.tick();
            return graph;
        });
    }



    function bindSliders(graph) {
        console.debug('setting physics');

        $('#charge').on('change', function (e) {
            var v = $(this).val();
            var res = 0.1;
            for (var i = 0; i < (100-v); i++) res /= 1.3;
            var scaled = -1 * res;
            //console.log('charge', v, '->', scaled);
            graph.setPhysics({charge: scaled});
        });
        $('#gravity').on('change', function (e) {
            var v = $(this).val();
            var res = 100.0;
            for (var i = 0; i < (100-v); i++) res /= 1.3;
            var scaled = 1 * res;
            //      console.log('gravity', v, '->', scaled);
            graph.setPhysics({gravity: scaled});
        });
        $('#strength').on('change', function (e) {
            var v = $(this).val();
            var res = 100.0;
            for (var i = 0; i < (100-v); i++) res /= 1.3;
            var scaled = 1 * res;
            //      console.log('strength', v, '->', scaled);
            graph.setPhysics({edgeStrength: scaled});
        });
        $('#length').on('change', function (e) {
            var v = $(this).val();
            var res = 100.0;
            for (var i = 0; i < (100-v); i++) res /= 1.3;
            var scaled = 1 * res;
            //      console.log('length', v, '->', scaled);
            graph.setPhysics({edgeDistance: scaled});
        });

        ['points', 'edges', 'midpoints', 'midedges'].forEach(function (name) {
            function bang () {
                var obj = {};
                obj[name] = $(this).is(':checked');
                graph.setVisible(obj);
            };
            $('#' + name).on('change', bang);
            bang.call($('#' + name));
        });

        ['lockPoints', 'lockEdges', 'lockMidpoints', 'lockMidedges'].forEach(function (name) {
            function bang () {
                var obj = {};
                obj[name] = $(this).is(':checked');
                graph.setLocked(obj);
            }
            $('#' + name).on('change', bang);
            bang.call($('#' + name));
        });

    }


    ///////////////////////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////

    function renderDataList(dataList, graph) {

        var dataEl = $("#datasets");

        dataList.forEach(function(dataSet, i) {
            dataEl.append($('<option></option>')
                .attr('value', i)
                .text(dataSet.base + " (" + dataSet.size + ")")
            );
        })

        // Set the starting selection of the <select> control to be blank, since we start with
        // random data loaded, not a matrix
        dataEl.prop('selectedIndex', -1)

        $('#datasets')
        .on('change', function () {
            var dataSet = dataList[parseInt(this.value)];

            return dataSet.loader(graph, dataSet.f)
                .then(function () {
                    graph.tick();
                })
            .catch(function(err) {
                console.error("Error loading matrix:", err);
                throw err;
            })
        });
    }



    $(function () {

        setup().
        then(function() {
            console.debug("SETUP, LOADING DATA")
            return demo.loadDataList(graph);
        }).then(function (dataList) {
            renderDataList(dataList, graph);
        }).then(function () {
            console.debug("LOADED DATA, BINDING")
            return bindSliders(graph);
        }).then(function () {
            graph.tick(); //initial view
        }).then(
            function () { console.debug('DONE') },
            function (err) { console.error('oops', err, err.stack) })

    });
},{"./NBody.js":1,"./RenderGL.js":2,"./SimCL.js":3,"./SimpleEvents.js":4,"./demo.js":6,"./libs/kmeans.js":8,"./libs/load.js":9,"./libs/stats.js":10,"jQuery":"nHrylo","q":15}],12:[function(_dereq_,module,exports){
var $ = _dereq_('jQuery');
var Q = _dereq_('Q');

if (typeof(window) == 'undefined') {
    webgl = _dereq_('node-webgl');
    Image = webgl.Image;
}

    'use strict';


    function getSource(id) {
        // TODO: Could we use HTML <script> elements instead of AJAX fetches? We could possibly
        // set the src of the script to our content, the type to something other than JS. Then, we
        // listen for the onload event. In this way, we may be able to load content from disk
        // without running a server.

        if (typeof window == 'undefined') {
            var fs = _dereq_('fs');
            return Q.denodeify(fs.readFile)('shaders/' + id, {encoding: 'utf8'});
        } else {
            var url = "shaders/" + id;
            return Q($.ajax(url, {dataType: "text"}));
        }
    }

    /**
     * Fetch an image as an HTML Image object
     *
     * @returns a promise fulfilled with the HTML Image object, once loaded
     */
    function getImage(url) {
        var deferred = Q.defer();
        var img = new Image();

        img.onload = function() {
            console.debug('IMG LOADED')
            deferred.resolve(img);
        };

        console.debug("SETTING SOURCE", url)
        img.src = url;
        console.debug("SET SOURCE")

        return deferred.promise;
    }


    // Extends target by adding the attributes of one or more other objects to it
    function extend(target, object1, objectN) {
        for (var arg = 1; arg < arguments.length; arg++) {
            for (var i in arguments[arg]) {
                target[i] = arguments[arg][i];
            }
        }
        return target;
    }


    module.exports = {
        "getSource": getSource,
        "getImage": getImage,
        "extend": extend
    };

},{"Q":13,"fs":16,"jQuery":"nHrylo","node-webgl":"+YTs4a"}],13:[function(_dereq_,module,exports){
(function (process){
// vim:ts=4:sts=4:sw=4:
/*!
 *
 * Copyright 2009-2012 Kris Kowal under the terms of the MIT
 * license found at http://github.com/kriskowal/q/raw/master/LICENSE
 *
 * With parts by Tyler Close
 * Copyright 2007-2009 Tyler Close under the terms of the MIT X license found
 * at http://www.opensource.org/licenses/mit-license.html
 * Forked at ref_send.js version: 2009-05-11
 *
 * With parts by Mark Miller
 * Copyright (C) 2011 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

(function (definition) {
    // Turn off strict mode for this function so we can assign to global.Q
    /* jshint strict: false */

    // This file will function properly as a <script> tag, or a module
    // using CommonJS and NodeJS or RequireJS module formats.  In
    // Common/Node/RequireJS, the module exports the Q API and when
    // executed as a simple <script>, it creates a Q global instead.

    // Montage Require
    if (typeof bootstrap === "function") {
        bootstrap("promise", definition);

    // CommonJS
    } else if (typeof exports === "object") {
        module.exports = definition();

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
        define(definition);

    // SES (Secure EcmaScript)
    } else if (typeof ses !== "undefined") {
        if (!ses.ok()) {
            return;
        } else {
            ses.makeQ = definition;
        }

    // <script>
    } else {
        Q = definition();
    }

})(function () {
"use strict";

var hasStacks = false;
try {
    throw new Error();
} catch (e) {
    hasStacks = !!e.stack;
}

// All code after this point will be filtered from stack traces reported
// by Q.
var qStartingLine = captureLine();
var qFileName;

// shims

// used for fallback in "allResolved"
var noop = function () {};

// Use the fastest possible means to execute a task in a future turn
// of the event loop.
var nextTick =(function () {
    // linked list of tasks (single, with head node)
    var head = {task: void 0, next: null};
    var tail = head;
    var flushing = false;
    var requestTick = void 0;
    var isNodeJS = false;

    function flush() {
        /* jshint loopfunc: true */

        while (head.next) {
            head = head.next;
            var task = head.task;
            head.task = void 0;
            var domain = head.domain;

            if (domain) {
                head.domain = void 0;
                domain.enter();
            }

            try {
                task();

            } catch (e) {
                if (isNodeJS) {
                    // In node, uncaught exceptions are considered fatal errors.
                    // Re-throw them synchronously to interrupt flushing!

                    // Ensure continuation if the uncaught exception is suppressed
                    // listening "uncaughtException" events (as domains does).
                    // Continue in next event to avoid tick recursion.
                    if (domain) {
                        domain.exit();
                    }
                    setTimeout(flush, 0);
                    if (domain) {
                        domain.enter();
                    }

                    throw e;

                } else {
                    // In browsers, uncaught exceptions are not fatal.
                    // Re-throw them asynchronously to avoid slow-downs.
                    setTimeout(function() {
                       throw e;
                    }, 0);
                }
            }

            if (domain) {
                domain.exit();
            }
        }

        flushing = false;
    }

    nextTick = function (task) {
        tail = tail.next = {
            task: task,
            domain: isNodeJS && process.domain,
            next: null
        };

        if (!flushing) {
            flushing = true;
            requestTick();
        }
    };

    if (typeof process !== "undefined" && process.nextTick) {
        // Node.js before 0.9. Note that some fake-Node environments, like the
        // Mocha test runner, introduce a `process` global without a `nextTick`.
        isNodeJS = true;

        requestTick = function () {
            process.nextTick(flush);
        };

    } else if (typeof setImmediate === "function") {
        // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
        if (typeof window !== "undefined") {
            requestTick = setImmediate.bind(window, flush);
        } else {
            requestTick = function () {
                setImmediate(flush);
            };
        }

    } else if (typeof MessageChannel !== "undefined") {
        // modern browsers
        // http://www.nonblocking.io/2011/06/windownexttick.html
        var channel = new MessageChannel();
        // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
        // working message ports the first time a page loads.
        channel.port1.onmessage = function () {
            requestTick = requestPortTick;
            channel.port1.onmessage = flush;
            flush();
        };
        var requestPortTick = function () {
            // Opera requires us to provide a message payload, regardless of
            // whether we use it.
            channel.port2.postMessage(0);
        };
        requestTick = function () {
            setTimeout(flush, 0);
            requestPortTick();
        };

    } else {
        // old browsers
        requestTick = function () {
            setTimeout(flush, 0);
        };
    }

    return nextTick;
})();

// Attempt to make generics safe in the face of downstream
// modifications.
// There is no situation where this is necessary.
// If you need a security guarantee, these primordials need to be
// deeply frozen anyway, and if you don’t need a security guarantee,
// this is just plain paranoid.
// However, this **might** have the nice side-effect of reducing the size of
// the minified code by reducing x.call() to merely x()
// See Mark Miller’s explanation of what this does.
// http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
var call = Function.call;
function uncurryThis(f) {
    return function () {
        return call.apply(f, arguments);
    };
}
// This is equivalent, but slower:
// uncurryThis = Function_bind.bind(Function_bind.call);
// http://jsperf.com/uncurrythis

var array_slice = uncurryThis(Array.prototype.slice);

var array_reduce = uncurryThis(
    Array.prototype.reduce || function (callback, basis) {
        var index = 0,
            length = this.length;
        // concerning the initial value, if one is not provided
        if (arguments.length === 1) {
            // seek to the first value in the array, accounting
            // for the possibility that is is a sparse array
            do {
                if (index in this) {
                    basis = this[index++];
                    break;
                }
                if (++index >= length) {
                    throw new TypeError();
                }
            } while (1);
        }
        // reduce
        for (; index < length; index++) {
            // account for the possibility that the array is sparse
            if (index in this) {
                basis = callback(basis, this[index], index);
            }
        }
        return basis;
    }
);

var array_indexOf = uncurryThis(
    Array.prototype.indexOf || function (value) {
        // not a very good shim, but good enough for our one use of it
        for (var i = 0; i < this.length; i++) {
            if (this[i] === value) {
                return i;
            }
        }
        return -1;
    }
);

var array_map = uncurryThis(
    Array.prototype.map || function (callback, thisp) {
        var self = this;
        var collect = [];
        array_reduce(self, function (undefined, value, index) {
            collect.push(callback.call(thisp, value, index, self));
        }, void 0);
        return collect;
    }
);

var object_create = Object.create || function (prototype) {
    function Type() { }
    Type.prototype = prototype;
    return new Type();
};

var object_hasOwnProperty = uncurryThis(Object.prototype.hasOwnProperty);

var object_keys = Object.keys || function (object) {
    var keys = [];
    for (var key in object) {
        if (object_hasOwnProperty(object, key)) {
            keys.push(key);
        }
    }
    return keys;
};

var object_toString = uncurryThis(Object.prototype.toString);

function isObject(value) {
    return value === Object(value);
}

// generator related shims

// FIXME: Remove this function once ES6 generators are in SpiderMonkey.
function isStopIteration(exception) {
    return (
        object_toString(exception) === "[object StopIteration]" ||
        exception instanceof QReturnValue
    );
}

// FIXME: Remove this helper and Q.return once ES6 generators are in
// SpiderMonkey.
var QReturnValue;
if (typeof ReturnValue !== "undefined") {
    QReturnValue = ReturnValue;
} else {
    QReturnValue = function (value) {
        this.value = value;
    };
}

// long stack traces

var STACK_JUMP_SEPARATOR = "From previous event:";

function makeStackTraceLong(error, promise) {
    // If possible, transform the error stack trace by removing Node and Q
    // cruft, then concatenating with the stack trace of `promise`. See #57.
    if (hasStacks &&
        promise.stack &&
        typeof error === "object" &&
        error !== null &&
        error.stack &&
        error.stack.indexOf(STACK_JUMP_SEPARATOR) === -1
    ) {
        var stacks = [];
        for (var p = promise; !!p; p = p.source) {
            if (p.stack) {
                stacks.unshift(p.stack);
            }
        }
        stacks.unshift(error.stack);

        var concatedStacks = stacks.join("\n" + STACK_JUMP_SEPARATOR + "\n");
        error.stack = filterStackString(concatedStacks);
    }
}

function filterStackString(stackString) {
    var lines = stackString.split("\n");
    var desiredLines = [];
    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i];

        if (!isInternalFrame(line) && !isNodeFrame(line) && line) {
            desiredLines.push(line);
        }
    }
    return desiredLines.join("\n");
}

function isNodeFrame(stackLine) {
    return stackLine.indexOf("(module.js:") !== -1 ||
           stackLine.indexOf("(node.js:") !== -1;
}

function getFileNameAndLineNumber(stackLine) {
    // Named functions: "at functionName (filename:lineNumber:columnNumber)"
    // In IE10 function name can have spaces ("Anonymous function") O_o
    var attempt1 = /at .+ \((.+):(\d+):(?:\d+)\)$/.exec(stackLine);
    if (attempt1) {
        return [attempt1[1], Number(attempt1[2])];
    }

    // Anonymous functions: "at filename:lineNumber:columnNumber"
    var attempt2 = /at ([^ ]+):(\d+):(?:\d+)$/.exec(stackLine);
    if (attempt2) {
        return [attempt2[1], Number(attempt2[2])];
    }

    // Firefox style: "function@filename:lineNumber or @filename:lineNumber"
    var attempt3 = /.*@(.+):(\d+)$/.exec(stackLine);
    if (attempt3) {
        return [attempt3[1], Number(attempt3[2])];
    }
}

function isInternalFrame(stackLine) {
    var fileNameAndLineNumber = getFileNameAndLineNumber(stackLine);

    if (!fileNameAndLineNumber) {
        return false;
    }

    var fileName = fileNameAndLineNumber[0];
    var lineNumber = fileNameAndLineNumber[1];

    return fileName === qFileName &&
        lineNumber >= qStartingLine &&
        lineNumber <= qEndingLine;
}

// discover own file name and line number range for filtering stack
// traces
function captureLine() {
    if (!hasStacks) {
        return;
    }

    try {
        throw new Error();
    } catch (e) {
        var lines = e.stack.split("\n");
        var firstLine = lines[0].indexOf("@") > 0 ? lines[1] : lines[2];
        var fileNameAndLineNumber = getFileNameAndLineNumber(firstLine);
        if (!fileNameAndLineNumber) {
            return;
        }

        qFileName = fileNameAndLineNumber[0];
        return fileNameAndLineNumber[1];
    }
}

function deprecate(callback, name, alternative) {
    return function () {
        if (typeof console !== "undefined" &&
            typeof console.warn === "function") {
            console.warn(name + " is deprecated, use " + alternative +
                         " instead.", new Error("").stack);
        }
        return callback.apply(callback, arguments);
    };
}

// end of shims
// beginning of real work

/**
 * Constructs a promise for an immediate reference, passes promises through, or
 * coerces promises from different systems.
 * @param value immediate reference or promise
 */
function Q(value) {
    // If the object is already a Promise, return it directly.  This enables
    // the resolve function to both be used to created references from objects,
    // but to tolerably coerce non-promises to promises.
    if (isPromise(value)) {
        return value;
    }

    // assimilate thenables
    if (isPromiseAlike(value)) {
        return coerce(value);
    } else {
        return fulfill(value);
    }
}
Q.resolve = Q;

/**
 * Performs a task in a future turn of the event loop.
 * @param {Function} task
 */
Q.nextTick = nextTick;

/**
 * Controls whether or not long stack traces will be on
 */
Q.longStackSupport = false;

/**
 * Constructs a {promise, resolve, reject} object.
 *
 * `resolve` is a callback to invoke with a more resolved value for the
 * promise. To fulfill the promise, invoke `resolve` with any value that is
 * not a thenable. To reject the promise, invoke `resolve` with a rejected
 * thenable, or invoke `reject` with the reason directly. To resolve the
 * promise to another thenable, thus putting it in the same state, invoke
 * `resolve` with that other thenable.
 */
Q.defer = defer;
function defer() {
    // if "messages" is an "Array", that indicates that the promise has not yet
    // been resolved.  If it is "undefined", it has been resolved.  Each
    // element of the messages array is itself an array of complete arguments to
    // forward to the resolved promise.  We coerce the resolution value to a
    // promise using the `resolve` function because it handles both fully
    // non-thenable values and other thenables gracefully.
    var messages = [], progressListeners = [], resolvedPromise;

    var deferred = object_create(defer.prototype);
    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, operands) {
        var args = array_slice(arguments);
        if (messages) {
            messages.push(args);
            if (op === "when" && operands[1]) { // progress operand
                progressListeners.push(operands[1]);
            }
        } else {
            nextTick(function () {
                resolvedPromise.promiseDispatch.apply(resolvedPromise, args);
            });
        }
    };

    // XXX deprecated
    promise.valueOf = function () {
        if (messages) {
            return promise;
        }
        var nearerValue = nearer(resolvedPromise);
        if (isPromise(nearerValue)) {
            resolvedPromise = nearerValue; // shorten chain
        }
        return nearerValue;
    };

    promise.inspect = function () {
        if (!resolvedPromise) {
            return { state: "pending" };
        }
        return resolvedPromise.inspect();
    };

    if (Q.longStackSupport && hasStacks) {
        try {
            throw new Error();
        } catch (e) {
            // NOTE: don't try to use `Error.captureStackTrace` or transfer the
            // accessor around; that causes memory leaks as per GH-111. Just
            // reify the stack trace as a string ASAP.
            //
            // At the same time, cut off the first line; it's always just
            // "[object Promise]\n", as per the `toString`.
            promise.stack = e.stack.substring(e.stack.indexOf("\n") + 1);
        }
    }

    // NOTE: we do the checks for `resolvedPromise` in each method, instead of
    // consolidating them into `become`, since otherwise we'd create new
    // promises with the lines `become(whatever(value))`. See e.g. GH-252.

    function become(newPromise) {
        resolvedPromise = newPromise;
        promise.source = newPromise;

        array_reduce(messages, function (undefined, message) {
            nextTick(function () {
                newPromise.promiseDispatch.apply(newPromise, message);
            });
        }, void 0);

        messages = void 0;
        progressListeners = void 0;
    }

    deferred.promise = promise;
    deferred.resolve = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(Q(value));
    };

    deferred.fulfill = function (value) {
        if (resolvedPromise) {
            return;
        }

        become(fulfill(value));
    };
    deferred.reject = function (reason) {
        if (resolvedPromise) {
            return;
        }

        become(reject(reason));
    };
    deferred.notify = function (progress) {
        if (resolvedPromise) {
            return;
        }

        array_reduce(progressListeners, function (undefined, progressListener) {
            nextTick(function () {
                progressListener(progress);
            });
        }, void 0);
    };

    return deferred;
}

/**
 * Creates a Node-style callback that will resolve or reject the deferred
 * promise.
 * @returns a nodeback
 */
defer.prototype.makeNodeResolver = function () {
    var self = this;
    return function (error, value) {
        if (error) {
            self.reject(error);
        } else if (arguments.length > 2) {
            self.resolve(array_slice(arguments, 1));
        } else {
            self.resolve(value);
        }
    };
};

/**
 * @param resolver {Function} a function that returns nothing and accepts
 * the resolve, reject, and notify functions for a deferred.
 * @returns a promise that may be resolved with the given resolve and reject
 * functions, or rejected by a thrown exception in resolver
 */
Q.Promise = promise; // ES6
Q.promise = promise;
function promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function.");
    }
    var deferred = defer();
    try {
        resolver(deferred.resolve, deferred.reject, deferred.notify);
    } catch (reason) {
        deferred.reject(reason);
    }
    return deferred.promise;
}

promise.race = race; // ES6
promise.all = all; // ES6
promise.reject = reject; // ES6
promise.resolve = Q; // ES6

// XXX experimental.  This method is a way to denote that a local value is
// serializable and should be immediately dispatched to a remote upon request,
// instead of passing a reference.
Q.passByCopy = function (object) {
    //freeze(object);
    //passByCopies.set(object, true);
    return object;
};

Promise.prototype.passByCopy = function () {
    //freeze(object);
    //passByCopies.set(object, true);
    return this;
};

/**
 * If two promises eventually fulfill to the same value, promises that value,
 * but otherwise rejects.
 * @param x {Any*}
 * @param y {Any*}
 * @returns {Any*} a promise for x and y if they are the same, but a rejection
 * otherwise.
 *
 */
Q.join = function (x, y) {
    return Q(x).join(y);
};

Promise.prototype.join = function (that) {
    return Q([this, that]).spread(function (x, y) {
        if (x === y) {
            // TODO: "===" should be Object.is or equiv
            return x;
        } else {
            throw new Error("Can't join: not the same: " + x + " " + y);
        }
    });
};

/**
 * Returns a promise for the first of an array of promises to become fulfilled.
 * @param answers {Array[Any*]} promises to race
 * @returns {Any*} the first promise to be fulfilled
 */
Q.race = race;
function race(answerPs) {
    return promise(function(resolve, reject) {
        // Switch to this once we can assume at least ES5
        // answerPs.forEach(function(answerP) {
        //     Q(answerP).then(resolve, reject);
        // });
        // Use this in the meantime
        for (var i = 0, len = answerPs.length; i < len; i++) {
            Q(answerPs[i]).then(resolve, reject);
        }
    });
}

Promise.prototype.race = function () {
    return this.then(Q.race);
};

/**
 * Constructs a Promise with a promise descriptor object and optional fallback
 * function.  The descriptor contains methods like when(rejected), get(name),
 * set(name, value), post(name, args), and delete(name), which all
 * return either a value, a promise for a value, or a rejection.  The fallback
 * accepts the operation name, a resolver, and any further arguments that would
 * have been forwarded to the appropriate method above had a method been
 * provided with the proper name.  The API makes no guarantees about the nature
 * of the returned object, apart from that it is usable whereever promises are
 * bought and sold.
 */
Q.makePromise = Promise;
function Promise(descriptor, fallback, inspect) {
    if (fallback === void 0) {
        fallback = function (op) {
            return reject(new Error(
                "Promise does not support operation: " + op
            ));
        };
    }
    if (inspect === void 0) {
        inspect = function () {
            return {state: "unknown"};
        };
    }

    var promise = object_create(Promise.prototype);

    promise.promiseDispatch = function (resolve, op, args) {
        var result;
        try {
            if (descriptor[op]) {
                result = descriptor[op].apply(promise, args);
            } else {
                result = fallback.call(promise, op, args);
            }
        } catch (exception) {
            result = reject(exception);
        }
        if (resolve) {
            resolve(result);
        }
    };

    promise.inspect = inspect;

    // XXX deprecated `valueOf` and `exception` support
    if (inspect) {
        var inspected = inspect();
        if (inspected.state === "rejected") {
            promise.exception = inspected.reason;
        }

        promise.valueOf = function () {
            var inspected = inspect();
            if (inspected.state === "pending" ||
                inspected.state === "rejected") {
                return promise;
            }
            return inspected.value;
        };
    }

    return promise;
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.then = function (fulfilled, rejected, progressed) {
    var self = this;
    var deferred = defer();
    var done = false;   // ensure the untrusted promise makes at most a
                        // single call to one of the callbacks

    function _fulfilled(value) {
        try {
            return typeof fulfilled === "function" ? fulfilled(value) : value;
        } catch (exception) {
            return reject(exception);
        }
    }

    function _rejected(exception) {
        if (typeof rejected === "function") {
            makeStackTraceLong(exception, self);
            try {
                return rejected(exception);
            } catch (newException) {
                return reject(newException);
            }
        }
        return reject(exception);
    }

    function _progressed(value) {
        return typeof progressed === "function" ? progressed(value) : value;
    }

    nextTick(function () {
        self.promiseDispatch(function (value) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_fulfilled(value));
        }, "when", [function (exception) {
            if (done) {
                return;
            }
            done = true;

            deferred.resolve(_rejected(exception));
        }]);
    });

    // Progress propagator need to be attached in the current tick.
    self.promiseDispatch(void 0, "when", [void 0, function (value) {
        var newValue;
        var threw = false;
        try {
            newValue = _progressed(value);
        } catch (e) {
            threw = true;
            if (Q.onerror) {
                Q.onerror(e);
            } else {
                throw e;
            }
        }

        if (!threw) {
            deferred.notify(newValue);
        }
    }]);

    return deferred.promise;
};

/**
 * Registers an observer on a promise.
 *
 * Guarantees:
 *
 * 1. that fulfilled and rejected will be called only once.
 * 2. that either the fulfilled callback or the rejected callback will be
 *    called, but not both.
 * 3. that fulfilled and rejected will not be called in this turn.
 *
 * @param value      promise or immediate reference to observe
 * @param fulfilled  function to be called with the fulfilled value
 * @param rejected   function to be called with the rejection exception
 * @param progressed function to be called on any progress notifications
 * @return promise for the return value from the invoked callback
 */
Q.when = when;
function when(value, fulfilled, rejected, progressed) {
    return Q(value).then(fulfilled, rejected, progressed);
}

Promise.prototype.thenResolve = function (value) {
    return this.then(function () { return value; });
};

Q.thenResolve = function (promise, value) {
    return Q(promise).thenResolve(value);
};

Promise.prototype.thenReject = function (reason) {
    return this.then(function () { throw reason; });
};

Q.thenReject = function (promise, reason) {
    return Q(promise).thenReject(reason);
};

/**
 * If an object is not a promise, it is as "near" as possible.
 * If a promise is rejected, it is as "near" as possible too.
 * If it’s a fulfilled promise, the fulfillment value is nearer.
 * If it’s a deferred promise and the deferred has been resolved, the
 * resolution is "nearer".
 * @param object
 * @returns most resolved (nearest) form of the object
 */

// XXX should we re-do this?
Q.nearer = nearer;
function nearer(value) {
    if (isPromise(value)) {
        var inspected = value.inspect();
        if (inspected.state === "fulfilled") {
            return inspected.value;
        }
    }
    return value;
}

/**
 * @returns whether the given object is a promise.
 * Otherwise it is a fulfilled value.
 */
Q.isPromise = isPromise;
function isPromise(object) {
    return isObject(object) &&
        typeof object.promiseDispatch === "function" &&
        typeof object.inspect === "function";
}

Q.isPromiseAlike = isPromiseAlike;
function isPromiseAlike(object) {
    return isObject(object) && typeof object.then === "function";
}

/**
 * @returns whether the given object is a pending promise, meaning not
 * fulfilled or rejected.
 */
Q.isPending = isPending;
function isPending(object) {
    return isPromise(object) && object.inspect().state === "pending";
}

Promise.prototype.isPending = function () {
    return this.inspect().state === "pending";
};

/**
 * @returns whether the given object is a value or fulfilled
 * promise.
 */
Q.isFulfilled = isFulfilled;
function isFulfilled(object) {
    return !isPromise(object) || object.inspect().state === "fulfilled";
}

Promise.prototype.isFulfilled = function () {
    return this.inspect().state === "fulfilled";
};

/**
 * @returns whether the given object is a rejected promise.
 */
Q.isRejected = isRejected;
function isRejected(object) {
    return isPromise(object) && object.inspect().state === "rejected";
}

Promise.prototype.isRejected = function () {
    return this.inspect().state === "rejected";
};

//// BEGIN UNHANDLED REJECTION TRACKING

// This promise library consumes exceptions thrown in handlers so they can be
// handled by a subsequent promise.  The exceptions get added to this array when
// they are created, and removed when they are handled.  Note that in ES6 or
// shimmed environments, this would naturally be a `Set`.
var unhandledReasons = [];
var unhandledRejections = [];
var trackUnhandledRejections = true;

function resetUnhandledRejections() {
    unhandledReasons.length = 0;
    unhandledRejections.length = 0;

    if (!trackUnhandledRejections) {
        trackUnhandledRejections = true;
    }
}

function trackRejection(promise, reason) {
    if (!trackUnhandledRejections) {
        return;
    }

    unhandledRejections.push(promise);
    if (reason && typeof reason.stack !== "undefined") {
        unhandledReasons.push(reason.stack);
    } else {
        unhandledReasons.push("(no stack) " + reason);
    }
}

function untrackRejection(promise) {
    if (!trackUnhandledRejections) {
        return;
    }

    var at = array_indexOf(unhandledRejections, promise);
    if (at !== -1) {
        unhandledRejections.splice(at, 1);
        unhandledReasons.splice(at, 1);
    }
}

Q.resetUnhandledRejections = resetUnhandledRejections;

Q.getUnhandledReasons = function () {
    // Make a copy so that consumers can't interfere with our internal state.
    return unhandledReasons.slice();
};

Q.stopUnhandledRejectionTracking = function () {
    resetUnhandledRejections();
    trackUnhandledRejections = false;
};

resetUnhandledRejections();

//// END UNHANDLED REJECTION TRACKING

/**
 * Constructs a rejected promise.
 * @param reason value describing the failure
 */
Q.reject = reject;
function reject(reason) {
    var rejection = Promise({
        "when": function (rejected) {
            // note that the error has been handled
            if (rejected) {
                untrackRejection(this);
            }
            return rejected ? rejected(reason) : this;
        }
    }, function fallback() {
        return this;
    }, function inspect() {
        return { state: "rejected", reason: reason };
    });

    // Note that the reason has not been handled.
    trackRejection(rejection, reason);

    return rejection;
}

/**
 * Constructs a fulfilled promise for an immediate reference.
 * @param value immediate reference
 */
Q.fulfill = fulfill;
function fulfill(value) {
    return Promise({
        "when": function () {
            return value;
        },
        "get": function (name) {
            return value[name];
        },
        "set": function (name, rhs) {
            value[name] = rhs;
        },
        "delete": function (name) {
            delete value[name];
        },
        "post": function (name, args) {
            // Mark Miller proposes that post with no name should apply a
            // promised function.
            if (name === null || name === void 0) {
                return value.apply(void 0, args);
            } else {
                return value[name].apply(value, args);
            }
        },
        "apply": function (thisp, args) {
            return value.apply(thisp, args);
        },
        "keys": function () {
            return object_keys(value);
        }
    }, void 0, function inspect() {
        return { state: "fulfilled", value: value };
    });
}

/**
 * Converts thenables to Q promises.
 * @param promise thenable promise
 * @returns a Q promise
 */
function coerce(promise) {
    var deferred = defer();
    nextTick(function () {
        try {
            promise.then(deferred.resolve, deferred.reject, deferred.notify);
        } catch (exception) {
            deferred.reject(exception);
        }
    });
    return deferred.promise;
}

/**
 * Annotates an object such that it will never be
 * transferred away from this process over any promise
 * communication channel.
 * @param object
 * @returns promise a wrapping of that object that
 * additionally responds to the "isDef" message
 * without a rejection.
 */
Q.master = master;
function master(object) {
    return Promise({
        "isDef": function () {}
    }, function fallback(op, args) {
        return dispatch(object, op, args);
    }, function () {
        return Q(object).inspect();
    });
}

/**
 * Spreads the values of a promised array of arguments into the
 * fulfillment callback.
 * @param fulfilled callback that receives variadic arguments from the
 * promised array
 * @param rejected callback that receives the exception if the promise
 * is rejected.
 * @returns a promise for the return value or thrown exception of
 * either callback.
 */
Q.spread = spread;
function spread(value, fulfilled, rejected) {
    return Q(value).spread(fulfilled, rejected);
}

Promise.prototype.spread = function (fulfilled, rejected) {
    return this.all().then(function (array) {
        return fulfilled.apply(void 0, array);
    }, rejected);
};

/**
 * The async function is a decorator for generator functions, turning
 * them into asynchronous generators.  Although generators are only part
 * of the newest ECMAScript 6 drafts, this code does not cause syntax
 * errors in older engines.  This code should continue to work and will
 * in fact improve over time as the language improves.
 *
 * ES6 generators are currently part of V8 version 3.19 with the
 * --harmony-generators runtime flag enabled.  SpiderMonkey has had them
 * for longer, but under an older Python-inspired form.  This function
 * works on both kinds of generators.
 *
 * Decorates a generator function such that:
 *  - it may yield promises
 *  - execution will continue when that promise is fulfilled
 *  - the value of the yield expression will be the fulfilled value
 *  - it returns a promise for the return value (when the generator
 *    stops iterating)
 *  - the decorated function returns a promise for the return value
 *    of the generator or the first rejected promise among those
 *    yielded.
 *  - if an error is thrown in the generator, it propagates through
 *    every following yield until it is caught, or until it escapes
 *    the generator function altogether, and is translated into a
 *    rejection for the promise returned by the decorated generator.
 */
Q.async = async;
function async(makeGenerator) {
    return function () {
        // when verb is "send", arg is a value
        // when verb is "throw", arg is an exception
        function continuer(verb, arg) {
            var result;

            // Until V8 3.19 / Chromium 29 is released, SpiderMonkey is the only
            // engine that has a deployed base of browsers that support generators.
            // However, SM's generators use the Python-inspired semantics of
            // outdated ES6 drafts.  We would like to support ES6, but we'd also
            // like to make it possible to use generators in deployed browsers, so
            // we also support Python-style generators.  At some point we can remove
            // this block.

            if (typeof StopIteration === "undefined") {
                // ES6 Generators
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    return reject(exception);
                }
                if (result.done) {
                    return result.value;
                } else {
                    return when(result.value, callback, errback);
                }
            } else {
                // SpiderMonkey Generators
                // FIXME: Remove this case when SM does ES6 generators.
                try {
                    result = generator[verb](arg);
                } catch (exception) {
                    if (isStopIteration(exception)) {
                        return exception.value;
                    } else {
                        return reject(exception);
                    }
                }
                return when(result, callback, errback);
            }
        }
        var generator = makeGenerator.apply(this, arguments);
        var callback = continuer.bind(continuer, "next");
        var errback = continuer.bind(continuer, "throw");
        return callback();
    };
}

/**
 * The spawn function is a small wrapper around async that immediately
 * calls the generator and also ends the promise chain, so that any
 * unhandled errors are thrown instead of forwarded to the error
 * handler. This is useful because it's extremely common to run
 * generators at the top-level to work with libraries.
 */
Q.spawn = spawn;
function spawn(makeGenerator) {
    Q.done(Q.async(makeGenerator)());
}

// FIXME: Remove this interface once ES6 generators are in SpiderMonkey.
/**
 * Throws a ReturnValue exception to stop an asynchronous generator.
 *
 * This interface is a stop-gap measure to support generator return
 * values in older Firefox/SpiderMonkey.  In browsers that support ES6
 * generators like Chromium 29, just use "return" in your generator
 * functions.
 *
 * @param value the return value for the surrounding generator
 * @throws ReturnValue exception with the value.
 * @example
 * // ES6 style
 * Q.async(function* () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      return foo + bar;
 * })
 * // Older SpiderMonkey style
 * Q.async(function () {
 *      var foo = yield getFooPromise();
 *      var bar = yield getBarPromise();
 *      Q.return(foo + bar);
 * })
 */
Q["return"] = _return;
function _return(value) {
    throw new QReturnValue(value);
}

/**
 * The promised function decorator ensures that any promise arguments
 * are settled and passed as values (`this` is also settled and passed
 * as a value).  It will also ensure that the result of a function is
 * always a promise.
 *
 * @example
 * var add = Q.promised(function (a, b) {
 *     return a + b;
 * });
 * add(Q(a), Q(B));
 *
 * @param {function} callback The function to decorate
 * @returns {function} a function that has been decorated.
 */
Q.promised = promised;
function promised(callback) {
    return function () {
        return spread([this, all(arguments)], function (self, args) {
            return callback.apply(self, args);
        });
    };
}

/**
 * sends a message to a value in a future turn
 * @param object* the recipient
 * @param op the name of the message operation, e.g., "when",
 * @param args further arguments to be forwarded to the operation
 * @returns result {Promise} a promise for the result of the operation
 */
Q.dispatch = dispatch;
function dispatch(object, op, args) {
    return Q(object).dispatch(op, args);
}

Promise.prototype.dispatch = function (op, args) {
    var self = this;
    var deferred = defer();
    nextTick(function () {
        self.promiseDispatch(deferred.resolve, op, args);
    });
    return deferred.promise;
};

/**
 * Gets the value of a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to get
 * @return promise for the property value
 */
Q.get = function (object, key) {
    return Q(object).dispatch("get", [key]);
};

Promise.prototype.get = function (key) {
    return this.dispatch("get", [key]);
};

/**
 * Sets the value of a property in a future turn.
 * @param object    promise or immediate reference for object object
 * @param name      name of property to set
 * @param value     new value of property
 * @return promise for the return value
 */
Q.set = function (object, key, value) {
    return Q(object).dispatch("set", [key, value]);
};

Promise.prototype.set = function (key, value) {
    return this.dispatch("set", [key, value]);
};

/**
 * Deletes a property in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of property to delete
 * @return promise for the return value
 */
Q.del = // XXX legacy
Q["delete"] = function (object, key) {
    return Q(object).dispatch("delete", [key]);
};

Promise.prototype.del = // XXX legacy
Promise.prototype["delete"] = function (key) {
    return this.dispatch("delete", [key]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param value     a value to post, typically an array of
 *                  invocation arguments for promises that
 *                  are ultimately backed with `resolve` values,
 *                  as opposed to those backed with URLs
 *                  wherein the posted value can be any
 *                  JSON serializable object.
 * @return promise for the return value
 */
// bound locally because it is used by other methods
Q.mapply = // XXX As proposed by "Redsandro"
Q.post = function (object, name, args) {
    return Q(object).dispatch("post", [name, args]);
};

Promise.prototype.mapply = // XXX As proposed by "Redsandro"
Promise.prototype.post = function (name, args) {
    return this.dispatch("post", [name, args]);
};

/**
 * Invokes a method in a future turn.
 * @param object    promise or immediate reference for target object
 * @param name      name of method to invoke
 * @param ...args   array of invocation arguments
 * @return promise for the return value
 */
Q.send = // XXX Mark Miller's proposed parlance
Q.mcall = // XXX As proposed by "Redsandro"
Q.invoke = function (object, name /*...args*/) {
    return Q(object).dispatch("post", [name, array_slice(arguments, 2)]);
};

Promise.prototype.send = // XXX Mark Miller's proposed parlance
Promise.prototype.mcall = // XXX As proposed by "Redsandro"
Promise.prototype.invoke = function (name /*...args*/) {
    return this.dispatch("post", [name, array_slice(arguments, 1)]);
};

/**
 * Applies the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param args      array of application arguments
 */
Q.fapply = function (object, args) {
    return Q(object).dispatch("apply", [void 0, args]);
};

Promise.prototype.fapply = function (args) {
    return this.dispatch("apply", [void 0, args]);
};

/**
 * Calls the promised function in a future turn.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q["try"] =
Q.fcall = function (object /* ...args*/) {
    return Q(object).dispatch("apply", [void 0, array_slice(arguments, 1)]);
};

Promise.prototype.fcall = function (/*...args*/) {
    return this.dispatch("apply", [void 0, array_slice(arguments)]);
};

/**
 * Binds the promised function, transforming return values into a fulfilled
 * promise and thrown errors into a rejected one.
 * @param object    promise or immediate reference for target function
 * @param ...args   array of application arguments
 */
Q.fbind = function (object /*...args*/) {
    var promise = Q(object);
    var args = array_slice(arguments, 1);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};
Promise.prototype.fbind = function (/*...args*/) {
    var promise = this;
    var args = array_slice(arguments);
    return function fbound() {
        return promise.dispatch("apply", [
            this,
            args.concat(array_slice(arguments))
        ]);
    };
};

/**
 * Requests the names of the owned properties of a promised
 * object in a future turn.
 * @param object    promise or immediate reference for target object
 * @return promise for the keys of the eventually settled object
 */
Q.keys = function (object) {
    return Q(object).dispatch("keys", []);
};

Promise.prototype.keys = function () {
    return this.dispatch("keys", []);
};

/**
 * Turns an array of promises into a promise for an array.  If any of
 * the promises gets rejected, the whole array is rejected immediately.
 * @param {Array*} an array (or promise for an array) of values (or
 * promises for values)
 * @returns a promise for an array of the corresponding values
 */
// By Mark Miller
// http://wiki.ecmascript.org/doku.php?id=strawman:concurrency&rev=1308776521#allfulfilled
Q.all = all;
function all(promises) {
    return when(promises, function (promises) {
        var countDown = 0;
        var deferred = defer();
        array_reduce(promises, function (undefined, promise, index) {
            var snapshot;
            if (
                isPromise(promise) &&
                (snapshot = promise.inspect()).state === "fulfilled"
            ) {
                promises[index] = snapshot.value;
            } else {
                ++countDown;
                when(
                    promise,
                    function (value) {
                        promises[index] = value;
                        if (--countDown === 0) {
                            deferred.resolve(promises);
                        }
                    },
                    deferred.reject,
                    function (progress) {
                        deferred.notify({ index: index, value: progress });
                    }
                );
            }
        }, void 0);
        if (countDown === 0) {
            deferred.resolve(promises);
        }
        return deferred.promise;
    });
}

Promise.prototype.all = function () {
    return all(this);
};

/**
 * Waits for all promises to be settled, either fulfilled or
 * rejected.  This is distinct from `all` since that would stop
 * waiting at the first rejection.  The promise returned by
 * `allResolved` will never be rejected.
 * @param promises a promise for an array (or an array) of promises
 * (or values)
 * @return a promise for an array of promises
 */
Q.allResolved = deprecate(allResolved, "allResolved", "allSettled");
function allResolved(promises) {
    return when(promises, function (promises) {
        promises = array_map(promises, Q);
        return when(all(array_map(promises, function (promise) {
            return when(promise, noop, noop);
        })), function () {
            return promises;
        });
    });
}

Promise.prototype.allResolved = function () {
    return allResolved(this);
};

/**
 * @see Promise#allSettled
 */
Q.allSettled = allSettled;
function allSettled(promises) {
    return Q(promises).allSettled();
}

/**
 * Turns an array of promises into a promise for an array of their states (as
 * returned by `inspect`) when they have all settled.
 * @param {Array[Any*]} values an array (or promise for an array) of values (or
 * promises for values)
 * @returns {Array[State]} an array of states for the respective values.
 */
Promise.prototype.allSettled = function () {
    return this.then(function (promises) {
        return all(array_map(promises, function (promise) {
            promise = Q(promise);
            function regardless() {
                return promise.inspect();
            }
            return promise.then(regardless, regardless);
        }));
    });
};

/**
 * Captures the failure of a promise, giving an oportunity to recover
 * with a callback.  If the given promise is fulfilled, the returned
 * promise is fulfilled.
 * @param {Any*} promise for something
 * @param {Function} callback to fulfill the returned promise if the
 * given promise is rejected
 * @returns a promise for the return value of the callback
 */
Q.fail = // XXX legacy
Q["catch"] = function (object, rejected) {
    return Q(object).then(void 0, rejected);
};

Promise.prototype.fail = // XXX legacy
Promise.prototype["catch"] = function (rejected) {
    return this.then(void 0, rejected);
};

/**
 * Attaches a listener that can respond to progress notifications from a
 * promise's originating deferred. This listener receives the exact arguments
 * passed to ``deferred.notify``.
 * @param {Any*} promise for something
 * @param {Function} callback to receive any progress notifications
 * @returns the given promise, unchanged
 */
Q.progress = progress;
function progress(object, progressed) {
    return Q(object).then(void 0, void 0, progressed);
}

Promise.prototype.progress = function (progressed) {
    return this.then(void 0, void 0, progressed);
};

/**
 * Provides an opportunity to observe the settling of a promise,
 * regardless of whether the promise is fulfilled or rejected.  Forwards
 * the resolution to the returned promise when the callback is done.
 * The callback can return a promise to defer completion.
 * @param {Any*} promise
 * @param {Function} callback to observe the resolution of the given
 * promise, takes no arguments.
 * @returns a promise for the resolution of the given promise when
 * ``fin`` is done.
 */
Q.fin = // XXX legacy
Q["finally"] = function (object, callback) {
    return Q(object)["finally"](callback);
};

Promise.prototype.fin = // XXX legacy
Promise.prototype["finally"] = function (callback) {
    callback = Q(callback);
    return this.then(function (value) {
        return callback.fcall().then(function () {
            return value;
        });
    }, function (reason) {
        // TODO attempt to recycle the rejection with "this".
        return callback.fcall().then(function () {
            throw reason;
        });
    });
};

/**
 * Terminates a chain of promises, forcing rejections to be
 * thrown as exceptions.
 * @param {Any*} promise at the end of a chain of promises
 * @returns nothing
 */
Q.done = function (object, fulfilled, rejected, progress) {
    return Q(object).done(fulfilled, rejected, progress);
};

Promise.prototype.done = function (fulfilled, rejected, progress) {
    var onUnhandledError = function (error) {
        // forward to a future turn so that ``when``
        // does not catch it and turn it into a rejection.
        nextTick(function () {
            makeStackTraceLong(error, promise);
            if (Q.onerror) {
                Q.onerror(error);
            } else {
                throw error;
            }
        });
    };

    // Avoid unnecessary `nextTick`ing via an unnecessary `when`.
    var promise = fulfilled || rejected || progress ?
        this.then(fulfilled, rejected, progress) :
        this;

    if (typeof process === "object" && process && process.domain) {
        onUnhandledError = process.domain.bind(onUnhandledError);
    }

    promise.then(void 0, onUnhandledError);
};

/**
 * Causes a promise to be rejected if it does not get fulfilled before
 * some milliseconds time out.
 * @param {Any*} promise
 * @param {Number} milliseconds timeout
 * @param {String} custom error message (optional)
 * @returns a promise for the resolution of the given promise if it is
 * fulfilled before the timeout, otherwise rejected.
 */
Q.timeout = function (object, ms, message) {
    return Q(object).timeout(ms, message);
};

Promise.prototype.timeout = function (ms, message) {
    var deferred = defer();
    var timeoutId = setTimeout(function () {
        deferred.reject(new Error(message || "Timed out after " + ms + " ms"));
    }, ms);

    this.then(function (value) {
        clearTimeout(timeoutId);
        deferred.resolve(value);
    }, function (exception) {
        clearTimeout(timeoutId);
        deferred.reject(exception);
    }, deferred.notify);

    return deferred.promise;
};

/**
 * Returns a promise for the given value (or promised value), some
 * milliseconds after it resolved. Passes rejections immediately.
 * @param {Any*} promise
 * @param {Number} milliseconds
 * @returns a promise for the resolution of the given promise after milliseconds
 * time has elapsed since the resolution of the given promise.
 * If the given promise rejects, that is passed immediately.
 */
Q.delay = function (object, timeout) {
    if (timeout === void 0) {
        timeout = object;
        object = void 0;
    }
    return Q(object).delay(timeout);
};

Promise.prototype.delay = function (timeout) {
    return this.then(function (value) {
        var deferred = defer();
        setTimeout(function () {
            deferred.resolve(value);
        }, timeout);
        return deferred.promise;
    });
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided as an array, and returns a promise.
 *
 *      Q.nfapply(FS.readFile, [__filename])
 *      .then(function (content) {
 *      })
 *
 */
Q.nfapply = function (callback, args) {
    return Q(callback).nfapply(args);
};

Promise.prototype.nfapply = function (args) {
    var deferred = defer();
    var nodeArgs = array_slice(args);
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Passes a continuation to a Node function, which is called with the given
 * arguments provided individually, and returns a promise.
 * @example
 * Q.nfcall(FS.readFile, __filename)
 * .then(function (content) {
 * })
 *
 */
Q.nfcall = function (callback /*...args*/) {
    var args = array_slice(arguments, 1);
    return Q(callback).nfapply(args);
};

Promise.prototype.nfcall = function (/*...args*/) {
    var nodeArgs = array_slice(arguments);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.fapply(nodeArgs).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Wraps a NodeJS continuation passing function and returns an equivalent
 * version that returns a promise.
 * @example
 * Q.nfbind(FS.readFile, __filename)("utf-8")
 * .then(console.log)
 * .done()
 */
Q.nfbind =
Q.denodeify = function (callback /*...args*/) {
    var baseArgs = array_slice(arguments, 1);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        Q(callback).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nfbind =
Promise.prototype.denodeify = function (/*...args*/) {
    var args = array_slice(arguments);
    args.unshift(this);
    return Q.denodeify.apply(void 0, args);
};

Q.nbind = function (callback, thisp /*...args*/) {
    var baseArgs = array_slice(arguments, 2);
    return function () {
        var nodeArgs = baseArgs.concat(array_slice(arguments));
        var deferred = defer();
        nodeArgs.push(deferred.makeNodeResolver());
        function bound() {
            return callback.apply(thisp, arguments);
        }
        Q(bound).fapply(nodeArgs).fail(deferred.reject);
        return deferred.promise;
    };
};

Promise.prototype.nbind = function (/*thisp, ...args*/) {
    var args = array_slice(arguments, 0);
    args.unshift(this);
    return Q.nbind.apply(void 0, args);
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback with a given array of arguments, plus a provided callback.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param {Array} args arguments to pass to the method; the callback
 * will be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nmapply = // XXX As proposed by "Redsandro"
Q.npost = function (object, name, args) {
    return Q(object).npost(name, args);
};

Promise.prototype.nmapply = // XXX As proposed by "Redsandro"
Promise.prototype.npost = function (name, args) {
    var nodeArgs = array_slice(args || []);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * Calls a method of a Node-style object that accepts a Node-style
 * callback, forwarding the given variadic arguments, plus a provided
 * callback argument.
 * @param object an object that has the named method
 * @param {String} name name of the method of object
 * @param ...args arguments to pass to the method; the callback will
 * be provided by Q and appended to these arguments.
 * @returns a promise for the value or error
 */
Q.nsend = // XXX Based on Mark Miller's proposed "send"
Q.nmcall = // XXX Based on "Redsandro's" proposal
Q.ninvoke = function (object, name /*...args*/) {
    var nodeArgs = array_slice(arguments, 2);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    Q(object).dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

Promise.prototype.nsend = // XXX Based on Mark Miller's proposed "send"
Promise.prototype.nmcall = // XXX Based on "Redsandro's" proposal
Promise.prototype.ninvoke = function (name /*...args*/) {
    var nodeArgs = array_slice(arguments, 1);
    var deferred = defer();
    nodeArgs.push(deferred.makeNodeResolver());
    this.dispatch("post", [name, nodeArgs]).fail(deferred.reject);
    return deferred.promise;
};

/**
 * If a function would like to support both Node continuation-passing-style and
 * promise-returning-style, it can end its internal promise chain with
 * `nodeify(nodeback)`, forwarding the optional nodeback argument.  If the user
 * elects to use a nodeback, the result will be sent there.  If they do not
 * pass a nodeback, they will receive the result promise.
 * @param object a result (or a promise for a result)
 * @param {Function} nodeback a Node.js-style callback
 * @returns either the promise or nothing
 */
Q.nodeify = nodeify;
function nodeify(object, nodeback) {
    return Q(object).nodeify(nodeback);
}

Promise.prototype.nodeify = function (nodeback) {
    if (nodeback) {
        this.then(function (value) {
            nextTick(function () {
                nodeback(null, value);
            });
        }, function (error) {
            nextTick(function () {
                nodeback(error);
            });
        });
    } else {
        return this;
    }
};

// All code before this point will be filtered from stack traces.
var qEndingLine = captureLine();

return Q;

});

}).call(this,_dereq_("IMmnkj"))
},{"IMmnkj":17}],14:[function(_dereq_,module,exports){
/**
 * @fileoverview gl-matrix - High performance matrix and vector operations
 * @author Brandon Jones
 * @author Colin MacKenzie IV
 * @version 2.1.0
 */

/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */


(function() {
  "use strict";

  var shim = {};
  if (typeof(exports) === 'undefined') {
    if(typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
      shim.exports = {};
      define(function() {
        return shim.exports;
      });
    } else {
      // gl-matrix lives in a browser, define its namespaces in global
      shim.exports = window;
    }    
  }
  else {
    // gl-matrix lives in commonjs, define its namespaces in exports
    shim.exports = exports;
  }

  (function(exports) {
    /* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */


if(!GLMAT_EPSILON) {
    var GLMAT_EPSILON = 0.000001;
}

if(!GLMAT_ARRAY_TYPE) {
    var GLMAT_ARRAY_TYPE = (typeof Float32Array !== 'undefined') ? Float32Array : Array;
}

/**
 * @class Common utilities
 * @name glMatrix
 */
var glMatrix = {};

/**
 * Sets the type of array used when creating new vectors and matricies
 *
 * @param {Type} type Array type, such as Float32Array or Array
 */
glMatrix.setMatrixArrayType = function(type) {
    GLMAT_ARRAY_TYPE = type;
}

if(typeof(exports) !== 'undefined') {
    exports.glMatrix = glMatrix;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 2 Dimensional Vector
 * @name vec2
 */

var vec2 = {};

/**
 * Creates a new, empty vec2
 *
 * @returns {vec2} a new 2D vector
 */
vec2.create = function() {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = 0;
    out[1] = 0;
    return out;
};

/**
 * Creates a new vec2 initialized with values from an existing vector
 *
 * @param {vec2} a vector to clone
 * @returns {vec2} a new 2D vector
 */
vec2.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = a[0];
    out[1] = a[1];
    return out;
};

/**
 * Creates a new vec2 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} a new 2D vector
 */
vec2.fromValues = function(x, y) {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = x;
    out[1] = y;
    return out;
};

/**
 * Copy the values from one vec2 to another
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the source vector
 * @returns {vec2} out
 */
vec2.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    return out;
};

/**
 * Set the components of a vec2 to the given values
 *
 * @param {vec2} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} out
 */
vec2.set = function(out, x, y) {
    out[0] = x;
    out[1] = y;
    return out;
};

/**
 * Adds two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    return out;
};

/**
 * Subtracts two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    return out;
};

/**
 * Alias for {@link vec2.subtract}
 * @function
 */
vec2.sub = vec2.subtract;

/**
 * Multiplies two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    return out;
};

/**
 * Alias for {@link vec2.multiply}
 * @function
 */
vec2.mul = vec2.multiply;

/**
 * Divides two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    return out;
};

/**
 * Alias for {@link vec2.divide}
 * @function
 */
vec2.div = vec2.divide;

/**
 * Returns the minimum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    return out;
};

/**
 * Returns the maximum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    return out;
};

/**
 * Scales a vec2 by a scalar number
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec2} out
 */
vec2.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    return out;
};

/**
 * Calculates the euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} distance between a and b
 */
vec2.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1];
    return Math.sqrt(x*x + y*y);
};

/**
 * Alias for {@link vec2.distance}
 * @function
 */
vec2.dist = vec2.distance;

/**
 * Calculates the squared euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec2.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1];
    return x*x + y*y;
};

/**
 * Alias for {@link vec2.squaredDistance}
 * @function
 */
vec2.sqrDist = vec2.squaredDistance;

/**
 * Calculates the length of a vec2
 *
 * @param {vec2} a vector to calculate length of
 * @returns {Number} length of a
 */
vec2.length = function (a) {
    var x = a[0],
        y = a[1];
    return Math.sqrt(x*x + y*y);
};

/**
 * Alias for {@link vec2.length}
 * @function
 */
vec2.len = vec2.length;

/**
 * Calculates the squared length of a vec2
 *
 * @param {vec2} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec2.squaredLength = function (a) {
    var x = a[0],
        y = a[1];
    return x*x + y*y;
};

/**
 * Alias for {@link vec2.squaredLength}
 * @function
 */
vec2.sqrLen = vec2.squaredLength;

/**
 * Negates the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to negate
 * @returns {vec2} out
 */
vec2.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    return out;
};

/**
 * Normalize a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to normalize
 * @returns {vec2} out
 */
vec2.normalize = function(out, a) {
    var x = a[0],
        y = a[1];
    var len = x*x + y*y;
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} dot product of a and b
 */
vec2.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1];
};

/**
 * Computes the cross product of two vec2's
 * Note that the cross product must by definition produce a 3D vector
 *
 * @param {vec3} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec3} out
 */
vec2.cross = function(out, a, b) {
    var z = a[0] * b[1] - a[1] * b[0];
    out[0] = out[1] = 0;
    out[2] = z;
    return out;
};

/**
 * Performs a linear interpolation between two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec2} out
 */
vec2.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    return out;
};

/**
 * Transforms the vec2 with a mat2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat2 = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[2] * y;
    out[1] = m[1] * x + m[3] * y;
    return out;
};

/**
 * Transforms the vec2 with a mat2d
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2d} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat2d = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[2] * y + m[4];
    out[1] = m[1] * x + m[3] * y + m[5];
    return out;
};

/**
 * Transforms the vec2 with a mat3
 * 3rd vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat3} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat3 = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[3] * y + m[6];
    out[1] = m[1] * x + m[4] * y + m[7];
    return out;
};

/**
 * Transforms the vec2 with a mat4
 * 3rd vector component is implicitly '0'
 * 4th vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat4 = function(out, a, m) {
    var x = a[0], 
        y = a[1];
    out[0] = m[0] * x + m[4] * y + m[12];
    out[1] = m[1] * x + m[5] * y + m[13];
    return out;
};

/**
 * Perform some operation over an array of vec2s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec2. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec2.forEach = (function() {
    var vec = vec2.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 2;
        }

        if(!offset) {
            offset = 0;
        }
        
        if(count) {
            l = Math.min((count * stride) + offset, a.length);
        } else {
            l = a.length;
        }

        for(i = offset; i < l; i += stride) {
            vec[0] = a[i]; vec[1] = a[i+1];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec2} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec2.str = function (a) {
    return 'vec2(' + a[0] + ', ' + a[1] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec2 = vec2;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 3 Dimensional Vector
 * @name vec3
 */

var vec3 = {};

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */
vec3.create = function() {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
};

/**
 * Creates a new vec3 initialized with values from an existing vector
 *
 * @param {vec3} a vector to clone
 * @returns {vec3} a new 3D vector
 */
vec3.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};

/**
 * Creates a new vec3 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} a new 3D vector
 */
vec3.fromValues = function(x, y, z) {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
};

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
vec3.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};

/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */
vec3.set = function(out, x, y, z) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
};

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
};

/**
 * Subtracts two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
};

/**
 * Alias for {@link vec3.subtract}
 * @function
 */
vec3.sub = vec3.subtract;

/**
 * Multiplies two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
};

/**
 * Alias for {@link vec3.multiply}
 * @function
 */
vec3.mul = vec3.multiply;

/**
 * Divides two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    out[2] = a[2] / b[2];
    return out;
};

/**
 * Alias for {@link vec3.divide}
 * @function
 */
vec3.div = vec3.divide;

/**
 * Returns the minimum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    out[2] = Math.min(a[2], b[2]);
    return out;
};

/**
 * Returns the maximum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    out[2] = Math.max(a[2], b[2]);
    return out;
};

/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */
vec3.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    out[2] = a[2] * b;
    return out;
};

/**
 * Calculates the euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} distance between a and b
 */
vec3.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2];
    return Math.sqrt(x*x + y*y + z*z);
};

/**
 * Alias for {@link vec3.distance}
 * @function
 */
vec3.dist = vec3.distance;

/**
 * Calculates the squared euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec3.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2];
    return x*x + y*y + z*z;
};

/**
 * Alias for {@link vec3.squaredDistance}
 * @function
 */
vec3.sqrDist = vec3.squaredDistance;

/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
vec3.length = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    return Math.sqrt(x*x + y*y + z*z);
};

/**
 * Alias for {@link vec3.length}
 * @function
 */
vec3.len = vec3.length;

/**
 * Calculates the squared length of a vec3
 *
 * @param {vec3} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec3.squaredLength = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    return x*x + y*y + z*z;
};

/**
 * Alias for {@link vec3.squaredLength}
 * @function
 */
vec3.sqrLen = vec3.squaredLength;

/**
 * Negates the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to negate
 * @returns {vec3} out
 */
vec3.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    return out;
};

/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */
vec3.normalize = function(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    var len = x*x + y*y + z*z;
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
        out[2] = a[2] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
vec3.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

/**
 * Computes the cross product of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.cross = function(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2],
        bx = b[0], by = b[1], bz = b[2];

    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
};

/**
 * Performs a linear interpolation between two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */
vec3.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1],
        az = a[2];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    out[2] = az + t * (b[2] - az);
    return out;
};

/**
 * Transforms the vec3 with a mat4.
 * 4th vector component is implicitly '1'
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec3} out
 */
vec3.transformMat4 = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
};

/**
 * Transforms the vec3 with a quat
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec3} out
 */
vec3.transformQuat = function(out, a, q) {
    var x = a[0], y = a[1], z = a[2],
        qx = q[0], qy = q[1], qz = q[2], qw = q[3],

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
};

/**
 * Perform some operation over an array of vec3s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec3.forEach = (function() {
    var vec = vec3.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 3;
        }

        if(!offset) {
            offset = 0;
        }
        
        if(count) {
            l = Math.min((count * stride) + offset, a.length);
        } else {
            l = a.length;
        }

        for(i = offset; i < l; i += stride) {
            vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec3} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec3.str = function (a) {
    return 'vec3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec3 = vec3;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 4 Dimensional Vector
 * @name vec4
 */

var vec4 = {};

/**
 * Creates a new, empty vec4
 *
 * @returns {vec4} a new 4D vector
 */
vec4.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return out;
};

/**
 * Creates a new vec4 initialized with values from an existing vector
 *
 * @param {vec4} a vector to clone
 * @returns {vec4} a new 4D vector
 */
vec4.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Creates a new vec4 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} a new 4D vector
 */
vec4.fromValues = function(x, y, z, w) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
};

/**
 * Copy the values from one vec4 to another
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the source vector
 * @returns {vec4} out
 */
vec4.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Set the components of a vec4 to the given values
 *
 * @param {vec4} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} out
 */
vec4.set = function(out, x, y, z, w) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
};

/**
 * Adds two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    out[3] = a[3] + b[3];
    return out;
};

/**
 * Subtracts two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    out[3] = a[3] - b[3];
    return out;
};

/**
 * Alias for {@link vec4.subtract}
 * @function
 */
vec4.sub = vec4.subtract;

/**
 * Multiplies two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    out[3] = a[3] * b[3];
    return out;
};

/**
 * Alias for {@link vec4.multiply}
 * @function
 */
vec4.mul = vec4.multiply;

/**
 * Divides two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    out[2] = a[2] / b[2];
    out[3] = a[3] / b[3];
    return out;
};

/**
 * Alias for {@link vec4.divide}
 * @function
 */
vec4.div = vec4.divide;

/**
 * Returns the minimum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    out[2] = Math.min(a[2], b[2]);
    out[3] = Math.min(a[3], b[3]);
    return out;
};

/**
 * Returns the maximum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    out[2] = Math.max(a[2], b[2]);
    out[3] = Math.max(a[3], b[3]);
    return out;
};

/**
 * Scales a vec4 by a scalar number
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec4} out
 */
vec4.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    out[2] = a[2] * b;
    out[3] = a[3] * b;
    return out;
};

/**
 * Calculates the euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} distance between a and b
 */
vec4.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2],
        w = b[3] - a[3];
    return Math.sqrt(x*x + y*y + z*z + w*w);
};

/**
 * Alias for {@link vec4.distance}
 * @function
 */
vec4.dist = vec4.distance;

/**
 * Calculates the squared euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec4.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2],
        w = b[3] - a[3];
    return x*x + y*y + z*z + w*w;
};

/**
 * Alias for {@link vec4.squaredDistance}
 * @function
 */
vec4.sqrDist = vec4.squaredDistance;

/**
 * Calculates the length of a vec4
 *
 * @param {vec4} a vector to calculate length of
 * @returns {Number} length of a
 */
vec4.length = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    return Math.sqrt(x*x + y*y + z*z + w*w);
};

/**
 * Alias for {@link vec4.length}
 * @function
 */
vec4.len = vec4.length;

/**
 * Calculates the squared length of a vec4
 *
 * @param {vec4} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec4.squaredLength = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    return x*x + y*y + z*z + w*w;
};

/**
 * Alias for {@link vec4.squaredLength}
 * @function
 */
vec4.sqrLen = vec4.squaredLength;

/**
 * Negates the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to negate
 * @returns {vec4} out
 */
vec4.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = -a[3];
    return out;
};

/**
 * Normalize a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to normalize
 * @returns {vec4} out
 */
vec4.normalize = function(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    var len = x*x + y*y + z*z + w*w;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
        out[2] = a[2] * len;
        out[3] = a[3] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} dot product of a and b
 */
vec4.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
};

/**
 * Performs a linear interpolation between two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec4} out
 */
vec4.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1],
        az = a[2],
        aw = a[3];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    out[2] = az + t * (b[2] - az);
    out[3] = aw + t * (b[3] - aw);
    return out;
};

/**
 * Transforms the vec4 with a mat4.
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec4} out
 */
vec4.transformMat4 = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2], w = a[3];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
    out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    return out;
};

/**
 * Transforms the vec4 with a quat
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec4} out
 */
vec4.transformQuat = function(out, a, q) {
    var x = a[0], y = a[1], z = a[2],
        qx = q[0], qy = q[1], qz = q[2], qw = q[3],

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
};

/**
 * Perform some operation over an array of vec4s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec4. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec4.forEach = (function() {
    var vec = vec4.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 4;
        }

        if(!offset) {
            offset = 0;
        }
        
        if(count) {
            l = Math.min((count * stride) + offset, a.length);
        } else {
            l = a.length;
        }

        for(i = offset; i < l; i += stride) {
            vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2]; vec[3] = a[i+3];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2]; a[i+3] = vec[3];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec4} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec4.str = function (a) {
    return 'vec4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec4 = vec4;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 2x2 Matrix
 * @name mat2
 */

var mat2 = {};

var mat2Identity = new Float32Array([
    1, 0,
    0, 1
]);

/**
 * Creates a new identity mat2
 *
 * @returns {mat2} a new 2x2 matrix
 */
mat2.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Creates a new mat2 initialized with values from an existing matrix
 *
 * @param {mat2} a matrix to clone
 * @returns {mat2} a new 2x2 matrix
 */
mat2.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Copy the values from one mat2 to another
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Set a mat2 to the identity matrix
 *
 * @param {mat2} out the receiving matrix
 * @returns {mat2} out
 */
mat2.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Transpose the values of a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a1 = a[1];
        out[1] = a[2];
        out[2] = a1;
    } else {
        out[0] = a[0];
        out[1] = a[2];
        out[2] = a[1];
        out[3] = a[3];
    }
    
    return out;
};

/**
 * Inverts a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.invert = function(out, a) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],

        // Calculate the determinant
        det = a0 * a3 - a2 * a1;

    if (!det) {
        return null;
    }
    det = 1.0 / det;
    
    out[0] =  a3 * det;
    out[1] = -a1 * det;
    out[2] = -a2 * det;
    out[3] =  a0 * det;

    return out;
};

/**
 * Calculates the adjugate of a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.adjoint = function(out, a) {
    // Caching this value is nessecary if out == a
    var a0 = a[0];
    out[0] =  a[3];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] =  a0;

    return out;
};

/**
 * Calculates the determinant of a mat2
 *
 * @param {mat2} a the source matrix
 * @returns {Number} determinant of a
 */
mat2.determinant = function (a) {
    return a[0] * a[3] - a[2] * a[1];
};

/**
 * Multiplies two mat2's
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the first operand
 * @param {mat2} b the second operand
 * @returns {mat2} out
 */
mat2.multiply = function (out, a, b) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
    var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = a0 * b0 + a1 * b2;
    out[1] = a0 * b1 + a1 * b3;
    out[2] = a2 * b0 + a3 * b2;
    out[3] = a2 * b1 + a3 * b3;
    return out;
};

/**
 * Alias for {@link mat2.multiply}
 * @function
 */
mat2.mul = mat2.multiply;

/**
 * Rotates a mat2 by the given angle
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat2} out
 */
mat2.rotate = function (out, a, rad) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        s = Math.sin(rad),
        c = Math.cos(rad);
    out[0] = a0 *  c + a1 * s;
    out[1] = a0 * -s + a1 * c;
    out[2] = a2 *  c + a3 * s;
    out[3] = a2 * -s + a3 * c;
    return out;
};

/**
 * Scales the mat2 by the dimensions in the given vec2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat2} out
 **/
mat2.scale = function(out, a, v) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        v0 = v[0], v1 = v[1];
    out[0] = a0 * v0;
    out[1] = a1 * v1;
    out[2] = a2 * v0;
    out[3] = a3 * v1;
    return out;
};

/**
 * Returns a string representation of a mat2
 *
 * @param {mat2} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat2.str = function (a) {
    return 'mat2(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.mat2 = mat2;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 2x3 Matrix
 * @name mat2d
 * 
 * @description 
 * A mat2d contains six elements defined as:
 * <pre>
 * [a, b,
 *  c, d,
 *  tx,ty]
 * </pre>
 * This is a short form for the 3x3 matrix:
 * <pre>
 * [a, b, 0
 *  c, d, 0
 *  tx,ty,1]
 * </pre>
 * The last column is ignored so the array is shorter and operations are faster.
 */

var mat2d = {};

var mat2dIdentity = new Float32Array([
    1, 0,
    0, 1,
    0, 0
]);

/**
 * Creates a new identity mat2d
 *
 * @returns {mat2d} a new 2x3 matrix
 */
mat2d.create = function() {
    var out = new GLMAT_ARRAY_TYPE(6);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    return out;
};

/**
 * Creates a new mat2d initialized with values from an existing matrix
 *
 * @param {mat2d} a matrix to clone
 * @returns {mat2d} a new 2x3 matrix
 */
mat2d.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(6);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    return out;
};

/**
 * Copy the values from one mat2d to another
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the source matrix
 * @returns {mat2d} out
 */
mat2d.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    return out;
};

/**
 * Set a mat2d to the identity matrix
 *
 * @param {mat2d} out the receiving matrix
 * @returns {mat2d} out
 */
mat2d.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    return out;
};

/**
 * Inverts a mat2d
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the source matrix
 * @returns {mat2d} out
 */
mat2d.invert = function(out, a) {
    var aa = a[0], ab = a[1], ac = a[2], ad = a[3],
        atx = a[4], aty = a[5];

    var det = aa * ad - ab * ac;
    if(!det){
        return null;
    }
    det = 1.0 / det;

    out[0] = ad * det;
    out[1] = -ab * det;
    out[2] = -ac * det;
    out[3] = aa * det;
    out[4] = (ac * aty - ad * atx) * det;
    out[5] = (ab * atx - aa * aty) * det;
    return out;
};

/**
 * Calculates the determinant of a mat2d
 *
 * @param {mat2d} a the source matrix
 * @returns {Number} determinant of a
 */
mat2d.determinant = function (a) {
    return a[0] * a[3] - a[1] * a[2];
};

/**
 * Multiplies two mat2d's
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the first operand
 * @param {mat2d} b the second operand
 * @returns {mat2d} out
 */
mat2d.multiply = function (out, a, b) {
    var aa = a[0], ab = a[1], ac = a[2], ad = a[3],
        atx = a[4], aty = a[5],
        ba = b[0], bb = b[1], bc = b[2], bd = b[3],
        btx = b[4], bty = b[5];

    out[0] = aa*ba + ab*bc;
    out[1] = aa*bb + ab*bd;
    out[2] = ac*ba + ad*bc;
    out[3] = ac*bb + ad*bd;
    out[4] = ba*atx + bc*aty + btx;
    out[5] = bb*atx + bd*aty + bty;
    return out;
};

/**
 * Alias for {@link mat2d.multiply}
 * @function
 */
mat2d.mul = mat2d.multiply;


/**
 * Rotates a mat2d by the given angle
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat2d} out
 */
mat2d.rotate = function (out, a, rad) {
    var aa = a[0],
        ab = a[1],
        ac = a[2],
        ad = a[3],
        atx = a[4],
        aty = a[5],
        st = Math.sin(rad),
        ct = Math.cos(rad);

    out[0] = aa*ct + ab*st;
    out[1] = -aa*st + ab*ct;
    out[2] = ac*ct + ad*st;
    out[3] = -ac*st + ct*ad;
    out[4] = ct*atx + st*aty;
    out[5] = ct*aty - st*atx;
    return out;
};

/**
 * Scales the mat2d by the dimensions in the given vec2
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to translate
 * @param {mat2d} v the vec2 to scale the matrix by
 * @returns {mat2d} out
 **/
mat2d.scale = function(out, a, v) {
    var vx = v[0], vy = v[1];
    out[0] = a[0] * vx;
    out[1] = a[1] * vy;
    out[2] = a[2] * vx;
    out[3] = a[3] * vy;
    out[4] = a[4] * vx;
    out[5] = a[5] * vy;
    return out;
};

/**
 * Translates the mat2d by the dimensions in the given vec2
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to translate
 * @param {mat2d} v the vec2 to translate the matrix by
 * @returns {mat2d} out
 **/
mat2d.translate = function(out, a, v) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4] + v[0];
    out[5] = a[5] + v[1];
    return out;
};

/**
 * Returns a string representation of a mat2d
 *
 * @param {mat2d} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat2d.str = function (a) {
    return 'mat2d(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + 
                    a[3] + ', ' + a[4] + ', ' + a[5] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.mat2d = mat2d;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 3x3 Matrix
 * @name mat3
 */

var mat3 = {};

var mat3Identity = new Float32Array([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
]);

/**
 * Creates a new identity mat3
 *
 * @returns {mat3} a new 3x3 matrix
 */
mat3.create = function() {
    var out = new GLMAT_ARRAY_TYPE(9);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
};

/**
 * Creates a new mat3 initialized with values from an existing matrix
 *
 * @param {mat3} a matrix to clone
 * @returns {mat3} a new 3x3 matrix
 */
mat3.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(9);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Copy the values from one mat3 to another
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Set a mat3 to the identity matrix
 *
 * @param {mat3} out the receiving matrix
 * @returns {mat3} out
 */
mat3.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
};

/**
 * Transpose the values of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a12 = a[5];
        out[1] = a[3];
        out[2] = a[6];
        out[3] = a01;
        out[5] = a[7];
        out[6] = a02;
        out[7] = a12;
    } else {
        out[0] = a[0];
        out[1] = a[3];
        out[2] = a[6];
        out[3] = a[1];
        out[4] = a[4];
        out[5] = a[7];
        out[6] = a[2];
        out[7] = a[5];
        out[8] = a[8];
    }
    
    return out;
};

/**
 * Inverts a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.invert = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b01 = a22 * a11 - a12 * a21,
        b11 = -a22 * a10 + a12 * a20,
        b21 = a21 * a10 - a11 * a20,

        // Calculate the determinant
        det = a00 * b01 + a01 * b11 + a02 * b21;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = b01 * det;
    out[1] = (-a22 * a01 + a02 * a21) * det;
    out[2] = (a12 * a01 - a02 * a11) * det;
    out[3] = b11 * det;
    out[4] = (a22 * a00 - a02 * a20) * det;
    out[5] = (-a12 * a00 + a02 * a10) * det;
    out[6] = b21 * det;
    out[7] = (-a21 * a00 + a01 * a20) * det;
    out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
};

/**
 * Calculates the adjugate of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.adjoint = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    out[0] = (a11 * a22 - a12 * a21);
    out[1] = (a02 * a21 - a01 * a22);
    out[2] = (a01 * a12 - a02 * a11);
    out[3] = (a12 * a20 - a10 * a22);
    out[4] = (a00 * a22 - a02 * a20);
    out[5] = (a02 * a10 - a00 * a12);
    out[6] = (a10 * a21 - a11 * a20);
    out[7] = (a01 * a20 - a00 * a21);
    out[8] = (a00 * a11 - a01 * a10);
    return out;
};

/**
 * Calculates the determinant of a mat3
 *
 * @param {mat3} a the source matrix
 * @returns {Number} determinant of a
 */
mat3.determinant = function (a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
};

/**
 * Multiplies two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
mat3.multiply = function (out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b00 = b[0], b01 = b[1], b02 = b[2],
        b10 = b[3], b11 = b[4], b12 = b[5],
        b20 = b[6], b21 = b[7], b22 = b[8];

    out[0] = b00 * a00 + b01 * a10 + b02 * a20;
    out[1] = b00 * a01 + b01 * a11 + b02 * a21;
    out[2] = b00 * a02 + b01 * a12 + b02 * a22;

    out[3] = b10 * a00 + b11 * a10 + b12 * a20;
    out[4] = b10 * a01 + b11 * a11 + b12 * a21;
    out[5] = b10 * a02 + b11 * a12 + b12 * a22;

    out[6] = b20 * a00 + b21 * a10 + b22 * a20;
    out[7] = b20 * a01 + b21 * a11 + b22 * a21;
    out[8] = b20 * a02 + b21 * a12 + b22 * a22;
    return out;
};

/**
 * Alias for {@link mat3.multiply}
 * @function
 */
mat3.mul = mat3.multiply;

/**
 * Translate a mat3 by the given vector
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to translate
 * @param {vec2} v vector to translate by
 * @returns {mat3} out
 */
mat3.translate = function(out, a, v) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],
        x = v[0], y = v[1];

    out[0] = a00;
    out[1] = a01;
    out[2] = a02;

    out[3] = a10;
    out[4] = a11;
    out[5] = a12;

    out[6] = x * a00 + y * a10 + a20;
    out[7] = x * a01 + y * a11 + a21;
    out[8] = x * a02 + y * a12 + a22;
    return out;
};

/**
 * Rotates a mat3 by the given angle
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */
mat3.rotate = function (out, a, rad) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        s = Math.sin(rad),
        c = Math.cos(rad);

    out[0] = c * a00 + s * a10;
    out[1] = c * a01 + s * a11;
    out[2] = c * a02 + s * a12;

    out[3] = c * a10 - s * a00;
    out[4] = c * a11 - s * a01;
    out[5] = c * a12 - s * a02;

    out[6] = a20;
    out[7] = a21;
    out[8] = a22;
    return out;
};

/**
 * Scales the mat3 by the dimensions in the given vec2
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat3} out
 **/
mat3.scale = function(out, a, v) {
    var x = v[0], y = v[2];

    out[0] = x * a[0];
    out[1] = x * a[1];
    out[2] = x * a[2];

    out[3] = y * a[3];
    out[4] = y * a[4];
    out[5] = y * a[5];

    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Copies the values from a mat2d into a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat3} out
 **/
mat3.fromMat2d = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = 0;

    out[3] = a[2];
    out[4] = a[3];
    out[5] = 0;

    out[6] = a[4];
    out[7] = a[5];
    out[8] = 1;
    return out;
};

/**
* Calculates a 3x3 matrix from the given quaternion
*
* @param {mat3} out mat3 receiving operation result
* @param {quat} q Quaternion to create matrix from
*
* @returns {mat3} out
*/
mat3.fromQuat = function (out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;

    out[3] = xy - wz;
    out[4] = 1 - (xx + zz);
    out[5] = yz + wx;

    out[6] = xz + wy;
    out[7] = yz - wx;
    out[8] = 1 - (xx + yy);

    return out;
};

/**
 * Returns a string representation of a mat3
 *
 * @param {mat3} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat3.str = function (a) {
    return 'mat3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + 
                    a[3] + ', ' + a[4] + ', ' + a[5] + ', ' + 
                    a[6] + ', ' + a[7] + ', ' + a[8] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.mat3 = mat3;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 4x4 Matrix
 * @name mat4
 */

var mat4 = {};

var mat4Identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
]);

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
mat4.create = function() {
    var out = new GLMAT_ARRAY_TYPE(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
mat4.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
mat4.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }
    
    return out;
};

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.invert = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.adjoint = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
mat4.determinant = function (a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
mat4.multiply = function (out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};

/**
 * Alias for {@link mat4.multiply}
 * @function
 */
mat4.mul = mat4.multiply;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
mat4.translate = function (out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
mat4.scale = function(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
mat4.rotate = function (out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < GLMAT_EPSILON) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateX = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateY = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateZ = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
mat4.fromRotationTranslation = function (out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    
    return out;
};

/**
* Calculates a 4x4 matrix from the given quaternion
*
* @param {mat4} out mat4 receiving operation result
* @param {quat} q Quaternion to create matrix from
*
* @returns {mat4} out
*/
mat4.fromQuat = function (out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;

    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;

    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.frustum = function (out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.perspective = function (out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.ortho = function (out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
mat4.lookAt = function (out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < GLMAT_EPSILON &&
        Math.abs(eyey - centery) < GLMAT_EPSILON &&
        Math.abs(eyez - centerz) < GLMAT_EPSILON) {
        return mat4.identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat4.str = function (a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.mat4 = mat4;
}
;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class Quaternion
 * @name quat
 */

var quat = {};

var quatIdentity = new Float32Array([0, 0, 0, 1]);

/**
 * Creates a new identity quat
 *
 * @returns {quat} a new quaternion
 */
quat.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Creates a new quat initialized with values from an existing quaternion
 *
 * @param {quat} a quaternion to clone
 * @returns {quat} a new quaternion
 * @function
 */
quat.clone = vec4.clone;

/**
 * Creates a new quat initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} a new quaternion
 * @function
 */
quat.fromValues = vec4.fromValues;

/**
 * Copy the values from one quat to another
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the source quaternion
 * @returns {quat} out
 * @function
 */
quat.copy = vec4.copy;

/**
 * Set the components of a quat to the given values
 *
 * @param {quat} out the receiving quaternion
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} out
 * @function
 */
quat.set = vec4.set;

/**
 * Set a quat to the identity quaternion
 *
 * @param {quat} out the receiving quaternion
 * @returns {quat} out
 */
quat.identity = function(out) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Sets a quat from the given angle and rotation axis,
 * then returns it.
 *
 * @param {quat} out the receiving quaternion
 * @param {vec3} axis the axis around which to rotate
 * @param {Number} rad the angle in radians
 * @returns {quat} out
 **/
quat.setAxisAngle = function(out, axis, rad) {
    rad = rad * 0.5;
    var s = Math.sin(rad);
    out[0] = s * axis[0];
    out[1] = s * axis[1];
    out[2] = s * axis[2];
    out[3] = Math.cos(rad);
    return out;
};

/**
 * Adds two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 * @function
 */
quat.add = vec4.add;

/**
 * Multiplies two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 */
quat.multiply = function(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = b[0], by = b[1], bz = b[2], bw = b[3];

    out[0] = ax * bw + aw * bx + ay * bz - az * by;
    out[1] = ay * bw + aw * by + az * bx - ax * bz;
    out[2] = az * bw + aw * bz + ax * by - ay * bx;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
};

/**
 * Alias for {@link quat.multiply}
 * @function
 */
quat.mul = quat.multiply;

/**
 * Scales a quat by a scalar number
 *
 * @param {quat} out the receiving vector
 * @param {quat} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {quat} out
 * @function
 */
quat.scale = vec4.scale;

/**
 * Rotates a quaternion by the given angle around the X axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateX = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw + aw * bx;
    out[1] = ay * bw + az * bx;
    out[2] = az * bw - ay * bx;
    out[3] = aw * bw - ax * bx;
    return out;
};

/**
 * Rotates a quaternion by the given angle around the Y axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateY = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        by = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw - az * by;
    out[1] = ay * bw + aw * by;
    out[2] = az * bw + ax * by;
    out[3] = aw * bw - ay * by;
    return out;
};

/**
 * Rotates a quaternion by the given angle around the Z axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateZ = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bz = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw + ay * bz;
    out[1] = ay * bw - ax * bz;
    out[2] = az * bw + aw * bz;
    out[3] = aw * bw - az * bz;
    return out;
};

/**
 * Calculates the W component of a quat from the X, Y, and Z components.
 * Assumes that quaternion is 1 unit in length.
 * Any existing W component will be ignored.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate W component of
 * @returns {quat} out
 */
quat.calculateW = function (out, a) {
    var x = a[0], y = a[1], z = a[2];

    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
    return out;
};

/**
 * Calculates the dot product of two quat's
 *
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {Number} dot product of a and b
 * @function
 */
quat.dot = vec4.dot;

/**
 * Performs a linear interpolation between two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 * @function
 */
quat.lerp = vec4.lerp;

/**
 * Performs a spherical linear interpolation between two quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 */
quat.slerp = function (out, a, b, t) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = b[0], by = b[1], bz = b[2], bw = b[3];

    var cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw,
        halfTheta,
        sinHalfTheta,
        ratioA,
        ratioB;

    if (Math.abs(cosHalfTheta) >= 1.0) {
        if (out !== a) {
            out[0] = ax;
            out[1] = ay;
            out[2] = az;
            out[3] = aw;
        }
        return out;
    }

    halfTheta = Math.acos(cosHalfTheta);
    sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
        out[0] = (ax * 0.5 + bx * 0.5);
        out[1] = (ay * 0.5 + by * 0.5);
        out[2] = (az * 0.5 + bz * 0.5);
        out[3] = (aw * 0.5 + bw * 0.5);
        return out;
    }

    ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    out[0] = (ax * ratioA + bx * ratioB);
    out[1] = (ay * ratioA + by * ratioB);
    out[2] = (az * ratioA + bz * ratioB);
    out[3] = (aw * ratioA + bw * ratioB);

    return out;
};

/**
 * Calculates the inverse of a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate inverse of
 * @returns {quat} out
 */
quat.invert = function(out, a) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        dot = a0*a0 + a1*a1 + a2*a2 + a3*a3,
        invDot = dot ? 1.0/dot : 0;
    
    // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

    out[0] = -a0*invDot;
    out[1] = -a1*invDot;
    out[2] = -a2*invDot;
    out[3] = a3*invDot;
    return out;
};

/**
 * Calculates the conjugate of a quat
 * If the quaternion is normalized, this function is faster than quat.inverse and produces the same result.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate conjugate of
 * @returns {quat} out
 */
quat.conjugate = function (out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = a[3];
    return out;
};

/**
 * Calculates the length of a quat
 *
 * @param {quat} a vector to calculate length of
 * @returns {Number} length of a
 * @function
 */
quat.length = vec4.length;

/**
 * Alias for {@link quat.length}
 * @function
 */
quat.len = quat.length;

/**
 * Calculates the squared length of a quat
 *
 * @param {quat} a vector to calculate squared length of
 * @returns {Number} squared length of a
 * @function
 */
quat.squaredLength = vec4.squaredLength;

/**
 * Alias for {@link quat.squaredLength}
 * @function
 */
quat.sqrLen = quat.squaredLength;

/**
 * Normalize a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quaternion to normalize
 * @returns {quat} out
 * @function
 */
quat.normalize = vec4.normalize;

/**
 * Creates a quaternion from the given 3x3 rotation matrix.
 *
 * @param {quat} out the receiving quaternion
 * @param {mat3} m rotation matrix
 * @returns {quat} out
 * @function
 */
quat.fromMat3 = (function() {
    var s_iNext = [1,2,0];
    return function(out, m) {
        // Algorithm in Ken Shoemake's article in 1987 SIGGRAPH course notes
        // article "Quaternion Calculus and Fast Animation".
        var fTrace = m[0] + m[4] + m[8];
        var fRoot;

        if ( fTrace > 0.0 ) {
            // |w| > 1/2, may as well choose w > 1/2
            fRoot = Math.sqrt(fTrace + 1.0);  // 2w
            out[3] = 0.5 * fRoot;
            fRoot = 0.5/fRoot;  // 1/(4w)
            out[0] = (m[7]-m[5])*fRoot;
            out[1] = (m[2]-m[6])*fRoot;
            out[2] = (m[3]-m[1])*fRoot;
        } else {
            // |w| <= 1/2
            var i = 0;
            if ( m[4] > m[0] )
              i = 1;
            if ( m[8] > m[i*3+i] )
              i = 2;
            var j = s_iNext[i];
            var k = s_iNext[j];
            
            fRoot = Math.sqrt(m[i*3+i]-m[j*3+j]-m[k*3+k] + 1.0);
            out[i] = 0.5 * fRoot;
            fRoot = 0.5 / fRoot;
            out[3] = (m[k*3+j] - m[j*3+k]) * fRoot;
            out[j] = (m[j*3+i] + m[i*3+j]) * fRoot;
            out[k] = (m[k*3+i] + m[i*3+k]) * fRoot;
        }
        
        return out;
    };
})();

/**
 * Returns a string representation of a quatenion
 *
 * @param {quat} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
quat.str = function (a) {
    return 'quat(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.quat = quat;
}
;













  })(shim.exports);
})();

},{}],15:[function(_dereq_,module,exports){
module.exports=_dereq_(13)
},{"IMmnkj":17}],16:[function(_dereq_,module,exports){

},{}],17:[function(_dereq_,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[11])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvb3B0L2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL2xtZXllcm92L0Rlc2t0b3AvR3JhcGhpc3RyeS9leHBlcmltZW50cy9uYm9keS9uYWl2ZS9qcy9OQm9keS5qcyIsIi9Vc2Vycy9sbWV5ZXJvdi9EZXNrdG9wL0dyYXBoaXN0cnkvZXhwZXJpbWVudHMvbmJvZHkvbmFpdmUvanMvUmVuZGVyR0wuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL1NpbUNMLmpzIiwiL1VzZXJzL2xtZXllcm92L0Rlc2t0b3AvR3JhcGhpc3RyeS9leHBlcmltZW50cy9uYm9keS9uYWl2ZS9qcy9TaW1wbGVFdmVudHMuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL2NsLmpzIiwiL1VzZXJzL2xtZXllcm92L0Rlc2t0b3AvR3JhcGhpc3RyeS9leHBlcmltZW50cy9uYm9keS9uYWl2ZS9qcy9kZW1vLmpzIiwiL1VzZXJzL2xtZXllcm92L0Rlc2t0b3AvR3JhcGhpc3RyeS9leHBlcmltZW50cy9uYm9keS9uYWl2ZS9qcy9saWJzL0xvbmcuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL2xpYnMva21lYW5zLmpzIiwiL1VzZXJzL2xtZXllcm92L0Rlc2t0b3AvR3JhcGhpc3RyeS9leHBlcmltZW50cy9uYm9keS9uYWl2ZS9qcy9saWJzL2xvYWQuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL2xpYnMvc3RhdHMuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL21haW4uanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL2pzL3V0aWwuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL25vZGVfbW9kdWxlcy9RL3EuanMiLCIvVXNlcnMvbG1leWVyb3YvRGVza3RvcC9HcmFwaGlzdHJ5L2V4cGVyaW1lbnRzL25ib2R5L25haXZlL25vZGVfbW9kdWxlcy9nbC1tYXRyaXgvZGlzdC9nbC1tYXRyaXguanMiLCIvb3B0L2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL29wdC9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1bUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNTZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeE5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbDNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDL3hIQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIFEgPSByZXF1aXJlKCdRJyk7XG52YXIgZ2xNYXRyaXggPSByZXF1aXJlKCdnbC1tYXRyaXgnKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL1NpbXBsZUV2ZW50cy5qcycpO1xuXG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgU1RFUF9OVU1CRVJfT05fQ0hBTkdFID0gMzA7XG4gICAgdmFyIGVsZW1lbnRzUGVyUG9pbnQgPSAyO1xuXG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTi1ib2R5IGdyYXBoIGFuZCByZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgZ3JhcGggb2JqZWN0XG4gICAgICpcbiAgICAgKiBAcGFyYW0gc2ltdWxhdG9yIC0gdGhlIG1vZHVsZSBvZiB0aGUgc2ltdWxhdG9yIGJhY2tlbmQgdG8gdXNlXG4gICAgICogQHBhcmFtIHJlbmRlcmVyIC0gdGhlIG1vZHVsZSBvZiB0aGUgcmVuZGVyaW5nIGJhY2tlbmQgdG8gdXNlXG4gICAgICogQHBhcmFtIGRvY3VtZW50IC0gcGFyZW50IGRvY3VtZW50IERPTVxuICAgICAqIEBwYXJhbSBjYW52YXMgLSB0aGUgY2FudmFzIERPTSBlbGVtZW50IHRvIGRyYXcgdGhlIGdyYXBoIGluXG4gICAgICogQHBhcmFtIGJnQ29sb3IgLSBbMC0tMjU1LDAtLTI1NSwwLS0yNTUsMC0tMV1cbiAgICAgKiBAcGFyYW0gW2RpbWVuc2lvbnM9XFxbMSwxXFxdXSAtIGEgdHdvIGVsZW1lbnQgYXJyYXkgW3dpZHRoLGhlaWdodF0gdXNlZCBmb3IgaW50ZXJuYWwgcG9zaXR1aW4gY2FsY3VsYXRpb25zLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGNyZWF0ZShzaW11bGF0b3IsIHJlbmRlcmVyLCBkb2N1bWVudCwgY2FudmFzLCBiZ0NvbG9yLCBkaW1lbnNpb25zLCBudW1TcGxpdHMpIHtcbiAgICAgICAgZGltZW5zaW9ucyA9IGRpbWVuc2lvbnMgfHwgWzEsMV07XG4gICAgICAgIG51bVNwbGl0cyA9IG51bVNwbGl0cyB8fCAwO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJlci5jcmVhdGUoZG9jdW1lbnQsIGNhbnZhcywgYmdDb2xvciwgZGltZW5zaW9ucylcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24ocmVuZCkge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnQ1JFQVRFRCBSRU5ERVJFUicpXG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yLmNyZWF0ZShyZW5kLCBkaW1lbnNpb25zLCBudW1TcGxpdHMpLnRoZW4oZnVuY3Rpb24oc2ltKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnQ1JFQVRFRCBTSU1VTEFUT1InKVxuICAgICAgICAgICAgICAgIHZhciBncmFwaCA9IHtcbiAgICAgICAgICAgICAgICAgICAgXCJyZW5kZXJlclwiOiByZW5kLFxuICAgICAgICAgICAgICAgICAgICBcInNpbXVsYXRvclwiOiBzaW1cbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldFBvaW50cyA9IHNldFBvaW50cy5iaW5kKHRoaXMsIGdyYXBoKTtcbiAgICAgICAgICAgICAgICBncmFwaC5zZXRFZGdlcyA9IHNldEVkZ2VzLmJpbmQodGhpcywgZ3JhcGgpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldFBoeXNpY3MgPSBzZXRQaHlzaWNzLmJpbmQodGhpcywgZ3JhcGgpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldFZpc2libGUgPSBzZXRWaXNpYmxlLmJpbmQodGhpcywgZ3JhcGgpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldExvY2tlZCA9IHNldExvY2tlZC5iaW5kKHRoaXMsIGdyYXBoKTtcbiAgICAgICAgICAgICAgICBncmFwaC5zZXRDb2xvck1hcCA9IHNldENvbG9yTWFwLmJpbmQodGhpcywgZ3JhcGgpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnRpY2sgPSB0aWNrLmJpbmQodGhpcywgZ3JhcGgpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnN0ZXBOdW1iZXIgPSAwO1xuICAgICAgICAgICAgICAgIGdyYXBoLmRpbWVuc2lvbnMgPSBkaW1lbnNpb25zO1xuICAgICAgICAgICAgICAgIGdyYXBoLm51bVNwbGl0cyA9IG51bVNwbGl0cztcblxuICAgICAgICAgICAgICAgIHJldHVybiBncmFwaDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHNldFBvaW50cyhncmFwaCwgcG9pbnRzKSB7XG4gICAgICAgIC8vIEZJWE1FOiBJZiB0aGVyZSBpcyBhbHJlYWR5IGRhdGEgbG9hZGVkLCB3ZSBzaG91bGQgdG8gZnJlZSBpdCBiZWZvcmUgbG9hZGluZyBuZXcgZGF0YVxuICAgICAgICBpZighKHBvaW50cyBpbnN0YW5jZW9mIEZsb2F0MzJBcnJheSkpIHtcbiAgICAgICAgICAgIHBvaW50cyA9IF90b1R5cGVkQXJyYXkocG9pbnRzLCBGbG9hdDMyQXJyYXkpO1xuICAgICAgICB9XG5cbiAgICAgICAgZ3JhcGguX19wb2ludHNIb3N0QnVmZmVyID0gcG9pbnRzO1xuXG4gICAgICAgIGdyYXBoLnN0ZXBOdW1iZXIgPSAwO1xuICAgICAgICByZXR1cm4gZ3JhcGguc2ltdWxhdG9yLnNldFBvaW50cyhwb2ludHMpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGdyYXBoO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIHZhciBzZXRFZGdlcyA9IFEucHJvbWlzZWQoZnVuY3Rpb24oZ3JhcGgsIGVkZ2VzKSB7XG5cbiAgICAgICAgaWYgKGVkZ2VzLmxlbmd0aCA8IDEpXG4gICAgICAgICAgICByZXR1cm4gUS5mY2FsbChmdW5jdGlvbigpIHsgcmV0dXJuIGdyYXBoOyB9KTtcblxuICAgICAgICBpZiAoIShlZGdlcyBpbnN0YW5jZW9mIFVpbnQzMkFycmF5KSkge1xuICAgICAgICAgICAgZWRnZXMgPSBfdG9UeXBlZEFycmF5KGVkZ2VzLCBVaW50MzJBcnJheSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmRlYnVnKFwiTnVtYmVyIG9mIGVkZ2VzOlwiLCBlZGdlcy5sZW5ndGggLyAyKTtcblxuICAgICAgICB2YXIgZWRnZXNGbGlwcGVkID0gbmV3IFVpbnQzMkFycmF5KGVkZ2VzLmxlbmd0aCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZWRnZXMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBlZGdlc0ZsaXBwZWRbaV0gPSBlZGdlc1tlZGdlcy5sZW5ndGggLSAxIC0gaV07XG5cbiAgICAgICAgZnVuY3Rpb24gZW5jYXBzdWxhdGUoZWRnZXMpIHtcblxuICAgICAgICAgICAgdmFyIGVkZ2VMaXN0ID0gbmV3IEFycmF5KGVkZ2VzLmxlbmd0aCAvIDIpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBlZGdlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgICAgICBlZGdlTGlzdFtpIC8gMl0gPSBbZWRnZXNbaV0sIGVkZ2VzW2kgKyAxXV07XG5cbiAgICAgICAgICAgIGVkZ2VMaXN0LnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgICAgIHJldHVybiBhWzBdIDwgYlswXSA/IC0xXG4gICAgICAgICAgICAgICAgICAgIDogYVswXSA+IGJbMF0gPyAxXG4gICAgICAgICAgICAgICAgICAgIDogYVsxXSAtIGJbMV07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIHdvcmtJdGVtcyA9IFtdO1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRfc291cmNlID0gZWRnZUxpc3RbMF1bMF07XG4gICAgICAgICAgICB2YXIgd29ya0l0ZW0gPSBbMCwgMV07XG4gICAgICAgICAgICBlZGdlTGlzdC5mb3JFYWNoKGZ1bmN0aW9uIChlZGdlLCBpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGkgPT0gMCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmKGVkZ2VbMF0gPT0gY3VycmVudF9zb3VyY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgd29ya0l0ZW1bMV0rKztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB3b3JrSXRlbXMucHVzaCh3b3JrSXRlbVswXSk7XG4gICAgICAgICAgICAgICAgICAgIHdvcmtJdGVtcy5wdXNoKHdvcmtJdGVtWzFdKTtcbiAgICAgICAgICAgICAgICAgICAgY3VycmVudF9zb3VyY2UgPSBlZGdlWzBdO1xuICAgICAgICAgICAgICAgICAgICB3b3JrSXRlbSA9IFtpLCAxXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHdvcmtJdGVtcy5wdXNoKHdvcmtJdGVtWzBdKTtcbiAgICAgICAgICAgIHdvcmtJdGVtcy5wdXNoKHdvcmtJdGVtWzFdKTtcblxuICAgICAgICAgICAgLy9DaGVlc2V5IGxvYWQgYmFsYW5jaW5nXG4gICAgICAgICAgICAvL1RPRE8gYmVuY2htYXJrXG4gICAgICAgICAgICB3b3JrSXRlbXMuc29ydChmdW5jdGlvbiAoZWRnZUxpc3QxLCBlZGdlTGlzdDIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZWRnZUxpc3QxLmxlbmd0aCAtIGVkZ2VMaXN0Mi5sZW5ndGg7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgdmFyIGVkZ2VzRmxhdHRlbmVkID0gbmV3IFVpbnQzMkFycmF5KGVkZ2VzLmxlbmd0aCk7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGVkZ2VMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgZWRnZXNGbGF0dGVuZWRbMiAqIGldID0gZWRnZUxpc3RbaV1bMF07XG4gICAgICAgICAgICAgICAgZWRnZXNGbGF0dGVuZWRbMiAqIGkgKyAxXSA9IGVkZ2VMaXN0W2ldWzFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGVkZ2VzVHlwZWQ6IGVkZ2VzRmxhdHRlbmVkLFxuICAgICAgICAgICAgICAgIG51bVdvcmtJdGVtczogd29ya0l0ZW1zLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB3b3JrSXRlbXNUeXBlZDogbmV3IFVpbnQzMkFycmF5KHdvcmtJdGVtcylcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZm9yd2FyZEVkZ2VzID0gZW5jYXBzdWxhdGUoZWRnZXMpO1xuICAgICAgICB2YXIgYmFja3dhcmRzRWRnZXMgPSBlbmNhcHN1bGF0ZShlZGdlc0ZsaXBwZWQpO1xuXG4gICAgICAgIHZhciBuRGltID0gZ3JhcGguZGltZW5zaW9ucy5sZW5ndGg7XG4gICAgICAgIHZhciBtaWRQb2ludHMgPSBuZXcgRmxvYXQzMkFycmF5KChlZGdlcy5sZW5ndGggLyAyKSAqIGdyYXBoLm51bVNwbGl0cyAqIG5EaW0gfHwgMSk7XG4gICAgICAgIGlmIChncmFwaC5udW1TcGxpdHMpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZWRnZXMubGVuZ3RoOyBpKz0yKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNyYyA9IGVkZ2VzW2ldO1xuICAgICAgICAgICAgICAgIHZhciBkc3QgPSBlZGdlc1tpICsgMV07XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgZCA9IDA7IGQgPCBuRGltOyBkKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0YXJ0ID0gZ3JhcGguX19wb2ludHNIb3N0QnVmZmVyW3NyYyAqIG5EaW0gKyBkXTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGVuZCA9IGdyYXBoLl9fcG9pbnRzSG9zdEJ1ZmZlcltkc3QgKiBuRGltICsgZF07XG4gICAgICAgICAgICAgICAgICAgIHZhciBzdGVwID0gKGVuZCAtIHN0YXJ0KSAvIChncmFwaC5udW1TcGxpdHMgKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgcSA9IDA7IHEgPCBncmFwaC5udW1TcGxpdHM7IHErKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgbWlkUG9pbnRzWyhpICogZ3JhcGgubnVtU3BsaXRzICsgcSkgKiBuRGltICsgZF0gPSBzdGFydCArIHN0ZXAgKiAocSArIDEpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ051bWJlciBvZiBjb250cm9sIHBvaW50czonLCBlZGdlcy5sZW5ndGggKiBncmFwaC5udW1TcGxpdHMsIGdyYXBoLm51bVNwbGl0cyk7XG5cbiAgICAgICAgcmV0dXJuIGdyYXBoLnNpbXVsYXRvci5zZXRFZGdlcyhmb3J3YXJkRWRnZXMsIGJhY2t3YXJkc0VkZ2VzLCBtaWRQb2ludHMpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkgeyByZXR1cm4gZ3JhcGg7IH0pO1xuICAgIH0pO1xuXG5cbiAgICBmdW5jdGlvbiBzZXRQaHlzaWNzKGdyYXBoLCBvcHRzKSB7XG4gICAgICAgIGdyYXBoLnN0ZXBOdW1iZXIgPSBTVEVQX05VTUJFUl9PTl9DSEFOR0U7XG4gICAgICAgIGdyYXBoLnNpbXVsYXRvci5zZXRQaHlzaWNzKG9wdHMpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gc2V0VmlzaWJsZShncmFwaCwgb3B0cykge1xuICAgICAgICBncmFwaC5yZW5kZXJlci5zZXRWaXNpYmxlKG9wdHMpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gc2V0TG9ja2VkKGdyYXBoLCBvcHRzKSB7XG4gICAgICAgIC8vVE9ETyByZXNldCBzdGVwIG51bWJlcj9cbiAgICAgICAgZ3JhcGguc2ltdWxhdG9yLnNldExvY2tlZChvcHRzKTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHNldENvbG9yTWFwKGdyYXBoLCBpbWFnZVVSTCwgbWF5YmVDbHVzdGVycykge1xuICAgICAgICByZXR1cm4gZ3JhcGgucmVuZGVyZXIuc2V0Q29sb3JNYXAoaW1hZ2VVUkwsIG1heWJlQ2x1c3RlcnMpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGdyYXBoO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8vIFR1cm5zIGFuIGFycmF5IG9mIHZlYzMncyBpbnRvIGEgRmxvYXQzMkFycmF5IHdpdGggZWxlbWVudHNQZXJQb2ludCB2YWx1ZXMgZm9yIGVhY2ggZWxlbWVudCBpblxuICAgIC8vIHRoZSBpbnB1dCBhcnJheS5cbiAgICBmdW5jdGlvbiBfdG9UeXBlZEFycmF5KGFycmF5LCBjb25zKSB7XG4gICAgICAgIHZhciBmbG9hdHMgPSBuZXcgY29ucyhhcnJheS5sZW5ndGggKiBlbGVtZW50c1BlclBvaW50KTtcblxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpaSA9IGkgKiBlbGVtZW50c1BlclBvaW50O1xuICAgICAgICAgICAgZmxvYXRzW2lpICsgMF0gPSBhcnJheVtpXVswXTtcbiAgICAgICAgICAgIGZsb2F0c1tpaSArIDFdID0gYXJyYXlbaV1bMV07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmxvYXRzO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gdGljayhncmFwaCkge1xuICAgICAgICBldmVudHMuZmlyZShcInRpY2tCZWdpblwiKTtcbiAgICAgICAgICAgIGV2ZW50cy5maXJlKFwic2ltdWxhdGVCZWdpblwiKTtcblxuICAgICAgICAgICAgcmV0dXJuIGdyYXBoLnNpbXVsYXRvci50aWNrKGdyYXBoLnN0ZXBOdW1iZXIrKylcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5maXJlKFwic2ltdWxhdGVFbmRcIik7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmZpcmUoXCJyZW5kZXJCZWdpblwiKTtcblxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJSRU5ERVJcIilcblxuICAgICAgICAgICAgICAgIHJldHVybiBncmFwaC5yZW5kZXJlci5yZW5kZXIoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiUkVOREVSRURcIilcbiAgICAgICAgICAgICAgICBldmVudHMuZmlyZShcInJlbmRlckVuZFwiKTtcbiAgICAgICAgICAgICAgICBldmVudHMuZmlyZShcInRpY2tFbmRcIik7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gZ3JhcGg7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgLy8gfVxuICAgIH1cblxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgICAgIFwiZWxlbWVudHNQZXJQb2ludFwiOiBlbGVtZW50c1BlclBvaW50LFxuICAgICAgICBcImNyZWF0ZVwiOiBjcmVhdGUsXG4gICAgICAgIFwic2V0UG9pbnRzXCI6IHNldFBvaW50cyxcbiAgICAgICAgXCJzZXRFZGdlc1wiOiBzZXRFZGdlcyxcbiAgICAgICAgXCJzZXRDb2xvck1hcFwiOiBzZXRDb2xvck1hcCxcbiAgICAgICAgXCJ0aWNrXCI6IHRpY2tcbiAgICB9O1xuIiwidmFyIFEgPSByZXF1aXJlKCdRJyk7XG52YXIgZ2xNYXRyaXggPSByZXF1aXJlKCdnbC1tYXRyaXgnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsLmpzJyk7XG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgY3JlYXRlID0gUS5wcm9taXNlZChmdW5jdGlvbihkb2N1bWVudCwgY2FudmFzLCBiZ0NvbG9yLCBkaW1lbnNpb25zLCB2aXNpYmxlKSB7XG4gICAgICAgIHZpc2libGUgPSB2aXNpYmxlIHx8IHt9O1xuXG4gICAgICAgIHZhciByZW5kZXJlciA9IHtkb2N1bWVudDogZG9jdW1lbnQsIGNhbnZhczogY2FudmFzfTtcblxuICAgICAgICAvLyBUaGUgZGltZW5zaW9ucyBvZiBhIGNhbnZhcywgYnkgZGVmYXVsdCwgZG8gbm90IGFjY3VyYXRlbHkgcmVmbGVjdCBpdHMgc2l6ZSBvbiBzY3JlZW4gKGFzXG4gICAgICAgIC8vIHNldCBpbiB0aGUgSFRNTC9DU1MvZXRjLikgVGhpcyBjaGFuZ2VzIHRoZSBjYW52YXMgc2l6ZSB0byBtYXRjaCBpdHMgc2l6ZSBvbiBzY3JlZW4uXG4gICAgICAgIGNhbnZhcy53aWR0aCA9IGNhbnZhcy5jbGllbnRXaWR0aDtcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IGNhbnZhcy5jbGllbnRIZWlnaHQ7XG5cbiAgICAgICAgdmFyIGdsID0gY2FudmFzLmdldENvbnRleHQoXCJ3ZWJnbFwiLCB7YW50aWFsaWFzOiB0cnVlLCBwcmVtdWx0aXBsaWVkQWxwaGE6IGZhbHNlfSk7XG4gICAgICAgIGlmKGdsID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZCBub3QgaW5pdGlhbGl6ZSBXZWJHTFwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCB1cCBXZWJHTCBzZXR0aW5nc1xuICAgICAgICBnbC5lbmFibGUoZ2wuQkxFTkQpO1xuICAgICAgICAvLyBnbC5ibGVuZEZ1bmMoZ2wuU1JDX0FMUEhBLCBnbC5PTkVfTUlOVVNfU1JDX0FMUEhBKTtcbiAgICAgICAgZ2wuYmxlbmRGdW5jU2VwYXJhdGUoZ2wuU1JDX0FMUEhBLCBnbC5PTkVfTUlOVVNfU1JDX0FMUEhBLCBnbC5PTkUsIGdsLk9ORSk7XG4gICAgICAgIGdsLmJsZW5kRXF1YXRpb25TZXBhcmF0ZShnbC5GVU5DX0FERCwgZ2wuRlVOQ19BREQpO1xuICAgICAgICBnbC5kZXB0aEZ1bmMoZ2wuTEVRVUFMKTtcbiAgICAgICAgZ2wuZW5hYmxlKGdsLkRFUFRIX1RFU1QpO1xuICAgICAgICBnbC5jbGVhckNvbG9yLmFwcGx5KGdsLCBiZ0NvbG9yKTtcbiAgICAgICAgLy8gTGluZXMgc2hvdWxkIGJlIDFweCB3aWRlXG4gICAgICAgIGdsLmxpbmVXaWR0aCgxKTtcblxuICAgICAgICAvLyBQb3B1bGF0ZSB0aGUgcmVuZGVyZXIgb2JqZWN0IHdpdGggZGVmYXVsdCB2YWx1ZXMsIGVtcHR5IGNvbnRhaW5lcnMsIGV0Yy5cbiAgICAgICAgcmVuZGVyZXIuZ2wgPSBnbDtcbiAgICAgICAgcmVuZGVyZXIuY2FudmFzID0gY2FudmFzO1xuICAgICAgICByZW5kZXJlci5idWZmZXJzID0ge307XG4gICAgICAgIHJlbmRlcmVyLnByb2dyYW1zID0ge307XG4gICAgICAgIHJlbmRlcmVyLmVsZW1lbnRzUGVyUG9pbnQgPSAyO1xuICAgICAgICByZW5kZXJlci5udW1Qb2ludHMgPSAwO1xuICAgICAgICByZW5kZXJlci5udW1FZGdlcyA9IDA7XG4gICAgICAgIHJlbmRlcmVyLm51bU1pZFBvaW50cyA9IDA7XG4gICAgICAgIHJlbmRlcmVyLmNvbG9yVGV4dHVyZSA9IG51bGw7XG5cbiAgICAgICAgLy8gRm9yIGVhY2ggbW9kdWxlIGZ1bmN0aW9uIHRoYXQgdGFrZXMgYSByZW5kZXJlciBhcyB0aGUgZmlyc3QgYXJndW1lbnQsIGJpbmQgYSB2ZXJzaW9uXG4gICAgICAgIC8vIHRvIHRoaXMgcmVuZGVyZXIgb2JqZWN0LCB3aXRoIHRoZSByZW5kZXJlciBhcmd1bWVudCBjdXJyaWVkIGluLlxuICAgICAgICByZW5kZXJlci5zZXRDYW1lcmEyZCA9IHNldENhbWVyYTJkLmJpbmQodGhpcywgcmVuZGVyZXIpO1xuICAgICAgICByZW5kZXJlci5jcmVhdGVCdWZmZXIgPSBjcmVhdGVCdWZmZXIuYmluZCh0aGlzLCByZW5kZXJlcik7XG4gICAgICAgIHJlbmRlcmVyLnJlbmRlciA9IHJlbmRlci5iaW5kKHRoaXMsIHJlbmRlcmVyKTtcbiAgICAgICAgcmVuZGVyZXIuY3JlYXRlUHJvZ3JhbSA9IGNyZWF0ZVByb2dyYW0uYmluZCh0aGlzLCByZW5kZXJlcik7XG4gICAgICAgIHJlbmRlcmVyLnNldFZpc2libGUgPSBzZXRWaXNpYmxlLmJpbmQodGhpcywgcmVuZGVyZXIpO1xuICAgICAgICByZW5kZXJlci5pc1Zpc2libGUgPSBpc1Zpc2libGUuYmluZCh0aGlzLCByZW5kZXJlcik7XG4gICAgICAgIHJlbmRlcmVyLnNldENvbG9yTWFwID0gc2V0Q29sb3JNYXAuYmluZCh0aGlzLCByZW5kZXJlcik7XG5cbiAgICAgICAgcmVuZGVyZXIudmlzaWJsZSA9IHtwb2ludHM6IHRydWUsIGVkZ2VzOiB0cnVlLCBtaWRwb2ludHM6IGZhbHNlLCBtaWRlZGdlczogZmFsc2V9O1xuICAgICAgICByZW5kZXJlci5zZXRWaXNpYmxlKHZpc2libGUpO1xuXG5cbiAgICAgICAgcmV0dXJuIFEuYWxsKFxuICAgICAgICAgICAgWydwb2ludCcsICdlZGdlJywgJ21pZHBvaW50JywgJ21pZGVkZ2UnLCAnbWlkZWRnZS10ZXh0dXJlZCddLm1hcChmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZW5kZXJlci5jcmVhdGVQcm9ncmFtKG5hbWUgKyAnLnZlcnRleCcsIG5hbWUgKyAnLmZyYWdtZW50Jyk7XG4gICAgICAgIH0pKVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uIChwb2ludFByb2dyYW0sIGVkZ2VQcm9ncmFtLCBtaWRwb2ludFByb2dyYW0sIG1pZGVkZ2VQcm9ncmFtLCBtaWRlZGdlVGV4dHVyZWRQcm9ncmFtKSB7XG4gICAgICAgICAgICByZW5kZXJlci5wcm9ncmFtc1tcInBvaW50c1wiXSA9IHBvaW50UHJvZ3JhbTtcbiAgICAgICAgICAgIHJlbmRlcmVyLnByb2dyYW1zW1wiZWRnZXNcIl0gPSBlZGdlUHJvZ3JhbTtcbiAgICAgICAgICAgIHJlbmRlcmVyLnByb2dyYW1zW1wibWlkcG9pbnRzXCJdID0gbWlkcG9pbnRQcm9ncmFtO1xuICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJtaWRlZGdlc1wiXSA9IG1pZGVkZ2VQcm9ncmFtO1xuICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJtaWRlZGdlc3RleHR1cmVkXCJdID0gbWlkZWRnZVRleHR1cmVkUHJvZ3JhbTtcblxuICAgICAgICAgICAgLy8gVE9ETzogRW5sYXJnZSB0aGUgY2FtZXJhIGJ5IHRoZSAoc2l6ZSBvZiBnbCBwb2ludHMgLyAyKSBzbyB0aGF0IHBvaW50cyBhcmUgZnVsbHlcbiAgICAgICAgICAgIC8vIG9uIHNjcmVlbiBldmVuIGlmIHRoZXkncmUgYXQgdGhlIGVkZ2Ugb2YgdGhlIGdyYXBoLlxuICAgICAgICAgICAgcmV0dXJuIHJlbmRlcmVyLnNldENhbWVyYTJkKC0wLjAxLCBkaW1lbnNpb25zWzBdICsgMC4wMSwgLTAuMDEsIGRpbWVuc2lvbnNbMV0gKyAwLjAxKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVByb2dyYW0ocmVuZGVyZXIsIHZlcnRleFNoYWRlcklELCBmcmFnbWVudFNoYWRlcklEKSB7XG4gICAgICAgIHZhciBnbCA9IHJlbmRlcmVyLmdsO1xuXG4gICAgICAgIHZhciBwcmFnT2JqID0ge307XG5cbiAgICAgICAgcHJhZ09iai5yZW5kZXJlciA9IHJlbmRlcmVyO1xuICAgICAgICBwcmFnT2JqLmdsUHJvZ3JhbSA9IGdsLmNyZWF0ZVByb2dyYW0oKTtcbiAgICAgICAgcHJhZ09iai5iaW5kVmVydGV4QXR0cmliID0gYmluZFZlcnRleEF0dHJpYi5iaW5kKHRoaXMsIHByYWdPYmopO1xuICAgICAgICBwcmFnT2JqLnVzZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZ2wudXNlUHJvZ3JhbShwcmFnT2JqLmdsUHJvZ3JhbSk7XG4gICAgICAgIH1cbiAgICAgICAgcHJhZ09iai5hdHRyaWJ1dGVzID0ge307XG5cbiAgICAgICAgcmV0dXJuIFEuYWxsKFtcbiAgICAgICAgICAgIHV0aWwuZ2V0U291cmNlKHZlcnRleFNoYWRlcklEICsgXCIuZ2xzbFwiKSxcbiAgICAgICAgICAgIHV0aWwuZ2V0U291cmNlKGZyYWdtZW50U2hhZGVySUQgKyBcIi5nbHNsXCIpXG4gICAgICAgIF0pXG4gICAgICAgIC5zcHJlYWQoZnVuY3Rpb24odmVydFNoYWRlclNvdXJjZSwgZnJhZ1NoYWRlclNvdXJjZSkge1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBjb21waWxlU2hhZGVyKHByb2dyYW0sIHNoYWRlclNvdXJjZSwgc2hhZGVyVHlwZSkge1xuXG4gICAgICAgICAgICAgICAgdmFyIHNhbml0aXplZFNoYWRlclNvdXJjZSA9IHNoYWRlclNvdXJjZS5yZXBsYWNlKFxuICAgICAgICAgICAgICAgICAgICAvKHByZWNpc2lvbiBbYS16XSogZmxvYXQ7KS9nLFwiI2lmZGVmIEdMX0VTXFxuJDFcXG4jZW5kaWZcXG5cIik7XG5cbiAgICAgICAgICAgICAgICB2YXIgc2hhZGVyID0gcmVuZGVyZXIuZ2wuY3JlYXRlU2hhZGVyKHNoYWRlclR5cGUpO1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLmdsLnNoYWRlclNvdXJjZShzaGFkZXIsIHNhbml0aXplZFNoYWRlclNvdXJjZSk7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuZ2wuY29tcGlsZVNoYWRlcihzaGFkZXIpO1xuICAgICAgICAgICAgICAgIGlmKCFyZW5kZXJlci5nbC5nZXRTaGFkZXJQYXJhbWV0ZXIoc2hhZGVyLCByZW5kZXJlci5nbC5DT01QSUxFX1NUQVRVUykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRXJyb3IgY29tcGlsaW5nIFdlYkdMIHNoYWRlciAoc2hhZGVyIHR5cGU6IFwiICsgc2hhZGVyVHlwZSArIFwiKVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIXJlbmRlcmVyLmdsLmlzU2hhZGVyKHNoYWRlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQWZ0ZXIgY29tcGlsaW5nIHNoYWRlciwgV2ViR0wgaXMgcmVwb3J0aW5nIGl0IGlzIG5vdCB2YWxpZFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW0uZ2xQcm9ncmFtLCBzaGFkZXIpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNoYWRlcjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcHJhZ09iai52ZXJ0ZXhTaGFkZXIgICA9IGNvbXBpbGVTaGFkZXIocHJhZ09iaiwgdmVydFNoYWRlclNvdXJjZSwgZ2wuVkVSVEVYX1NIQURFUik7XG4gICAgICAgICAgICBwcmFnT2JqLmZyYWdtZW50U2hhZGVyID0gY29tcGlsZVNoYWRlcihwcmFnT2JqLCBmcmFnU2hhZGVyU291cmNlLCBnbC5GUkFHTUVOVF9TSEFERVIpO1xuXG4gICAgICAgICAgICBnbC5saW5rUHJvZ3JhbShwcmFnT2JqLmdsUHJvZ3JhbSk7XG4gICAgICAgICAgICByZXR1cm4gcHJhZ09iajtcbiAgICAgICAgfSk7XG4gICAgfVxuXG5cbiAgICB2YXIgc2V0Q2FtZXJhMmQgPSBRLnByb21pc2VkKGZ1bmN0aW9uKHJlbmRlcmVyLCBsZWZ0LCByaWdodCwgYm90dG9tLCB0b3ApIHtcbiAgICAgICAgcmVuZGVyZXIuZ2wudmlld3BvcnQoMCwgMCwgcmVuZGVyZXIuY2FudmFzLndpZHRoLCByZW5kZXJlci5jYW52YXMuaGVpZ2h0KTtcblxuICAgICAgICB2YXIgbHIgPSAxIC8gKGxlZnQgLSByaWdodCksXG4gICAgICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKTtcblxuICAgICAgICB2YXIgbXZwTWF0cml4ID0gZ2xNYXRyaXgubWF0MmQuY3JlYXRlKCk7XG4gICAgICAgIGdsTWF0cml4Lm1hdDJkLnNjYWxlKG12cE1hdHJpeCwgbXZwTWF0cml4LCBnbE1hdHJpeC52ZWMyLmZyb21WYWx1ZXMoLTIgKiBsciwgLTIgKiBidCkpO1xuICAgICAgICBnbE1hdHJpeC5tYXQyZC50cmFuc2xhdGUobXZwTWF0cml4LCBtdnBNYXRyaXgsIGdsTWF0cml4LnZlYzIuZnJvbVZhbHVlcygobGVmdCtyaWdodCkqbHIsICh0b3ArYm90dG9tKSpidCkpO1xuXG4gICAgICAgIHZhciBtdnBNYXQzID0gZ2xNYXRyaXgubWF0My5jcmVhdGUoKTtcbiAgICAgICAgZ2xNYXRyaXgubWF0My5mcm9tTWF0MmQobXZwTWF0MywgbXZwTWF0cml4KTtcblxuICAgICAgICBbJ3BvaW50cycsICdlZGdlcycsICdtaWRwb2ludHMnLCAnbWlkZWRnZXMnLCAnbWlkZWRnZXN0ZXh0dXJlZCddLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIHZhciBwcm9ncmFtID0gcmVuZGVyZXIucHJvZ3JhbXNbbmFtZV0uZ2xQcm9ncmFtO1xuICAgICAgICAgICAgcmVuZGVyZXIuZ2wudXNlUHJvZ3JhbShwcm9ncmFtKTtcbiAgICAgICAgICAgIHZhciBtdnBMb2NhdGlvbiA9IHJlbmRlcmVyLmdsLmdldFVuaWZvcm1Mb2NhdGlvbihwcm9ncmFtLCBcIm12cFwiKTtcbiAgICAgICAgICAgIHJlbmRlcmVyLmdsLnVuaWZvcm1NYXRyaXgzZnYobXZwTG9jYXRpb24sIGZhbHNlLCBtdnBNYXQzKTtcbiAgICAgICAgfSlcblxuICAgICAgICByZXR1cm4gcmVuZGVyZXI7XG4gICAgfSk7XG5cblxuXG4gICAgdmFyIGNvbG9yTWFwcyA9XG4gICAgICAgIFtcbiAgICAgICAgICBbWzAsMCwwXV0sIC8vMVxuICAgICAgICAgIFtbMjU1LDAsMF0sWzAsMCwyNTVdXSwgLy8yXG4gICAgICAgICAgW1sxNDEsMjExLDE5OV0sWzI1NSwyNTUsMTc5XSxbMTkwLDE4NiwyMThdXSxcbiAgICAgICAgICBbWzE0MSwyMTEsMTk5XSxbMjU1LDI1NSwxNzldLFsxOTAsMTg2LDIxOF0sIFsyNTEsMTI4LDExNF1dLFxuICAgICAgICAgIFtbMjI4LDI2LDI4XSwgWzU1LDEyNiwxODRdLCBbNzcsMTc1LDc0XSwgWzE1Miw3OCwxNjNdLCBbMjU1LDEyNywwXV0sXG4gICAgICAgICAgW1syMjgsMjYsMjhdLCBbNTUsMTI2LDE4NF0sIFs3NywxNzUsNzRdLCBbMTUyLDc4LDE2M10sIFsyNTUsMTI3LDBdLCBbMjU1LDI1NSw1MV1dLFxuICAgICAgICAgIFtbMjI4LDI2LDI4XSwgWzU1LDEyNiwxODRdLCBbNzcsMTc1LDc0XSwgWzE1Miw3OCwxNjNdLCBbMjU1LDEyNywwXSwgWzI1NSwyNTUsNTFdLCBbMTY2LDg2LDQwXV0sXG4gICAgICAgICAgW1syMjgsMjYsMjhdLCBbNTUsMTI2LDE4NF0sIFs3NywxNzUsNzRdLCBbMTUyLDc4LDE2M10sIFsyNTUsMTI3LDBdLCBbMjU1LDI1NSw1MV0sIFsxNjYsODYsNDBdLCBbMjQ3LDEyOSwxOTFdXSxcbiAgICAgICAgICBbWzIyOCwyNiwyOF0sIFs1NSwxMjYsMTg0XSwgWzc3LDE3NSw3NF0sIFsxNTIsNzgsMTYzXSwgWzI1NSwxMjcsMF0sIFsyNTUsMjU1LDUxXSwgWzE2Niw4Niw0MF0sIFsyNDcsMTI5LDE5MV0sIFsxNTMsMTUzLDE1M11dLFxuICAgICAgICAgIFtbMTY2LDIwNiwyMjddLCBbMzEsMTIwLDE4MF0sIFsxNzgsMjIzLDEzOF0sIFs1MSwxNjAsNDRdLCBbMjUxLDE1NCwxNTNdLCBbMjI3LDI2LDI4XSwgWzI1MywxOTEsMTExXSwgWzI1NSwxMjcsMF0sIFsyMDIsMTc4LDIxNF0sIFsxMDYsNjEsMTU0XV0sXG4gICAgICAgICAgW1sxNjYsMjA2LDIyN10sIFszMSwxMjAsMTgwXSwgWzE3OCwyMjMsMTM4XSwgWzUxLDE2MCw0NF0sIFsyNTEsMTU0LDE1M10sIFsyMjcsMjYsMjhdLCBbMjUzLDE5MSwxMTFdLCBbMjU1LDEyNywwXSwgWzIwMiwxNzgsMjE0XSwgWzEwNiw2MSwxNTRdLCBbMjU1LDI1NSwxNTNdXSxcbiAgICAgICAgICBbWzE2NiwyMDYsMjI3XSwgWzMxLDEyMCwxODBdLCBbMTc4LDIyMywxMzhdLCBbNTEsMTYwLDQ0XSwgWzI1MSwxNTQsMTUzXSwgWzIyNywyNiwyOF0sIFsyNTMsMTkxLDExMV0sIFsyNTUsMTI3LDBdLCBbMjAyLDE3OCwyMTRdLCBbMTA2LDYxLDE1NF0sIFsyNTUsMjU1LDE1M10sIFsxNzcsODksNDBdXVxuICAgICAgICBdO1xuXG5cblxuXG4gICAgLyoqXG4gICAgICogRmV0Y2ggdGhlIGltYWdlIGF0IHRoZSBnaXZlbiBVUkwgYW5kIHVzZSBpdCB3aGVuIGNvbG9yaW5nIGVkZ2VzIGluIHRoZSBncmFwaC5cbiAgICAgKi9cbiAgICB2YXIgc2V0Q29sb3JNYXAgPSBRLnByb21pc2VkKGZ1bmN0aW9uKHJlbmRlcmVyLCBpbWFnZVVSTCwgbWF5YmVDbHVzdGVycykge1xuICAgICAgICAvLyBUT0RPOiBBbGxvdyBhIHVzZXIgdG8gY2xlYXIgdGhlIGNvbG9yIG1hcCBieSBwYXNzaW5nIGluIGEgbnVsbCBoZXJlIG9yIHNvbWV0aGluZ1xuICAgICAgICB2YXIgZ2wgPSByZW5kZXJlci5nbDtcblxuICAgICAgICByZXR1cm4gdXRpbC5nZXRJbWFnZShpbWFnZVVSTClcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24odGV4SW1nKSB7XG5cbiAgICAgICAgICAgIHZhciBpbWFnZURhdGE7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKG1heWJlQ2x1c3RlcnMpIHtcblxuICAgICAgICAgICAgICAgIHZhciBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgICAgICAgICAgICAgIGNhbnZhcy53aWR0aCA9IHRleEltZy53aWR0aDtcbiAgICAgICAgICAgICAgICBjYW52YXMuaGVpZ2h0ID0gdGV4SW1nLmhlaWdodDtcblxuICAgICAgICAgICAgICAgIHZhciBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIpO1xuICAgICAgICAgICAgICAgIGlmIChjdHguY3JlYXRlSW1hZ2VEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgIGltYWdlRGF0YSA9IGN0eC5jcmVhdGVJbWFnZURhdGEodGV4SW1nLndpZHRoLCB0ZXhJbWcuaGVpZ2h0KTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkYXRhOiBuZXcgVWludDhBcnJheSh0ZXhJbWcud2lkdGggKiB0ZXhJbWcuaGVpZ2h0ICogNClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vZGVmYXVsdCB0byB3aGl0ZS90cmFuc3BhcmVudFxuICAgICAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgdGV4SW1nLndpZHRoOyB4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCB0ZXhJbWcuaGVpZ2h0OyB5KyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpID0gNCAqICh5ICogdGV4SW1nLndpZHRoICsgeCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEuZGF0YVtpXSA9IDI1NTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGF0YS5kYXRhW2krMV0gPSAyNTU7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEuZGF0YVtpKzJdID0gMjU1O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW1hZ2VEYXRhLmRhdGFbaSszXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvL3BvaW50IGJveCBhcm91bmQgZWFjaCBzdGFydCBwb2ludCB0byBpdHMgY2x1c3RlclxuICAgICAgICAgICAgICAgIC8vRklYTUU6IHVuc2FmZSBpbiBjYXNlIG9mIG92ZXJwbG90dGluZzsgYmV0dGVyIHRvIGhhdmUgYSBsYWJlbGVkIGVkZ2VsaXN0Li5cbiAgICAgICAgICAgICAgICB2YXIgY29sb3JzID0gY29sb3JNYXBzW21heWJlQ2x1c3RlcnMuY2x1c3RlcnMuY2VudGVycy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICBtYXliZUNsdXN0ZXJzLmVkZ2VzLmZvckVhY2goZnVuY3Rpb24gKHBhaXIsIGkpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNsdXN0ZXJJZHggPSBtYXliZUNsdXN0ZXJzLmNsdXN0ZXJzLmxhYmVsaW5nW2ldO1xuICAgICAgICAgICAgICAgICAgICB2YXIgY2x1c3RlciA9IG1heWJlQ2x1c3RlcnMuY2x1c3RlcnMuY2VudGVyc1tjbHVzdGVySWR4XTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0YXJ0UG9pbnQgPSBtYXliZUNsdXN0ZXJzLnBvaW50c1twYWlyWzBdXTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgY29sb3IgPSBjb2xvcnNbY2x1c3RlcklkeF07XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbCA9IHN0YXJ0UG9pbnRbMF0gKiB0ZXhJbWcud2lkdGg7XG4gICAgICAgICAgICAgICAgICAgIHZhciByb3cgPSBzdGFydFBvaW50WzFdICogdGV4SW1nLmhlaWdodDtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSAzO1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGEgPSAtcmFuZ2U7IGEgPCByYW5nZTsgYSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBiID0gLXJhbmdlOyBiIDwgcmFuZ2U7IGIrKykge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGlkeCA9IChNYXRoLmZsb29yKHJvdyArIGEpICogdGV4SW1nLndpZHRoICsgTWF0aC5mbG9vcihjb2wrYikpICogNDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZHggPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0ZXhJbWcud2lkdGggKiB0ZXhJbWcuaGVpZ2h0ICogNCwgaWR4KSk7IC8vY2xhbXBcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGltYWdlRGF0YS5kYXRhW2lkeF0gPSBjb2xvclswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEuZGF0YVtpZHgrMV0gPSBjb2xvclsxXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEuZGF0YVtpZHgrMl0gPSBjb2xvclsyXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbWFnZURhdGEuZGF0YVtpZHgrM10gPSAyNTU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdiYWQgY2x1c3RlciBsb2FkJywgZSwgZS5zdGFjayk7XG4gICAgICAgICAgICB9XG5cblxuXG4gICAgICAgICAgICByZW5kZXJlci5jb2xvclRleHR1cmUgPSBnbC5jcmVhdGVUZXh0dXJlKCk7XG4gICAgICAgICAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCByZW5kZXJlci5jb2xvclRleHR1cmUpO1xuICAgICAgICAgICAgZ2wucGl4ZWxTdG9yZWkoZ2wuVU5QQUNLX0ZMSVBfWV9XRUJHTCwgdHJ1ZSk7XG4gICAgICAgICAgICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLlJHQkEsIGdsLlJHQkEsIGdsLlVOU0lHTkVEX0JZVEUsIGltYWdlRGF0YSA/IGltYWdlRGF0YS5kYXRhIDogdGV4SW1nKTtcbiAgICAgICAgICAgIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5MSU5FQVIpO1xuICAgICAgICAgICAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01JTl9GSUxURVIsIGdsLkxJTkVBUl9NSVBNQVBfTkVBUkVTVCk7XG4gICAgICAgICAgICBnbC5nZW5lcmF0ZU1pcG1hcChnbC5URVhUVVJFXzJEKTtcbiAgICAgICAgICAgIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIG51bGwpO1xuICAgICAgICB9KTtcbiAgICB9KTtcblxuXG4gICAgdmFyIGNyZWF0ZUJ1ZmZlciA9IFEucHJvbWlzZWQoZnVuY3Rpb24ocmVuZGVyZXIsIGRhdGEpIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnY3JlYXRpbmcgZ2wgYnVmZmVyJywgdHlwZW9mKGRhdGEpLCBkYXRhLmNvbnN0cnVjdG9yKVxuICAgICAgICB2YXIgYnVmZmVyID0gcmVuZGVyZXIuZ2wuY3JlYXRlQnVmZmVyKCk7XG4gICAgICAgIHZhciBidWZPYmogPSB7XG4gICAgICAgICAgICBcImJ1ZmZlclwiOiBidWZmZXIsXG4gICAgICAgICAgICBcImdsXCI6IHJlbmRlcmVyLmdsLFxuICAgICAgICAgICAgXCJsZW5cIjogdHlwZW9mKGRhdGEpID09ICdudW1iZXInID8gZGF0YSA6IGRhdGEubGVuZ3RoXG4gICAgICAgIH07XG5cbiAgICAgICAgYnVmT2JqLmRlbGV0ZSA9IFEucHJvbWlzZWQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZW5kZXJlci5nbC5kZWxldGVCdWZmZXIoYnVmZmVyKTtcbiAgICAgICAgICAgIHJldHVybiByZW5kZXJlcjtcbiAgICAgICAgfSlcbiAgICAgICAgYnVmT2JqLndyaXRlID0gd3JpdGUuYmluZCh0aGlzLCBidWZPYmopO1xuXG4gICAgICAgIGlmKGRhdGEpIHtcbiAgICAgICAgICAgIHJldHVybiBidWZPYmoud3JpdGUoZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gYnVmT2JqO1xuICAgICAgICB9XG4gICAgfSk7XG5cblxuICAgIHZhciB3cml0ZSA9IFEucHJvbWlzZWQoZnVuY3Rpb24oYnVmZmVyLCBkYXRhKSB7XG4gICAgICAgIGJ1ZmZlci5nbC5iaW5kQnVmZmVyKGJ1ZmZlci5nbC5BUlJBWV9CVUZGRVIsIGJ1ZmZlci5idWZmZXIpO1xuICAgICAgICBidWZmZXIuZ2wuYnVmZmVyRGF0YShidWZmZXIuZ2wuQVJSQVlfQlVGRkVSLCBkYXRhLCBidWZmZXIuZ2wuRFlOQU1JQ19EUkFXKTtcbiAgICAgICAgcmV0dXJuIGJ1ZmZlcjtcbiAgICB9KTtcblxuXG4gICAgLyoqXG4gICAgICogU2hvcnRjdXQgbWV0aG9kIHRvIGZpbmQgdGhlIGxvY2F0aW9uIG9mIGFuIGF0dHJpYnV0ZSwgYmluZCBhIGJ1ZmZlciwgYW5kIHRoZW4gc2V0IHRoZVxuICAgICAqIGF0dHJpYnV0ZSB0byB0aGUgYnVmZmVyXG4gICAgICpcbiAgICAgKiBAcGFyYW0gcHJvZ3JhbSAtIHRoZSBwcm9ncmFtIG9iamVjdCB3aXRoIHRoZSBhdHRyaWJ1dGUgeW91IHdhbnQgdG8gYmluZCB0byB0aGUgYnVmZmVyXG4gICAgICogQHBhcmFtIGJ1ZmZlciAtIHRoZSBidWZmZXIgeW91IHdhbnQgdG8gYmluZCB0byB0aGUgYXR0cmlidXRlXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGF0dHJpYnV0ZSAtIHRoZSBuYW1lIG9mIHRoZSBhdHRyaWJ1dGUgeW91IHdpc2ggdG8gYmluZFxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBlbGVtZW50c1Blckl0ZW0gLSB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIHRvIHVzZSBmb3IgZWFjaCByZW5kZXJlZCBpdGVtIChlLmcuLFxuICAgICAqIHVzZSB0d28gZmxvYXRzIHBlciBwb2ludCkuIFBhc3NlZCBkaXJlY3RseSB0byBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKCkgYXMgJ3NpemUnIGFyZ3VtZW50LlxuICAgICAqIEBwYXJhbSBnbFR5cGUgLSB0aGUgV2ViR0wgdHlwZSBvZiB0aGUgYXJyYXkgKGUuZy4sIGdsLkZMT0FUKVxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbm9ybWFsaXplIC0gc2hvdWxkIHRoZSBkYXRhIGJlIG5vcm1hbGl6ZWQgYmVmb3JlIGJlaW5nIHByb2Nlc3NlZCBieSBzaGFkZXJzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHN0cmlkZSAtIHRoZSBudW1iZXIgb2YgYnl0ZXMgYmV0d2VlbiBpdGVtIGVsZW1lbnRzIChub3JtYWxseVxuICAgICAqIGVsZW1lbnRzUGVySXRlbSAqIHNpemVvZih0eXBlKSlcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gb2Zmc2V0IC0gdGhlIG51bWJlciBvZiBieXRlcyBmcm9tIHRoZSBzdGFydCBvZiB0aGUgYnVmZmVyIHRvIGJlZ2luIHJlYWRpbmdcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBiaW5kVmVydGV4QXR0cmliKHByb2dyYW0sIGJ1ZmZlciwgYXR0cmlidXRlLCBlbGVtZW50c1Blckl0ZW0sIGdsVHlwZSwgbm9ybWFsaXplLCBzdHJpZGUsIG9mZnNldCkge1xuICAgICAgICB2YXIgZ2wgPSBwcm9ncmFtLnJlbmRlcmVyLmdsO1xuICAgICAgICAvLyBUT0RPOiBjYWNoZSB0aGlzLCBiZWNhdXNlIGdldEF0dHJpYkxvY2F0aW9uIGlzIGEgQ1BVL0dQVSBzeW5jaHJvbml6YXRpb25cbiAgICAgICAgdmFyIGxvY2F0aW9uID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbS5nbFByb2dyYW0sIGF0dHJpYnV0ZSk7XG5cbiAgICAgICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIGJ1ZmZlci5idWZmZXIpO1xuICAgICAgICBnbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShsb2NhdGlvbik7XG4gICAgICAgIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIobG9jYXRpb24sIGVsZW1lbnRzUGVySXRlbSwgZ2xUeXBlLCBub3JtYWxpemUsIHN0cmlkZSwgb2Zmc2V0KTtcblxuICAgICAgICByZXR1cm4gcHJvZ3JhbTtcbiAgICB9XG5cblxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlIG9yIGRpc2FibGUgdGhlIGRyYXdpbmcgb2YgZWxlbWVudHMgaW4gdGhlIHNjZW5lLiBFbGVtZW50cyBhcmUgb25lIG9mOiBwb2ludHMsIGVkZ2VzLFxuICAgICAqIG1pZHBvaW50cywgbWlkZWRnZXMuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gcmVuZGVyZXIgLSB0aGUgcmVuZGVyZXIgb2JqZWN0IGNyZWF0ZWQgd2l0aCBHTFJ1bm5lci5jcmVhdGUoKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB2aXNpYmxlIC0gQW4gb2JqZWN0IHdpdGgga2V5cyBmb3IgMCBvciBtb3JlIG9iamVjdHMgdG8gc2V0IHRoZSB2aXNpYmlsaXR5XG4gICAgICogZm9yLiBFYWNoIHZhbHVlIHNob3VsZCBiZSB0cnVlIG9yIGZhbHNlLlxuICAgICAqIEByZXR1cm5zIHRoZSByZW5kZXJlciBvYmplY3QgcGFzc2VkIGluLCB3aXRoIHZpc2liaWxpdHkgb3B0aW9ucyB1cGRhdGVkXG4gICAgICovXG4gICAgZnVuY3Rpb24gc2V0VmlzaWJsZShyZW5kZXJlciwgdmlzaWJsZSkge1xuICAgICAgICB1dGlsLmV4dGVuZChyZW5kZXJlci52aXNpYmxlLCB2aXNpYmxlKTtcblxuICAgICAgICByZXR1cm4gcmVuZGVyZXI7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBlbGVtZW50IHBhc3NlZCBpbiBzaG91bGQgYmUgdmlzaWJsZSBpbiBpbWFnZVxuICAgICAqXG4gICAgICogQHBhcmFtIHJlbmRlcmVyIC0gdGhlIHJlbmRlcmVyIG9iamVjdCBjcmVhdGVkIHdpdGggR0xSdW5uZXIuY3JlYXRlKClcbiAgICAgKiBAcGFyYW0gZWxlbWVudCAtIHRoZSBuYW1lIG9mIHRoZSBlbGVtZW50IHRvIGNoZWNrIHZpc2liaWxpdHkgZm9yXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyBhIGJvb2xlYW4gdmFsdWUgZGV0ZXJtaW5pbmcgaWYgdGhlIG9iamVjdCBzaG91bGQgYmUgdmlzaWJsZSAoZmFsc2UgYnkgZGVmYXVsdClcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpc1Zpc2libGUocmVuZGVyZXIsIGVsZW1lbnQpIHtcbiAgICAgICAgLy8gVE9ETzogY2hlY2sgdGhlIGxlbmd0aCBvZiB0aGUgYXNzb2NpYXRlZCBidWZmZXIgdG8gc2VlIGlmIGl0J3MgPjA7IHJldHVybiBmYWxzZSBpZiBub3QuXG4gICAgICAgIHJldHVybiAocmVuZGVyZXIudmlzaWJsZVtlbGVtZW50XSB8fCBmYWxzZSk7XG4gICAgfVxuXG5cbiAgICB2YXIgcmVuZGVyID0gUS5wcm9taXNlZChmdW5jdGlvbihyZW5kZXJlcikge1xuICAgICAgICB2YXIgZ2wgPSByZW5kZXJlci5nbDtcblxuICAgICAgICBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUIHwgZ2wuREVQVEhfQlVGRkVSX0JJVCk7XG5cbiAgICAgICAgLy8gSWYgdGhlcmUgYXJlIG5vIHBvaW50cyBpbiB0aGUgZ3JhcGgsIGRvbid0IHJlbmRlciBhbnl0aGluZ1xuICAgICAgICBpZihyZW5kZXJlci5udW1Qb2ludHMgPCAxKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVuZGVyZXI7XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmKHJlbmRlcmVyLm51bUVkZ2VzID4gMCkge1xuICAgICAgICAgICAgaWYgKHJlbmRlcmVyLmlzVmlzaWJsZShcImVkZ2VzXCIpKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnUkVOREVSOiBFREdFUycpXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJlZGdlc1wiXS51c2UoKTtcbiAgICAgICAgICAgICAgICByZW5kZXJlci5wcm9ncmFtc1tcImVkZ2VzXCJdLmJpbmRWZXJ0ZXhBdHRyaWIocmVuZGVyZXIuYnVmZmVycy5zcHJpbmdzLCBcImN1clBvc1wiLFxuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5lbGVtZW50c1BlclBvaW50LCBnbC5GTE9BVCwgZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLmVsZW1lbnRzUGVyUG9pbnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQsIDApO1xuICAgICAgICAgICAgICAgIGdsLmRyYXdBcnJheXMoZ2wuTElORVMsIDAsIHJlbmRlcmVyLm51bUVkZ2VzICogMik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZW5kZXJlci5pc1Zpc2libGUoXCJtaWRlZGdlc1wiKSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1JFTkRFUjogTUlERURHRVMnKVxuICAgICAgICAgICAgICAgIGlmKHJlbmRlcmVyLmNvbG9yVGV4dHVyZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5wcm9ncmFtc1tcIm1pZGVkZ2VzXCJdLnVzZSgpO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5wcm9ncmFtc1tcIm1pZGVkZ2VzXCJdLmJpbmRWZXJ0ZXhBdHRyaWIocmVuZGVyZXIuYnVmZmVycy5taWRTcHJpbmdzLCBcImN1clBvc1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCwgZ2wuRkxPQVQsIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGdsLmRyYXdBcnJheXMoZ2wuTElORVMsIDAsIHJlbmRlcmVyLm51bU1pZEVkZ2VzICogMik7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJtaWRlZGdlc3RleHR1cmVkXCJdLnVzZSgpO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5wcm9ncmFtc1tcIm1pZGVkZ2VzdGV4dHVyZWRcIl0uYmluZFZlcnRleEF0dHJpYihyZW5kZXJlci5idWZmZXJzLm1pZFNwcmluZ3MsIFwiY3VyUG9zXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5lbGVtZW50c1BlclBvaW50LCBnbC5GTE9BVCwgZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICByZW5kZXJlci5lbGVtZW50c1BlclBvaW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULCAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJtaWRlZGdlc3RleHR1cmVkXCJdLmJpbmRWZXJ0ZXhBdHRyaWIocmVuZGVyZXIuYnVmZmVycy5taWRTcHJpbmdzQ29sb3JDb29yZCwgXCJhQ29sb3JDb29yZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCwgZ2wuRkxPQVQsIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTApO1xuICAgICAgICAgICAgICAgICAgICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCByZW5kZXJlci5jb2xvclRleHR1cmUpO1xuICAgICAgICAgICAgICAgICAgICBnbC51bmlmb3JtMWkoZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHJlbmRlcmVyLnByb2dyYW1zW1wibWlkZWRnZXN0ZXh0dXJlZFwiXS5nbFByb2dyYW0sIFwidVNhbXBsZXJcIiksIDApO1xuICAgICAgICAgICAgICAgICAgICBnbC5kcmF3QXJyYXlzKGdsLkxJTkVTLCAwLCByZW5kZXJlci5udW1NaWRFZGdlcyAqIDIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlbmRlcmVyLmlzVmlzaWJsZShcInBvaW50c1wiKSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1JFTkRFUjogUE9JTlRTJylcbiAgICAgICAgICAgIHJlbmRlcmVyLnByb2dyYW1zW1wicG9pbnRzXCJdLnVzZSgpO1xuICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJwb2ludHNcIl0uYmluZFZlcnRleEF0dHJpYihyZW5kZXJlci5idWZmZXJzLmN1clBvaW50cywgXCJjdXJQb3NcIixcbiAgICAgICAgICAgICAgICByZW5kZXJlci5lbGVtZW50c1BlclBvaW50LCBnbC5GTE9BVCwgZmFsc2UsXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgMClcbiAgICAgICAgICAgIGdsLmRyYXdBcnJheXMoZ2wuUE9JTlRTLCAwLCByZW5kZXJlci5udW1Qb2ludHMpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJlbmRlcmVyLmlzVmlzaWJsZShcIm1pZHBvaW50c1wiKSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1JFTkRFUjogTUlEUE9JTlRTJylcbiAgICAgICAgICAgIHJlbmRlcmVyLnByb2dyYW1zW1wibWlkcG9pbnRzXCJdLnVzZSgpO1xuICAgICAgICAgICAgcmVuZGVyZXIucHJvZ3JhbXNbXCJtaWRwb2ludHNcIl0uYmluZFZlcnRleEF0dHJpYihyZW5kZXJlci5idWZmZXJzLmN1ck1pZFBvaW50cywgXCJjdXJQb3NcIixcbiAgICAgICAgICAgICAgICByZW5kZXJlci5lbGVtZW50c1BlclBvaW50LCBnbC5GTE9BVCwgZmFsc2UsXG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgMCk7XG4gICAgICAgICAgICBnbC5kcmF3QXJyYXlzKGdsLlBPSU5UUywgMCwgcmVuZGVyZXIubnVtTWlkUG9pbnRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGdsLmZpbmlzaCgpO1xuXG4gICAgICAgIHJldHVybiByZW5kZXJlcjtcbiAgICB9KTtcblxuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgICAgIFwiY3JlYXRlXCI6IGNyZWF0ZSxcbiAgICAgICAgXCJjcmVhdGVQcm9ncmFtXCI6IGNyZWF0ZVByb2dyYW0sXG4gICAgICAgIFwic2V0Q29sb3JNYXBcIjogc2V0Q29sb3JNYXAsXG4gICAgICAgIFwic2V0Q2FtZXJhMmRcIjogc2V0Q2FtZXJhMmQsXG4gICAgICAgIFwiY3JlYXRlQnVmZmVyXCI6IGNyZWF0ZUJ1ZmZlcixcbiAgICAgICAgXCJ3cml0ZVwiOiB3cml0ZSxcbiAgICAgICAgXCJiaW5kVmVydGV4QXR0cmliXCI6IGJpbmRWZXJ0ZXhBdHRyaWIsXG4gICAgICAgIFwic2V0VmlzaWJsZVwiOiBzZXRWaXNpYmxlLFxuICAgICAgICBcImlzVmlzaWJsZVwiOiBpc1Zpc2libGUsXG4gICAgICAgIFwicmVuZGVyXCI6IHJlbmRlclxuICAgIH07XG4iLCJcbnZhciBRID0gcmVxdWlyZSgnUScpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcbnZhciBjbGpzID0gcmVxdWlyZSgnLi9jbC5qcycpO1xuXG5pZiAodHlwZW9mKHdpbmRvdykgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB3ZWJjbCA9IHJlcXVpcmUoJ25vZGUtd2ViY2wnKTtcbn1cblxuXG5cbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIFEubG9uZ1N0YWNrU3VwcG9ydCA9IHRydWU7XG4gICAgdmFyIHJhbmRMZW5ndGggPSA3MztcblxuXG4gICAgZnVuY3Rpb24gY3JlYXRlKHJlbmRlcmVyLCBkaW1lbnNpb25zLCBudW1TcGxpdHMsIGxvY2tlZCkge1xuICAgICAgICByZXR1cm4gY2xqcy5jcmVhdGUocmVuZGVyZXIuZ2wpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKGNsKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdDUkVBVEUgQ0wgKGZyb20gZ2wpJylcbiAgICAgICAgICAgIC8vIENvbXBpbGUgdGhlIFdlYkNMIGtlcm5lbHNcbiAgICAgICAgICAgIHJldHVybiB1dGlsLmdldFNvdXJjZShcImFwcGx5LWZvcmNlcy5jbFwiKVxuICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24oc291cmNlKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnR09UIFNPVVJDRScpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNsLmNvbXBpbGUoc291cmNlLCBbXCJhcHBseV9wb2ludHNcIiwgXCJhcHBseV9zcHJpbmdzXCIsIFwiYXBwbHlfbWlkcG9pbnRzXCIsIFwiYXBwbHlfbWlkc3ByaW5nc1wiXSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24oa2VybmVscykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ0NPTVBJTEVEJylcbiAgICAgICAgICAgICAgICB2YXIgc2ltT2JqID0ge1xuICAgICAgICAgICAgICAgICAgICBcInJlbmRlcmVyXCI6IHJlbmRlcmVyLFxuICAgICAgICAgICAgICAgICAgICBcImNsXCI6IGNsLFxuICAgICAgICAgICAgICAgICAgICBcInBvaW50S2VybmVsXCI6IGtlcm5lbHNbXCJhcHBseV9wb2ludHNcIl0sXG4gICAgICAgICAgICAgICAgICAgIFwiZWRnZXNLZXJuZWxcIjoga2VybmVsc1tcImFwcGx5X3NwcmluZ3NcIl0sXG4gICAgICAgICAgICAgICAgICAgIFwibWlkUG9pbnRLZXJuZWxcIjoga2VybmVsc1tcImFwcGx5X21pZHBvaW50c1wiXSxcbiAgICAgICAgICAgICAgICAgICAgXCJtaWRFZGdlc0tlcm5lbFwiOiBrZXJuZWxzW1wiYXBwbHlfbWlkc3ByaW5nc1wiXSxcbiAgICAgICAgICAgICAgICAgICAgXCJlbGVtZW50c1BlclBvaW50XCI6IDJcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHNpbU9iai50aWNrID0gdGljay5iaW5kKHRoaXMsIHNpbU9iaik7XG4gICAgICAgICAgICAgICAgc2ltT2JqLnNldFBvaW50cyA9IHNldFBvaW50cy5iaW5kKHRoaXMsIHNpbU9iaik7XG4gICAgICAgICAgICAgICAgc2ltT2JqLnNldEVkZ2VzID0gc2V0RWRnZXMuYmluZCh0aGlzLCBzaW1PYmopO1xuICAgICAgICAgICAgICAgIHNpbU9iai5zZXRMb2NrZWQgPSBzZXRMb2NrZWQuYmluZCh0aGlzLCBzaW1PYmopO1xuICAgICAgICAgICAgICAgIHNpbU9iai5zZXRQaHlzaWNzID0gc2V0UGh5c2ljcy5iaW5kKHRoaXMsIHNpbU9iaik7XG4gICAgICAgICAgICAgICAgc2ltT2JqLnJlc2V0QnVmZmVycyA9IHJlc2V0QnVmZmVycy5iaW5kKHRoaXMsIHNpbU9iaik7XG5cbiAgICAgICAgICAgICAgICBzaW1PYmouZGltZW5zaW9ucyA9IGRpbWVuc2lvbnM7XG4gICAgICAgICAgICAgICAgc2ltT2JqLm51bVNwbGl0cyA9IG51bVNwbGl0cztcbiAgICAgICAgICAgICAgICBzaW1PYmoubnVtUG9pbnRzID0gMDtcbiAgICAgICAgICAgICAgICBzaW1PYmoubnVtRWRnZXMgPSAwO1xuICAgICAgICAgICAgICAgIHNpbU9iai5sb2NrZWQgPSB1dGlsLmV4dGVuZChcbiAgICAgICAgICAgICAgICAgICAge2xvY2tQb2ludHM6IGZhbHNlLCBsb2NrTWlkcG9pbnRzOiB0cnVlLCBsb2NrRWRnZXM6IGZhbHNlLCBsb2NrTWlkZWRnZXM6IHRydWV9LFxuICAgICAgICAgICAgICAgICAgICAobG9ja2VkIHx8IHt9KVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICBzaW1PYmouYnVmZmVycyA9IHtcbiAgICAgICAgICAgICAgICAgICAgbmV4dFBvaW50czogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgcmFuZFZhbHVlczogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgY3VyUG9pbnRzOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBmb3J3YXJkc0VkZ2VzOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBmb3J3YXJkc1dvcmtJdGVtczogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgYmFja3dhcmRzRWRnZXM6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgIGJhY2t3YXJkc1dvcmtJdGVtczogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgc3ByaW5nc1BvczogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbWlkU3ByaW5nc1BvczogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgbWlkU3ByaW5nc0NvbG9yQ29vcmQ6IG51bGxcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIldlYkNMIHNpbXVsYXRvciBjcmVhdGVkXCIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzaW1PYmpcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDb3VsZCBub3QgY29tcGlsZSBzaW0nLCBlcnIpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignQ291bGQgbm90IGNyZWF0ZSBzaW0nLCBlcnIpO1xuICAgICAgICAgICAgcmV0dXJuIGVycjtcbiAgICAgICAgfSlcblxuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gYW4gYXJyYXkgb2YgKHBvdGVudGlhbGx5IG51bGwpIGJ1ZmZlcnMsIGRlbGV0ZSB0aGUgbm9uLW51bGwgYnVmZmVycyBhbmQgc2V0IHRoZWlyXG4gICAgICogdmFyaWFibGUgaW4gdGhlIHNpbXVsYXRvciBidWZmZXIgb2JqZWN0IHRvIG51bGwuXG4gICAgICovXG4gICAgdmFyIHJlc2V0QnVmZmVycyA9IGZ1bmN0aW9uKHNpbXVsYXRvciwgYnVmZmVycykge1xuICAgICAgICB2YXIgdmFsaWRCdWZmZXJzID0gYnVmZmVycy5maWx0ZXIoZnVuY3Rpb24odmFsKSB7IHJldHVybiAhKCF2YWwpOyB9KTtcbiAgICAgICAgaWYodmFsaWRCdWZmZXJzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gUShudWxsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNlYXJjaCBmb3IgdGhlIGJ1ZmZlciBpbiB0aGUgc2ltdWxhdG9yJ3MgYnVmZmVyIG9iamVjdCwgYW5kIHNldCBpdCB0byBudWxsIHRoZXJlXG4gICAgICAgIHZhbGlkQnVmZmVycy5mb3JFYWNoKGZ1bmN0aW9uKGJ1ZmZUb0RlbGV0ZSkge1xuICAgICAgICAgICAgZm9yKHZhciBidWZmIGluIHNpbXVsYXRvci5idWZmZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYoc2ltdWxhdG9yLmJ1ZmZlcnMuaGFzT3duUHJvcGVydHkoYnVmZikgJiYgc2ltdWxhdG9yLmJ1ZmZlcnNbYnVmZl0gPT0gYnVmZlRvRGVsZXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzW2J1ZmZdID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhbGlkQnVmZmVycy5tYXAoZnVuY3Rpb24oYnVmZlRvRGVsZXRlKSB7XG4gICAgICAgICAgICBidWZmVG9EZWxldGUuZGVsZXRlKCk7XG4gICAgICAgIH0pXG5cbiAgICAgICAgcmV0dXJuIFEuYWxsKHZhbGlkQnVmZmVycyk7XG4gICAgfTtcblxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBpbml0aWFsIHBvc2l0aW9ucyBvZiB0aGUgcG9pbnRzIGluIHRoZSBOQm9keSBzaW11bGF0aW9uXG4gICAgICogQHBhcmFtIHNpbXVsYXRvciAtIHRoZSBzaW11bGF0b3Igb2JqZWN0IGNyZWF0ZWQgYnkgU2ltQ0wuY3JlYXRlKClcbiAgICAgKiBAcGFyYW0ge0Zsb2F0MzJBcnJheX0gcG9pbnRzIC0gYSB0eXBlZCBhcnJheSBjb250YWluaW5nIHR3byBlbGVtZW50cyBmb3IgZXZlcnkgcG9pbnQsIHRoZSB4XG4gICAgICogcG9zaXRpb24sIHByb2NlZWRlZCBieSB0aGUgeSBwb3NpdGlvblxuICAgICAqXG4gICAgICogQHJldHVybnMgYSBwcm9taXNlIGZ1bGZpbGxlZCBieSB3aXRoIHRoZSBnaXZlbiBzaW11bGF0b3Igb2JqZWN0XG4gICAgICovXG4gICAgZnVuY3Rpb24gc2V0UG9pbnRzKHNpbXVsYXRvciwgcG9pbnRzKSB7XG4gICAgICAgIGlmKHBvaW50cy5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcG9pbnRzIGJ1ZmZlciBpcyBlbXB0eVwiKTtcbiAgICAgICAgfVxuICAgICAgICBpZihwb2ludHMubGVuZ3RoICUgc2ltdWxhdG9yLmVsZW1lbnRzUGVyUG9pbnQgIT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBwb2ludHMgYnVmZmVyIGlzIGFuIGludmFsaWQgc2l6ZSAobXVzdCBiZSBhIG11bHRpcGxlIG9mIFwiICsgc2ltdWxhdG9yLmVsZW1lbnRzUGVyUG9pbnQgKyBcIilcIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2ltdWxhdG9yLnJlc2V0QnVmZmVycyhbXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5uZXh0UG9pbnRzLFxuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMucmFuZFZhbHVlcyxcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmN1clBvaW50c1xuICAgICAgICBdKVxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNpbXVsYXRvci5udW1Qb2ludHMgPSBwb2ludHMubGVuZ3RoIC8gc2ltdWxhdG9yLmVsZW1lbnRzUGVyUG9pbnQ7XG4gICAgICAgICAgICBzaW11bGF0b3IucmVuZGVyZXIubnVtUG9pbnRzID0gc2ltdWxhdG9yLm51bVBvaW50cztcblxuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIk51bWJlciBvZiBwb2ludHM6XCIsIHNpbXVsYXRvci5yZW5kZXJlci5udW1Qb2ludHMpO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYnVmZmVycyBhbmQgd3JpdGUgaW5pdGlhbCBkYXRhIHRvIHRoZW0sIHRoZW4gc2V0XG4gICAgICAgICAgICByZXR1cm4gUS5hbGwoW1xuICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IucmVuZGVyZXIuY3JlYXRlQnVmZmVyKHBvaW50cywgJ2N1clBvaW50cycpLFxuICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyKHBvaW50cy5ieXRlTGVuZ3RoLCAnbmV4dFBvaW50cycpLFxuICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyKHJhbmRMZW5ndGggKiBzaW11bGF0b3IuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgJ3JhbmRWYWx1ZXMnKVxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uKHBvaW50c1ZCTywgbmV4dFBvaW50c0J1ZmZlciwgcmFuZEJ1ZmZlcikge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnbWFkZSBtb3N0IHBvaW50cycpXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5uZXh0UG9pbnRzID0gbmV4dFBvaW50c0J1ZmZlcjtcblxuICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLmJ1ZmZlcnMuY3VyUG9pbnRzID0gcG9pbnRzVkJPO1xuXG4gICAgICAgICAgICAvLyBHZW5lcmF0ZSBhbiBhcnJheSBvZiByYW5kb20gdmFsdWVzIHdlIHdpbGwgd3JpdGUgdG8gdGhlIHJhbmRWYWx1ZXMgYnVmZmVyXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5yYW5kVmFsdWVzID0gcmFuZEJ1ZmZlcjtcbiAgICAgICAgICAgIHZhciByYW5kcyA9IG5ldyBGbG9hdDMyQXJyYXkocmFuZExlbmd0aCAqIHNpbXVsYXRvci5lbGVtZW50c1BlclBvaW50KTtcbiAgICAgICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCByYW5kcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHJhbmRzW2ldID0gTWF0aC5yYW5kb20oKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIFEuYWxsKFtcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyR0wocG9pbnRzVkJPLCAnY3VyUG9pbnRzJyksXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMucmFuZFZhbHVlcy53cml0ZShyYW5kcyldKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnNwcmVhZChmdW5jdGlvbihwb2ludHNCdWYsIHJhbmRWYWx1ZXMpIHtcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmN1clBvaW50cyA9IHBvaW50c0J1ZjtcblxuICAgICAgICAgICAgdmFyIGxvY2FsUG9zU2l6ZSA9IE1hdGgubWluKHNpbXVsYXRvci5jbC5tYXhUaHJlYWRzLCBzaW11bGF0b3IubnVtUG9pbnRzKSAqIHNpbXVsYXRvci5lbGVtZW50c1BlclBvaW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UO1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIlNFVFRJTkcgUE9JTlQgMFwiLCBcIkZJWE1FOiBkeW4gYWxsb2MgX19sb2NhbCwgbm90IGhhcmRjb2RlIGluIGtlcm5lbFwiKTtcbiAgICAgICAgICAgIHJldHVybiBzaW11bGF0b3IucG9pbnRLZXJuZWwuc2V0QXJncyhbXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbc2ltdWxhdG9yLm51bVBvaW50c10gOiBuZXcgVWludDMyQXJyYXkoW3NpbXVsYXRvci5udW1Qb2ludHNdKSxcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMubmV4dFBvaW50cy5idWZmZXIsXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbMV0gOiBuZXcgVWludDMyQXJyYXkoW2xvY2FsUG9zU2l6ZV0pLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gW3NpbXVsYXRvci5kaW1lbnNpb25zWzBdXSA6IG5ldyBGbG9hdDMyQXJyYXkoW3NpbXVsYXRvci5kaW1lbnNpb25zWzBdXSksXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbc2ltdWxhdG9yLmRpbWVuc2lvbnNbMV1dIDogbmV3IEZsb2F0MzJBcnJheShbc2ltdWxhdG9yLmRpbWVuc2lvbnNbMV1dKSxcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFstMC4wMDAwMV0gOiBuZXcgRmxvYXQzMkFycmF5KFstMC4wMDAwMV0pLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gWzAuMl0gOiBuZXcgRmxvYXQzMkFycmF5KFswLjJdKSxcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMucmFuZFZhbHVlcy5idWZmZXIsXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbMF0gOiBuZXcgVWludDMyQXJyYXkoWzBdKVxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFtcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZS5VSU5ULFxuICAgICAgICAgICAgICAgICAgICBudWxsLCBudWxsLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkxPQ0FMX01FTU9SWV9TSVpFLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULFxuICAgICAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLlVJTlRcbiAgICAgICAgICAgICAgICBdIDogdW5kZWZpbmVkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGVkZ2UgbGlzdCBmb3IgdGhlIGdyYXBoXG4gICAgICpcbiAgICAgKiBAcGFyYW0gc2ltdWxhdG9yIC0gdGhlIHNpbXVsYXRvciBvYmplY3QgdG8gc2V0IHRoZSBlZGdlcyBmb3JcbiAgICAgKiBAcGFyYW0ge2VkZ2VzVHlwZWQ6IHtVaW50MzJBcnJheX0sIG51bVdvcmtJdGVtczogdWludCwgd29ya0l0ZW1zVHlwZWQ6IHtVaW50MzJBcnJheX0gfSBmb3J3YXJkc0VkZ2VzIC1cbiAgICAgKiAgICAgICAgRWRnZSBsaXN0IGFzIHJlcHJlc2VudGVkIGluIGlucHV0IGdyYXBoLlxuICAgICAqICAgICAgICBlZGdlc1R5cGVkIGlzIGJ1ZmZlciB3aGVyZSBldmVyeSB0d28gaXRlbXMgY29udGFpbiB0aGUgaW5kZXggb2YgdGhlIHNvdXJjZVxuICAgICAqICAgICAgICBub2RlIGZvciBhbiBlZGdlLCBhbmQgdGhlIGluZGV4IG9mIHRoZSB0YXJnZXQgbm9kZSBvZiB0aGUgZWRnZS5cbiAgICAgKiAgICAgICAgd29ya0l0ZW1zIGlzIGEgYnVmZmVyIHdoZXJlIGV2ZXJ5IHR3byBpdGVtcyBlbmNvZGUgaW5mb3JtYXRpb24gbmVlZGVkIGJ5XG4gICAgICogICAgICAgICBvbmUgdGhyZWFkOiB0aGUgaW5kZXggb2YgdGhlIGZpcnN0IGVkZ2UgaXQgc2hvdWxkIHByb2Nlc3MsIGFuZCB0aGUgbnVtYmVyIG9mXG4gICAgICogICAgICAgICBjb25zZWN1dGl2ZSBlZGdlcyBpdCBzaG91bGQgcHJvY2VzcyBpbiB0b3RhbC5cbiAgICAgKiBAcGFyYW0ge2VkZ2VzVHlwZWQ6IHtVaW50MzJBcnJheX0sIG51bVdvcmtJdGVtczogdWludCwgd29ya0l0ZW1zVHlwZXM6IHtVaW50MzJBcnJheX0gfSBiYWNrd2FyZHNFZGdlcyAtXG4gICAgICogICAgICAgIFNhbWUgYXMgZm9yd2FyZHNFZGdlcywgZXhjZXB0IHJldmVyc2UgZWRnZSBzcmMvZHN0IGFuZCByZWRlZmluZSB3b3JrSXRlbXMvbnVtV29ya0l0ZW1zIGNvcnJlc29uZGluZ2x5LlxuICAgICAqIEBwYXJhbSB7RmxvYXQzMkFycmF5fSBtaWRQb2ludHMgLSBkZW5zZSBhcnJheSBvZiBjb250cm9sIHBvaW50cyAocGFja2VkIHNlcXVlbmNlIG9mIG5EaW0gc3RydWN0cylcbiAgICAgKiBAcmV0dXJucyB7US5wcm9taXNlfSBhIHByb21pc2UgZm9yIHRoZSBzaW11bGF0b3Igb2JqZWN0XG4gICAgICovXG4gICAgZnVuY3Rpb24gc2V0RWRnZXMoc2ltdWxhdG9yLCBmb3J3YXJkc0VkZ2VzLCBiYWNrd2FyZHNFZGdlcywgbWlkUG9pbnRzKSB7XG4gICAgICAgIC8vZWRnZXMsIHdvcmtJdGVtc1xuICAgICAgICB2YXIgZWxlbWVudHNQZXJFZGdlID0gMjsgLy8gVGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiB0aGUgZWRnZXMgYnVmZmVyIHBlciBzcHJpbmdcbiAgICAgICAgdmFyIGVsZW1lbnRzUGVyV29ya0l0ZW0gPSAyO1xuXG4gICAgICAgIGlmKGZvcndhcmRzRWRnZXMuZWRnZXNUeXBlZC5sZW5ndGggPCAxKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgZWRnZSBidWZmZXIgaXMgZW1wdHlcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYoZm9yd2FyZHNFZGdlcy5lZGdlc1R5cGVkLmxlbmd0aCAlIGVsZW1lbnRzUGVyRWRnZSAhPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIGVkZ2UgYnVmZmVyIHNpemUgaXMgaW52YWxpZCAobXVzdCBiZSBhIG11bHRpcGxlIG9mIFwiICsgZWxlbWVudHNQZXJFZGdlICsgXCIpXCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmKGZvcndhcmRzRWRnZXMud29ya0l0ZW1zVHlwZWQubGVuZ3RoIDwgMSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHdvcmsgaXRlbXMgYnVmZmVyIGlzIGVtcHR5XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmKGZvcndhcmRzRWRnZXMud29ya0l0ZW1zVHlwZWQubGVuZ3RoICUgZWxlbWVudHNQZXJXb3JrSXRlbSAhPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHdvcmsgaXRlbSBidWZmZXIgc2l6ZSBpcyBpbnZhbGlkIChtdXN0IGJlIGEgbXVsdGlwbGUgb2YgXCIgKyBlbGVtZW50c1BlcldvcmtJdGVtICsgXCIpXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNpbXVsYXRvci5yZXNldEJ1ZmZlcnMoW1xuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuZm9yd2FyZHNFZGdlcyxcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmZvcndhcmRzV29ya0l0ZW1zLFxuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuYmFja3dhcmRzRWRnZXMsXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5iYWNrd2FyZHNXb3JrSXRlbXMsXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5zcHJpbmdzUG9zLFxuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMubWlkU3ByaW5nc1BvcyxcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLm1pZFNwcmluZ3NDb2xvckNvb3JkXG4gICAgICAgIF0pXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy8gSW5pdCBjb25zdGFudFxuICAgICAgICAgICAgc2ltdWxhdG9yLm51bUVkZ2VzID0gZm9yd2FyZHNFZGdlcy5lZGdlc1R5cGVkLmxlbmd0aCAvIGVsZW1lbnRzUGVyRWRnZTtcbiAgICAgICAgICAgIHNpbXVsYXRvci5yZW5kZXJlci5udW1FZGdlcyA9IHNpbXVsYXRvci5udW1FZGdlcztcbiAgICAgICAgICAgIHNpbXVsYXRvci5udW1Gb3J3YXJkc1dvcmtJdGVtcyA9IGZvcndhcmRzRWRnZXMud29ya0l0ZW1zVHlwZWQubGVuZ3RoIC8gZWxlbWVudHNQZXJXb3JrSXRlbTtcbiAgICAgICAgICAgIHNpbXVsYXRvci5udW1CYWNrd2FyZHNXb3JrSXRlbXMgPSBiYWNrd2FyZHNFZGdlcy53b3JrSXRlbXNUeXBlZC5sZW5ndGggLyBlbGVtZW50c1BlcldvcmtJdGVtO1xuXG4gICAgICAgICAgICBzaW11bGF0b3IubnVtTWlkUG9pbnRzID0gbWlkUG9pbnRzLmxlbmd0aCAvIHNpbXVsYXRvci5lbGVtZW50c1BlclBvaW50O1xuICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLm51bU1pZFBvaW50cyA9IHNpbXVsYXRvci5udW1NaWRQb2ludHM7XG4gICAgICAgICAgICBzaW11bGF0b3IubnVtTWlkRWRnZXMgPSBzaW11bGF0b3IubnVtTWlkUG9pbnRzICsgc2ltdWxhdG9yLm51bUVkZ2VzO1xuICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLm51bU1pZEVkZ2VzID0gc2ltdWxhdG9yLm51bU1pZEVkZ2VzO1xuXG4gICAgICAgICAgICAvLyBDcmVhdGUgYnVmZmVyc1xuICAgICAgICAgICAgcmV0dXJuIFEuYWxsKFtcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyKGZvcndhcmRzRWRnZXMuZWRnZXNUeXBlZC5ieXRlTGVuZ3RoLCAnZm9yd2FyZHNFZGdlcycpLFxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5jbC5jcmVhdGVCdWZmZXIoZm9yd2FyZHNFZGdlcy53b3JrSXRlbXNUeXBlZC5ieXRlTGVuZ3RoLCAnZm9yd2FyZHNXb3JrSXRlbXMnKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyKGJhY2t3YXJkc0VkZ2VzLmVkZ2VzVHlwZWQuYnl0ZUxlbmd0aCwgJ2JhY2t3YXJkc0VkZ2VzJyksXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmNsLmNyZWF0ZUJ1ZmZlcihiYWNrd2FyZHNFZGdlcy53b3JrSXRlbXNUeXBlZC5ieXRlTGVuZ3RoLCAnYmFja3dhcmRzV29ya0l0ZW1zJyksXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmNsLmNyZWF0ZUJ1ZmZlcihtaWRQb2ludHMuYnl0ZUxlbmd0aCwgJ25leHRNaWRQb2ludHMnKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IucmVuZGVyZXIuY3JlYXRlQnVmZmVyKHNpbXVsYXRvci5udW1FZGdlcyAqIGVsZW1lbnRzUGVyRWRnZSAqIHNpbXVsYXRvci5lbGVtZW50c1BlclBvaW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULCAnc3ByaW5ncycpLFxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5yZW5kZXJlci5jcmVhdGVCdWZmZXIobWlkUG9pbnRzLCAnY3VyTWlkUG9pbnRzJyksXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLmNyZWF0ZUJ1ZmZlcihzaW11bGF0b3IubnVtTWlkRWRnZXMgKiBlbGVtZW50c1BlckVkZ2UgKiBzaW11bGF0b3IuZWxlbWVudHNQZXJQb2ludCAqIEZsb2F0MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCwgJ21pZFNwcmluZ3MnKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IucmVuZGVyZXIuY3JlYXRlQnVmZmVyKHNpbXVsYXRvci5udW1NaWRFZGdlcyAqIGVsZW1lbnRzUGVyRWRnZSAqIHNpbXVsYXRvci5lbGVtZW50c1BlclBvaW50ICogRmxvYXQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5ULCAnbWlkU3ByaW5nc0NvbG9yQ29vcmQnKV0pO1xuICAgICAgICB9KVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uKGZvcndhcmRzRWRnZXNCdWZmZXIsIGZvcndhcmRzV29ya0l0ZW1zQnVmZmVyLCBiYWNrd2FyZHNFZGdlc0J1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICBiYWNrd2FyZHNXb3JrSXRlbXNCdWZmZXIsIG5leHRNaWRQb2ludHNCdWZmZXIsIHNwcmluZ3NWQk8sXG4gICAgICAgICAgICAgICAgICAgICAgICAgbWlkUG9pbnRzVkJPLCBtaWRTcHJpbmdzVkJPLCBtaWRTcHJpbmdzQ29sb3JDb29yZFZCTykge1xuICAgICAgICAgICAgLy8gQmluZCBidWZmZXJzXG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5mb3J3YXJkc0VkZ2VzID0gZm9yd2FyZHNFZGdlc0J1ZmZlcjtcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmZvcndhcmRzV29ya0l0ZW1zID0gZm9yd2FyZHNXb3JrSXRlbXNCdWZmZXI7XG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5iYWNrd2FyZHNFZGdlcyA9IGJhY2t3YXJkc0VkZ2VzQnVmZmVyO1xuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuYmFja3dhcmRzV29ya0l0ZW1zID0gYmFja3dhcmRzV29ya0l0ZW1zQnVmZmVyO1xuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMubmV4dE1pZFBvaW50cyA9IG5leHRNaWRQb2ludHNCdWZmZXI7XG5cbiAgICAgICAgICAgIHNpbXVsYXRvci5yZW5kZXJlci5idWZmZXJzLnNwcmluZ3MgPSBzcHJpbmdzVkJPO1xuICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLmJ1ZmZlcnMuY3VyTWlkUG9pbnRzID0gbWlkUG9pbnRzVkJPO1xuICAgICAgICAgICAgc2ltdWxhdG9yLnJlbmRlcmVyLmJ1ZmZlcnMubWlkU3ByaW5ncyA9IG1pZFNwcmluZ3NWQk87XG4gICAgICAgICAgICBzaW11bGF0b3IucmVuZGVyZXIuYnVmZmVycy5taWRTcHJpbmdzQ29sb3JDb29yZCA9IG1pZFNwcmluZ3NDb2xvckNvb3JkVkJPO1xuXG4gICAgICAgICAgICByZXR1cm4gUS5hbGwoW1xuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5jbC5jcmVhdGVCdWZmZXJHTChzcHJpbmdzVkJPLCAnc3ByaW5nc1BvcycpLFxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5jbC5jcmVhdGVCdWZmZXJHTChtaWRQb2ludHNWQk8sICdjdXJNaWRQb2ludHMnKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyR0wobWlkU3ByaW5nc1ZCTywgJ21pZFNwcmluZ3NQb3MnKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyR0wobWlkU3ByaW5nc0NvbG9yQ29vcmRWQk8sICdtaWRTcHJpbmdzQ29sb3JDb29yZCcpLFxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmZvcndhcmRzRWRnZXMud3JpdGUoZm9yd2FyZHNFZGdlcy5lZGdlc1R5cGVkKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5mb3J3YXJkc1dvcmtJdGVtcy53cml0ZShmb3J3YXJkc0VkZ2VzLndvcmtJdGVtc1R5cGVkKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5iYWNrd2FyZHNFZGdlcy53cml0ZShiYWNrd2FyZHNFZGdlcy5lZGdlc1R5cGVkKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5iYWNrd2FyZHNXb3JrSXRlbXMud3JpdGUoYmFja3dhcmRzRWRnZXMud29ya0l0ZW1zVHlwZWQpLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5zcHJlYWQoZnVuY3Rpb24oc3ByaW5nc0J1ZmZlciwgbWlkUG9pbnRzQnVmLCBtaWRTcHJpbmdzQnVmZmVyLCBtaWRTcHJpbmdzQ29sb3JDb29yZEJ1ZmZlcikge1xuICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuc3ByaW5nc1BvcyA9IHNwcmluZ3NCdWZmZXI7XG4gICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5taWRTcHJpbmdzUG9zID0gbWlkU3ByaW5nc0J1ZmZlcjtcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmN1ck1pZFBvaW50cyA9IG1pZFBvaW50c0J1ZjtcbiAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLm1pZFNwcmluZ3NDb2xvckNvb3JkID0gbWlkU3ByaW5nc0NvbG9yQ29vcmRCdWZmZXI7XG5cblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUUlkgQ09QWVwiKTtcblxuICAgICAgICAgICAgcmV0dXJuIFEoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAvL3JldHVybiBzaW11bGF0b3IuYnVmZmVycy5uZXh0TWlkUG9pbnRzLmNvcHlJbnRvKHNpbXVsYXRvci5idWZmZXJzLmN1ck1pZFBvaW50cyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICB9KS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiU1VDQ0VEIENPUFlcIilcbiAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRkFJTCBDT1BZXCIsIGVyciwgZXJyLnN0YWNrKVxuICAgICAgICAgICAgfSlcbiovXG5cblxuXG4gICAgICAgICAgICB2YXIgbG9jYWxQb3NTaXplID0gTWF0aC5taW4oc2ltdWxhdG9yLmNsLm1heFRocmVhZHMsIHNpbXVsYXRvci5udW1NaWRQb2ludHMpICogc2ltdWxhdG9yLmVsZW1lbnRzUGVyUG9pbnQgKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQ7XG4gICAgICAgICAgICB2YXIgbWlkUG9pbnRBcmdzID0gc2ltdWxhdG9yLm1pZFBvaW50S2VybmVsLnNldEFyZ3MoW1xuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gW3NpbXVsYXRvci5udW1NaWRQb2ludHNdIDogbmV3IFVpbnQzMkFycmF5KFtzaW11bGF0b3IubnVtTWlkUG9pbnRzXSksXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbc2ltdWxhdG9yLm51bVNwbGl0c10gOiBuZXcgVWludDMyQXJyYXkoW3NpbXVsYXRvci5udW1TcGxpdHNdKSxcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyTWlkUG9pbnRzLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMubmV4dE1pZFBvaW50cy5idWZmZXIsXG5cbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFtsb2NhbFBvc1NpemVdIDogbmV3IFVpbnQzMkFycmF5KFtsb2NhbFBvc1NpemVdKSxcblxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gW3NpbXVsYXRvci5kaW1lbnNpb25zWzBdXSA6IG5ldyBGbG9hdDMyQXJyYXkoW3NpbXVsYXRvci5kaW1lbnNpb25zWzBdXSksXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbc2ltdWxhdG9yLmRpbWVuc2lvbnNbMV1dIDogbmV3IEZsb2F0MzJBcnJheShbc2ltdWxhdG9yLmRpbWVuc2lvbnNbMV1dKSxcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFstMC4wMDAwMV0gOiBuZXcgRmxvYXQzMkFycmF5KFstMC4wMDAwMV0pLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gWzAuMl0gOiBuZXcgRmxvYXQzMkFycmF5KFswLjJdKSxcblxuICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5yYW5kVmFsdWVzLmJ1ZmZlcixcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFswXSA6IG5ldyBVaW50MzJBcnJheShbMF0pXSxcbiAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gW1xuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLlVJTlQsIHdlYmNsLnR5cGUuVUlOVCwgbnVsbCwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZS5MT0NBTF9NRU1PUllfU0laRSwgd2ViY2wudHlwZS5GTE9BVCwgd2ViY2wudHlwZS5GTE9BVCwgd2ViY2wudHlwZS5GTE9BVCx3ZWJjbC50eXBlLkZMT0FULFxuICAgICAgICAgICAgICAgIG51bGwsIHdlYmNsLnR5cGUuVUlOVF0gOiBudWxsKTtcblxuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnRURHRVMgS0VSTkVMIDAnKVxuICAgICAgICAgICAgdmFyIGVkZ2VBcmdzID0gc2ltdWxhdG9yLmVkZ2VzS2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgWyAgIG51bGwsIC8vZm9yd2FyZHMvYmFja3dhcmRzIHBpY2tlZCBkeW5hbWljYWxseVxuICAgICAgICAgICAgICAgICAgICBudWxsLCAvL2ZvcndhcmRzL2JhY2t3YXJkcyBwaWNrZWQgZHluYW1pY2FsbHlcbiAgICAgICAgICAgICAgICAgICAgbnVsbCwgLy9zaW11bGF0b3IuYnVmZmVycy5jdXJQb2ludHMuYnVmZmVyIHRoZW4gc2ltdWxhdG9yLmJ1ZmZlcnMubmV4dFBvaW50cy5idWZmZXJcbiAgICAgICAgICAgICAgICAgICAgbnVsbCwgLy9zaW11bGF0b3IuYnVmZmVycy5uZXh0UG9pbnRzLmJ1ZmZlciB0aGVuIHNpbXVsYXRvci5idWZmZXJzLmN1clBvaW50cy5idWZmZXJcbiAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuc3ByaW5nc1Bvcy5idWZmZXIsXG4gICAgICAgICAgICAgICAgICAgIHdlYmNsLnR5cGUgPyBbMS4wXSA6IG5ldyBGbG9hdDMyQXJyYXkoWzEuMF0pLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gWzAuMV0gOiBuZXcgRmxvYXQzMkFycmF5KFswLjFdKSxcbiAgICAgICAgICAgICAgICAgICAgbnVsbF0sXG4gICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULCB3ZWJjbC50eXBlLkZMT0FUXVxuICAgICAgICAgICAgICAgICAgICA6IG51bGwpO1xuXG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiTUlEIEVER0VTIDBcIilcbiAgICAgICAgICAgIHZhciBtaWRFZGdlQXJncyA9IHNpbXVsYXRvci5taWRFZGdlc0tlcm5lbC5zZXRBcmdzKFtcbiAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gW3NpbXVsYXRvci5udW1TcGxpdHNdIDogbmV3IFVpbnQzMkFycmF5KFtzaW11bGF0b3IubnVtU3BsaXRzXSksICAgICAgICAvLyAwOlxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLmZvcndhcmRzRWRnZXMuYnVmZmVyLCAgICAgICAgLy8gMTogb25seSBuZWVkIG9uZSBkaXJlY3Rpb24gYXMgZ3VhcmFudGVlZCB0byBiZSBjaGFpbnNcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5mb3J3YXJkc1dvcmtJdGVtcy5idWZmZXIsICAgIC8vIDI6XG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzLmJ1ZmZlciwgICAgICAgICAgICAvLyAzOlxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLm5leHRNaWRQb2ludHMuYnVmZmVyLCAgICAgICAgLy8gNDpcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5jdXJNaWRQb2ludHMuYnVmZmVyLCAgICAgICAgIC8vIDU6XG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMubWlkU3ByaW5nc1Bvcy5idWZmZXIsICAgICAgICAvLyA2OlxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLm1pZFNwcmluZ3NDb2xvckNvb3JkLmJ1ZmZlciwgLy8gNzpcbiAgICAgICAgICAgICAgICB3ZWJjbC50eXBlID8gWzEuMF0gOiBuZXcgRmxvYXQzMkFycmF5KFsxLjBdKSwgIC8vIDg6XG4gICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFswLjFdIDogbmV3IEZsb2F0MzJBcnJheShbMC4xXSksICAvLyA5OlxuICAgICAgICAgICAgICAgIG51bGxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFtcbiAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZS5VSU5ULCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLFxuICAgICAgICAgICAgICAgICAgICB3ZWJjbC50eXBlLkZMT0FULCB3ZWJjbC50eXBlLkZMT0FULCAvKndlYmNsLnR5cGUuVUlOVCovbnVsbFxuICAgICAgICAgICAgICAgIF0gOiBudWxsKTtcblxuICAgICAgICAgICAgcmV0dXJuIFEuYWxsKG1pZFBvaW50QXJncywgZWRnZUFyZ3MsIG1pZEVkZ2VBcmdzKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHNldExvY2tlZChzaW11bGF0b3IsIGNmZykge1xuICAgICAgICBjZmcgPSBjZmcgfHwge307XG4gICAgICAgIHV0aWwuZXh0ZW5kKHNpbXVsYXRvci5sb2NrZWQsIGNmZyk7XG4gICAgfVxuXG5cblxuICAgIHZhciB0b3RDZmcgPSB7fTtcblxuICAgIGZ1bmN0aW9uIHNldFBoeXNpY3Moc2ltdWxhdG9yLCBjZmcpIHtcbiAgICAgICAgLy8gVE9ETzogSW5zdGVhZCBvZiBzZXR0aW5nIHRoZXNlIGtlcm5lbCBhcmdzIGltbWVkaWF0ZWx5LCB3ZSBzaG91bGQgbWFrZSB0aGUgcGh5c2ljcyB2YWx1ZXNcbiAgICAgICAgLy8gcHJvcGVydGllcyBvZiB0aGUgc2ltdWxhdG9yIG9iamVjdCwgYW5kIGp1c3QgY2hhbmdlIHRob3NlIHByb3BlcnRpZXMuIFRoZW4sIHdoZW4gd2UgcnVuXG4gICAgICAgIC8vIHRoZSBrZXJuZWxzLCB3ZSBzZXQgdGhlIGFyZyB1c2luZyB0aGUgb2JqZWN0IHByb3BlcnR5ICh0aGUgc2FtZSB3YXkgd2Ugc2V0IHN0ZXBOdW1iZXIuKVxuXG4gICAgICAgIGNmZyA9IGNmZyB8fCB7fTtcblxuICAgICAgICBmb3IgKHZhciBpIGluIGNmZykge1xuICAgICAgICAgICAgdG90Q2ZnW2ldID0gY2ZnW2ldO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ1VQREFUSU5HIFBIWVNJQ1MnLCB0b3RDZmcsICcoZGVsdGE6JywgY2ZnLCAnKScpO1xuXG4gICAgICAgIGlmKGNmZy5jaGFyZ2UgfHwgY2ZnLmdyYXZpdHkpIHtcbiAgICAgICAgICAgIHZhciBjaGFyZ2UgPSBjZmcuY2hhcmdlID8gKHdlYmNsLnR5cGUgPyBbY2ZnLmNoYXJnZV0gOiBuZXcgRmxvYXQzMkFycmF5KFtjZmcuY2hhcmdlXSkpIDogbnVsbDtcbiAgICAgICAgICAgIHZhciBjaGFyZ2VfdCA9IGNmZy5jaGFyZ2UgPyBjbGpzLnR5cGVzLmZsb2F0X3QgOiBudWxsO1xuXG4gICAgICAgICAgICB2YXIgZ3Jhdml0eSA9IGNmZy5ncmF2aXR5ID8gKHdlYmNsLnR5cGUgPyBbY2ZnLmdyYXZpdHldIDogbmV3IEZsb2F0MzJBcnJheShbY2ZnLmdyYXZpdHldKSkgOiBudWxsO1xuICAgICAgICAgICAgdmFyIGdyYXZpdHlfdCA9IGNmZy5ncmF2aXR5ID8gY2xqcy50eXBlcy5mbG9hdF90IDogbnVsbDtcblxuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIlNFVFRJTkcgUE9JTlQgMVwiKVxuICAgICAgICAgICAgc2ltdWxhdG9yLnBvaW50S2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGNoYXJnZSwgZ3Jhdml0eSwgbnVsbCwgbnVsbF0sXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGNoYXJnZV90LCBncmF2aXR5X3QsIG51bGwsIG51bGxdKTtcblxuICAgICAgICAgICAgc2ltdWxhdG9yLm1pZFBvaW50S2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGNoYXJnZSwgZ3Jhdml0eSwgbnVsbCwgbnVsbF0sXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGNoYXJnZV90LCBncmF2aXR5X3QsIG51bGwsIG51bGxdKTtcblxuICAgICAgICB9XG5cbiAgICAgICAgaWYoY2ZnLmVkZ2VEaXN0YW5jZSB8fCBjZmcuZWRnZVN0cmVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgZWRnZURpc3RhbmNlID0gY2ZnLmVkZ2VEaXN0YW5jZSA/ICh3ZWJjbC50eXBlID8gW2NmZy5lZGdlRGlzdGFuY2VdIDogbmV3IEZsb2F0MzJBcnJheShbY2ZnLmVkZ2VEaXN0YW5jZV0pKSA6IG51bGw7XG4gICAgICAgICAgICB2YXIgZWRnZURpc3RhbmNlX3QgPSBjZmcuZWRnZURpc3RhbmNlID8gY2xqcy50eXBlcy5mbG9hdF90IDogbnVsbDtcblxuICAgICAgICAgICAgdmFyIGVkZ2VTdHJlbmd0aCA9IGNmZy5lZGdlU3RyZW5ndGggPyAod2ViY2wudHlwZSA/IFtjZmcuZWRnZVN0cmVuZ3RoXSA6IG5ldyBGbG9hdDMyQXJyYXkoW2NmZy5lZGdlU3RyZW5ndGhdKSkgOiBudWxsO1xuICAgICAgICAgICAgdmFyIGVkZ2VTdHJlbmd0aF90ID0gY2ZnLmVkZ2VTdHJlbmd0aCA/IGNsanMudHlwZXMuZmxvYXRfdCA6IG51bGw7XG5cbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJFREdFUyBLRVJORUwgMVwiKVxuICAgICAgICAgICAgc2ltdWxhdG9yLmVkZ2VzS2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGVkZ2VTdHJlbmd0aCwgZWRnZURpc3RhbmNlLCBudWxsXSxcbiAgICAgICAgICAgICAgICBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgZWRnZVN0cmVuZ3RoX3QsIGVkZ2VEaXN0YW5jZV90LCBudWxsXSk7XG5cbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJNSUQgRURHRVMgMVwiKVxuICAgICAgICAgICAgc2ltdWxhdG9yLm1pZEVkZ2VzS2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgLy8gMCAgIDEgICAgIDIgICAgIDMgICAgIDQgICAgIDUgICAgIDYgICAgIDcgICAgIDggICAgICAgICAgICAgICA5ICAgICAgICAgICAgICAgMTBcbiAgICAgICAgICAgICAgICBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgZWRnZVN0cmVuZ3RoLCAgIGVkZ2VEaXN0YW5jZSwgICBudWxsXSxcbiAgICAgICAgICAgICAgICBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgZWRnZVN0cmVuZ3RoX3QsIGVkZ2VEaXN0YW5jZV90LCBudWxsXSk7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIHRpY2soc2ltdWxhdG9yLCBzdGVwTnVtYmVyKSB7XG5cbiAgICAgICAgZnVuY3Rpb24gZWRnZUtlcm5lbFNlcSAoZWRnZXMsIHdvcmtJdGVtcywgbnVtV29ya0l0ZW1zLCBmcm9tUG9pbnRzLCB0b1BvaW50cykge1xuXG4gICAgICAgICAgICB2YXIgYnVmcyA9IFtlZGdlcywgd29ya0l0ZW1zLCBmcm9tUG9pbnRzLCB0b1BvaW50cywgc2ltdWxhdG9yLmJ1ZmZlcnMuc3ByaW5nc1Bvc107XG5cbiAgICAgICAgICAgIHJldHVybiBRKClcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNpbXVsYXRvci5lZGdlc0tlcm5lbC5zZXRBcmdzKFxuICAgICAgICAgICAgICAgICAgICAgICAgW2VkZ2VzLmJ1ZmZlciwgd29ya0l0ZW1zLmJ1ZmZlciwgZnJvbVBvaW50cy5idWZmZXIsIHRvUG9pbnRzLmJ1ZmZlciwgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICBudWxsLCBudWxsLCB3ZWJjbC50eXBlID8gW3N0ZXBOdW1iZXJdIDogbmV3IFVpbnQzMkFycmF5KFtzdGVwTnVtYmVyXSldLFxuICAgICAgICAgICAgICAgICAgICAgICAgd2ViY2wudHlwZSA/IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgIG51bGwsIG51bGwsIGNsanMudHlwZXMudWludF90XSA6IG51bGwpO1xuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUS5hbGwoYnVmcy5tYXAoZnVuY3Rpb24gKGJ1ZikgeyByZXR1cm4gYnVmLmFjcXVpcmUoKTsgfSkpO1xuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAvL3JldHVybiBRKGNvbnNvbGUuZXJyb3IoXCJTS0lQIEVER0VcIikpXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ2VkZ2UgY2FsbCcsIGNsanMudHlwZXMudWludF90LCBudW1Xb3JrSXRlbXMpXG4gICAgICAgICAgICAgICAgICAgIHNpbXVsYXRvci5lZGdlc0tlcm5lbC5jYWxsKG51bVdvcmtJdGVtcywgW10pO1xuICAgICAgICAgICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gUS5hbGwoYnVmcy5tYXAoZnVuY3Rpb24gKGJ1ZikgeyByZXR1cm4gYnVmLnJlbGVhc2UoKTsgfSkpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbm8gcG9pbnRzIGluIHRoZSBncmFwaCwgZG9uJ3QgcnVuIHRoZSBzaW11bGF0aW9uXG4gICAgICAgIGlmKHNpbXVsYXRvci5udW1Qb2ludHMgPCAxKSB7XG4gICAgICAgICAgICByZXR1cm4gUShzaW11bGF0b3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICAgICAgICAvLyBSdW4gdGhlIHBvaW50cyBrZXJuZWxcbiAgICAgICAgcmV0dXJuIFEoKVxuICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdTRVRUSU5HIFBPSU5UIDInKVxuICAgICAgICAgICAgc2ltdWxhdG9yLnBvaW50S2VybmVsLnNldEFyZ3MoXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIHdlYmNsLnR5cGUgPyBbc3RlcE51bWJlcl0gOiBuZXcgVWludDMyQXJyYXkoW3N0ZXBOdW1iZXJdKV0sXG4gICAgICAgICAgICAgICAgW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGwsIGNsanMudHlwZXMudWludF90XSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ2FjcXVpcmluZycpXG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzLmFjcXVpcmUoKTsgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCd+fn5+fnJ1biBwb2ludCcsICdsb2NrZWQ/Jywgc2ltdWxhdG9yLmxvY2tlZC5sb2NrUG9pbnRzID8gdHJ1ZSA6IGZhbHNlKVxuICAgICAgICAgICAgcmV0dXJuIHNpbXVsYXRvci5sb2NrZWQubG9ja1BvaW50cyA/IGZhbHNlIDogc2ltdWxhdG9yLnBvaW50S2VybmVsLmNhbGwoc2ltdWxhdG9yLm51bVBvaW50cywgW10pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzLnJlbGVhc2UoKTsgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHNpbXVsYXRvci5idWZmZXJzLm5leHRQb2ludHMuY29weUludG8oc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzKTsgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdiYWQgcnVuIHBvaW50IGNhbGwnLCBlcnIpO1xuICAgICAgICAgICAgICAgIHJldHVybiBlcnI7XG4gICAgICAgICAgICB9KVxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ2NvcGllZD8nKVxuICAgICAgICAgICAgaWYoc2ltdWxhdG9yLm51bUVkZ2VzID4gMCkge1xuICAgICAgICAgICAgICAgIGlmIChzaW11bGF0b3IubG9ja2VkLmxvY2tFZGdlcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCd+fn5+fnNpbSBsb2NrZWQsIFNLSVAnKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ0VER0UgU0VRIGxvY2tlZD8gZmFsc2UnKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVkZ2VLZXJuZWxTZXEoXG4gICAgICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5mb3J3YXJkc0VkZ2VzLCBzaW11bGF0b3IuYnVmZmVycy5mb3J3YXJkc1dvcmtJdGVtcywgc2ltdWxhdG9yLm51bUZvcndhcmRzV29ya0l0ZW1zLFxuICAgICAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyUG9pbnRzLCBzaW11bGF0b3IuYnVmZmVycy5uZXh0UG9pbnRzKVxuICAgICAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdmb3J3YXJkLCBub3cgYmFjaycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVkZ2VLZXJuZWxTZXEoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuYmFja3dhcmRzRWRnZXMsIHNpbXVsYXRvci5idWZmZXJzLmJhY2t3YXJkc1dvcmtJdGVtcywgc2ltdWxhdG9yLm51bUJhY2t3YXJkc1dvcmtJdGVtcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5uZXh0UG9pbnRzLCBzaW11bGF0b3IuYnVmZmVycy5jdXJQb2ludHMpOyB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ2JhZCBlZGdlIHNlcSBjYWxsJywgZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4gICAgICAgIC8vIFJ1biB0aGUgZWRnZXMga2VybmVsXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1NFVCBNSURQT0lOVCcpXG5cbiAgICAgICAgICAgIHNpbXVsYXRvci5taWRQb2ludEtlcm5lbC5zZXRBcmdzKFxuICAgICAgICAgICAgICAgIFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCB3ZWJjbC50eXBlID8gW3N0ZXBOdW1iZXJdIDogbmV3IFVpbnQzMkFycmF5KFtzdGVwTnVtYmVyXSldLFxuICAgICAgICAgICAgICAgIFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBjbGpzLnR5cGVzLnVpbnRfdF0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ01JRFBPSU5UIFJFQURZJylcbiAgICAgICAgICAgIHJldHVybiBRLmFsbChbXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyTWlkUG9pbnRzLmFjcXVpcmUoKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5taWRTcHJpbmdzQ29sb3JDb29yZC5hY3F1aXJlKClcbiAgICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnQ0FMTCBNSURQT0lOVCcsICdsb2NrZWQ/Jywgc2ltdWxhdG9yLmxvY2tlZC5sb2NrTWlkcG9pbnRzKVxuICAgICAgICAgICAgcmV0dXJuIHNpbXVsYXRvci5sb2NrZWQubG9ja01pZHBvaW50cyA/IHNpbXVsYXRvciA6IHNpbXVsYXRvci5taWRQb2ludEtlcm5lbC5jYWxsKHNpbXVsYXRvci5udW1NaWRQb2ludHMsIFtdKTsgIC8vIEFQUExZIE1JRC1GT1JDRVNcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIFEuYWxsKFtcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5jdXJNaWRQb2ludHMucmVsZWFzZSgpLFxuICAgICAgICAgICAgICAgIHNpbXVsYXRvci5idWZmZXJzLm1pZFNwcmluZ3NDb2xvckNvb3JkLnJlbGVhc2UoKVxuICAgICAgICAgICAgXSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy9yZXR1cm4gY29uc29sZS5lcnJvcihcIlNLSVAgQ09QWSBNSURcIilcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ0NPUFkgTUlEUE9JTlQnKVxuXG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgICAgdmFyIG1lbVNpemUgPSAxIDw8IDU7XG4gICAgICAgICAgICAgICAgdmFyIGhfaWRhdGEgPSBuZXcgVWludDhBcnJheShtZW1TaXplKTtcbiAgICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgbWVtU2l6ZTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGhfaWRhdGFbaV0gPSAoaSAmIDB4ZmYpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB2YXIgYSwgYjtcbiAgICAgICAgICAgICAgICByZXR1cm4gUS5hbGwoW1xuICAgICAgICAgICAgICAgICAgICBzaW11bGF0b3IuY2wuY3JlYXRlQnVmZmVyKG1lbVNpemUsICdkX2lkYXRhJyksXG4gICAgICAgICAgICAgICAgICAgIHNpbXVsYXRvci5jbC5jcmVhdGVCdWZmZXJHTChzaW11bGF0b3IucmVuZGVyZXIuY3JlYXRlQnVmZmVyKGhfaWRhdGEsICdkX29kYXRhX2Jhc2UnKSwgJ2Rfb2RhdGEnKV0pXG4gICAgICAgICAgICAgICAgLnNwcmVhZChmdW5jdGlvbiAoZF9pZGF0YSwgZF9vZGF0YSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdnb3QnKVxuICAgICAgICAgICAgICAgICAgICBhID0gZF9pZGF0YTtcbiAgICAgICAgICAgICAgICAgICAgYiA9IGRfb2RhdGE7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRfaWRhdGEud3JpdGUoaF9pZGF0YSk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJXUk9URVwiKVxuICAgICAgICAgICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgMTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhLmNvcHlJbnRvKGIpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZBSUwgV1JJVEUgVEVTVCcsIGVyciwgZXJyLnN0YWNrKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiUEFTUyBDT1BZIFRFU1RcIilcblxuICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZBSUxFRCBDT1BZIFRFU1RcIilcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcblxuXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yLmJ1ZmZlcnMubmV4dE1pZFBvaW50cy5jb3B5SW50byhzaW11bGF0b3IuYnVmZmVycy5jdXJNaWRQb2ludHMpO1xuXG5cbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY29uc29sZS5kZWJ1Zygnfn5+fn5NSUQgRURHRVMgMicsICdsb2NrZWQ/Jywgc2ltdWxhdG9yLmxvY2tlZC5sb2NrTWlkZWRnZXMpXG4gICAgICAgICAgICBpZiAoc2ltdWxhdG9yLm51bUVkZ2VzID4gMCAmJiAhc2ltdWxhdG9yLmxvY2tlZC5sb2NrTWlkZWRnZXMpIHtcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IubWlkRWRnZXNLZXJuZWwuc2V0QXJncyhcbiAgICAgICAgICAgICAgICAgICAgLy8gMCAgIDEgICAgIDIgICAgIDMgICAgIDQgICAgIDUgICAgIDYgICAgIDcgICAgIDggICAgIDkgICAgIDEwXG4gICAgICAgICAgICAgICAgICAgIFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsLCB3ZWJjbC50eXBlID8gW3N0ZXBOdW1iZXJdIDogbmV3IFVpbnQzMkFycmF5KFtzdGVwTnVtYmVyXSldLFxuICAgICAgICAgICAgICAgICAgICBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgY2xqcy50eXBlcy51aW50X3RdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yLm1pZEVkZ2VzS2VybmVsLmNhbGwoc2ltdWxhdG9yLm51bUZvcndhcmRzV29ya0l0ZW1zLCBbXSlcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNpbXVsYXRvcjtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdiYWRkZGQnLCBlcnIsIGVyci5zdGFjaylcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdyZWxlYXNlIG1pZHBvaW50JylcbiAgICAgICAgICAgIHJldHVybiBRLmFsbChbXG4gICAgICAgICAgICAgICAgc2ltdWxhdG9yLmJ1ZmZlcnMuY3VyTWlkUG9pbnRzLnJlbGVhc2UoKSxcbiAgICAgICAgICAgICAgICBzaW11bGF0b3IuYnVmZmVycy5taWRTcHJpbmdzQ29sb3JDb29yZC5yZWxlYXNlKClcbiAgICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ3EgZmluaXNoJylcbiAgICAgICAgICAgIHNpbXVsYXRvci5jbC5xdWV1ZS5maW5pc2goKTsgLy9GSVhNRSB1c2UgY2FsbGJhY2sgYXJnXG4gICAgICAgICAgICByZXR1cm4gc2ltdWxhdG9yO1xuICAgICAgICB9KTtcbiAgICB9XG5cblxuICAgIG1vZHVsZS5leHBvcnRzID0ge1xuICAgICAgICBcImNyZWF0ZVwiOiBjcmVhdGUsXG4gICAgICAgIFwic2V0TG9ja2VkXCI6IHNldExvY2tlZCxcbiAgICAgICAgXCJzZXRQb2ludHNcIjogc2V0UG9pbnRzLFxuICAgICAgICBcInNldEVkZ2VzXCI6IHNldEVkZ2VzLFxuICAgICAgICBcInRpY2tcIjogdGlja1xuICAgIH07XG4iLCJcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICB2YXIgZXhwb3J0cyA9IHt9O1xuXG4gICAgLy8gQSBtb2R1bGUtbGV2ZWwgbGlzdCBvZiBhbGwgdGhlIGV2ZW50IGxpc3RlbmVyc1xuICAgIHZhciBsaXN0ZW5lcnMgPSB7fTtcblxuXG4gICAgZXhwb3J0cy5saXN0ZW4gPSBmdW5jdGlvbihldmVudCwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIGV2ZW50TGlzdGVuZXJzID0gbGlzdGVuZXJzW2V2ZW50XSB8fCBbXTtcbiAgICAgICAgZXZlbnRMaXN0ZW5lcnMucHVzaChjYWxsYmFjayk7XG4gICAgICAgIGxpc3RlbmVyc1tldmVudF0gPSBldmVudExpc3RlbmVycztcbiAgICB9O1xuXG5cbiAgICAvLyBUT0RPOiBhZGQgJ3JlbW92ZScgZnVuY3Rpb25cblxuXG4gICAgZXhwb3J0cy5maXJlID0gZnVuY3Rpb24oZXZlbnQsIGFyZ3MpIHtcbiAgICAgICAgdmFyIGV2ZW50TGlzdGVuZXJzID0gbGlzdGVuZXJzW2V2ZW50XSB8fCBbXTtcblxuICAgICAgICBmb3IodmFyIGkgaW4gZXZlbnRMaXN0ZW5lcnMpIHtcbiAgICAgICAgICAgIGV2ZW50TGlzdGVuZXJzW2ldLmNhbGwodGhpcywgYXJncyk7XG4gICAgICAgIH1cbiAgICB9O1xuXG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHM7XG4iLCJ2YXIgUSA9IHJlcXVpcmUoJ3EnKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL1NpbXBsZUV2ZW50cy5qcycpO1xuXG5pZiAodHlwZW9mKHdpbmRvdykgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB3ZWJjbCA9IHJlcXVpcmUoJ25vZGUtd2ViY2wnKTtcbiAgICBjb25zb2xlLmRlYnVnID0gY29uc29sZS5sb2c7XG59XG5cblxudmFyIGdldENsQ29udGV4dDtcbmlmICh0eXBlb2Yod2luZG93KSA9PSAndW5kZWZpbmVkJykge1xuICAgIGNvbnNvbGUuZGVidWcoXCJOT0RFQ0xcIilcbiAgICB2YXIgQ3JlYXRlQ29udGV4dCA9IGZ1bmN0aW9uKHdlYmNsLCBnbCwgcGxhdGZvcm0sIGRldmljZXMpIHtcbiAgICAgICAgcmV0dXJuIHdlYmNsLmNyZWF0ZUNvbnRleHQoe1xuICAgICAgICAgICAgZGV2aWNlczogZGV2aWNlcyxcbiAgICAgICAgICAgIHNoYXJlR3JvdXA6IGdsLFxuICAgICAgICAgICAgcGxhdGZvcm06IHBsYXRmb3JtfSk7XG4gICAgfTtcbiAgICB2YXIgQ3JlYXRlQ0wgPSBmdW5jdGlvbih3ZWJjbCwgZ2wpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB3ZWJjbCA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiV2ViQ0wgZG9lcyBub3QgYXBwZWFyIHRvIGJlIHN1cHBvcnRlZCBpbiB5b3VyIGJyb3dzZXJcIik7XG4gICAgICAgIH0gZWxzZSBpZiAod2ViY2wgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGFjY2VzcyBXZWJDTCBvYmplY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIHBsYXRmb3JtcyA9IHdlYmNsLmdldFBsYXRmb3JtcygpO1xuICAgICAgICBpZiAocGxhdGZvcm1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmluZCBhbnkgV2ViQ0wgcGxhdGZvcm1zXCIpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IHBsYXRmb3Jtc1swXTtcbiAgICAgICAgdmFyIGRldmljZXMgPSBwbGF0Zm9ybS5nZXREZXZpY2VzKHdlYmNsLkRFVklDRV9UWVBFX0dQVSkubWFwKGZ1bmN0aW9uKGQpIHtcbiAgICAgICAgICAgIHZhciB3b3JrSXRlbXMgPSBkLmdldEluZm8od2ViY2wuREVWSUNFX01BWF9XT1JLX0lURU1fU0laRVMpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBkZXZpY2U6IGQsXG4gICAgICAgICAgICAgICAgY29tcHV0ZVVuaXRzOiB3b3JrSXRlbXMucmVkdWNlKGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGEgKiBiO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZGV2aWNlcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHZhciBuYW1lQSA9IGEuZGV2aWNlLmdldEluZm8od2ViY2wuREVWSUNFX1ZFTkRPUik7XG4gICAgICAgICAgICB2YXIgbmFtZUIgPSBiLmRldmljZS5nZXRJbmZvKHdlYmNsLkRFVklDRV9WRU5ET1IpO1xuICAgICAgICAgICAgdmFyIHZlbmRvciA9IFwiTlZJRElBXCJcbiAgICAgICAgICAgIGlmIChuYW1lQS5pbmRleE9mKHZlbmRvcikgIT0gLTEgJiYgbmFtZUIuaW5kZXhPZih2ZW5kb3IpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lQi5pbmRleE9mKHZlbmRvcikgIT0gLTEgJiYgbmFtZUEuaW5kZXhPZih2ZW5kb3IpID09IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBiLmNvbXB1dGVVbml0cyAtIGEuY29tcHV0ZVVuaXRzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdmFyIGRldmljZVdyYXBwZXI7XG4gICAgICAgIHZhciBlcnIgPSBkZXZpY2VzLmxlbmd0aCA/IG51bGwgOiBuZXcgRXJyb3IoXCJObyBXZWJDTCBkZXZpY2VzIG9mIHNwZWNpZmllZCB0eXBlIChcIiArIHdlYmNsLkRFVklDRV9UWVBFX0dQVSArIFwiKSBmb3VuZFwiKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZXZpY2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgd3JhcHBlZCA9IGRldmljZXNbaV07XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGlmICh3cmFwcGVkLmRldmljZS5nZXRJbmZvKHdlYmNsLkRFVklDRV9FWFRFTlNJT05TKS5zZWFyY2goL2dsLnNoYXJpbmcvaSkgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJyAgU2tpcHBpbmcgZGV2aWNlIGR1ZSB0byBubyBzaGFyaW5nJywgaSwgd3JhcHBlZCk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3cmFwcGVkLmNvbnRleHQgPSBDcmVhdGVDb250ZXh0KHdlYmNsLCBnbCwgcGxhdGZvcm0sIFsgd3JhcHBlZC5kZXZpY2UgXSk7XG4gICAgICAgICAgICAgICAgaWYgKHdyYXBwZWQuY29udGV4dCA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcIkVycm9yIGNyZWF0aW5nIFdlYkNMIGNvbnRleHRcIik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdyYXBwZWQucXVldWUgPSB3cmFwcGVkLmNvbnRleHQuY3JlYXRlQ29tbWFuZFF1ZXVlKHdyYXBwZWQuZGV2aWNlLCAwKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiICBTa2lwcGluZyBkZXZpY2UgZHVlIHRvIGVycm9yXCIsIGksIHdyYXBwZWQsIGUpO1xuICAgICAgICAgICAgICAgIGVyciA9IGU7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZXZpY2VXcmFwcGVyID0gd3JhcHBlZDtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGlmICghZGV2aWNlV3JhcHBlcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCIgIERldmljZVwiLCBkZXZpY2VXcmFwcGVyLCBkZXZpY2VXcmFwcGVyLmRldmljZS5nZXRJbmZvKHdlYmNsLkRFVklDRV9WRU5ET1IpKTtcblxuICAgICAgICB2YXIgcmVzID0ge1xuICAgICAgICAgICAgZ2w6IGdsLFxuICAgICAgICAgICAgY2w6IHdlYmNsLFxuICAgICAgICAgICAgY29udGV4dDogZGV2aWNlV3JhcHBlci5jb250ZXh0LFxuICAgICAgICAgICAgZGV2aWNlOiBkZXZpY2VXcmFwcGVyLmRldmljZSxcbiAgICAgICAgICAgIHF1ZXVlOiBkZXZpY2VXcmFwcGVyLnF1ZXVlLFxuICAgICAgICAgICAgbWF4VGhyZWFkczogZGV2aWNlV3JhcHBlci5kZXZpY2UuZ2V0SW5mbyh3ZWJjbC5ERVZJQ0VfTUFYX1dPUktfR1JPVVBfU0laRSksXG4gICAgICAgICAgICBudW1Db3JlczogZGV2aWNlV3JhcHBlci5kZXZpY2UuZ2V0SW5mbyh3ZWJjbC5ERVZJQ0VfTUFYX0NPTVBVVEVfVU5JVFMpXG4gICAgICAgIH07XG5cbiAgICAgICAgLy9GSVhNRSA/P1xuICAgICAgICByZXMuY29tcGlsZSA9IGNvbXBpbGUuYmluZCh0aGlzLCByZXMpO1xuICAgICAgICByZXMuY3JlYXRlQnVmZmVyID0gY3JlYXRlQnVmZmVyLmJpbmQodGhpcywgcmVzKTtcbiAgICAgICAgcmVzLmNyZWF0ZUJ1ZmZlckdMID0gY3JlYXRlQnVmZmVyR0wuYmluZCh0aGlzLCByZXMpO1xuXG4gICAgICAgIHJldHVybiByZXM7XG5cbiAgICB9O1xuICAgIGdldENsQ29udGV4dCA9IGZ1bmN0aW9uIChnbCkge1xuICAgICAgICByZXR1cm4gQ3JlYXRlQ0wod2ViY2wsIGdsKTtcbiAgICB9XG59IGVsc2Uge1xuICAgIGdldENsQ29udGV4dCA9IGZ1bmN0aW9uIChnbCkge1xuICAgICAgICBpZiAodHlwZW9mKHdlYmNsKSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiV2ViQ0wgZG9lcyBub3QgYXBwZWFyIHRvIGJlIHN1cHBvcnRlZCBpbiB5b3VyIGJyb3dzZXJcIik7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2wgPSB3ZWJjbDtcbiAgICAgICAgaWYgKGNsID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBhY2Nlc3MgV2ViQ0wgb2JqZWN0XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHBsYXRmb3JtcyA9IGNsLmdldFBsYXRmb3JtcygpO1xuICAgICAgICBpZiAocGxhdGZvcm1zLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmluZCBhbnkgV2ViQ0wgcGxhdGZvcm1zXCIpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBwbGF0Zm9ybSA9IHBsYXRmb3Jtc1swXTtcblxuICAgICAgICAvL3NvcnQgYnkgbnVtYmVyIG9mIGNvbXB1dGUgdW5pdHMgYW5kIHVzZSBmaXJzdCBub24tZmFpbGluZyBkZXZpY2VcbiAgICAgICAgdmFyIGRldmljZXMgPSBwbGF0Zm9ybS5nZXREZXZpY2VzKGNsLkRFVklDRV9UWVBFX0FMTCkubWFwKGZ1bmN0aW9uIChkKSB7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHR5cGVUb1N0cmluZyAodikge1xuICAgICAgICAgICAgICAgIHJldHVybiB2ID09IDIgPyAnQ1BVJ1xuICAgICAgICAgICAgICAgICAgICA6IHYgPT0gNCA/ICdHUFUnXG4gICAgICAgICAgICAgICAgICAgIDogdiA9PSA4ID8gJ0FDQ0VMRVJBVE9SJ1xuICAgICAgICAgICAgICAgICAgICA6ICgndW5rbm93biB0eXBlOiAnICsgdik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB3b3JrSXRlbXMgPSBkLmdldEluZm8oY2wuREVWSUNFX01BWF9XT1JLX0lURU1fU0laRVMpO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGRldmljZTogZCxcbiAgICAgICAgICAgICAgICBERVZJQ0VfVFlQRTogdHlwZVRvU3RyaW5nKGQuZ2V0SW5mbyhjbC5ERVZJQ0VfVFlQRSkpLFxuICAgICAgICAgICAgICAgIERFVklDRV9NQVhfV09SS19JVEVNX1NJWkVTOiB3b3JrSXRlbXMsXG4gICAgICAgICAgICAgICAgY29tcHV0ZVVuaXRzOiBbXS5zbGljZS5jYWxsKHdvcmtJdGVtcywgMCkucmVkdWNlKGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiBhICogYjsgfSlcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgICBkZXZpY2VzLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHsgcmV0dXJuIGIuY29tcHV0ZVVuaXRzIC0gYS5jb21wdXRlVW5pdHM7IH0pO1xuXG4gICAgICAgIHZhciBkZXZpY2VXcmFwcGVyO1xuICAgICAgICB2YXIgZXJyID0gZGV2aWNlcy5sZW5ndGggP1xuICAgICAgICAgICAgbnVsbCA6IG5ldyBFcnJvcihcIk5vIFdlYkNMIGRldmljZXMgb2Ygc3BlY2lmaWVkIHR5cGUgKFwiICsgY2wuREVWSUNFX1RZUEVfQUxMICsgXCIpIGZvdW5kXCIpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRldmljZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciB3cmFwcGVkID0gZGV2aWNlc1tpXTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgd3JhcHBlZC5jb250ZXh0ID0gX2NyZWF0ZUNvbnRleHQoY2wsIGdsLCBwbGF0Zm9ybSwgW3dyYXBwZWQuZGV2aWNlXSlcbiAgICAgICAgICAgICAgICBpZiAod3JhcHBlZC5jb250ZXh0ID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IEVycm9yKFwiRXJyb3IgY3JlYXRpbmcgV2ViQ0wgY29udGV4dFwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgd3JhcHBlZC5xdWV1ZSA9IHdyYXBwZWQuY29udGV4dC5jcmVhdGVDb21tYW5kUXVldWUod3JhcHBlZC5kZXZpY2UsIG51bGwpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIgIFNraXBwaW5nIGRldmljZSBkdWUgdG8gZXJyb3JcIiwgaSwgd3JhcHBlZCwgZSk7XG4gICAgICAgICAgICAgICAgZXJyID0gZTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRldmljZVdyYXBwZXIgPSB3cmFwcGVkO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFkZXZpY2VXcmFwcGVyKSB7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmRlYnVnKFwiICBEZXZpY2VcIiwgZGV2aWNlV3JhcHBlcik7XG5cbiAgICAgICAgdmFyIGNsT2JqID0ge1xuICAgICAgICAgICAgXCJnbFwiOiBnbCxcbiAgICAgICAgICAgIFwiY2xcIjogY2wsXG4gICAgICAgICAgICBcImNvbnRleHRcIjogZGV2aWNlV3JhcHBlci5jb250ZXh0LFxuICAgICAgICAgICAgXCJkZXZpY2VcIjogZGV2aWNlV3JhcHBlci5kZXZpY2UsXG4gICAgICAgICAgICBcInF1ZXVlXCI6IGRldmljZVdyYXBwZXIucXVldWUsXG4gICAgICAgICAgICBcIm1heFRocmVhZHNcIjogZGV2aWNlV3JhcHBlci5kZXZpY2UuZ2V0SW5mbyhjbC5ERVZJQ0VfTUFYX1dPUktfR1JPVVBfU0laRSksXG4gICAgICAgICAgICBcIm51bUNvcmVzXCI6IGRldmljZVdyYXBwZXIuZGV2aWNlLmdldEluZm8oY2wuREVWSUNFX01BWF9DT01QVVRFX1VOSVRTKVxuICAgICAgICB9O1xuXG4gICAgICAgIGNsT2JqLmNvbXBpbGUgPSBjb21waWxlLmJpbmQodGhpcywgY2xPYmopO1xuICAgICAgICBjbE9iai5jcmVhdGVCdWZmZXIgPSBjcmVhdGVCdWZmZXIuYmluZCh0aGlzLCBjbE9iaik7XG4gICAgICAgIGNsT2JqLmNyZWF0ZUJ1ZmZlckdMID0gY3JlYXRlQnVmZmVyR0wuYmluZCh0aGlzLCBjbE9iaik7XG5cbiAgICAgICAgcmV0dXJuIGNsT2JqO1xuICAgIH07XG59XG5cblxuXG5cblxuXG4vLyBUT0RPOiBpbiBjYWxsKCkgYW5kIHNldGFyZ3MoKSwgd2UgY3VycmVudGx5IHJlcXVpcmVzIGEgYGFyZ1R5cGVzYCBhcmd1bWVudCBiZWN1YXNlIG9sZGVyIFdlYkNMXG4vLyB2ZXJzaW9ucyByZXF1aXJlIHVzIHRvIHBhc3MgaW4gdGhlIHR5cGUgb2Yga2VybmVsIGFyZ3MuIEhvd2V2ZXIsIGN1cnJlbnQgdmVyc2lvbnMgZG8gbm90LiBXZSB3YW50XG4vLyB0byBrZWVwIHRoaXMgQVBJIGFzIGNsb3NlIHRvIHRoZSBjdXJyZW50IFdlYkNMIHNwZWMgYXMgcG9zc2libGUuIFRoZXJlZm9yZSwgd2Ugc2hvdWxkIG5vdCByZXF1aXJlXG4vLyB0aGF0IGFyZ3VtZW50LCBldmVuIG9uIG9sZCB2ZXJzaW9ucy4gSW5zdGVhZCwgd2Ugc2hvdWxkIHF1ZXJ5IHRoZSBrZXJuZWwgZm9yIHRoZSB0eXBlcyBvZiBlYWNoXG4vLyBhcmd1bWVudCBhbmQgZmlsbCBpbiB0aGF0IGluZm9ybWF0aW9uIGF1dG9tYXRpY2FsbHksIHdoZW4gcmVxdWlyZWQgYnkgb2xkIFdlYkNMIHZlcnNpb25zLlxuXG5cbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgY3JlYXRlID0gUS5wcm9taXNlZChnZXRDbENvbnRleHQpO1xuXG5cbiAgICAvLyBUaGlzIGlzIGEgc2VwYXJhdGUgZnVuY3Rpb24gZnJvbSBjcmVhdGUoKSBpbiBvcmRlciB0byBhbGxvdyBwb2x5ZmlsbCgpIHRvIG92ZXJyaWRlIGl0IG9uXG4gICAgLy8gb2xkZXIgV2ViQ0wgcGxhdGZvcm1zLCB3aGljaCBoYXZlIGEgZGlmZmVyZW50IHdheSBvZiBjcmVhdGluZyBhIGNvbnRleHQgYW5kIGVuYWJsaW5nIENMLUdMXG4gICAgLy8gc2hhcmluZy5cbiAgICB2YXIgX2NyZWF0ZUNvbnRleHQgPSBmdW5jdGlvbihjbCwgZ2wsIHBsYXRmb3JtLCBkZXZpY2VzKSB7XG4gICAgICAgIGNsLmVuYWJsZUV4dGVuc2lvbihcIktIUl9HTF9TSEFSSU5HXCIpO1xuICAgICAgICByZXR1cm4gY2wuY3JlYXRlQ29udGV4dChnbCwgZGV2aWNlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29tcGlsZSB0aGUgV2ViQ0wgcHJvZ3JhbSBzb3VyY2UgYW5kIHJldHVybiB0aGUga2VybmVsKHMpIHJlcXVlc3RlZFxuICAgICAqXG4gICAgICogQHBhcmFtIGNsIC0gdGhlIGNsanMgaW5zdGFuY2Ugb2JqZWN0XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHNvdXJjZSAtIHRoZSBzb3VyY2UgY29kZSBvZiB0aGUgV2ViQ0wgcHJvZ3JhbSB5b3Ugd2lzaCB0byBjb21waWxlXG4gICAgICogQHBhcmFtIHsoc3RyaW5nfHN0cmluZ1tdKX0ga2VybmVscyAtIHRoZSBrZXJuZWwgbmFtZShzKSB5b3Ugd2lzaCB0byBnZXQgZnJvbSB0aGUgY29tcGlsZWQgcHJvZ3JhbVxuICAgICAqXG4gICAgICogQHJldHVybnMgeyhrZXJuZWx8T2JqZWN0LjxzdHJpbmcsIGtlcm5lbD4pfSBJZiBrZXJuZWxzIHdhcyBhIHNpbmdsZSBrZXJuZWwgbmFtZSwgcmV0dXJucyBhXG4gICAgICogICAgICAgICAgc2luZ2xlIGtlcm5lbC4gSWYga2VybmVscyB3YXMgYW4gYXJyYXkgb2Yga2VybmVsIG5hbWVzLCByZXR1cm5zIGFuIG9iamVjdCB3aXRoIGVhY2hcbiAgICAgKiAgICAgICAgICBrZXJuZWwgbmFtZSBtYXBwZWQgdG8gaXRzIGtlcm5lbCBvYmplY3QuXG4gICAgICovXG4gICAgdmFyIGNvbXBpbGUgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChjbCwgc291cmNlLCBrZXJuZWxzKSB7XG4gICAgICAgIHZhciB0MCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICBjb25zb2xlLmRlYnVnKFwiQ09NUElMSU5HXCIpO1xuICAgICAgICB0cnkge1xuICAgICAgICB2YXIgcHJvZ3JhbSA9IGNsLmNvbnRleHQuY3JlYXRlUHJvZ3JhbShzb3VyY2UpO1xuICAgICAgICBwcm9ncmFtLmJ1aWxkKFtjbC5kZXZpY2VdKTtcblxuICAgICAgICBpZiAodHlwZW9mIGtlcm5lbHMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIga2VybmVsT2JqID0ge307XG4gICAgICAgICAgICAgICAga2VybmVsT2JqLm5hbWUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAga2VybmVsT2JqLmtlcm5lbCA9IHByb2dyYW0uY3JlYXRlS2VybmVsKGtlcm5lbHMpO1xuICAgICAgICAgICAgICAgIGtlcm5lbE9iai5jbCA9IGNsO1xuICAgICAgICAgICAgICAgIGtlcm5lbE9iai5jYWxsID0gY2FsbC5iaW5kKHRoaXMsIGtlcm5lbE9iaik7XG4gICAgICAgICAgICAgICAga2VybmVsT2JqLnNldEFyZ3MgPSBzZXRBcmdzLmJpbmQodGhpcywga2VybmVsT2JqKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBrZXJuZWxPYmo7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIga2VybmVsT2JqcyA9IHt9O1xuXG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwga2VybmVscy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBrZXJuZWxOYW1lID0ga2VybmVsc1tpXTtcbiAgICAgICAgICAgICAgICB2YXIga2VybmVsT2JqID0ge307XG4gICAgICAgICAgICAgICAga2VybmVsT2JqLm5hbWUgPSBrZXJuZWxOYW1lO1xuICAgICAgICAgICAgICAgIGtlcm5lbE9iai5rZXJuZWwgPSBwcm9ncmFtLmNyZWF0ZUtlcm5lbChrZXJuZWxOYW1lKTtcbiAgICAgICAgICAgICAgICBrZXJuZWxPYmouY2wgPSBjbDtcbiAgICAgICAgICAgICAgICBrZXJuZWxPYmouY2FsbCA9IGNhbGwuYmluZCh0aGlzLCBrZXJuZWxPYmopO1xuICAgICAgICAgICAgICAgIGtlcm5lbE9iai5zZXRBcmdzID0gc2V0QXJncy5iaW5kKHRoaXMsIGtlcm5lbE9iaik7XG5cbiAgICAgICAgICAgICAgICBrZXJuZWxPYmpzW2tlcm5lbE5hbWVdID0ga2VybmVsT2JqO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgIC9jb21waWxlZCcsIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdDApO1xuXG4gICAgICAgICAgICByZXR1cm4ga2VybmVsT2JqcztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignd2F0JywgZS5zdGFjayk7XG4gICAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgfSk7XG5cblxuICAgIC8vIEV4ZWN1dGVzIHRoZSBzcGVjaWZpZWQga2VybmVsLCB3aXRoIGB0aHJlYWRzYCBudW1iZXIgb2YgdGhyZWFkcywgc2V0dGluZyBlYWNoIGVsZW1lbnQgaW5cbiAgICAvLyBgYXJnc2AgdG8gc3VjY2Vzc2l2ZSBwb3NpdGlvbiBhcmd1bWVudHMgdG8gdGhlIGtlcm5lbCBiZWZvcmUgY2FsbGluZy5cbiAgICB2YXIgY2FsbCA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGtlcm5lbCwgdGhyZWFkcywgYXJncywgYXJnVHlwZXMpIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcIkNBTExcIiwga2VybmVsLm5hbWUpXG4gICAgICAgIHZhciB0MCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICBhcmdzID0gYXJncyB8fCBbXTtcbiAgICAgICAgYXJnVHlwZXMgPSBhcmdUeXBlcyB8fCBbXTtcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnY2FsbCcsIGFyZ3MsIGFyZ1R5cGVzKVxuICAgICAgICByZXR1cm4ga2VybmVsLnNldEFyZ3MoYXJncywgYXJnVHlwZXMpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB2YXIgd29ya2dyb3VwU2l6ZSA9IG5ldyBJbnQzMkFycmF5KFt0aHJlYWRzXSk7XG4gICAgICAgICAgICBldmVudHMuZmlyZShcImtlcm5lbFN0YXJ0XCIpO1xuICAgICAgICAgICAga2VybmVsLmNsLnF1ZXVlLmVucXVldWVORFJhbmdlS2VybmVsKGtlcm5lbC5rZXJuZWwsIHdvcmtncm91cFNpemUubGVuZ3RoLCBbXSwgd29ya2dyb3VwU2l6ZSwgW10pO1xuICAgICAgICAgICAga2VybmVsLmNsLnF1ZXVlLmZpbmlzaCgpO1xuICAgICAgICAgICAgZXZlbnRzLmZpcmUoXCJrZXJuZWxFbmRcIik7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgIC9jYWxsZWQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwKTtcbiAgICAgICAgICAgIHJldHVybiBrZXJuZWw7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG5cbiAgICB2YXIgc2V0QXJncyA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGtlcm5lbCwgYXJncywgYXJnVHlwZXMpIHtcbiAgICAgICAgY29uc29sZS5kZWJ1ZygnU0VUIEFSR1MnLCBhcmdzLCBhcmdUeXBlcylcbiAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYoYXJnc1tpXSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGtlcm5lbC5rZXJuZWwuc2V0QXJnKGksIGFyZ3NbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUuZGVidWcoJyAgL2FsbCBzZXQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwKTtcbiAgICAgICAgcmV0dXJuIGtlcm5lbDtcbiAgICB9KTtcblxuXG4gICAgdmFyIGNyZWF0ZUJ1ZmZlciA9IFEucHJvbWlzZWQoZnVuY3Rpb24gY3JlYXRlQnVmZmVyKGNsLCBzaXplLCBuYW1lKSB7XG5cbiAgICAgICAgY29uc29sZS5kZWJ1ZygnQ1JFQVRFIGJ1ZmZlcicsIG5hbWUpO1xuXG4gICAgICAgIHZhciBidWZmZXIgPSBjbC5jb250ZXh0LmNyZWF0ZUJ1ZmZlcihjbC5jbC5NRU1fUkVBRF9XUklURSwgc2l6ZSk7XG4gICAgICAgIGlmIChidWZmZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBjcmVhdGUgdGhlIFdlYkNMIGJ1ZmZlclwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBidWZPYmogPSB7XG4gICAgICAgICAgICAgICAgXCJuYW1lXCI6IG5hbWUsXG4gICAgICAgICAgICAgICAgXCJidWZmZXJcIjogYnVmZmVyLFxuICAgICAgICAgICAgICAgIFwiY2xcIjogY2wsXG4gICAgICAgICAgICAgICAgXCJzaXplXCI6IHNpemUsXG4gICAgICAgICAgICAgICAgXCJhY3F1aXJlXCI6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiICBhY3F1aXJlIGxvY2tcIiwgYnVmT2JqLm5hbWUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBRKCk7IH0sXG4gICAgICAgICAgICAgICAgXCJyZWxlYXNlXCI6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiICByZWxlYXNlIGxvY2tcIiwgYnVmT2JqLm5hbWUpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBRKCk7IH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBidWZPYmouZGVsZXRlID0gUS5wcm9taXNlZChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBidWZPYmoucmVsZWFzZSgpO1xuICAgICAgICAgICAgICAgIGJ1Zk9iai5zaXplID0gMDtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYnVmT2JqLndyaXRlID0gd3JpdGUuYmluZCh0aGlzLCBidWZPYmopO1xuICAgICAgICAgICAgYnVmT2JqLnJlYWQgPSByZWFkLmJpbmQodGhpcywgYnVmT2JqKTtcbiAgICAgICAgICAgIGJ1Zk9iai5jb3B5SW50byA9IGNvcHlCdWZmZXIuYmluZCh0aGlzLCBjbCwgYnVmT2JqKTtcbiAgICAgICAgICAgIHJldHVybiBidWZPYmo7XG4gICAgICAgIH1cbiAgICB9KTtcblxuXG4gICAgLy8gVE9ETzogSWYgd2UgY2FsbCBidWZmZXIuYWNxdWlyZSgpIHR3aWNlIHdpdGhvdXQgY2FsbGluZyBidWZmZXIucmVsZWFzZSgpLCBpdCBzaG91bGQgaGF2ZSBub1xuICAgIC8vIGVmZmVjdC5cbiAgICB2YXIgY3JlYXRlQnVmZmVyR0wgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChjbCwgdmJvLCBuYW1lKSB7XG5cbiAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgY29uc29sZS5kZWJ1ZygnQ1JFQVRFIGJ1ZmZlciBHTCcsIG5hbWUpO1xuXG4gICAgICAgIHZhciBidWZmZXIgPSBjbC5jb250ZXh0LmNyZWF0ZUZyb21HTEJ1ZmZlcihjbC5jbC5NRU1fUkVBRF9XUklURSwgdmJvLmJ1ZmZlcik7XG4gICAgICAgIGlmIChidWZmZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBjcmVhdGUgV2ViQ0wgYnVmZmVyIGZyb20gV2ViR0wgYnVmZmVyXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKCFidWZmZXIuZ2V0SW5mbykgY29uc29sZS53YXJuKCcgIHZibywgd2VpcmQgbGVuJywgdmJvLmxlbilcbiAgICAgICAgICAgIHZhciBidWZPYmogPSB7XG4gICAgICAgICAgICAgICAgXCJuYW1lXCI6IG5hbWUsXG4gICAgICAgICAgICAgICAgXCJidWZmZXJcIjogYnVmZmVyLFxuICAgICAgICAgICAgICAgIFwiY2xcIjogY2wsXG4gICAgICAgICAgICAgICAgXCJzaXplXCI6IGJ1ZmZlci5nZXRJbmZvID8gYnVmZmVyLmdldEluZm8oY2wuY2wuTUVNX1NJWkUpIDogKHZiby5sZW4gKiBGbG9hdDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpLFxuICAgICAgICAgICAgICAgIFwiYWNxdWlyZVwiOiBRLnByb21pc2VkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiICBhY3F1aXJlIGdsXCIsIGJ1Zk9iai5uYW1lKVxuICAgICAgICAgICAgICAgICAgICB2YXIgdDAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgICAgICAgICAgY2wucXVldWUuZW5xdWV1ZUFjcXVpcmVHTE9iamVjdHMoW2J1ZmZlcl0pO1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgICAgL2FjcXVpcmVkJywgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0MCk7XG5cbiAgICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgICBcInJlbGVhc2VcIjogUS5wcm9taXNlZChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZyhcIiAgcmVsZWFzZSBnbFwiLCBidWZPYmoubmFtZSk7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0MCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgICAgICBjbC5xdWV1ZS5lbnF1ZXVlUmVsZWFzZUdMT2JqZWN0cyhbYnVmZmVyXSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJyAgICAvcmVsZWFzZWQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwKTtcblxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgYnVmT2JqLmRlbGV0ZSA9IFEucHJvbWlzZWQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGJ1Zk9iai5yZWxlYXNlKClcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgYnVmT2JqLnJlbGVhc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgYnVmT2JqLnNpemUgPSAwO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBidWZPYmoud3JpdGUgPSB3cml0ZS5iaW5kKHRoaXMsIGJ1Zk9iaik7XG4gICAgICAgICAgICBidWZPYmoucmVhZCA9IHJlYWQuYmluZCh0aGlzLCBidWZPYmopO1xuICAgICAgICAgICAgYnVmT2JqLmNvcHlJbnRvID0gY29weUJ1ZmZlci5iaW5kKHRoaXMsIGNsLCBidWZPYmopO1xuXG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgIC9jcmVhdGVkJywgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0MCk7XG5cbiAgICAgICAgICAgIHJldHVybiBidWZPYmo7XG4gICAgICAgIH1cbiAgICB9KTtcblxuXG4gICAgdmFyIGNvcHlCdWZmZXIgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChjbCwgc291cmNlLCBkZXN0aW5hdGlvbikge1xuICAgICAgICBjb25zb2xlLmRlYnVnKCdDT1BZIEJVRkZFUicsIHNvdXJjZS5uYW1lLCBkZXN0aW5hdGlvbi5uYW1lLCBzb3VyY2Uuc2l6ZSwgZGVzdGluYXRpb24uc2l6ZSlcbiAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIHJldHVybiBRKClcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHNvdXJjZS5hY3F1aXJlKCk7IH0pXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7IHJldHVybiBkZXN0aW5hdGlvbi5hY3F1aXJlKCk7IH0pXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgY2wucXVldWUuZW5xdWV1ZUNvcHlCdWZmZXIoc291cmNlLmJ1ZmZlciwgZGVzdGluYXRpb24uYnVmZmVyLCAwLCAwLCBNYXRoLm1pbihzb3VyY2Uuc2l6ZSwgZGVzdGluYXRpb24uc2l6ZSkpO1xuICAgICAgICAgICAgICAgIHJldHVybiBzb3VyY2UucmVsZWFzZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRlc3RpbmF0aW9uLnJlbGVhc2UoKTsgfSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjbC5xdWV1ZS5maW5pc2goKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgIC9jb3BpZWQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBkZXN0aW5hdGlvbjsgfSk7XG4gICAgfSk7XG5cblxuICAgIHZhciB3cml0ZSA9IFEucHJvbWlzZWQoZnVuY3Rpb24gd3JpdGUoYnVmZmVyLCBkYXRhKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCJXUklURVwiLCBidWZmZXIubmFtZSlcbiAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIHJldHVybiBidWZmZXIuYWNxdWlyZSgpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNsLnF1ZXVlLmVucXVldWVXcml0ZUJ1ZmZlcihidWZmZXIuYnVmZmVyLCB0cnVlLCAwLCBkYXRhLmJ5dGVMZW5ndGgsIGRhdGEpO1xuICAgICAgICAgICAgICAgIHJldHVybiBidWZmZXIucmVsZWFzZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGJ1ZmZlci5jbC5xdWV1ZS5maW5pc2goKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKCcgIC93cm90ZScsIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBidWZmZXI7XG4gICAgICAgICAgICB9KTtcbiAgICB9KTtcblxuXG4gICAgdmFyIHJlYWQgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChidWZmZXIsIHRhcmdldCkge1xuICAgICAgICBjb25zb2xlLmVycm8oXCJSRUFEXCIsIGJ1ZmZlci5uYW1lKTtcbiAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIHJldHVybiBidWZmZXIuYWNxdWlyZSgpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgY29weVNpemUgPSBNYXRoLm1pbihidWZmZXIuc2l6ZSwgdGFyZ2V0Lmxlbmd0aCAqIHRhcmdldC5CWVRFU19QRVJfRUxFTUVOVCk7XG4gICAgICAgICAgICAgICAgYnVmZmVyLmNsLnF1ZXVlLmVucXVldWVSZWFkQnVmZmVyKGJ1ZmZlci5idWZmZXIsIHRydWUsIDAsIGNvcHlTaXplLCB0YXJnZXQpO1xuICAgICAgICAgICAgICAgIHJldHVybiBidWZmZXIucmVsZWFzZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJyAgL3JlYWQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gYnVmZmVyO1xuICAgICAgICAgICAgfSk7XG4gICAgfSk7XG5cblxuICAgIC8vIERldGVjdHMgdGhlIFdlYkNMIHBsYXRmb3JtIHdlJ3JlIHJ1bm5pbmcgb24sIGFuZCBtb2RpZmllcyB0aGlzIG1vZHVsZSBhcyBuZWVkZWQuXG4gICAgLy8gUmV0dXJucyB0cnVlIGlmIHRoZSB0aGUgcGxhdGZvcm0gaXMgb3V0LW9mLWRhdGUgYW5kIG5lZWRlZCB0byBiZSBwb2x5ZmlsbGVkLCBhbmQgZmFsc2UgaWZcbiAgICAvLyB0aGUgcGxhdGZvcm0gaXMgdXAtdG8tZGF0ZSBhbmQgbm8gbW9kaWZpY2F0aW9uIHdhcyBuZWVkZWQuXG4gICAgZnVuY3Rpb24gcG9seWZpbGwoKSB7XG4gICAgICAgIC8vIERldGVjdCBpZiB3ZSdyZSBydW5uaW5nIG9uIGEgY3VycmVudCBXZWJDTCB2ZXJzaW9uXG4gICAgICAgIGlmKHR5cGVvZih3aW5kb3cpICE9ICd1bmRlZmluZWQnICYmIHR5cGVvZiB3ZWJjbC5lbmFibGVFeHRlbnNpb24gPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAvLyBJZiBzbywgZG9uJ3QgZG8gYW55dGhpbmdcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCJbY2wuanNdIERldGVjdGVkIG9sZCBXZWJDTCBwbGF0Zm9ybS4gTW9kaWZ5aW5nIGZ1bmN0aW9ucyB0byBzdXBwb3J0IGl0LlwiKTtcblxuXG4gICAgICAgIF9jcmVhdGVDb250ZXh0ID0gZnVuY3Rpb24oY2wsIGdsLCBwbGF0Zm9ybSwgZGV2aWNlcykge1xuICAgICAgICAgICAgaWYgKHdlYmNsLnR5cGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gd2ViY2wuY3JlYXRlQ29udGV4dCh7XG4gICAgICAgICAgICAgICAgICAgIGRldmljZXM6IGRldmljZXMsXG4gICAgICAgICAgICAgICAgICAgIHNoYXJlR3JvdXA6IGdsLFxuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcGxhdGZvcm19KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGV4dGVuc2lvbiA9IGNsLmdldEV4dGVuc2lvbihcIktIUl9HTF9TSEFSSU5HXCIpO1xuICAgICAgICAgICAgICAgIGlmIChleHRlbnNpb24gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGQgbm90IGNyZWF0ZSBhIHNoYXJlZCBDTC9HTCBjb250ZXh0IHVzaW5nIHRoZSBXZWJDTCBleHRlbnNpb24gc3lzdGVtXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gZXh0ZW5zaW9uLmNyZWF0ZUNvbnRleHQoe1xuICAgICAgICAgICAgICAgICAgICBwbGF0Zm9ybTogcGxhdGZvcm0sXG4gICAgICAgICAgICAgICAgICAgIGRldmljZXM6IGRldmljZXMsXG4gICAgICAgICAgICAgICAgICAgIGRldmljZVR5cGU6IGNsLkRFVklDRV9UWVBFX0dQVSxcbiAgICAgICAgICAgICAgICAgICAgc2hhcmVkQ29udGV4dDogbnVsbFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cblxuXG4gICAgICAgIGNhbGwgPSBRLnByb21pc2VkKGZ1bmN0aW9uIChrZXJuZWwsIHRocmVhZHMsIGFyZ3MsIGFyZ1R5cGVzKSB7XG4gICAgICAgICAgICBhcmdzID0gYXJncyB8fCBbXTtcbiAgICAgICAgICAgIGFyZ1R5cGVzID0gYXJnVHlwZXMgfHwgW107XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdDQUxMIChwb2x5KScsIGtlcm5lbC5uYW1lLCBhcmdzLCBhcmdUeXBlcylcbiAgICAgICAgICAgIHZhciB0MCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgcmV0dXJuIGtlcm5lbC5zZXRBcmdzKGFyZ3MsIGFyZ1R5cGVzKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIC8va2VybmVsLmNsLnF1ZXVlLmZpbmlzaCgpO1xuICAgICAgICAgICAgICAgIHZhciB3b3JrZ3JvdXBTaXplID0gdHlwZW9mKHdpbmRvdykgPT0gJ3VuZGVmaW5lZCcgPyBbdGhyZWFkc10gOiBuZXcgSW50MzJBcnJheShbdGhyZWFkc10pO1xuICAgICAgICAgICAgICAgIGlmICh3ZWJjbC50eXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIGtlcm5lbC5jbC5xdWV1ZS5lbnF1ZXVlTkRSYW5nZUtlcm5lbChrZXJuZWwua2VybmVsLCBudWxsLCBbdGhyZWFkc10sIG51bGwpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGtlcm5lbC5jbC5xdWV1ZS5lbnF1ZXVlTkRSYW5nZUtlcm5lbChrZXJuZWwua2VybmVsLCBudWxsLCB3b3JrZ3JvdXBTaXplLCBudWxsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc29sZS5kZWJ1ZygnICBlbnF1ZXVlZCcpXG4gICAgICAgICAgICAgICAga2VybmVsLmNsLnF1ZXVlLmZpbmlzaCgpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJyAgL2NhbGxlZCcsIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdDApO1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXJuZWw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2V0QXJncyA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGtlcm5lbCwgYXJncywgYXJnVHlwZXMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ1NFVCBBUkdTIChwb2x5KScsIGFyZ3MgPyBhcmdzLmxlbmd0aCA6ICdubyBhcmdzJywgYXJnVHlwZXMgPyBhcmdUeXBlcy5sZW5ndGggOiAnbm8gdHlwZXMnKVxuICAgICAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXJnc1tpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAga2VybmVsLmtlcm5lbC5zZXRBcmcoaSwgYXJnc1tpXS5sZW5ndGggPyBhcmdzW2ldWzBdIDogYXJnc1tpXSwgYXJnVHlwZXNbaV0gfHwgdW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCd3YXQnLCBlLCBlLnN0YWNrKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJyAgL3NldCcsIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdDApO1xuICAgICAgICAgICAgcmV0dXJuIGtlcm5lbDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKHR5cGVvZiBXZWJDTEtlcm5lbEFyZ3VtZW50VHlwZXMgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcyA9IHdlYmNsLnR5cGU7XG4gICAgICAgIH1cblxuICAgICAgICB0eXBlcyA9IHtcbiAgICAgICAgICAgIGNoYXJfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLkNIQVIsXG4gICAgICAgICAgICBkb3VibGVfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLkRPVUJMRSxcbiAgICAgICAgICAgIGZsb2F0X3Q6IFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcy5GTE9BVCxcbiAgICAgICAgICAgIGhhbGZfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLkhBTEYsXG4gICAgICAgICAgICBpbnRfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLklOVCxcbiAgICAgICAgICAgIGxvY2FsX3Q6IFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcy5MT0NBTF9NRU1PUllfU0laRSxcbiAgICAgICAgICAgIGxvbmdfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLkxPTkcsXG4gICAgICAgICAgICBzaG9ydF90OiBXZWJDTEtlcm5lbEFyZ3VtZW50VHlwZXMuU0hPUlQsXG4gICAgICAgICAgICB1Y2hhcl90OiBXZWJDTEtlcm5lbEFyZ3VtZW50VHlwZXMuVUNIQVIsXG4gICAgICAgICAgICB1aW50X3Q6IFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcy5VSU5ULFxuICAgICAgICAgICAgdWxvbmdfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLlVMT05HLFxuICAgICAgICAgICAgdXNob3J0X3Q6IFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcy5VU0hPUlQsXG4gICAgICAgICAgICBmbG9hdDJfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLlZFQzIsXG4gICAgICAgICAgICBmbG9hdDNfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLlZFQzMsXG4gICAgICAgICAgICBmbG9hdDRfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLlZFQzQsXG4gICAgICAgICAgICBmbG9hdDhfdDogV2ViQ0xLZXJuZWxBcmd1bWVudFR5cGVzLlZFQzgsXG4gICAgICAgICAgICBmbG9hdDE2X3Q6IFdlYkNMS2VybmVsQXJndW1lbnRUeXBlcy5WRUMxNlxuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICB2YXIgdHlwZXMgPSB7fTtcbiAgICB2YXIgQ1VSUkVOVF9DTCA9ICFwb2x5ZmlsbCgpO1xuXG5cbiAgICBtb2R1bGUuZXhwb3J0cyA9IHtcbiAgICAgICAgXCJjcmVhdGVcIjogY3JlYXRlLFxuICAgICAgICBcImNvbXBpbGVcIjogY29tcGlsZSxcbiAgICAgICAgXCJjYWxsXCI6IGNhbGwsXG4gICAgICAgIFwic2V0QXJnc1wiOiBzZXRBcmdzLFxuICAgICAgICBcImNyZWF0ZUJ1ZmZlclwiOiBjcmVhdGVCdWZmZXIsXG4gICAgICAgIFwiY3JlYXRlQnVmZmVyR0xcIjogY3JlYXRlQnVmZmVyR0wsXG4gICAgICAgIFwid3JpdGVcIjogd3JpdGUsXG4gICAgICAgIFwidHlwZXNcIjogdHlwZXMsXG4gICAgICAgIFwiQ1VSUkVOVF9DTFwiOiBDVVJSRU5UX0NMXG4gICAgfTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIE1hdHJpeExvYWRlciA9IHJlcXVpcmUoJy4vbGlicy9sb2FkLmpzJyk7XG52YXIga21lYW5zID0gcmVxdWlyZSgnLi9saWJzL2ttZWFucy5qcycpO1xuXG5cbi8vIEdlbmVyYXRlcyBgYW1vdW50YCBudW1iZXIgb2YgcmFuZG9tIHBvaW50c1xuZnVuY3Rpb24gY3JlYXRlUG9pbnRzKGFtb3VudCwgZGltKSB7XG4gICAgLy8gQWxsb2NhdGUgMiBlbGVtZW50cyBmb3IgZWFjaCBwb2ludCAoeCwgeSlcbiAgICB2YXIgcG9pbnRzID0gW107XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgYW1vdW50OyBpKyspIHtcbiAgICAgICAgcG9pbnRzLnB1c2goW01hdGgucmFuZG9tKCkgKiBkaW1bMF0sIE1hdGgucmFuZG9tKCkgKiBkaW1bMV1dKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcG9pbnRzO1xufVxuXG5cbmZ1bmN0aW9uIGNyZWF0ZUVkZ2VzKGFtb3VudCwgbnVtTm9kZXMpIHtcbiAgICB2YXIgZWRnZXMgPSBbXTtcbiAgICAvLyBUaGlzIG1heSBjcmVhdGUgZHVwbGljYXRlIGVkZ2VzLiBPaCB3ZWxsLCBmb3Igbm93LlxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBhbW91bnQ7IGkrKykge1xuICAgICAgICB2YXIgc291cmNlID0gKGkgJSBudW1Ob2RlcyksXG4gICAgICAgICAgICB0YXJnZXQgPSAoaSArIDEpICUgbnVtTm9kZXM7XG5cbiAgICAgICAgZWRnZXMucHVzaChbc291cmNlLCB0YXJnZXRdKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZWRnZXM7XG59XG5cblxuZnVuY3Rpb24gbG9hZEdlbyhncmFwaCwgZ3JhcGhGaWxlVVJJKSB7XG4gICAgdmFyIHByb2Nlc3NlZERhdGE7XG5cbiAgICByZXR1cm4gTWF0cml4TG9hZGVyLmxvYWRHZW8oZ3JhcGhGaWxlVVJJKVxuICAgIC50aGVuKGZ1bmN0aW9uKGdlb0RhdGEpIHtcbiAgICAgICAgcHJvY2Vzc2VkRGF0YSA9IE1hdHJpeExvYWRlci5wcm9jZXNzR2VvKGdlb0RhdGEpO1xuXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJz09PT09PT09PT09PVBST0NFU1NFRCcpXG4gICAgICAgIGNvbnNvbGUuZGVidWcoJ25vZGVzL2VkZ2VzJywgcHJvY2Vzc2VkRGF0YS5wb2ludHMubGVuZ3RoLCBwcm9jZXNzZWREYXRhLmVkZ2VzLmxlbmd0aClcblxuICAgICAgICByZXR1cm4gZ3JhcGguc2V0UG9pbnRzKHByb2Nlc3NlZERhdGEucG9pbnRzKTtcbiAgICB9KVxuICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuXG4gICAgICAgIHZhciBwb3NpdGlvbiA9IGZ1bmN0aW9uIChwb2ludHMsIGVkZ2VzKSB7XG4gICAgICAgICAgICByZXR1cm4gZWRnZXMubWFwKGZ1bmN0aW9uIChwYWlyKXtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnQgPSBwb2ludHNbcGFpclswXV07XG4gICAgICAgICAgICAgICAgdmFyIGVuZCA9IHBvaW50c1twYWlyWzFdXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gW3N0YXJ0WzBdLCBzdGFydFsxXSwgZW5kWzBdLCBlbmRbMV1dO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH07XG4gICAgICAgIHZhciBrID0gNjsgLy9uZWVkIHRvIGJlIDw9ICMgc3VwcG9ydGVkIGNvbG9ycywgY3VycmVudGx5IDlcbiAgICAgICAgdmFyIHN0ZXBzID0gIDUwO1xuICAgICAgICB2YXIgcG9zaXRpb25zID0gcG9zaXRpb24ocHJvY2Vzc2VkRGF0YS5wb2ludHMsIHByb2Nlc3NlZERhdGEuZWRnZXMpO1xuICAgICAgICB2YXIgY2x1c3RlcnMgPSBrbWVhbnMocG9zaXRpb25zLCBrLCBzdGVwcyk7IC8vWyBbMC0tMV1fNCBdX2tcblxuICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIGdyYXBoXG4gICAgICAgICAgICAgICAgLnNldENvbG9yTWFwKFwidGVzdC1jb2xvcm1hcDIucG5nXCIsIHtjbHVzdGVyczogY2x1c3RlcnMsIHBvaW50czogcHJvY2Vzc2VkRGF0YS5wb2ludHMsIGVkZ2VzOiBwcm9jZXNzZWREYXRhLmVkZ2VzfSlcbiAgICAgICAgICAgICAgICB0aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdyYXBoLnNldEVkZ2VzKHByb2Nlc3NlZERhdGEuZWRnZXMpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoXCJTRVQgR0VPIFBPSU5UUywgRURHRVNcIik7XG4gICAgICAgIHJldHVybiBncmFwaDtcbiAgICB9LCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1dBVCcsIGVyciwgZXJyLnN0YWNrKVxuICAgIH0pO1xufVxuXG5cblxuZnVuY3Rpb24gYW5pbWF0b3IgKGRvY3VtZW50LCBwcm9taXNlKSB7XG5cbiAgICB2YXIgYW5pbWF0aW5nID0gZmFsc2U7XG5cbiAgICB2YXIgbmV4dCA9IGZ1bmN0aW9uIChmKSB7XG4gICAgICAgIHZhciBiYXNlID0gKHR5cGVvZiB3aW5kb3cgPT0gJ3VuZGVmaW5lZCcgPyBkb2N1bWVudCA6IHdpbmRvdyk7XG4gICAgICAgIGJhc2UucmVxdWVzdEFuaW1hdGlvbkZyYW1lKGYpO1xuICAgIH1cblxuXG4gICAgdmFyIHN0ZXAgPSAwO1xuICAgIHZhciBib3VuZCA9IC0xO1xuXG4gICAgdmFyIHJlcyA9IHtcbiAgICAgICAgc3RvcEFuaW1hdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgYW5pbWF0aW5nID0gZmFsc2U7XG4gICAgICAgICAgICByZXR1cm4gcmVzO1xuICAgICAgICB9LFxuICAgICAgICBzdGFydEFuaW1hdGlvbjogZnVuY3Rpb24gKG1heWJlQ2IsIG1heWJlTWF4U3RlcHMpIHtcbiAgICAgICAgICAgIGJvdW5kID0gbWF5YmVNYXhTdGVwcztcbiAgICAgICAgICAgIGFuaW1hdGluZyA9IHRydWU7XG4gICAgICAgICAgICB2YXIgcnVuID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJz09PT09PT09PT09PT09PVNURVBQSU5HJywgc3RlcCsrKVxuICAgICAgICAgICAgICAgIGJvdW5kLS07XG4gICAgICAgICAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgcHJvbWlzZSgpLnRoZW4oXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCIgIC9TVEVQUEVEXCIsIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdDAsICdtcycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGFuaW1hdGluZyAmJiBib3VuZCAhPSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dChydW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWF5YmVDYikgbWF5YmVDYigpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgY29uc29sZS5kZWJ1ZyhcIkFOSU1BVEUgRE9ORVwiKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkVSUk9SXCIsIGVyciwgZXJyLnN0YWNrKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgbmV4dChydW4pO1xuICAgICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG5cblxuLyoqXG4gKiBQb3B1bGF0ZSB0aGUgZGF0YSBsaXN0IGRyb3Bkb3duIG1lbnUgd2l0aCBhdmFpbGFibGUgZGF0YSwgYW5kIHNldHVwIGFjdGlvbnMgdG8gbG9hZCB0aGUgZGF0YVxuICogd2hlbiB0aGUgdXNlciBzZWxlY3RzIG9uZSBvZiB0aGUgb3B0aW9ucy5cbiAqXG4gKiBAcGFyYW0gY2xHcmFwaCAtIHRoZSBOQm9keSBncmFwaCBvYmplY3QgY3JlYXRlZCBieSBOQm9keS5jcmVhdGUoKVxuICovXG5mdW5jdGlvbiBsb2FkRGF0YUxpc3QoY2xHcmFwaCkge1xuICAgIC8vIEdpdmVuIGEgVVJJIG9mIGEgSlNPTiBkYXRhIGluZGV4LCByZXR1cm4gYW4gYXJyYXkgb2Ygb2JqZWN0cywgd2l0aCBrZXlzIGZvciBkaXNwbGF5IG5hbWUsXG4gICAgLy8gZmlsZSBVUkksIGFuZCBkYXRhIHNpemVcbiAgICBmdW5jdGlvbiBnZXREYXRhTGlzdChsaXN0VVJJKSB7XG4gICAgICAgIHJldHVybiBNYXRyaXhMb2FkZXIubHMobGlzdFVSSSlcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGZpbGVzKSB7XG4gICAgICAgICAgICB2YXIgbGlzdGluZyA9IFtdO1xuXG4gICAgICAgICAgICBmaWxlcy5mb3JFYWNoKGZ1bmN0aW9uIChmaWxlLCBpKSB7XG4gICAgICAgICAgICAgICAgbGlzdGluZy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgZjogZmlsZS5mLFxuICAgICAgICAgICAgICAgICAgICBiYXNlOiBmaWxlLmYuc3BsaXQoL1xcL3xcXC4vKVtmaWxlLmYuc3BsaXQoL1xcL3xcXC4vKS5sZW5ndGggLSAzXSxcbiAgICAgICAgICAgICAgICAgICAgS0I6IGZpbGUuS0IsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IGZpbGUuS0IgPiAxMDAwID8gKE1hdGgucm91bmQoZmlsZS5LQiAvIDEwMDApICsgXCIgTUJcIikgOiAoZmlsZS5LQiArIFwiIEtCXCIpXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGxpc3Rpbmc7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHZhciBkYXRhTGlzdCA9IFtdO1xuXG4gICAgcmV0dXJuIGdldERhdGFMaXN0KFwiZGF0YS9nZW8uanNvblwiKVxuICAgIC50aGVuKGZ1bmN0aW9uKGdlb0xpc3Qpe1xuICAgICAgICBjb25zb2xlLmRlYnVnKFwiICBnZW9saXN0XCIpXG4gICAgICAgIGdlb0xpc3QgPSBnZW9MaXN0Lm1hcChmdW5jdGlvbihmaWxlSW5mbykge1xuICAgICAgICAgICAgZmlsZUluZm9bXCJiYXNlXCJdID0gZmlsZUluZm8uYmFzZSArIFwiLmdlb1wiO1xuICAgICAgICAgICAgZmlsZUluZm9bXCJsb2FkZXJcIl0gPSBsb2FkR2VvO1xuICAgICAgICAgICAgcmV0dXJuIGZpbGVJbmZvO1xuICAgICAgICB9KTtcblxuICAgICAgICBkYXRhTGlzdCA9IGRhdGFMaXN0LmNvbmNhdChnZW9MaXN0KTtcblxuICAgICAgICByZXR1cm4gZ2V0RGF0YUxpc3QoXCJkYXRhL21hdHJpY2VzLmJpbmFyeS5qc29uXCIpO1xuICAgIH0pXG4gICAgLnRoZW4oZnVuY3Rpb24obWF0cml4TGlzdCl7XG4gICAgICAgIGNvbnNvbGUuZGVidWcoJyAgbWF0cml4bGlzdCcpO1xuICAgICAgICBtYXRyaXhMaXN0ID0gbWF0cml4TGlzdC5tYXAoZnVuY3Rpb24oZmlsZUluZm8pIHtcbiAgICAgICAgICAgIGZpbGVJbmZvW1wiYmFzZVwiXSA9IGZpbGVJbmZvLmJhc2UgKyBcIi5tdHhcIjtcbiAgICAgICAgICAgIGZpbGVJbmZvW1wibG9hZGVyXCJdID0gbG9hZE1hdHJpeDtcbiAgICAgICAgICAgIHJldHVybiBmaWxlSW5mbztcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGF0YUxpc3QgPSBkYXRhTGlzdC5jb25jYXQobWF0cml4TGlzdCk7XG5cbiAgICAgICAgcmV0dXJuIGRhdGFMaXN0O1xuICAgIH0pO1xufVxuXG5cbi8qKlxuICogTG9hZHMgdGhlIG1hdHJpeCBkYXRhIGF0IHRoZSBnaXZlbiBVUkkgaW50byB0aGUgTkJvZHkgZ3JhcGguXG4gKi9cbmZ1bmN0aW9uIGxvYWRNYXRyaXgoZ3JhcGgsIGdyYXBoRmlsZVVSSSkge1xuICAgIHZhciBncmFwaEZpbGU7XG5cbiAgICByZXR1cm4gTWF0cml4TG9hZGVyLmxvYWRCaW5hcnkoZ3JhcGhGaWxlVVJJKVxuICAgIC50aGVuKGZ1bmN0aW9uICh2KSB7XG4gICAgICAgIGdyYXBoRmlsZSA9IHY7XG4gICAgICAgICQoJyNmaWxlbm9kZXMnKS50ZXh0KCdOb2RlczogJyArIHYubnVtTm9kZXMpO1xuICAgICAgICAkKCcjZmlsZWVkZ2VzJykudGV4dCgnRWRnZXM6ICcgKyB2Lm51bUVkZ2VzKTtcblxuICAgICAgICB2YXIgcG9pbnRzID0gY3JlYXRlUG9pbnRzKGdyYXBoRmlsZS5udW1Ob2RlcywgZ3JhcGguZGltZW5zaW9ucyk7XG5cbiAgICAgICAgcmV0dXJuIGdyYXBoLnNldFBvaW50cyhwb2ludHMpO1xuICAgIH0pXG4gICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBncmFwaC5zZXRFZGdlcyhncmFwaEZpbGUuZWRnZXMpO1xuICAgIH0pXG4gICAgLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBncmFwaDtcbiAgICB9KTtcbn1cblxuXG5cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgY3JlYXRlUG9pbnRzOiBjcmVhdGVQb2ludHMsXG4gICAgY3JlYXRlRWRnZXM6IGNyZWF0ZUVkZ2VzLFxuICAgIGFuaW1hdG9yOiBhbmltYXRvcixcbiAgICBsb2FkR2VvOiBsb2FkR2VvLFxuICAgIGxvYWREYXRhTGlzdDogbG9hZERhdGFMaXN0XG59OyIsIi8qXG4gQ29weXJpZ2h0IDIwMTMgRGFuaWVsIFdpcnR6IDxkY29kZUBkY29kZS5pbz5cbiBDb3B5cmlnaHQgMjAwOSBUaGUgQ2xvc3VyZSBMaWJyYXJ5IEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG5cbiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcblxuIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuXG4gVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMtSVNcIiBCQVNJUyxcbiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuLyoqXG4gKiBAbGljZW5zZSBMb25nLmpzIChjKSAyMDEzIERhbmllbCBXaXJ0eiA8ZGNvZGVAZGNvZGUuaW8+XG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wXG4gKiBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9kY29kZUlPL0xvbmcuanMgZm9yIGRldGFpbHNcbiAqIFxuICogTG9uZy5qcyBpcyBiYXNlZCBvbiBnb29nLm1hdGguTG9uZyBmcm9tIHRoZSBDbG9zdXJlIExpYnJhcnkuXG4gKiBDb3B5cmlnaHQgMjAwOSBUaGUgQ2xvc3VyZSBMaWJyYXJ5IEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKiBSZWxlYXNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wXG4gKiBzZWU6IGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvY2xvc3VyZS1saWJyYXJ5LyBmb3IgZGV0YWlsc1xuICovXG5cbi8qKlxuICogRGVmaW5lcyBhIExvbmcgY2xhc3MgZm9yIHJlcHJlc2VudGluZyBhIDY0LWJpdCB0d28ncy1jb21wbGVtZW50XG4gKiBpbnRlZ2VyIHZhbHVlLCB3aGljaCBmYWl0aGZ1bGx5IHNpbXVsYXRlcyB0aGUgYmVoYXZpb3Igb2YgYSBKYXZhIFwibG9uZ1wiLiBUaGlzXG4gKiBpbXBsZW1lbnRhdGlvbiBpcyBkZXJpdmVkIGZyb20gTG9uZ0xpYiBpbiBHV1QuXG4gKi9cbihmdW5jdGlvbihnbG9iYWwpIHtcblxuICAgIC8qKlxuICAgICAqIENvbnN0cnVjdHMgYSA2NC1iaXQgdHdvJ3MtY29tcGxlbWVudCBpbnRlZ2VyLCBnaXZlbiBpdHMgbG93IGFuZCBoaWdoIDMyLWJpdFxuICAgICAqIHZhbHVlcyBhcyAqc2lnbmVkKiBpbnRlZ2Vycy4gIFNlZSB0aGUgZnJvbSogZnVuY3Rpb25zIGJlbG93IGZvciBtb3JlXG4gICAgICogY29udmVuaWVudCB3YXlzIG9mIGNvbnN0cnVjdGluZyBMb25ncy5cbiAgICAgKlxuICAgICAqIFRoZSBpbnRlcm5hbCByZXByZXNlbnRhdGlvbiBvZiBhIGxvbmcgaXMgdGhlIHR3byBnaXZlbiBzaWduZWQsIDMyLWJpdCB2YWx1ZXMuXG4gICAgICogV2UgdXNlIDMyLWJpdCBwaWVjZXMgYmVjYXVzZSB0aGVzZSBhcmUgdGhlIHNpemUgb2YgaW50ZWdlcnMgb24gd2hpY2hcbiAgICAgKiBKYXZhc2NyaXB0IHBlcmZvcm1zIGJpdC1vcGVyYXRpb25zLiAgRm9yIG9wZXJhdGlvbnMgbGlrZSBhZGRpdGlvbiBhbmRcbiAgICAgKiBtdWx0aXBsaWNhdGlvbiwgd2Ugc3BsaXQgZWFjaCBudW1iZXIgaW50byAxNi1iaXQgcGllY2VzLCB3aGljaCBjYW4gZWFzaWx5IGJlXG4gICAgICogbXVsdGlwbGllZCB3aXRoaW4gSmF2YXNjcmlwdCdzIGZsb2F0aW5nLXBvaW50IHJlcHJlc2VudGF0aW9uIHdpdGhvdXQgb3ZlcmZsb3dcbiAgICAgKiBvciBjaGFuZ2UgaW4gc2lnbi5cbiAgICAgKlxuICAgICAqIEluIHRoZSBhbGdvcml0aG1zIGJlbG93LCB3ZSBmcmVxdWVudGx5IHJlZHVjZSB0aGUgbmVnYXRpdmUgY2FzZSB0byB0aGVcbiAgICAgKiBwb3NpdGl2ZSBjYXNlIGJ5IG5lZ2F0aW5nIHRoZSBpbnB1dChzKSBhbmQgdGhlbiBwb3N0LXByb2Nlc3NpbmcgdGhlIHJlc3VsdC5cbiAgICAgKiBOb3RlIHRoYXQgd2UgbXVzdCBBTFdBWVMgY2hlY2sgc3BlY2lhbGx5IHdoZXRoZXIgdGhvc2UgdmFsdWVzIGFyZSBNSU5fVkFMVUVcbiAgICAgKiAoLTJeNjMpIGJlY2F1c2UgLU1JTl9WQUxVRSA9PSBNSU5fVkFMVUUgKHNpbmNlIDJeNjMgY2Fubm90IGJlIHJlcHJlc2VudGVkIGFzXG4gICAgICogYSBwb3NpdGl2ZSBudW1iZXIsIGl0IG92ZXJmbG93cyBiYWNrIGludG8gYSBuZWdhdGl2ZSkuICBOb3QgaGFuZGxpbmcgdGhpc1xuICAgICAqIGNhc2Ugd291bGQgb2Z0ZW4gcmVzdWx0IGluIGluZmluaXRlIHJlY3Vyc2lvbi5cbiAgICAgKiBcbiAgICAgKiBAZXhwb3J0cyBMb25nXG4gICAgICogQGNsYXNzIEEgTG9uZyBjbGFzcyBmb3IgcmVwcmVzZW50aW5nIGEgNjQtYml0IHR3bydzLWNvbXBsZW1lbnQgaW50ZWdlciB2YWx1ZS5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbG93IFRoZSBsb3cgKHNpZ25lZCkgMzIgYml0cyBvZiB0aGUgbG9uZy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGlnaCBUaGUgaGlnaCAoc2lnbmVkKSAzMiBiaXRzIG9mIHRoZSBsb25nLlxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbj19IHVuc2lnbmVkIFdoZXRoZXIgdW5zaWduZWQgb3Igbm90LiBEZWZhdWx0cyB0byBgZmFsc2VgIChzaWduZWQpLlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIHZhciBMb25nID0gZnVuY3Rpb24obG93LCBoaWdoLCB1bnNpZ25lZCkge1xuICAgICAgICBcbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRoZSBsb3cgMzIgYml0cyBhcyBhIHNpZ25lZCB2YWx1ZS5cbiAgICAgICAgICogQHR5cGUge251bWJlcn1cbiAgICAgICAgICogQGV4cG9zZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5sb3cgPSBsb3cgfCAwO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBUaGUgaGlnaCAzMiBiaXRzIGFzIGEgc2lnbmVkIHZhbHVlLlxuICAgICAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAgICAgKiBAZXhwb3NlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmhpZ2ggPSBoaWdoIHwgMDtcblxuICAgICAgICAvKipcbiAgICAgICAgICogV2hldGhlciB1bnNpZ25lZCBvciBub3QuXG4gICAgICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAgICAgKiBAZXhwb3NlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLnVuc2lnbmVkID0gISF1bnNpZ25lZDtcbiAgICB9O1xuXG4gICAgLy8gTk9URTogQ29tbW9uIGNvbnN0YW50IHZhbHVlcyBaRVJPLCBPTkUsIE5FR19PTkUsIGV0Yy4gYXJlIGRlZmluZWQgYmVsb3cgdGhlIGZyb20qIG1ldGhvZHMgb24gd2hpY2ggdGhleSBkZXBlbmQuXG5cbiAgICAvLyBOT1RFOiBUaGUgZm9sbG93aW5nIGNhY2hlIHZhcmlhYmxlcyBhcmUgdXNlZCBpbnRlcm5hbGx5IG9ubHkgYW5kIGFyZSB0aGVyZWZvcmUgbm90IGV4cG9zZWQgYXMgcHJvcGVydGllcyBvZiB0aGVcbiAgICAvLyBMb25nIGNsYXNzLlxuICAgIFxuICAgIC8qKlxuICAgICAqIEEgY2FjaGUgb2YgdGhlIExvbmcgcmVwcmVzZW50YXRpb25zIG9mIHNtYWxsIGludGVnZXIgdmFsdWVzLlxuICAgICAqIEB0eXBlIHshT2JqZWN0fVxuICAgICAqL1xuICAgIHZhciBJTlRfQ0FDSEUgPSB7fTtcblxuICAgIC8qKlxuICAgICAqIEEgY2FjaGUgb2YgdGhlIExvbmcgcmVwcmVzZW50YXRpb25zIG9mIHNtYWxsIHVuc2lnbmVkIGludGVnZXIgdmFsdWVzLlxuICAgICAqIEB0eXBlIHshT2JqZWN0fVxuICAgICAqL1xuICAgIHZhciBVSU5UX0NBQ0hFID0ge307XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgTG9uZyByZXByZXNlbnRpbmcgdGhlIGdpdmVuICgzMi1iaXQpIGludGVnZXIgdmFsdWUuXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHZhbHVlIFRoZSAzMi1iaXQgaW50ZWdlciBpbiBxdWVzdGlvbi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdC4gRGVmYXVsdHMgdG8gZmFsc2UgKHNpZ25lZCkuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuZnJvbUludCA9IGZ1bmN0aW9uKHZhbHVlLCB1bnNpZ25lZCkge1xuICAgICAgICB2YXIgb2JqLCBjYWNoZWRPYmo7XG4gICAgICAgIGlmICghdW5zaWduZWQpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUgfCAwO1xuICAgICAgICAgICAgaWYgKC0xMjggPD0gdmFsdWUgJiYgdmFsdWUgPCAxMjgpIHtcbiAgICAgICAgICAgICAgICBjYWNoZWRPYmogPSBJTlRfQ0FDSEVbdmFsdWVdO1xuICAgICAgICAgICAgICAgIGlmIChjYWNoZWRPYmopIHJldHVybiBjYWNoZWRPYmo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvYmogPSBuZXcgTG9uZyh2YWx1ZSwgdmFsdWUgPCAwID8gLTEgOiAwLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoLTEyOCA8PSB2YWx1ZSAmJiB2YWx1ZSA8IDEyOCkge1xuICAgICAgICAgICAgICAgIElOVF9DQUNIRVt2YWx1ZV0gPSBvYmo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZSA+Pj4gMDtcbiAgICAgICAgICAgIGlmICgwIDw9IHZhbHVlICYmIHZhbHVlIDwgMjU2KSB7XG4gICAgICAgICAgICAgICAgY2FjaGVkT2JqID0gVUlOVF9DQUNIRVt2YWx1ZV07XG4gICAgICAgICAgICAgICAgaWYgKGNhY2hlZE9iaikgcmV0dXJuIGNhY2hlZE9iajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9iaiA9IG5ldyBMb25nKHZhbHVlLCAodmFsdWUgfCAwKSA8IDAgPyAtMSA6IDAsIHRydWUpO1xuICAgICAgICAgICAgaWYgKDAgPD0gdmFsdWUgJiYgdmFsdWUgPCAyNTYpIHtcbiAgICAgICAgICAgICAgICBVSU5UX0NBQ0hFW3ZhbHVlXSA9IG9iajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBvYmo7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIExvbmcgcmVwcmVzZW50aW5nIHRoZSBnaXZlbiB2YWx1ZSwgcHJvdmlkZWQgdGhhdCBpdCBpcyBhIGZpbml0ZVxuICAgICAqIG51bWJlci4gIE90aGVyd2lzZSwgemVybyBpcyByZXR1cm5lZC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gdmFsdWUgVGhlIG51bWJlciBpbiBxdWVzdGlvbi5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdC4gRGVmYXVsdHMgdG8gZmFsc2UgKHNpZ25lZCkuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuZnJvbU51bWJlciA9IGZ1bmN0aW9uKHZhbHVlLCB1bnNpZ25lZCkge1xuICAgICAgICB1bnNpZ25lZCA9ICEhdW5zaWduZWQ7XG4gICAgICAgIGlmIChpc05hTih2YWx1ZSkgfHwgIWlzRmluaXRlKHZhbHVlKSkge1xuICAgICAgICAgICAgcmV0dXJuIExvbmcuWkVSTztcbiAgICAgICAgfSBlbHNlIGlmICghdW5zaWduZWQgJiYgdmFsdWUgPD0gLVRXT19QV1JfNjNfREJMKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NSU5fU0lHTkVEX1ZBTFVFO1xuICAgICAgICB9IGVsc2UgaWYgKHVuc2lnbmVkICYmIHZhbHVlIDw9IDApIHtcbiAgICAgICAgICAgIHJldHVybiBMb25nLk1JTl9VTlNJR05FRF9WQUxVRTtcbiAgICAgICAgfSBlbHNlIGlmICghdW5zaWduZWQgJiYgdmFsdWUgKyAxID49IFRXT19QV1JfNjNfREJMKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NQVhfU0lHTkVEX1ZBTFVFO1xuICAgICAgICB9IGVsc2UgaWYgKHVuc2lnbmVkICYmIHZhbHVlID49IFRXT19QV1JfNjRfREJMKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5NQVhfVU5TSUdORURfVkFMVUU7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWUgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tTnVtYmVyKC12YWx1ZSwgZmFsc2UpLm5lZ2F0ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBMb25nKCh2YWx1ZSAlIFRXT19QV1JfMzJfREJMKSB8IDAsICh2YWx1ZSAvIFRXT19QV1JfMzJfREJMKSB8IDAsIHVuc2lnbmVkKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgTG9uZyByZXByZXNlbnRpbmcgdGhlIDY0Yml0IGludGVnZXIgdGhhdCBjb21lcyBieSBjb25jYXRlbmF0aW5nIHRoZSBnaXZlbiBsb3cgYW5kIGhpZ2ggYml0cy4gRWFjaCBpc1xuICAgICAqICBhc3N1bWVkIHRvIHVzZSAzMiBiaXRzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsb3dCaXRzIFRoZSBsb3cgMzIgYml0cy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gaGlnaEJpdHMgVGhlIGhpZ2ggMzIgYml0cy5cbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW49fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdC4gRGVmYXVsdHMgdG8gZmFsc2UgKHNpZ25lZCkuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBjb3JyZXNwb25kaW5nIExvbmcgdmFsdWUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuZnJvbUJpdHMgPSBmdW5jdGlvbihsb3dCaXRzLCBoaWdoQml0cywgdW5zaWduZWQpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBMb25nKGxvd0JpdHMsIGhpZ2hCaXRzLCB1bnNpZ25lZCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBMb25nIHJlcHJlc2VudGluZyB0aGUgNjRiaXQgaW50ZWdlciB0aGF0IGNvbWVzIGJ5IGNvbmNhdGVuYXRpbmcgdGhlIGdpdmVuIGxvdywgbWlkZGxlIGFuZCBoaWdoIGJpdHMuXG4gICAgICogIEVhY2ggaXMgYXNzdW1lZCB0byB1c2UgMjggYml0cy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcGFydDAgVGhlIGxvdyAyOCBiaXRzXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHBhcnQxIFRoZSBtaWRkbGUgMjggYml0c1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBwYXJ0MiBUaGUgaGlnaCAyOCAoOCkgYml0c1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbj19IHVuc2lnbmVkIFdoZXRoZXIgdW5zaWduZWQgb3Igbm90LiBEZWZhdWx0cyB0byBmYWxzZSAoc2lnbmVkKS5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ31cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5mcm9tMjhCaXRzID0gZnVuY3Rpb24ocGFydDAsIHBhcnQxLCBwYXJ0MiwgdW5zaWduZWQpIHtcbiAgICAgICAgLy8gMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDExMTEgMTExMTExMTExMTExMTExMTExMTExMTExMjIyMjIyMjIgMjIyMjIyMjIyMjIyMlxuICAgICAgICAvLyBMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTCBISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISFxuICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyhwYXJ0MCB8IChwYXJ0MSA8PCAyOCksIChwYXJ0MSA+Pj4gNCkgfCAocGFydDIpIDw8IDI0LCB1bnNpZ25lZCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBMb25nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBzdHJpbmcsIHdyaXR0ZW4gdXNpbmcgdGhlIGdpdmVuXG4gICAgICogcmFkaXguXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHN0ciBUaGUgdGV4dHVhbCByZXByZXNlbnRhdGlvbiBvZiB0aGUgTG9uZy5cbiAgICAgKiBAcGFyYW0geyhib29sZWFufG51bWJlcik9fSB1bnNpZ25lZCBXaGV0aGVyIHVuc2lnbmVkIG9yIG5vdC4gRGVmYXVsdHMgdG8gZmFsc2UgKHNpZ25lZCkuXG4gICAgICogQHBhcmFtIHtudW1iZXI9fSByYWRpeCBUaGUgcmFkaXggaW4gd2hpY2ggdGhlIHRleHQgaXMgd3JpdHRlbi5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVGhlIGNvcnJlc3BvbmRpbmcgTG9uZyB2YWx1ZS5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5mcm9tU3RyaW5nID0gZnVuY3Rpb24oc3RyLCB1bnNpZ25lZCwgcmFkaXgpIHtcbiAgICAgICAgaWYgKHN0ci5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cobmV3IEVycm9yKCdudW1iZXIgZm9ybWF0IGVycm9yOiBlbXB0eSBzdHJpbmcnKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHN0ciA9PT0gXCJOYU5cIiB8fCBzdHIgPT09IFwiSW5maW5pdHlcIiB8fCBzdHIgPT09IFwiK0luZmluaXR5XCIgfHwgc3RyID09PSBcIi1JbmZpbml0eVwiKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5aRVJPO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgdW5zaWduZWQgPT09ICdudW1iZXInKSB7IC8vIEZvciBnb29nLm1hdGguTG9uZyBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgICByYWRpeCA9IHVuc2lnbmVkO1xuICAgICAgICAgICAgdW5zaWduZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByYWRpeCA9IHJhZGl4IHx8IDEwO1xuICAgICAgICBpZiAocmFkaXggPCAyIHx8IDM2IDwgcmFkaXgpIHtcbiAgICAgICAgICAgIHRocm93KG5ldyBFcnJvcigncmFkaXggb3V0IG9mIHJhbmdlOiAnICsgcmFkaXgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzdHIuY2hhckF0KDApID09ICctJykge1xuICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbVN0cmluZyhzdHIuc3Vic3RyaW5nKDEpLCB1bnNpZ25lZCwgcmFkaXgpLm5lZ2F0ZSgpO1xuICAgICAgICB9IGVsc2UgaWYgKHN0ci5pbmRleE9mKCctJykgPj0gMCkge1xuICAgICAgICAgICAgdGhyb3cobmV3IEVycm9yKCdudW1iZXIgZm9ybWF0IGVycm9yOiBpbnRlcmlvciBcIi1cIiBjaGFyYWN0ZXI6ICcgKyBzdHIpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERvIHNldmVyYWwgKDgpIGRpZ2l0cyBlYWNoIHRpbWUgdGhyb3VnaCB0aGUgbG9vcCwgc28gYXMgdG9cbiAgICAgICAgLy8gbWluaW1pemUgdGhlIGNhbGxzIHRvIHRoZSB2ZXJ5IGV4cGVuc2l2ZSBlbXVsYXRlZCBkaXYuXG4gICAgICAgIHZhciByYWRpeFRvUG93ZXIgPSBMb25nLmZyb21OdW1iZXIoTWF0aC5wb3cocmFkaXgsIDgpKTtcblxuICAgICAgICB2YXIgcmVzdWx0ID0gTG9uZy5aRVJPO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkgKz0gOCkge1xuICAgICAgICAgICAgdmFyIHNpemUgPSBNYXRoLm1pbig4LCBzdHIubGVuZ3RoIC0gaSk7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSBwYXJzZUludChzdHIuc3Vic3RyaW5nKGksIGkgKyBzaXplKSwgcmFkaXgpO1xuICAgICAgICAgICAgaWYgKHNpemUgPCA4KSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvd2VyID0gTG9uZy5mcm9tTnVtYmVyKE1hdGgucG93KHJhZGl4LCBzaXplKSk7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0Lm11bHRpcGx5KHBvd2VyKS5hZGQoTG9uZy5mcm9tTnVtYmVyKHZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5tdWx0aXBseShyYWRpeFRvUG93ZXIpO1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5hZGQoTG9uZy5mcm9tTnVtYmVyKHZhbHVlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuXG4gICAgLy8gTk9URTogdGhlIGNvbXBpbGVyIHNob3VsZCBpbmxpbmUgdGhlc2UgY29uc3RhbnQgdmFsdWVzIGJlbG93IGFuZCB0aGVuIHJlbW92ZSB0aGVzZSB2YXJpYWJsZXMsIHNvIHRoZXJlIHNob3VsZCBiZVxuICAgIC8vIG5vIHJ1bnRpbWUgcGVuYWx0eSBmb3IgdGhlc2UuXG4gICAgXG4gICAgLy8gTk9URTogVGhlIGZvbGxvd2luZyBjb25zdGFudCB2YWx1ZXMgYXJlIHVzZWQgaW50ZXJuYWxseSBvbmx5IGFuZCBhcmUgdGhlcmVmb3JlIG5vdCBleHBvc2VkIGFzIHByb3BlcnRpZXMgb2YgdGhlXG4gICAgLy8gTG9uZyBjbGFzcy5cblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgdmFyIFRXT19QV1JfMTZfREJMID0gMSA8PCAxNjtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgdmFyIFRXT19QV1JfMjRfREJMID0gMSA8PCAyNDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgdmFyIFRXT19QV1JfMzJfREJMID0gVFdPX1BXUl8xNl9EQkwgKiBUV09fUFdSXzE2X0RCTDtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICovXG4gICAgdmFyIFRXT19QV1JfMzFfREJMID0gVFdPX1BXUl8zMl9EQkwgLyAyO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB2YXIgVFdPX1BXUl80OF9EQkwgPSBUV09fUFdSXzMyX0RCTCAqIFRXT19QV1JfMTZfREJMO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB2YXIgVFdPX1BXUl82NF9EQkwgPSBUV09fUFdSXzMyX0RCTCAqIFRXT19QV1JfMzJfREJMO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUge251bWJlcn1cbiAgICAgKi9cbiAgICB2YXIgVFdPX1BXUl82M19EQkwgPSBUV09fUFdSXzY0X0RCTCAvIDI7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7IUxvbmd9XG4gICAgICovXG4gICAgdmFyIFRXT19QV1JfMjQgPSBMb25nLmZyb21JbnQoMSA8PCAyNCk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7IUxvbmd9XG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuWkVSTyA9IExvbmcuZnJvbUludCgwKTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHshTG9uZ31cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5PTkUgPSBMb25nLmZyb21JbnQoMSk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7IUxvbmd9XG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuTkVHX09ORSA9IExvbmcuZnJvbUludCgtMSk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7IUxvbmd9XG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuTUFYX1NJR05FRF9WQUxVRSA9IExvbmcuZnJvbUJpdHMoMHhGRkZGRkZGRiB8IDAsIDB4N0ZGRkZGRkYgfCAwLCBmYWxzZSk7XG5cbiAgICAvKipcbiAgICAgKiBAdHlwZSB7IUxvbmd9XG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcuTUFYX1VOU0lHTkVEX1ZBTFVFID0gTG9uZy5mcm9tQml0cygweEZGRkZGRkZGIHwgMCwgMHhGRkZGRkZGRiB8IDAsIHRydWUpO1xuXG4gICAgLyoqXG4gICAgICogQWxpYXMgb2Yge0BsaW5rIExvbmcuTUFYX1NJR05FRF9WQUxVRX0gZm9yIGdvb2cubWF0aC5Mb25nIGNvbXBhdGliaWxpdHkuXG4gICAgICogQHR5cGUgeyFMb25nfVxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLk1BWF9WQUxVRSA9IExvbmcuTUFYX1NJR05FRF9WQUxVRTtcblxuICAgIC8qKlxuICAgICAqIEB0eXBlIHshTG9uZ31cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5NSU5fU0lHTkVEX1ZBTFVFID0gTG9uZy5mcm9tQml0cygwLCAweDgwMDAwMDAwIHwgMCwgZmFsc2UpO1xuXG4gICAgLyoqXG4gICAgICogQHR5cGUgeyFMb25nfVxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLk1JTl9VTlNJR05FRF9WQUxVRSA9IExvbmcuZnJvbUJpdHMoMCwgMCwgdHJ1ZSk7XG5cbiAgICAvKipcbiAgICAgKiBBbGlhcyBvZiB7QGxpbmsgTG9uZy5NSU5fU0lHTkVEX1ZBTFVFfSAgZm9yIGdvb2cubWF0aC5Mb25nIGNvbXBhdGliaWxpdHkuXG4gICAgICogQHR5cGUgeyFMb25nfVxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLk1JTl9WQUxVRSA9IExvbmcuTUlOX1NJR05FRF9WQUxVRTtcblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge251bWJlcn0gVGhlIHZhbHVlLCBhc3N1bWluZyBpdCBpcyBhIDMyLWJpdCBpbnRlZ2VyLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS50b0ludCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy51bnNpZ25lZCA/IHRoaXMubG93ID4+PiAwIDogdGhpcy5sb3c7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge251bWJlcn0gVGhlIGNsb3Nlc3QgZmxvYXRpbmctcG9pbnQgcmVwcmVzZW50YXRpb24gdG8gdGhpcyB2YWx1ZS5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUudG9OdW1iZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMudW5zaWduZWQpIHtcbiAgICAgICAgICAgIHJldHVybiAoKHRoaXMuaGlnaCA+Pj4gMCkgKiBUV09fUFdSXzMyX0RCTCkgKyAodGhpcy5sb3cgPj4+IDApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmhpZ2ggKiBUV09fUFdSXzMyX0RCTCArICh0aGlzLmxvdyA+Pj4gMCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0gcmFkaXggVGhlIHJhZGl4IGluIHdoaWNoIHRoZSB0ZXh0IHNob3VsZCBiZSB3cml0dGVuLlxuICAgICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIHRleHR1YWwgcmVwcmVzZW50YXRpb24gb2YgdGhpcyB2YWx1ZS5cbiAgICAgKiBAb3ZlcnJpZGVcbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbihyYWRpeCkge1xuICAgICAgICByYWRpeCA9IHJhZGl4IHx8IDEwO1xuICAgICAgICBpZiAocmFkaXggPCAyIHx8IDM2IDwgcmFkaXgpIHtcbiAgICAgICAgICAgIHRocm93KG5ldyBFcnJvcigncmFkaXggb3V0IG9mIHJhbmdlOiAnICsgcmFkaXgpKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5pc1plcm8oKSkge1xuICAgICAgICAgICAgcmV0dXJuICcwJztcbiAgICAgICAgfVxuICAgICAgICB2YXIgcmVtO1xuICAgICAgICBpZiAodGhpcy5pc05lZ2F0aXZlKCkpIHsgLy8gVW5zaWduZWQgTG9uZ3MgYXJlIG5ldmVyIG5lZ2F0aXZlXG4gICAgICAgICAgICBpZiAodGhpcy5lcXVhbHMoTG9uZy5NSU5fU0lHTkVEX1ZBTFVFKSkge1xuICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gY2hhbmdlIHRoZSBMb25nIHZhbHVlIGJlZm9yZSBpdCBjYW4gYmUgbmVnYXRlZCwgc28gd2UgcmVtb3ZlXG4gICAgICAgICAgICAgICAgLy8gdGhlIGJvdHRvbS1tb3N0IGRpZ2l0IGluIHRoaXMgYmFzZSBhbmQgdGhlbiByZWN1cnNlIHRvIGRvIHRoZSByZXN0LlxuICAgICAgICAgICAgICAgIHZhciByYWRpeExvbmcgPSBMb25nLmZyb21OdW1iZXIocmFkaXgpO1xuICAgICAgICAgICAgICAgIHZhciBkaXYgPSB0aGlzLmRpdihyYWRpeExvbmcpO1xuICAgICAgICAgICAgICAgIHJlbSA9IGRpdi5tdWx0aXBseShyYWRpeExvbmcpLnN1YnRyYWN0KHRoaXMpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkaXYudG9TdHJpbmcocmFkaXgpICsgcmVtLnRvSW50KCkudG9TdHJpbmcocmFkaXgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJy0nICsgdGhpcy5uZWdhdGUoKS50b1N0cmluZyhyYWRpeCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEbyBzZXZlcmFsICg2KSBkaWdpdHMgZWFjaCB0aW1lIHRocm91Z2ggdGhlIGxvb3AsIHNvIGFzIHRvXG4gICAgICAgIC8vIG1pbmltaXplIHRoZSBjYWxscyB0byB0aGUgdmVyeSBleHBlbnNpdmUgZW11bGF0ZWQgZGl2LlxuICAgICAgICB2YXIgcmFkaXhUb1Bvd2VyID0gTG9uZy5mcm9tTnVtYmVyKE1hdGgucG93KHJhZGl4LCA2KSk7XG4gICAgICAgIHJlbSA9IHRoaXM7XG4gICAgICAgIHZhciByZXN1bHQgPSAnJztcbiAgICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgICAgIHZhciByZW1EaXYgPSByZW0uZGl2KHJhZGl4VG9Qb3dlcik7XG4gICAgICAgICAgICB2YXIgaW50dmFsID0gcmVtLnN1YnRyYWN0KHJlbURpdi5tdWx0aXBseShyYWRpeFRvUG93ZXIpKS50b0ludCgpO1xuICAgICAgICAgICAgdmFyIGRpZ2l0cyA9IGludHZhbC50b1N0cmluZyhyYWRpeCk7XG4gICAgICAgICAgICByZW0gPSByZW1EaXY7XG4gICAgICAgICAgICBpZiAocmVtLmlzWmVybygpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGRpZ2l0cyArIHJlc3VsdDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGRpZ2l0cy5sZW5ndGggPCA2KSB7XG4gICAgICAgICAgICAgICAgICAgIGRpZ2l0cyA9ICcwJyArIGRpZ2l0cztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gJycgKyBkaWdpdHMgKyByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7bnVtYmVyfSBUaGUgaGlnaCAzMiBiaXRzIGFzIGEgc2lnbmVkIHZhbHVlLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5nZXRIaWdoQml0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5oaWdoO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSBoaWdoIDMyIGJpdHMgYXMgYW4gdW5zaWduZWQgdmFsdWUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmdldEhpZ2hCaXRzVW5zaWduZWQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGlnaCA+Pj4gMDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7bnVtYmVyfSBUaGUgbG93IDMyIGJpdHMgYXMgYSBzaWduZWQgdmFsdWUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmdldExvd0JpdHMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubG93O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IFRoZSBsb3cgMzIgYml0cyBhcyBhbiB1bnNpZ25lZCB2YWx1ZS5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuZ2V0TG93Qml0c1Vuc2lnbmVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmxvdyA+Pj4gMDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7bnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIgb2YgYml0cyBuZWVkZWQgdG8gcmVwcmVzZW50IHRoZSBhYnNvbHV0ZVxuICAgICAqICAgICB2YWx1ZSBvZiB0aGlzIExvbmcuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmdldE51bUJpdHNBYnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuaXNOZWdhdGl2ZSgpKSB7IC8vIFVuc2lnbmVkIExvbmdzIGFyZSBuZXZlciBuZWdhdGl2ZVxuICAgICAgICAgICAgaWYgKHRoaXMuZXF1YWxzKExvbmcuTUlOX1NJR05FRF9WQUxVRSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gNjQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZ2F0ZSgpLmdldE51bUJpdHNBYnMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciB2YWwgPSB0aGlzLmhpZ2ggIT0gMCA/IHRoaXMuaGlnaCA6IHRoaXMubG93O1xuICAgICAgICAgICAgZm9yICh2YXIgYml0ID0gMzE7IGJpdCA+IDA7IGJpdC0tKSB7XG4gICAgICAgICAgICAgICAgaWYgKCh2YWwgJiAoMSA8PCBiaXQpKSAhPSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmhpZ2ggIT0gMCA/IGJpdCArIDMzIDogYml0ICsgMTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoaXMgdmFsdWUgaXMgemVyby5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuaXNaZXJvID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmhpZ2ggPT0gMCAmJiB0aGlzLmxvdyA9PSAwO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoaXMgdmFsdWUgaXMgbmVnYXRpdmUuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmlzTmVnYXRpdmUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuICF0aGlzLnVuc2lnbmVkICYmIHRoaXMuaGlnaCA8IDA7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhpcyB2YWx1ZSBpcyBvZGQuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmlzT2RkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5sb3cgJiAxKSA9PSAxO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoaXMgdmFsdWUgaXMgZXZlbi5cbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5pc0V2ZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuICh0aGlzLmxvdyAmIDEpID09IDA7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7TG9uZ30gb3RoZXIgTG9uZyB0byBjb21wYXJlIGFnYWluc3QuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gV2hldGhlciB0aGlzIExvbmcgZXF1YWxzIHRoZSBvdGhlci5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgaWYgKHRoaXMudW5zaWduZWQgIT0gb3RoZXIudW5zaWduZWQgJiYgKHRoaXMuaGlnaCA+Pj4gMzEpICE9IChvdGhlci5oaWdoID4+PiAzMSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgcmV0dXJuICh0aGlzLmhpZ2ggPT0gb3RoZXIuaGlnaCkgJiYgKHRoaXMubG93ID09IG90aGVyLmxvdyk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7TG9uZ30gb3RoZXIgTG9uZyB0byBjb21wYXJlIGFnYWluc3QuXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn0gV2hldGhlciB0aGlzIExvbmcgZG9lcyBub3QgZXF1YWwgdGhlIG90aGVyLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5ub3RFcXVhbHMgPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gIXRoaXMuZXF1YWxzKG90aGVyKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBMb25nIHRvIGNvbXBhcmUgYWdhaW5zdC5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoaXMgTG9uZyBpcyBsZXNzIHRoYW4gdGhlIG90aGVyLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5sZXNzVGhhbiA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbXBhcmUob3RoZXIpIDwgMDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBMb25nIHRvIGNvbXBhcmUgYWdhaW5zdC5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufSBXaGV0aGVyIHRoaXMgTG9uZyBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIG90aGVyLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5sZXNzVGhhbk9yRXF1YWwgPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gdGhpcy5jb21wYXJlKG90aGVyKSA8PSAwO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0xvbmd9IG90aGVyIExvbmcgdG8gY29tcGFyZSBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhpcyBMb25nIGlzIGdyZWF0ZXIgdGhhbiB0aGUgb3RoZXIuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmdyZWF0ZXJUaGFuID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29tcGFyZShvdGhlcikgPiAwO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge0xvbmd9IG90aGVyIExvbmcgdG8gY29tcGFyZSBhZ2FpbnN0LlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IFdoZXRoZXIgdGhpcyBMb25nIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byB0aGUgb3RoZXIuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmdyZWF0ZXJUaGFuT3JFcXVhbCA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbXBhcmUob3RoZXIpID49IDA7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIENvbXBhcmVzIHRoaXMgTG9uZyB3aXRoIHRoZSBnaXZlbiBvbmUuXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBMb25nIHRvIGNvbXBhcmUgYWdhaW5zdC5cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9IDAgaWYgdGhleSBhcmUgdGhlIHNhbWUsIDEgaWYgdGhlIHRoaXMgaXMgZ3JlYXRlciwgYW5kIC0xXG4gICAgICogICAgIGlmIHRoZSBnaXZlbiBvbmUgaXMgZ3JlYXRlci5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIGlmICh0aGlzLmVxdWFscyhvdGhlcikpIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgICAgIHZhciB0aGlzTmVnID0gdGhpcy5pc05lZ2F0aXZlKCk7XG4gICAgICAgIHZhciBvdGhlck5lZyA9IG90aGVyLmlzTmVnYXRpdmUoKTtcbiAgICAgICAgaWYgKHRoaXNOZWcgJiYgIW90aGVyTmVnKSByZXR1cm4gLTE7XG4gICAgICAgIGlmICghdGhpc05lZyAmJiBvdGhlck5lZykgcmV0dXJuIDE7XG4gICAgICAgIGlmICghdGhpcy51bnNpZ25lZCkge1xuICAgICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCB0aGUgc2lnbnMgYXJlIHRoZSBzYW1lXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdWJ0cmFjdChvdGhlcikuaXNOZWdhdGl2ZSgpID8gLTEgOiAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQm90aCBhcmUgcG9zaXRpdmUgaWYgYXQgbGVhc3Qgb25lIGlzIHVuc2lnbmVkXG4gICAgICAgICAgICByZXR1cm4gKG90aGVyLmhpZ2ggPj4+IDApID4gKHRoaXMuaGlnaCA+Pj4gMCkgfHwgKG90aGVyLmhpZ2ggPT0gdGhpcy5oaWdoICYmIChvdGhlci5sb3cgPj4+IDApID4gKHRoaXMubG93ID4+PiAwKSkgPyAtMSA6IDE7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBuZWdhdGlvbiBvZiB0aGlzIHZhbHVlLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5uZWdhdGUgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYgKCF0aGlzLnVuc2lnbmVkICYmIHRoaXMuZXF1YWxzKExvbmcuTUlOX1NJR05FRF9WQUxVRSkpIHtcbiAgICAgICAgICAgIHJldHVybiBMb25nLk1JTl9TSUdORURfVkFMVUU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMubm90KCkuYWRkKExvbmcuT05FKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3VtIG9mIHRoaXMgYW5kIHRoZSBnaXZlbiBMb25nLlxuICAgICAqIEBwYXJhbSB7TG9uZ30gb3RoZXIgTG9uZyB0byBhZGQgdG8gdGhpcyBvbmUuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBzdW0gb2YgdGhpcyBhbmQgdGhlIGdpdmVuIExvbmcuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIC8vIERpdmlkZSBlYWNoIG51bWJlciBpbnRvIDQgY2h1bmtzIG9mIDE2IGJpdHMsIGFuZCB0aGVuIHN1bSB0aGUgY2h1bmtzLlxuICAgICAgICBcbiAgICAgICAgdmFyIGE0OCA9IHRoaXMuaGlnaCA+Pj4gMTY7XG4gICAgICAgIHZhciBhMzIgPSB0aGlzLmhpZ2ggJiAweEZGRkY7XG4gICAgICAgIHZhciBhMTYgPSB0aGlzLmxvdyA+Pj4gMTY7XG4gICAgICAgIHZhciBhMDAgPSB0aGlzLmxvdyAmIDB4RkZGRjtcblxuICAgICAgICB2YXIgYjQ4ID0gb3RoZXIuaGlnaCA+Pj4gMTY7XG4gICAgICAgIHZhciBiMzIgPSBvdGhlci5oaWdoICYgMHhGRkZGO1xuICAgICAgICB2YXIgYjE2ID0gb3RoZXIubG93ID4+PiAxNjtcbiAgICAgICAgdmFyIGIwMCA9IG90aGVyLmxvdyAmIDB4RkZGRjtcblxuICAgICAgICB2YXIgYzQ4ID0gMCwgYzMyID0gMCwgYzE2ID0gMCwgYzAwID0gMDtcbiAgICAgICAgYzAwICs9IGEwMCArIGIwMDtcbiAgICAgICAgYzE2ICs9IGMwMCA+Pj4gMTY7XG4gICAgICAgIGMwMCAmPSAweEZGRkY7XG4gICAgICAgIGMxNiArPSBhMTYgKyBiMTY7XG4gICAgICAgIGMzMiArPSBjMTYgPj4+IDE2O1xuICAgICAgICBjMTYgJj0gMHhGRkZGO1xuICAgICAgICBjMzIgKz0gYTMyICsgYjMyO1xuICAgICAgICBjNDggKz0gYzMyID4+PiAxNjtcbiAgICAgICAgYzMyICY9IDB4RkZGRjtcbiAgICAgICAgYzQ4ICs9IGE0OCArIGI0ODtcbiAgICAgICAgYzQ4ICY9IDB4RkZGRjtcbiAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMoKGMxNiA8PCAxNikgfCBjMDAsIChjNDggPDwgMTYpIHwgYzMyLCB0aGlzLnVuc2lnbmVkKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgZGlmZmVyZW5jZSBvZiB0aGlzIGFuZCB0aGUgZ2l2ZW4gTG9uZy5cbiAgICAgKiBAcGFyYW0ge0xvbmd9IG90aGVyIExvbmcgdG8gc3VidHJhY3QgZnJvbSB0aGlzLlxuICAgICAqIEByZXR1cm4geyFMb25nfSBUaGUgZGlmZmVyZW5jZSBvZiB0aGlzIGFuZCB0aGUgZ2l2ZW4gTG9uZy5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuc3VidHJhY3QgPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gdGhpcy5hZGQob3RoZXIubmVnYXRlKCkpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwcm9kdWN0IG9mIHRoaXMgYW5kIHRoZSBnaXZlbiBsb25nLlxuICAgICAqIEBwYXJhbSB7TG9uZ30gb3RoZXIgTG9uZyB0byBtdWx0aXBseSB3aXRoIHRoaXMuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBwcm9kdWN0IG9mIHRoaXMgYW5kIHRoZSBvdGhlci5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUubXVsdGlwbHkgPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICBpZiAodGhpcy5pc1plcm8oKSkge1xuICAgICAgICAgICAgcmV0dXJuIExvbmcuWkVSTztcbiAgICAgICAgfSBlbHNlIGlmIChvdGhlci5pc1plcm8oKSkge1xuICAgICAgICAgICAgcmV0dXJuIExvbmcuWkVSTztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmVxdWFscyhMb25nLk1JTl9WQUxVRSkpIHtcbiAgICAgICAgICAgIHJldHVybiBvdGhlci5pc09kZCgpID8gTG9uZy5NSU5fVkFMVUUgOiBMb25nLlpFUk87XG4gICAgICAgIH0gZWxzZSBpZiAob3RoZXIuZXF1YWxzKExvbmcuTUlOX1ZBTFVFKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaXNPZGQoKSA/IExvbmcuTUlOX1ZBTFVFIDogTG9uZy5aRVJPO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuaXNOZWdhdGl2ZSgpKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuaXNOZWdhdGl2ZSgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMubmVnYXRlKCkubXVsdGlwbHkob3RoZXIubmVnYXRlKCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5uZWdhdGUoKS5tdWx0aXBseShvdGhlcikubmVnYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAob3RoZXIuaXNOZWdhdGl2ZSgpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tdWx0aXBseShvdGhlci5uZWdhdGUoKSkubmVnYXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gSWYgYm90aCBsb25ncyBhcmUgc21hbGwsIHVzZSBmbG9hdCBtdWx0aXBsaWNhdGlvblxuICAgICAgICBpZiAodGhpcy5sZXNzVGhhbihUV09fUFdSXzI0KSAmJlxuICAgICAgICAgICAgb3RoZXIubGVzc1RoYW4oVFdPX1BXUl8yNCkpIHtcbiAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21OdW1iZXIodGhpcy50b051bWJlcigpICogb3RoZXIudG9OdW1iZXIoKSwgdGhpcy51bnNpZ25lZCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEaXZpZGUgZWFjaCBsb25nIGludG8gNCBjaHVua3Mgb2YgMTYgYml0cywgYW5kIHRoZW4gYWRkIHVwIDR4NCBwcm9kdWN0cy5cbiAgICAgICAgLy8gV2UgY2FuIHNraXAgcHJvZHVjdHMgdGhhdCB3b3VsZCBvdmVyZmxvdy5cbiAgICAgICAgXG4gICAgICAgIHZhciBhNDggPSB0aGlzLmhpZ2ggPj4+IDE2O1xuICAgICAgICB2YXIgYTMyID0gdGhpcy5oaWdoICYgMHhGRkZGO1xuICAgICAgICB2YXIgYTE2ID0gdGhpcy5sb3cgPj4+IDE2O1xuICAgICAgICB2YXIgYTAwID0gdGhpcy5sb3cgJiAweEZGRkY7XG5cbiAgICAgICAgdmFyIGI0OCA9IG90aGVyLmhpZ2ggPj4+IDE2O1xuICAgICAgICB2YXIgYjMyID0gb3RoZXIuaGlnaCAmIDB4RkZGRjtcbiAgICAgICAgdmFyIGIxNiA9IG90aGVyLmxvdyA+Pj4gMTY7XG4gICAgICAgIHZhciBiMDAgPSBvdGhlci5sb3cgJiAweEZGRkY7XG5cbiAgICAgICAgdmFyIGM0OCA9IDAsIGMzMiA9IDAsIGMxNiA9IDAsIGMwMCA9IDA7XG4gICAgICAgIGMwMCArPSBhMDAgKiBiMDA7XG4gICAgICAgIGMxNiArPSBjMDAgPj4+IDE2O1xuICAgICAgICBjMDAgJj0gMHhGRkZGO1xuICAgICAgICBjMTYgKz0gYTE2ICogYjAwO1xuICAgICAgICBjMzIgKz0gYzE2ID4+PiAxNjtcbiAgICAgICAgYzE2ICY9IDB4RkZGRjtcbiAgICAgICAgYzE2ICs9IGEwMCAqIGIxNjtcbiAgICAgICAgYzMyICs9IGMxNiA+Pj4gMTY7XG4gICAgICAgIGMxNiAmPSAweEZGRkY7XG4gICAgICAgIGMzMiArPSBhMzIgKiBiMDA7XG4gICAgICAgIGM0OCArPSBjMzIgPj4+IDE2O1xuICAgICAgICBjMzIgJj0gMHhGRkZGO1xuICAgICAgICBjMzIgKz0gYTE2ICogYjE2O1xuICAgICAgICBjNDggKz0gYzMyID4+PiAxNjtcbiAgICAgICAgYzMyICY9IDB4RkZGRjtcbiAgICAgICAgYzMyICs9IGEwMCAqIGIzMjtcbiAgICAgICAgYzQ4ICs9IGMzMiA+Pj4gMTY7XG4gICAgICAgIGMzMiAmPSAweEZGRkY7XG4gICAgICAgIGM0OCArPSBhNDggKiBiMDAgKyBhMzIgKiBiMTYgKyBhMTYgKiBiMzIgKyBhMDAgKiBiNDg7XG4gICAgICAgIGM0OCAmPSAweEZGRkY7XG4gICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKChjMTYgPDwgMTYpIHwgYzAwLCAoYzQ4IDw8IDE2KSB8IGMzMiwgdGhpcy51bnNpZ25lZCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhpcyBMb25nIGRpdmlkZWQgYnkgdGhlIGdpdmVuIG9uZS5cbiAgICAgKiBAcGFyYW0ge0xvbmd9IG90aGVyIExvbmcgYnkgd2hpY2ggdG8gZGl2aWRlLlxuICAgICAqIEByZXR1cm4geyFMb25nfSBUaGlzIExvbmcgZGl2aWRlZCBieSB0aGUgZ2l2ZW4gb25lLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5kaXYgPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICBpZiAob3RoZXIuaXNaZXJvKCkpIHtcbiAgICAgICAgICAgIHRocm93KG5ldyBFcnJvcignZGl2aXNpb24gYnkgemVybycpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmlzWmVybygpKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5aRVJPO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmVxdWFscyhMb25nLk1JTl9TSUdORURfVkFMVUUpKSB7XG4gICAgICAgICAgICBpZiAob3RoZXIuZXF1YWxzKExvbmcuT05FKSB8fCBvdGhlci5lcXVhbHMoTG9uZy5ORUdfT05FKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtaW47ICAvLyByZWNhbGwgdGhhdCAtTUlOX1ZBTFVFID09IE1JTl9WQUxVRVxuICAgICAgICAgICAgfSBlbHNlIGlmIChvdGhlci5lcXVhbHMoTG9uZy5NSU5fVkFMVUUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIExvbmcuT05FO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBBdCB0aGlzIHBvaW50LCB3ZSBoYXZlIHxvdGhlcnwgPj0gMiwgc28gfHRoaXMvb3RoZXJ8IDwgfE1JTl9WQUxVRXwuXG4gICAgICAgICAgICAgICAgdmFyIGhhbGZUaGlzID0gdGhpcy5zaGlmdFJpZ2h0KDEpO1xuICAgICAgICAgICAgICAgIHZhciBhcHByb3ggPSBoYWxmVGhpcy5kaXYob3RoZXIpLnNoaWZ0TGVmdCgxKTtcbiAgICAgICAgICAgICAgICBpZiAoYXBwcm94LmVxdWFscyhMb25nLlpFUk8pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBvdGhlci5pc05lZ2F0aXZlKCkgPyBMb25nLk9ORSA6IExvbmcuTkVHX09ORTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVtID0gdGhpcy5zdWJ0cmFjdChvdGhlci5tdWx0aXBseShhcHByb3gpKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IGFwcHJveC5hZGQocmVtLmRpdihvdGhlcikpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChvdGhlci5lcXVhbHMoTG9uZy5NSU5fVkFMVUUpKSB7XG4gICAgICAgICAgICByZXR1cm4gTG9uZy5aRVJPO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmlzTmVnYXRpdmUoKSkge1xuICAgICAgICAgICAgaWYgKG90aGVyLmlzTmVnYXRpdmUoKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZ2F0ZSgpLmRpdihvdGhlci5uZWdhdGUoKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5lZ2F0ZSgpLmRpdihvdGhlcikubmVnYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAob3RoZXIuaXNOZWdhdGl2ZSgpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5kaXYob3RoZXIubmVnYXRlKCkpLm5lZ2F0ZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVwZWF0IHRoZSBmb2xsb3dpbmcgdW50aWwgdGhlIHJlbWFpbmRlciBpcyBsZXNzIHRoYW4gb3RoZXI6ICBmaW5kIGFcbiAgICAgICAgLy8gZmxvYXRpbmctcG9pbnQgdGhhdCBhcHByb3hpbWF0ZXMgcmVtYWluZGVyIC8gb3RoZXIgKmZyb20gYmVsb3cqLCBhZGQgdGhpc1xuICAgICAgICAvLyBpbnRvIHRoZSByZXN1bHQsIGFuZCBzdWJ0cmFjdCBpdCBmcm9tIHRoZSByZW1haW5kZXIuICBJdCBpcyBjcml0aWNhbCB0aGF0XG4gICAgICAgIC8vIHRoZSBhcHByb3hpbWF0ZSB2YWx1ZSBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHJlYWwgdmFsdWUgc28gdGhhdCB0aGVcbiAgICAgICAgLy8gcmVtYWluZGVyIG5ldmVyIGJlY29tZXMgbmVnYXRpdmUuXG4gICAgICAgIHZhciByZXMgPSBMb25nLlpFUk87XG4gICAgICAgIHZhciByZW0gPSB0aGlzO1xuICAgICAgICB3aGlsZSAocmVtLmdyZWF0ZXJUaGFuT3JFcXVhbChvdGhlcikpIHtcbiAgICAgICAgICAgIC8vIEFwcHJveGltYXRlIHRoZSByZXN1bHQgb2YgZGl2aXNpb24uIFRoaXMgbWF5IGJlIGEgbGl0dGxlIGdyZWF0ZXIgb3JcbiAgICAgICAgICAgIC8vIHNtYWxsZXIgdGhhbiB0aGUgYWN0dWFsIHZhbHVlLlxuICAgICAgICAgICAgdmFyIGFwcHJveCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IocmVtLnRvTnVtYmVyKCkgLyBvdGhlci50b051bWJlcigpKSk7XG5cbiAgICAgICAgICAgIC8vIFdlIHdpbGwgdHdlYWsgdGhlIGFwcHJveGltYXRlIHJlc3VsdCBieSBjaGFuZ2luZyBpdCBpbiB0aGUgNDgtdGggZGlnaXQgb3JcbiAgICAgICAgICAgIC8vIHRoZSBzbWFsbGVzdCBub24tZnJhY3Rpb25hbCBkaWdpdCwgd2hpY2hldmVyIGlzIGxhcmdlci5cbiAgICAgICAgICAgIHZhciBsb2cyID0gTWF0aC5jZWlsKE1hdGgubG9nKGFwcHJveCkgLyBNYXRoLkxOMik7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSAobG9nMiA8PSA0OCkgPyAxIDogTWF0aC5wb3coMiwgbG9nMiAtIDQ4KTtcblxuICAgICAgICAgICAgLy8gRGVjcmVhc2UgdGhlIGFwcHJveGltYXRpb24gdW50aWwgaXQgaXMgc21hbGxlciB0aGFuIHRoZSByZW1haW5kZXIuICBOb3RlXG4gICAgICAgICAgICAvLyB0aGF0IGlmIGl0IGlzIHRvbyBsYXJnZSwgdGhlIHByb2R1Y3Qgb3ZlcmZsb3dzIGFuZCBpcyBuZWdhdGl2ZS5cbiAgICAgICAgICAgIHZhciBhcHByb3hSZXMgPSBMb25nLmZyb21OdW1iZXIoYXBwcm94LCB0aGlzLnVuc2lnbmVkKTtcbiAgICAgICAgICAgIHZhciBhcHByb3hSZW0gPSBhcHByb3hSZXMubXVsdGlwbHkob3RoZXIpO1xuICAgICAgICAgICAgd2hpbGUgKGFwcHJveFJlbS5pc05lZ2F0aXZlKCkgfHwgYXBwcm94UmVtLmdyZWF0ZXJUaGFuKHJlbSkpIHtcbiAgICAgICAgICAgICAgICBhcHByb3ggLT0gZGVsdGE7XG4gICAgICAgICAgICAgICAgYXBwcm94UmVzID0gTG9uZy5mcm9tTnVtYmVyKGFwcHJveCwgdGhpcy51bnNpZ25lZCk7XG4gICAgICAgICAgICAgICAgYXBwcm94UmVtID0gYXBwcm94UmVzLm11bHRpcGx5KG90aGVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gV2Uga25vdyB0aGUgYW5zd2VyIGNhbid0IGJlIHplcm8uLi4gYW5kIGFjdHVhbGx5LCB6ZXJvIHdvdWxkIGNhdXNlXG4gICAgICAgICAgICAvLyBpbmZpbml0ZSByZWN1cnNpb24gc2luY2Ugd2Ugd291bGQgbWFrZSBubyBwcm9ncmVzcy5cbiAgICAgICAgICAgIGlmIChhcHByb3hSZXMuaXNaZXJvKCkpIHtcbiAgICAgICAgICAgICAgICBhcHByb3hSZXMgPSBMb25nLk9ORTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVzID0gcmVzLmFkZChhcHByb3hSZXMpO1xuICAgICAgICAgICAgcmVtID0gcmVtLnN1YnRyYWN0KGFwcHJveFJlbSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGlzIExvbmcgbW9kdWxvIHRoZSBnaXZlbiBvbmUuXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBMb25nIGJ5IHdoaWNoIHRvIG1vZC5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVGhpcyBMb25nIG1vZHVsbyB0aGUgZ2l2ZW4gb25lLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5tb2R1bG8gPSBmdW5jdGlvbihvdGhlcikge1xuICAgICAgICByZXR1cm4gdGhpcy5zdWJ0cmFjdCh0aGlzLmRpdihvdGhlcikubXVsdGlwbHkob3RoZXIpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBiaXR3aXNlLU5PVCBvZiB0aGlzIHZhbHVlLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5ub3QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMofnRoaXMubG93LCB+dGhpcy5oaWdoLCB0aGlzLnVuc2lnbmVkKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgYml0d2lzZS1BTkQgb2YgdGhpcyBMb25nIGFuZCB0aGUgZ2l2ZW4gb25lLlxuICAgICAqIEBwYXJhbSB7TG9uZ30gb3RoZXIgVGhlIExvbmcgd2l0aCB3aGljaCB0byBBTkQuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoZSBiaXR3aXNlLUFORCBvZiB0aGlzIGFuZCB0aGUgb3RoZXIuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLmFuZCA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKHRoaXMubG93ICYgb3RoZXIubG93LCB0aGlzLmhpZ2ggJiBvdGhlci5oaWdoLCB0aGlzLnVuc2lnbmVkKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgYml0d2lzZS1PUiBvZiB0aGlzIExvbmcgYW5kIHRoZSBnaXZlbiBvbmUuXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBUaGUgTG9uZyB3aXRoIHdoaWNoIHRvIE9SLlxuICAgICAqIEByZXR1cm4geyFMb25nfSBUaGUgYml0d2lzZS1PUiBvZiB0aGlzIGFuZCB0aGUgb3RoZXIuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLm9yID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHModGhpcy5sb3cgfCBvdGhlci5sb3csIHRoaXMuaGlnaCB8IG90aGVyLmhpZ2gsIHRoaXMudW5zaWduZWQpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBiaXR3aXNlLVhPUiBvZiB0aGlzIExvbmcgYW5kIHRoZSBnaXZlbiBvbmUuXG4gICAgICogQHBhcmFtIHtMb25nfSBvdGhlciBUaGUgTG9uZyB3aXRoIHdoaWNoIHRvIFhPUi5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVGhlIGJpdHdpc2UtWE9SIG9mIHRoaXMgYW5kIHRoZSBvdGhlci5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUueG9yID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHModGhpcy5sb3cgXiBvdGhlci5sb3csIHRoaXMuaGlnaCBeIG90aGVyLmhpZ2gsIHRoaXMudW5zaWduZWQpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoaXMgTG9uZyB3aXRoIGJpdHMgc2hpZnRlZCB0byB0aGUgbGVmdCBieSB0aGUgZ2l2ZW4gYW1vdW50LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBudW1CaXRzIFRoZSBudW1iZXIgb2YgYml0cyBieSB3aGljaCB0byBzaGlmdC5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVGhpcyBzaGlmdGVkIHRvIHRoZSBsZWZ0IGJ5IHRoZSBnaXZlbiBhbW91bnQuXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLnNoaWZ0TGVmdCA9IGZ1bmN0aW9uKG51bUJpdHMpIHtcbiAgICAgICAgbnVtQml0cyAmPSA2MztcbiAgICAgICAgaWYgKG51bUJpdHMgPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgbG93ID0gdGhpcy5sb3c7XG4gICAgICAgICAgICBpZiAobnVtQml0cyA8IDMyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGhpZ2ggPSB0aGlzLmhpZ2g7XG4gICAgICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMobG93IDw8IG51bUJpdHMsIChoaWdoIDw8IG51bUJpdHMpIHwgKGxvdyA+Pj4gKDMyIC0gbnVtQml0cykpLCB0aGlzLnVuc2lnbmVkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMoMCwgbG93IDw8IChudW1CaXRzIC0gMzIpLCB0aGlzLnVuc2lnbmVkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoaXMgTG9uZyB3aXRoIGJpdHMgc2hpZnRlZCB0byB0aGUgcmlnaHQgYnkgdGhlIGdpdmVuIGFtb3VudC5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbnVtQml0cyBUaGUgbnVtYmVyIG9mIGJpdHMgYnkgd2hpY2ggdG8gc2hpZnQuXG4gICAgICogQHJldHVybiB7IUxvbmd9IFRoaXMgc2hpZnRlZCB0byB0aGUgcmlnaHQgYnkgdGhlIGdpdmVuIGFtb3VudC5cbiAgICAgKiBAZXhwb3NlXG4gICAgICovXG4gICAgTG9uZy5wcm90b3R5cGUuc2hpZnRSaWdodCA9IGZ1bmN0aW9uKG51bUJpdHMpIHtcbiAgICAgICAgbnVtQml0cyAmPSA2MztcbiAgICAgICAgaWYgKG51bUJpdHMgPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgaGlnaCA9IHRoaXMuaGlnaDtcbiAgICAgICAgICAgIGlmIChudW1CaXRzIDwgMzIpIHtcbiAgICAgICAgICAgICAgICB2YXIgbG93ID0gdGhpcy5sb3c7XG4gICAgICAgICAgICAgICAgcmV0dXJuIExvbmcuZnJvbUJpdHMoKGxvdyA+Pj4gbnVtQml0cykgfCAoaGlnaCA8PCAoMzIgLSBudW1CaXRzKSksIGhpZ2ggPj4gbnVtQml0cywgdGhpcy51bnNpZ25lZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKGhpZ2ggPj4gKG51bUJpdHMgLSAzMiksIGhpZ2ggPj0gMCA/IDAgOiAtMSwgdGhpcy51bnNpZ25lZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGlzIExvbmcgd2l0aCBiaXRzIHNoaWZ0ZWQgdG8gdGhlIHJpZ2h0IGJ5IHRoZSBnaXZlbiBhbW91bnQsIHdpdGhcbiAgICAgKiB0aGUgbmV3IHRvcCBiaXRzIG1hdGNoaW5nIHRoZSBjdXJyZW50IHNpZ24gYml0LlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBudW1CaXRzIFRoZSBudW1iZXIgb2YgYml0cyBieSB3aGljaCB0byBzaGlmdC5cbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVGhpcyBzaGlmdGVkIHRvIHRoZSByaWdodCBieSB0aGUgZ2l2ZW4gYW1vdW50LCB3aXRoXG4gICAgICogICAgIHplcm9zIHBsYWNlZCBpbnRvIHRoZSBuZXcgbGVhZGluZyBiaXRzLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5zaGlmdFJpZ2h0VW5zaWduZWQgPSBmdW5jdGlvbihudW1CaXRzKSB7XG4gICAgICAgIG51bUJpdHMgJj0gNjM7XG4gICAgICAgIGlmIChudW1CaXRzID09IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGhpZ2ggPSB0aGlzLmhpZ2g7XG4gICAgICAgICAgICBpZiAobnVtQml0cyA8IDMyKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxvdyA9IHRoaXMubG93O1xuICAgICAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKChsb3cgPj4+IG51bUJpdHMpIHwgKGhpZ2ggPDwgKDMyIC0gbnVtQml0cykpLCBoaWdoID4+PiBudW1CaXRzLCB0aGlzLnVuc2lnbmVkKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobnVtQml0cyA9PSAzMikge1xuICAgICAgICAgICAgICAgIHJldHVybiBMb25nLmZyb21CaXRzKGhpZ2gsIDAsIHRoaXMudW5zaWduZWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gTG9uZy5mcm9tQml0cyhoaWdoID4+PiAobnVtQml0cyAtIDMyKSwgMCwgdGhpcy51bnNpZ25lZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7IUxvbmd9IFNpZ25lZCBsb25nXG4gICAgICogQGV4cG9zZVxuICAgICAqL1xuICAgIExvbmcucHJvdG90eXBlLnRvU2lnbmVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBsID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICBsLnVuc2lnbmVkID0gZmFsc2U7XG4gICAgICAgIHJldHVybiBsO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHshTG9uZ30gVW5zaWduZWQgbG9uZ1xuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS50b1Vuc2lnbmVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBsID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICBsLnVuc2lnbmVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIGw7XG4gICAgfTtcbiAgICBcbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtMb25nfSBDbG9uZWQgaW5zdGFuY2Ugd2l0aCB0aGUgc2FtZSBsb3cvaGlnaCBiaXRzIGFuZCB1bnNpZ25lZCBmbGFnLlxuICAgICAqIEBleHBvc2VcbiAgICAgKi9cbiAgICBMb25nLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gbmV3IExvbmcodGhpcy5sb3csIHRoaXMuaGlnaCwgdGhpcy51bnNpZ25lZCk7XG4gICAgfTtcblxuICAgIC8vIEVuYWJsZSBtb2R1bGUgbG9hZGluZyBpZiBhdmFpbGFibGVcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPSAndW5kZWZpbmVkJyAmJiBtb2R1bGVbXCJleHBvcnRzXCJdKSB7IC8vIENvbW1vbkpTXG4gICAgICAgIG1vZHVsZVtcImV4cG9ydHNcIl0gPSBMb25nO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSAhPSAndW5kZWZpbmVkJyAmJiBkZWZpbmVbXCJhbWRcIl0pIHsgLy8gQU1EXG4gICAgICAgIGRlZmluZShcIk1hdGgvTG9uZ1wiLCBbXSwgZnVuY3Rpb24oKSB7IHJldHVybiBMb25nOyB9KTtcbiAgICB9IGVsc2UgeyAvLyBTaGltXG4gICAgICAgIGlmICghZ2xvYmFsW1wiZGNvZGVJT1wiXSkge1xuICAgICAgICAgICAgZ2xvYmFsW1wiZGNvZGVJT1wiXSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIGdsb2JhbFtcImRjb2RlSU9cIl1bXCJMb25nXCJdID0gTG9uZztcbiAgICB9XG5cbn0pKHRoaXMpO1xuIiwiLy9rbWVhbnNcbi8vIFsgWyBmbG9hdCBdX3IgXV9wICogaW50PT1rICogaW50IC0+XG4vLyB7bGFiZWxpbmc6IFsgaW50IDw9IGsgXV9wLCBjZW50ZXJzOiBbIFsgZmxvYXQgXV9yIF1faywgYXNzaWdubWVudHM6IFsgWyB7cm93OiBpbnQsIGRpc3Q6IGZsb2F0fV0gXV9rfVxuXG5mdW5jdGlvbiBrbWVhbnMgKGRhdGEsIGssIG1heFN0ZXBzKSB7XG5cdGlmIChrID4gZGF0YS5sZW5ndGgpIHRocm93ICdrIG11c3QgYmUgbGVzcyB0aGFuIHJhbmsnO1xuXG5cdC8vZ3JhYiBrIHJhbmRvbSByb3dzXG5cdC8vIFsgW2Zsb2F0XSBdXyhtPmspICogazppbnQgLT4gWyBbZmxvYXRdIF1fa1xuXHQvLyBUT0RPIGsrKyBpbml0aWFsaXplclxuXHRmdW5jdGlvbiBpbml0IChkYXRhLCBrKSB7XG5cdFx0dmFyIG9wdHMgPSBbXTtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIG9wdHMucHVzaChpKTtcblxuXHRcdHZhciByb3dzID0gW107XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBrOyBpKyspXG5cdFx0XHRyb3dzLnB1c2gob3B0cy5zcGxpY2UoTWF0aC5yb3VuZChNYXRoLnJhbmRvbSgpICogb3B0cy5sZW5ndGgpLDEpKTtcblxuXHRcdHJldHVybiByb3dzLm1hcChmdW5jdGlvbiAoaWR4KSB7IHJldHVybiBkYXRhW2lkeF07IH0pO1xuXHR9XG5cblx0Ly9ldWNsaWRlYW46IHNxcnQgb2Ygc3VtIG9mIHNxdWFyZXNcblx0Ly8gWyBmbG9hdCBdX2sgKiBbIGZsb2F0IF1fayAtPiBmbG9hdFxuXHRmdW5jdGlvbiBkaXN0IChyb3csIGNlbnRlcikge1xuXHRcdHZhciBzdW0gPSAwO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgcm93Lmxlbmd0aDsgaSsrKVxuXHRcdFx0c3VtICs9IE1hdGgucG93KHJvd1tpXSAtIGNlbnRlcltpXSwgMik7XG5cdFx0cmV0dXJuIE1hdGguc3FydChzdW0pO1xuXHR9XG5cblx0Ly9jbG9zZXN0IGNsdXN0ZXJcblx0Ly8gWyBmbG9hdCBdX3IgKiBbIFsgZmxvYXQgXV9yIF1fayAtPiBpbnRcblx0ZnVuY3Rpb24gYXNzaWduIChyb3csIGNlbnRlcnMpIHtcblx0XHR2YXIgY2VudGVyID0gMDtcblx0XHR2YXIgc2NvcmUgPSBkaXN0KHJvdywgY2VudGVyc1swXSk7XG5cdFx0Zm9yICh2YXIgaSA9IDE7IGkgPCBjZW50ZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR2YXIgYXR0ZW1wdCA9IGRpc3Qocm93LCBjZW50ZXJzW2ldKTtcblx0XHRcdGlmIChhdHRlbXB0IDwgc2NvcmUpIHtcblx0XHRcdFx0Y2VudGVyID0gaTtcblx0XHRcdFx0c2NvcmUgPSBhdHRlbXB0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge2NsdXN0ZXI6IGNlbnRlciwgc2NvcmU6IHNjb3JlfTtcblx0fVxuXG5cdC8vIHJlbGFiZWwgcG9pbnRzIGFuZCByZXR1cm4gd2hldGhlciBhbnkgY2hhbmdlZFxuXHQvLyBbIF8gXV9wICogWyBbIGZsb2F0IF1fciBdX3AgKiBbIFsgZmxvYXQgXV9yIF1fayAtPiB7YW55Q2hhbmdlZDogYm9vbCwgY2x1c3RlcmluZzogWyBbe3JvdzogaW50LCBkaXN0OiBmbG9hdH1dIF1fa1xuXHRmdW5jdGlvbiBhc3NpZ25BbGwgKGxhYmVsaW5nLCByb3dzLCBjZW50ZXJzKSB7XG5cblx0XHR2YXIgYW55Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdHZhciBhc3NpZ25tZW50cyA9IFtdO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgY2VudGVycy5sZW5ndGg7IGkrKykgYXNzaWdubWVudHMucHVzaChbXSk7XG5cblx0XHRmb3IgKHZhciBwID0gMDsgcCA8IHJvd3MubGVuZ3RoOyBwKyspIHtcblx0XHRcdHZhciBiZWZvcmUgPSBsYWJlbGluZ1twXTtcblx0XHRcdHZhciBhc3NpZ25tZW50ID0gYXNzaWduKHJvd3NbcF0sIGNlbnRlcnMpO1xuXHRcdFx0aWYgKGFzc2lnbm1lbnQuY2x1c3RlciAhPSBiZWZvcmUpIHtcblx0XHRcdFx0YW55Q2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGxhYmVsaW5nW3BdID0gYXNzaWdubWVudC5jbHVzdGVyO1xuXHRcdFx0fVxuXHRcdFx0YXNzaWdubWVudHNbYXNzaWdubWVudC5jbHVzdGVyXS5wdXNoKHtyb3c6IHAsIGRpc3Q6IGFzc2lnbm1lbnQuc2NvcmV9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHthbnlDaGFuZ2VkOiBhbnlDaGFuZ2VkLCBjbHVzdGVyaW5nOiBhc3NpZ25tZW50c31cblx0fVxuXG5cdC8vdXBkYXRlIGNsdXN0ZXIga1xuXHQvL3JldHVybiB3aGV0aGVyIGEgdmFsdWUgY2hhbmdlZFxuXHQvLyBbIGludCA8PSBrIF1fcCAqIFsgWyBmbG9hdCBdX3IgXV9rICogWyBbIGZsb2F0IF1fciBdX3AgKiBpbnQ8PWsgLT4gYm9vbFxuXHRmdW5jdGlvbiByZWNlbnRlckNsdXN0ZXIgKGxhYmVsaW5nLCBjZW50ZXJzLCBkYXRhLCBrKSB7XG5cdFx0dmFyIGFueUNoYW5nZWQgPSBmYWxzZTtcblx0XHR2YXIgbnVtSGl0cyA9IDA7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBsYWJlbGluZy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGxhYmVsaW5nW2ldID09IGspIG51bUhpdHMrKztcblx0XHR9XG5cdFx0aWYgKCFudW1IaXRzKSB7XG5cdFx0XHRmb3IgKHZhciBmID0gMDsgZiA8IGNlbnRlcnNbMF0ubGVuZ3RoOyBmKyspIHtcblx0XHRcdFx0dmFyIGJlZm9yZSA9IGNlbnRlcnNba11bZl07XG5cdFx0XHRcdGNlbnRlcnNba11bZl0gPSAwO1xuXHRcdFx0XHRhbnlDaGFuZ2VkIHw9IGJlZm9yZSAhPSAwO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFueUNoYW5nZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAodmFyIGYgPSAwOyBmIDwgY2VudGVyc1swXS5sZW5ndGg7IGYrKykge1xuXHRcdFx0XHR2YXIgYmVmb3JlID0gY2VudGVyc1trXVtmXTtcblx0XHRcdFx0dmFyIHN1bSA9IDA7XG5cdFx0XHRcdGZvciAodmFyIHAgPSAwOyBwIDwgbGFiZWxpbmcubGVuZ3RoOyBwKyspXG5cdFx0XHRcdFx0aWYgKGxhYmVsaW5nW3BdID09IGspXG5cdFx0XHRcdFx0XHRzdW0gKz0gZGF0YVtwXVtmXTtcblx0XHRcdFx0dmFyIG5ld0NlbnRlciA9IHN1bSAvIG51bUhpdHM7XG5cdFx0XHRcdGNlbnRlcnNba11bZl0gPSBuZXdDZW50ZXI7XG5cdFx0XHRcdGFueUNoYW5nZWQgfD0gYmVmb3JlID09IG5ld0NlbnRlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhbnlDaGFuZ2VkO1xuXHRcdH1cblx0fVxuXG5cdC8vdXBkYXRlIGNsdXN0ZXJzXG5cdC8vcmV0dXJuIHdoZXRoZXIgYW55IHZhbHVlcyBjaGFuZ2VkXG5cdC8vIFsgaW50IDw9IGsgXV9wICogWyBbIGZsb2F0IF1fciBdX2sgKiBbIFsgZmxvYXQgXV9yIF1fcCAtPiBib29sXG5cdGZ1bmN0aW9uIHJlY2VudGVyQ2x1c3RlcnMgKGxhYmVsaW5nLCBjZW50ZXJzLCBkYXRhKSB7XG5cdFx0dmFyIGFueUNoYW5nZWQgPSBmYWxzZTtcblx0XHRmb3IgKHZhciBrID0gMDsgayA8IGNlbnRlcnMubGVuZ3RoOyBrKyspXG5cdFx0XHRhbnlDaGFuZ2VkIHw9IHJlY2VudGVyQ2x1c3RlcihsYWJlbGluZywgY2VudGVycywgZGF0YSwgayk7XG5cdFx0cmV0dXJuIGFueUNoYW5nZWQ7XG5cdH1cblxuXHR2YXIgY2VudGVycyA9IGluaXQoZGF0YSxrKTtcblx0dmFyIGxhYmVsaW5nID0gbmV3IEFycmF5KGRhdGEubGVuZ3RoKTtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBkYXRhLmxlbmd0aDsgaSsrKSBsYWJlbGluZ1tpXSA9IDA7XG5cblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtYXhTdGVwczsgaSsrKSB7XG4vL1x0XHRjb25zb2xlLmVycm9yKCcxMCBsYWJlbHMnLCBsYWJlbGluZy5zbGljZSgwLDEwKSk7XG4vL1x0XHRjb25zb2xlLmVycm9yKCczIGNlbnRlcnMnLCBbXS5jb25jYXQuYXBwbHkoW10sY2VudGVycy5zbGljZSgwLDMpLm1hcChmdW5jdGlvbiAocm93KSB7IHJldHVybiByb3cuc2xpY2UoMCwyKTsgfSkpKTtcblx0XHR2YXIgYXNzaWdubWVudHMgPSBhc3NpZ25BbGwobGFiZWxpbmcsIGRhdGEsIGNlbnRlcnMpO1xuLy9cdFx0Y29uc29sZS5lcnJvcihhc3NpZ25tZW50cy5jbHVzdGVyaW5nLnNsaWNlKDAsMykpO1xuXHRcdHZhciBhc3NpZ25DaGFuZ2UgPSBhc3NpZ25tZW50cy5hbnlDaGFuZ2VkO1xuXHRcdHZhciBjbHVzdGVyQ2hhbmdlID0gcmVjZW50ZXJDbHVzdGVycyhsYWJlbGluZywgY2VudGVycywgZGF0YSk7XG5cdFx0dmFyIGFueUNoYW5nZWQgPSBhc3NpZ25DaGFuZ2UgfHwgY2x1c3RlckNoYW5nZTtcbi8vXHRcdGNvbnNvbGUuZXJyb3IoJ2NoYW5nZScsIGksIGFzc2lnbkNoYW5nZSwgY2x1c3RlckNoYW5nZSk7XG5cdFx0aWYgKCFhbnlDaGFuZ2VkKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHR2YXIgYXNzaWdubWVudHMgPSBhc3NpZ25BbGwobGFiZWxpbmcsIGRhdGEsIGNlbnRlcnMpOyAvL3VuZGVyIG1vc3QgcmVjZW50IGNsdXN0ZXJpbmdcblx0cmV0dXJuIHtsYWJlbGluZzogbGFiZWxpbmcsIGNlbnRlcnM6IGNlbnRlcnMsIGFzc2lnbm1lbnRzOiBhc3NpZ25tZW50cy5jbHVzdGVyaW5nfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBrbWVhbnM7IiwidmFyICQgPSByZXF1aXJlKCdqUXVlcnknKTtcbnZhciBRID0gcmVxdWlyZSgnUScpO1xudmFyIExvbmcgPSByZXF1aXJlKCcuL0xvbmcuanMnKTtcblxuICAgIFwidXNlIHN0cmljdFwiO1xuXG4gICAgdmFyIGV4cG9ydHMgPSB7XG4gICAgICAgIGxzOiBmdW5jdGlvbiAobWF0cml4SnNvbikge1xuICAgICAgICAgICAgLy9GSVhNRSBkbyBub3QgZG8gYXMgZXZhbFxuXG4gICAgICAgICAgICB2YXIgcGFydHMgPSBtYXRyaXhKc29uLnNwbGl0KCcvJyk7XG4gICAgICAgICAgICBwYXJ0cy5wb3AoKTtcbiAgICAgICAgICAgIHZhciBiYXNlID0gcGFydHMuam9pbignLycpICsgJy8nO1xuXG4gICAgICAgICAgICB2YXIgZmlsZSA9IHR5cGVvZiB3aW5kb3cgPT0gJ3VuZGVmaW5lZCcgP1xuICAgICAgICAgICAgICAgICAgICBRLmRlbm9kZWlmeShyZXF1aXJlKCdmcycpLnJlYWRGaWxlKShtYXRyaXhKc29uLCB7ZW5jb2Rpbmc6ICd1dGY4J30pXG4gICAgICAgICAgICAgICAgOiAgIFEoJC5hamF4KG1hdHJpeEpzb24sIHtkYXRhVHlwZTogXCJ0ZXh0XCJ9KSk7XG5cbiAgICAgICAgICAgIHJldHVybiBmaWxlXG4gICAgICAgICAgICAgICAgLnRoZW4oZXZhbClcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAobHN0KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBsc3QubWFwKGZ1bmN0aW9uIChmKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge0tCOiBmLktCLCAnZic6IGJhc2UgKyBmLmZ9O1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuXG4gICAgICAgIGxvYWRCaW5hcnk6IGZ1bmN0aW9uIChmaWxlKSB7IC8vIC0+IFByb21pc2UgQmluYXJ5XG4gICAgICAgICAgICB2YXIgdDAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gQmluYXJ5IChidWYpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBlZGdlczogbmV3IFVpbnQzMkFycmF5KGJ1Zi5idWZmZXIsIDQgKiA0KSxcbiAgICAgICAgICAgICAgICAgICAgbWluOiBidWZbMF0sXG4gICAgICAgICAgICAgICAgICAgIG1heDogYnVmWzFdLFxuICAgICAgICAgICAgICAgICAgICBudW1Ob2RlczogYnVmWzJdLFxuICAgICAgICAgICAgICAgICAgICBudW1FZGdlczogYnVmWzNdXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJlcyA9IFEuZGVmZXIoKTtcblxuICAgICAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIGZpbGUsIHRydWUpO1xuICAgICAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gICAgICAgICAgICB4aHIub25sb2FkID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIHJlcy5yZXNvbHZlKEJpbmFyeShuZXcgVWludDMyQXJyYXkodGhpcy5yZXNwb25zZSkpKTtcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZygnYmluYXJ5IGxvYWQnLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwLCAnbXMnKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB4aHIuc2VuZCgpO1xuXG4gICAgICAgICAgICByZXR1cm4gcmVzLnByb21pc2U7XG4gICAgICAgIH0sXG5cblxuICAgICAgICBsb2FkOiBmdW5jdGlvbiAoZmlsZSkge1xuICAgICAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIHJldHVybiBRKCQuYWpheChmaWxlLCB7ZGF0YVR5cGU6IFwidGV4dFwifSkpXG4gICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoc3RyKSB7XG4gICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coJ25haXZlIHBhcnNlJywgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0MCwgJ21zJyk7XG5cbiAgICAgICAgICAgICAgICAvL2h0dHA6Ly9ibC5vY2tzLm9yZy9tYm9zdG9jay8yODQ2NDU0XG4gICAgICAgICAgICAgICAgdmFyIG5vZGVzID0gW107XG4gICAgICAgICAgICAgICAgdmFyIGxpbmtzID0gc3RyXG4gICAgICAgICAgICAgICAgICAuc3BsaXQoL1xcbi9nKSAvLyBzcGxpdCBsaW5lc1xuICAgICAgICAgICAgICAgICAgLmZpbHRlcihmdW5jdGlvbihkKSB7IHJldHVybiBkLmNoYXJBdCgwKSAhPSBcIiVcIjsgfSkgLy8gc2tpcCBjb21tZW50c1xuICAgICAgICAgICAgICAgICAgLnNsaWNlKDEsIC0xKSAvLyBza2lwIGhlYWRlciBsaW5lLCBsYXN0IGxpbmVcbiAgICAgICAgICAgICAgICAgIC5tYXAoZnVuY3Rpb24oZCkge1xuICAgICAgICAgICAgICAgICAgICBkID0gZC5zcGxpdCgvXFxzKy9nKTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGRbMF0gLSAxLCB0YXJnZXQgPSBkWzFdIC0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNvdXJjZTogbm9kZXNbc291cmNlXSB8fCAobm9kZXNbc291cmNlXSA9IHtpbmRleDogc291cmNlfSksXG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQ6IG5vZGVzW3RhcmdldF0gfHwgKG5vZGVzW3RhcmdldF0gPSB7aW5kZXg6IHRhcmdldH0pXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnbmFpdmUgcGFyc2UgKyB0cmFuc2Zvcm0nLCBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIHQwLCAnbXMnKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICBub2Rlczogbm9kZXMsXG4gICAgICAgICAgICAgICAgICBsaW5rczogbGlua3NcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIC8vbG9hZFxuXG5cbiAgICAgICAgbG9hZEdlbzogZnVuY3Rpb24oZmlsZSkgeyAvLyAtPiBQcm9taXNlIEJpbmFyeVxuICAgICAgICAgICAgdmFyIHQwID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJMT0FESU5HIEdFT1wiLCBmaWxlKTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gQmluYXJ5IChidWYpIHtcbiAgICAgICAgICAgICAgICB2YXIgZjMyID0gbmV3IEZsb2F0MzJBcnJheShidWYuYnVmZmVyKTtcbiAgICAgICAgICAgICAgICB2YXIgaTMyID0gbmV3IEludDMyQXJyYXkoYnVmLmJ1ZmZlcik7XG4gICAgICAgICAgICAgICAgdmFyIHVpMzIgPSBidWY7XG4gICAgICAgICAgICAgICAgdmFyIHN0cnVjdDMyTGVuZ3RoID0gMSArIDIgKiAoMiArIDEgKyAxKTtcbiAgICAgICAgICAgICAgICB2YXIgc3RydWN0OExlbmd0aCA9IDQgKiAoMSArIDIgKiAoMiArIDEgKyAxKSk7XG5cbiAgICAgICAgICAgICAgICBmdW5jdGlvbiB0b1VUQyhsb3csIGhpZ2gpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRlKExvbmcuZnJvbUJpdHMobG93LCBoaWdoLCB0cnVlKS50b051bWJlcigpKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBudW1FZGdlczogYnVmLmJ5dGVMZW5ndGggLyBzdHJ1Y3Q4TGVuZ3RoLFxuICAgICAgICAgICAgICAgICAgICBpZDogZnVuY3Rpb24gKGkpIHsgcmV0dXJuIHVpMzJbaSAqIHN0cnVjdDMyTGVuZ3RoXTsgfSxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnRUaW1lOiBmdW5jdGlvbiAoaSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGlkeCA9IGkgKiBzdHJ1Y3QzMkxlbmd0aCArIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9VVEMoaTMyW2lkeF0sIGkzMltpZHggKyAxXSk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0TGF0OiBmdW5jdGlvbiAoaSkgeyByZXR1cm4gZjMyW2kgKiBzdHJ1Y3QzMkxlbmd0aCArIDNdOyB9LFxuICAgICAgICAgICAgICAgICAgICBzdGFydExuZzogZnVuY3Rpb24gKGkpIHsgcmV0dXJuIGYzMltpICogc3RydWN0MzJMZW5ndGggKyA0XTsgfSxcbiAgICAgICAgICAgICAgICAgICAgZW5kVGltZTogZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpZHggPSBpICogc3RydWN0MzJMZW5ndGggKyA1O1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRvVVRDKGkzMltpZHhdLCBpMzJbaWR4ICsgMV0pO1xuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBlbmRMYXQ6IGZ1bmN0aW9uIChpKSB7IHJldHVybiBmMzJbaSAqIHN0cnVjdDMyTGVuZ3RoICsgN107IH0sXG4gICAgICAgICAgICAgICAgICAgIGVuZExuZzogZnVuY3Rpb24gKGkpIHsgcmV0dXJuIGYzMltpICogc3RydWN0MzJMZW5ndGggKyA4XTsgfVxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByZXMgPSBRLmRlZmVyKCk7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2Yod2luZG93KSA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJub2RlIGZzXCIpXG4gICAgICAgICAgICAgICAgcmV0dXJuIFEuZGVub2RlaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpKGZpbGUpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChub2RlQnVmZmVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gQmluYXJ5KG5ldyBVaW50MzJBcnJheShub2RlQnVmZmVyKSk7XG4gICAgICAgICAgICAgICAgICAgIH0sIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJPT1BTXCIsIGVycik7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiZ2VvIGJyb3dzZXJcIilcbiAgICAgICAgICAgICAgICB2YXIgeGhyID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gICAgICAgICAgICAgICAgeGhyLm9wZW4oJ0dFVCcsIGZpbGUsIHRydWUpO1xuICAgICAgICAgICAgICAgIHhoci5yZXNwb25zZVR5cGUgPSAnYXJyYXlidWZmZXInO1xuICAgICAgICAgICAgICAgIHhoci5vbmxvYWQgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcy5yZXNvbHZlKEJpbmFyeShuZXcgVWludDMyQXJyYXkodGhpcy5yZXNwb25zZSkpKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coJ2JpbmFyeSBsb2FkJywgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0MCwgJ21zJyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB4aHIuc2VuZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzLnByb21pc2U7XG4gICAgICAgIH0sXG5cblxuICAgICAgICBnZXRHZW9Cb3VuZHM6IGZ1bmN0aW9uIChiaW5hcnkpIHtcbiAgICAgICAgICAgIHZhciBtaW5MYXQgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgICAgICAgICB2YXIgbWF4TGF0ID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuICAgICAgICAgICAgdmFyIG1pbkxuZyA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICAgICAgICAgIHZhciBtYXhMbmcgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG4gICAgICAgICAgICB2YXIgYXZnTGF0ID0gMDtcbiAgICAgICAgICAgIHZhciBhdmdMbmcgPSAwO1xuICAgICAgICAgICAgdmFyIHNMYXQgPSAwO1xuICAgICAgICAgICAgdmFyIHNMbmcgPSAwO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBiaW5hcnkubnVtRWRnZXM7IGkrKykge1xuICAgICAgICAgICAgICAgIG1pbkxhdCA9IE1hdGgubWluKE1hdGgubWluKG1pbkxhdCwgYmluYXJ5LnN0YXJ0TGF0KGkpKSwgYmluYXJ5LmVuZExhdChpKSk7XG4gICAgICAgICAgICAgICAgbWF4TGF0ID0gTWF0aC5tYXgoTWF0aC5tYXgobWF4TGF0LCBiaW5hcnkuc3RhcnRMYXQoaSkpLCBiaW5hcnkuZW5kTGF0KGkpKTtcbiAgICAgICAgICAgICAgICBtaW5MbmcgPSBNYXRoLm1pbihNYXRoLm1pbihtaW5MbmcsIGJpbmFyeS5zdGFydExuZyhpKSksIGJpbmFyeS5lbmRMbmcoaSkpO1xuICAgICAgICAgICAgICAgIG1heExuZyA9IE1hdGgubWF4KE1hdGgubWF4KG1heExuZywgYmluYXJ5LnN0YXJ0TG5nKGkpKSwgYmluYXJ5LmVuZExuZyhpKSk7XG5cbiAgICAgICAgICAgICAgICB2YXIgbmV3QXZnTGF0ID0gYXZnTGF0ICsgKGJpbmFyeS5zdGFydExhdChpKSArIGJpbmFyeS5lbmRMYXQoaSkgLSAyICogYXZnTGF0KSAvIChpICsgMik7XG4gICAgICAgICAgICAgICAgc0xhdCA9IHNMYXRcbiAgICAgICAgICAgICAgICAgICAgKyAoYmluYXJ5LnN0YXJ0TGF0KGkpIC0gbmV3QXZnTGF0KSAqIChiaW5hcnkuc3RhcnRMYXQoaSkgLSBhdmdMYXQpXG4gICAgICAgICAgICAgICAgICAgICsgKGJpbmFyeS5lbmRMYXQoaSkgLSBuZXdBdmdMYXQpICogKGJpbmFyeS5lbmRMYXQoaSkgLSBhdmdMYXQpO1xuICAgICAgICAgICAgICAgIGF2Z0xhdCA9IG5ld0F2Z0xhdDtcblxuICAgICAgICAgICAgICAgIHZhciBuZXdBdmdMbmcgPSBhdmdMbmcgKyAoYmluYXJ5LnN0YXJ0TG5nKGkpICsgYmluYXJ5LmVuZExuZyhpKSAtIDIgKiBhdmdMbmcpIC8gKGkgKyAyKTtcbiAgICAgICAgICAgICAgICBzTG5nID0gc0xuZ1xuICAgICAgICAgICAgICAgICAgICArIChiaW5hcnkuc3RhcnRMbmcoaSkgLSBuZXdBdmdMbmcpICogKGJpbmFyeS5zdGFydExuZyhpKSAtIGF2Z0xuZylcbiAgICAgICAgICAgICAgICAgICAgKyAoYmluYXJ5LmVuZExuZyhpKSAtIG5ld0F2Z0xuZykgKiAoYmluYXJ5LmVuZExuZyhpKSAtIGF2Z0xuZyk7XG4gICAgICAgICAgICAgICAgYXZnTG5nID0gbmV3QXZnTG5nO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHN0ZExhdCA9IE1hdGguc3FydChzTGF0LyhiaW5hcnkubnVtRWRnZXMgLSAxKSk7XG4gICAgICAgICAgICB2YXIgc3RkTG5nID0gTWF0aC5zcXJ0KHNMbmcvKGJpbmFyeS5udW1FZGdlcyAtIDEpKTtcblxuICAgICAgICAgICAgLy8gbm9ybWFsaXplX2Qodl9kKSA9ICh2X2QgKyBkLnNjYWxlLmMpL2Quc2NhbGUueFxuXG4gICAgICAgICAgICAvLyBIZW5jZWZvcnRoLCB3aG9ldmVyIHVzZXMgb25lLWxldHRlciB2YXJpYWJsZSBuYW1lcyBmb3Igbm9uLXRlbXBvcmFyeSB2YXJpYWJsZXMgb3dlc1xuICAgICAgICAgICAgLy8gZXZlcnlib2R5IGVsc2UgbHVuY2hcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbGF0OiB7bWluOiBtaW5MYXQsIG1heDogbWF4TGF0LCBzdGF0czoge2F2ZzogYXZnTGF0LCBzdGQ6IHN0ZExhdH0sIHNjYWxlOiB7YzogLShhdmdMYXQgLSAxLjUgKiBzdGRMYXQpLCB4OiAzICogc3RkTGF0fX0sXG4gICAgICAgICAgICAgICAgbG5nOiB7bWluOiBtaW5MbmcsIG1heDogbWF4TG5nLCBzdGF0czoge2F2ZzogYXZnTG5nLCBzdGQ6IHN0ZExuZ30sIHNjYWxlOiB7YzogLShhdmdMbmcgLSAxLjUgKiBzdGRMbmcpLCB4OiAzICogc3RkTG5nfX1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG5cblxuICAgICAgICAvKipcbiAgICAgICAgICogVGFrZXMgZ2VvIGRhdGEgcmV0dXJuZWQgYnkgbG9hZEdlbyBhbmQgcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyBhbmQgZWRnZSBhbmQgcG9pbnRzXG4gICAgICAgICAqIGFycmF5LCB3aXRoIHRoZSBwb2ludHMgYmVpbmcgcHJvcGVybHkgbm9ybWFsaXplZCB0byBiZSBvbiBbMSwxXSBhbmRcbiAgICAgICAgICovXG4gICAgICAgIHByb2Nlc3NHZW86IGZ1bmN0aW9uKGdlb0RhdGEpIHtcbiAgICAgICAgICAgIHZhciBwb2ludHMgPSBbXSxcbiAgICAgICAgICAgICAgICBlZGdlcyA9IFtdLFxuICAgICAgICAgICAgICAgIGJvdW5kcyA9IGV4cG9ydHMuZ2V0R2VvQm91bmRzKGdlb0RhdGEpO1xuXG4gICAgICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgZ2VvRGF0YS5udW1FZGdlczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYoTWF0aC5yYW5kb20oKSA8IDAuNykge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcG9pbnRzLnB1c2goWyhnZW9EYXRhLnN0YXJ0TG5nKGkpICsgYm91bmRzLmxuZy5zY2FsZS5jKSAvIChib3VuZHMubG5nLnNjYWxlLngpLCAoZ2VvRGF0YS5zdGFydExhdChpKSArIGJvdW5kcy5sYXQuc2NhbGUuYykgLyAoYm91bmRzLmxhdC5zY2FsZS54KV0pO1xuICAgICAgICAgICAgICAgIHBvaW50cy5wdXNoKFsoZ2VvRGF0YS5lbmRMbmcoaSkgKyBib3VuZHMubG5nLnNjYWxlLmMpIC8gKGJvdW5kcy5sbmcuc2NhbGUueCksIChnZW9EYXRhLmVuZExhdChpKSArIGJvdW5kcy5sYXQuc2NhbGUuYykgLyAoYm91bmRzLmxhdC5zY2FsZS54KV0pO1xuICAgICAgICAgICAgICAgIGVkZ2VzLnB1c2goW3BvaW50cy5sZW5ndGggLSAyLCBwb2ludHMubGVuZ3RoIC0gMV0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1wicG9pbnRzXCI6IHBvaW50cywgXCJlZGdlc1wiOiBlZGdlc307XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzO1xuIiwiLyoqXG4gKiBAYXV0aG9yIG1yZG9vYiAvIGh0dHA6Ly9tcmRvb2IuY29tL1xuICovXG5cbnZhciBTdGF0cyA9IGZ1bmN0aW9uICgpIHtcblxuICAgIHZhciBzdGFydFRpbWUgPSBEYXRlLm5vdygpLCBwcmV2VGltZSA9IHN0YXJ0VGltZTtcbiAgICB2YXIgbXMgPSAwLCBtc01pbiA9IEluZmluaXR5LCBtc01heCA9IDA7XG4gICAgdmFyIGZwcyA9IDAsIGZwc01pbiA9IEluZmluaXR5LCBmcHNNYXggPSAwO1xuICAgIHZhciBmcmFtZXMgPSAwLCBtb2RlID0gMDtcblxuICAgIHZhciBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgIGNvbnRhaW5lci5pZCA9ICdzdGF0cyc7XG4gICAgY29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoICdtb3VzZWRvd24nLCBmdW5jdGlvbiAoIGV2ZW50ICkgeyBldmVudC5wcmV2ZW50RGVmYXVsdCgpOyBzZXRNb2RlKCArKyBtb2RlICUgMiApIH0sIGZhbHNlICk7XG4gICAgY29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnd2lkdGg6ODBweDtvcGFjaXR5OjAuOTtjdXJzb3I6cG9pbnRlcic7XG5cbiAgICB2YXIgZnBzRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2RpdicgKTtcbiAgICBmcHNEaXYuaWQgPSAnZnBzJztcbiAgICBmcHNEaXYuc3R5bGUuY3NzVGV4dCA9ICdwYWRkaW5nOjAgMCAzcHggM3B4O3RleHQtYWxpZ246bGVmdDtiYWNrZ3JvdW5kLWNvbG9yOiMwMDInO1xuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCggZnBzRGl2ICk7XG5cbiAgICB2YXIgZnBzVGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgZnBzVGV4dC5pZCA9ICdmcHNUZXh0JztcbiAgICBmcHNUZXh0LnN0eWxlLmNzc1RleHQgPSAnY29sb3I6IzBmZjtmb250LWZhbWlseTpIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZjtmb250LXNpemU6OXB4O2ZvbnQtd2VpZ2h0OmJvbGQ7bGluZS1oZWlnaHQ6MTVweCc7XG4gICAgZnBzVGV4dC5pbm5lckhUTUwgPSAnRlBTJztcbiAgICBmcHNEaXYuYXBwZW5kQ2hpbGQoIGZwc1RleHQgKTtcblxuICAgIHZhciBmcHNHcmFwaCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdkaXYnICk7XG4gICAgZnBzR3JhcGguaWQgPSAnZnBzR3JhcGgnO1xuICAgIGZwc0dyYXBoLnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246cmVsYXRpdmU7d2lkdGg6NzRweDtoZWlnaHQ6MzBweDtiYWNrZ3JvdW5kLWNvbG9yOiMwZmYnO1xuICAgIGZwc0Rpdi5hcHBlbmRDaGlsZCggZnBzR3JhcGggKTtcblxuICAgIHdoaWxlICggZnBzR3JhcGguY2hpbGRyZW4ubGVuZ3RoIDwgNzQgKSB7XG5cbiAgICAgICAgdmFyIGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoICdzcGFuJyApO1xuICAgICAgICBiYXIuc3R5bGUuY3NzVGV4dCA9ICd3aWR0aDoxcHg7aGVpZ2h0OjMwcHg7ZmxvYXQ6bGVmdDtiYWNrZ3JvdW5kLWNvbG9yOiMxMTMnO1xuICAgICAgICBmcHNHcmFwaC5hcHBlbmRDaGlsZCggYmFyICk7XG5cbiAgICB9XG5cbiAgICB2YXIgbXNEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgIG1zRGl2LmlkID0gJ21zJztcbiAgICBtc0Rpdi5zdHlsZS5jc3NUZXh0ID0gJ3BhZGRpbmc6MCAwIDNweCAzcHg7dGV4dC1hbGlnbjpsZWZ0O2JhY2tncm91bmQtY29sb3I6IzAyMDtkaXNwbGF5Om5vbmUnO1xuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZCggbXNEaXYgKTtcblxuICAgIHZhciBtc1RleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgIG1zVGV4dC5pZCA9ICdtc1RleHQnO1xuICAgIG1zVGV4dC5zdHlsZS5jc3NUZXh0ID0gJ2NvbG9yOiMwZjA7Zm9udC1mYW1pbHk6SGVsdmV0aWNhLEFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjlweDtmb250LXdlaWdodDpib2xkO2xpbmUtaGVpZ2h0OjE1cHgnO1xuICAgIG1zVGV4dC5pbm5lckhUTUwgPSAnTVMnO1xuICAgIG1zRGl2LmFwcGVuZENoaWxkKCBtc1RleHQgKTtcblxuICAgIHZhciBtc0dyYXBoID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ2RpdicgKTtcbiAgICBtc0dyYXBoLmlkID0gJ21zR3JhcGgnO1xuICAgIG1zR3JhcGguc3R5bGUuY3NzVGV4dCA9ICdwb3NpdGlvbjpyZWxhdGl2ZTt3aWR0aDo3NHB4O2hlaWdodDozMHB4O2JhY2tncm91bmQtY29sb3I6IzBmMCc7XG4gICAgbXNEaXYuYXBwZW5kQ2hpbGQoIG1zR3JhcGggKTtcblxuICAgIHdoaWxlICggbXNHcmFwaC5jaGlsZHJlbi5sZW5ndGggPCA3NCApIHtcblxuICAgICAgICB2YXIgYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCggJ3NwYW4nICk7XG4gICAgICAgIGJhci5zdHlsZS5jc3NUZXh0ID0gJ3dpZHRoOjFweDtoZWlnaHQ6MzBweDtmbG9hdDpsZWZ0O2JhY2tncm91bmQtY29sb3I6IzEzMSc7XG4gICAgICAgIG1zR3JhcGguYXBwZW5kQ2hpbGQoIGJhciApO1xuXG4gICAgfVxuXG4gICAgdmFyIHNldE1vZGUgPSBmdW5jdGlvbiAoIHZhbHVlICkge1xuXG4gICAgICAgIG1vZGUgPSB2YWx1ZTtcblxuICAgICAgICBzd2l0Y2ggKCBtb2RlICkge1xuXG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgICAgZnBzRGl2LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuICAgICAgICAgICAgICAgIG1zRGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgICAgZnBzRGl2LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG4gICAgICAgICAgICAgICAgbXNEaXYuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cblxuICAgIH1cblxuICAgIHZhciB1cGRhdGVHcmFwaCA9IGZ1bmN0aW9uICggZG9tLCB2YWx1ZSApIHtcblxuICAgICAgICB2YXIgY2hpbGQgPSBkb20uYXBwZW5kQ2hpbGQoIGRvbS5maXJzdENoaWxkICk7XG4gICAgICAgIGNoaWxkLnN0eWxlLmhlaWdodCA9IHZhbHVlICsgJ3B4JztcblxuICAgIH1cblxuICAgIHJldHVybiB7XG5cbiAgICAgICAgUkVWSVNJT046IDExLFxuXG4gICAgICAgIGRvbUVsZW1lbnQ6IGNvbnRhaW5lcixcblxuICAgICAgICBzZXRNb2RlOiBzZXRNb2RlLFxuXG4gICAgICAgIGJlZ2luOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgIHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgfSxcblxuICAgICAgICBlbmQ6IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgICAgICBtcyA9IHRpbWUgLSBzdGFydFRpbWU7XG4gICAgICAgICAgICBtc01pbiA9IE1hdGgubWluKCBtc01pbiwgbXMgKTtcbiAgICAgICAgICAgIG1zTWF4ID0gTWF0aC5tYXgoIG1zTWF4LCBtcyApO1xuXG4gICAgICAgICAgICBtc1RleHQudGV4dENvbnRlbnQgPSBtcyArICcgTVMgKCcgKyBtc01pbiArICctJyArIG1zTWF4ICsgJyknO1xuICAgICAgICAgICAgdXBkYXRlR3JhcGgoIG1zR3JhcGgsIE1hdGgubWluKCAzMCwgMzAgLSAoIG1zIC8gMjAwICkgKiAzMCApICk7XG5cbiAgICAgICAgICAgIGZyYW1lcyArKztcblxuICAgICAgICAgICAgaWYgKCB0aW1lID4gcHJldlRpbWUgKyAxMDAwICkge1xuXG4gICAgICAgICAgICAgICAgZnBzID0gTWF0aC5yb3VuZCggKCBmcmFtZXMgKiAxMDAwICkgLyAoIHRpbWUgLSBwcmV2VGltZSApICk7XG4gICAgICAgICAgICAgICAgZnBzTWluID0gTWF0aC5taW4oIGZwc01pbiwgZnBzICk7XG4gICAgICAgICAgICAgICAgZnBzTWF4ID0gTWF0aC5tYXgoIGZwc01heCwgZnBzICk7XG5cbiAgICAgICAgICAgICAgICBmcHNUZXh0LnRleHRDb250ZW50ID0gZnBzICsgJyBGUFMgKCcgKyBmcHNNaW4gKyAnLScgKyBmcHNNYXggKyAnKSc7XG4gICAgICAgICAgICAgICAgdXBkYXRlR3JhcGgoIGZwc0dyYXBoLCBNYXRoLm1pbiggMzAsIDMwIC0gKCBmcHMgLyAxMDAgKSAqIDMwICkgKTtcblxuICAgICAgICAgICAgICAgIHByZXZUaW1lID0gdGltZTtcbiAgICAgICAgICAgICAgICBmcmFtZXMgPSAwO1xuXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aW1lO1xuXG4gICAgICAgIH0sXG5cbiAgICAgICAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgIHN0YXJ0VGltZSA9IHRoaXMuZW5kKCk7XG5cbiAgICAgICAgfVxuXG4gICAgfVxuXG59O1xuXG5cbm1vZHVsZS5leHBvcnRzID0gU3RhdHM7IiwidmFyICQgPSByZXF1aXJlKCdqUXVlcnknKSxcbiAgICBOQm9keSA9IHJlcXVpcmUoJy4vTkJvZHkuanMnKSxcbiAgICBSZW5kZXJHTCA9IHJlcXVpcmUoJy4vUmVuZGVyR0wuanMnKSxcbiAgICBTaW1DTCA9IHJlcXVpcmUoJy4vU2ltQ0wuanMnKSxcbiAgICBNYXRyaXhMb2FkZXIgPSByZXF1aXJlKCcuL2xpYnMvbG9hZC5qcycpLFxuICAgIFEgPSByZXF1aXJlKCdxJyksXG4gICAgU3RhdHMgPSByZXF1aXJlKCcuL2xpYnMvc3RhdHMuanMnKSxcbiAgICBldmVudHMgPSByZXF1aXJlKCcuL1NpbXBsZUV2ZW50cy5qcycpLFxuICAgIGttZWFucyA9IHJlcXVpcmUoJy4vbGlicy9rbWVhbnMuanMnKSxcbiAgICBkZW1vID0gcmVxdWlyZSgnLi9kZW1vLmpzJylcblxuXG5cbiAgICBcInVzZSBzdHJpY3RcIjtcblxuICAgIHZhciBncmFwaCA9IG51bGwsXG4gICAgICAgIG51bVBvaW50cyA9IDEwMDAsLy8xMDI0LC8vMjA0OCwvLzE2Mzg0LFxuICAgICAgICBudW0sXG4gICAgICAgIG51bUVkZ2VzID0gbnVtUG9pbnRzLFxuICAgICAgICBkaW1lbnNpb25zID0gWzEsMV07IC8vWzk2MCw5NjBdO1xuXG5cbiAgICBmdW5jdGlvbiBzZXR1cCgpIHtcbiAgICAgICAgY29uc29sZS5sb2coXCJSdW5uaW5nIE5haXZlIE4tYm9keSBzaW11bGF0aW9uXCIpO1xuXG4gICAgICAgIHJldHVybiBOQm9keS5jcmVhdGUoU2ltQ0wsIFJlbmRlckdMLCBkb2N1bWVudCwgJChcIiNzaW11bGF0aW9uXCIpWzBdLCBbMCwwLDAsMF0sIGRpbWVuc2lvbnMsIDMpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKGNyZWF0ZWRHcmFwaCkge1xuICAgICAgICAgICAgZ3JhcGggPSBjcmVhdGVkR3JhcGg7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIk4tYm9keSBncmFwaCBjcmVhdGVkLlwiKTtcblxuICAgICAgICAgICAgdmFyIHBvaW50cyA9IGRlbW8uY3JlYXRlUG9pbnRzKG51bVBvaW50cywgZGltZW5zaW9ucyk7XG4gICAgICAgICAgICB2YXIgZWRnZXMgPSBkZW1vLmNyZWF0ZUVkZ2VzKG51bUVkZ2VzLCBudW1Qb2ludHMpO1xuXG4gICAgICAgICAgICByZXR1cm4gUS5hbGwoW1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldFBvaW50cyhwb2ludHMpLFxuICAgICAgICAgICAgICAgIHBvaW50cyxcbiAgICAgICAgICAgICAgICBlZGdlcyxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICB9KVxuICAgICAgICAuc3ByZWFkKGZ1bmN0aW9uKGdyYXBoLCBwb2ludHMsIGVkZ2VzKSB7XG4gICAgICAgICAgICBncmFwaC5zZXRDb2xvck1hcChcInRlc3QtY29sb3JtYXAyLnBuZ1wiKTtcbiAgICAgICAgICAgIHJldHVybiBncmFwaC5zZXRFZGdlcyhlZGdlcyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKGdyYXBoKSB7XG4gICAgICAgICAgICB2YXIgZnBzVG90YWwgPSBuZXcgU3RhdHMoKTtcbiAgICAgICAgICAgIGZwc1RvdGFsLnNldE1vZGUoMCk7XG4gICAgICAgICAgICAkKFwiI2Zwc1RvdGFsXCIpLmFwcGVuZChmcHNUb3RhbC5kb21FbGVtZW50KTtcbiAgICAgICAgICAgIGV2ZW50cy5saXN0ZW4oXCJ0aWNrQmVnaW5cIiwgZnVuY3Rpb24oKSB7IGZwc1RvdGFsLmJlZ2luKCk7IH0pO1xuICAgICAgICAgICAgZXZlbnRzLmxpc3RlbihcInRpY2tFbmRcIiwgZnVuY3Rpb24oKSB7IGZwc1RvdGFsLmVuZCgpOyB9KTtcblxuICAgICAgICAgICAgdmFyIGZwc1NpbSA9IG5ldyBTdGF0cygpO1xuICAgICAgICAgICAgZnBzU2ltLnNldE1vZGUoMSk7XG4gICAgICAgICAgICAkKFwiI2Zwc1NpbVwiKS5hcHBlbmQoZnBzU2ltLmRvbUVsZW1lbnQpO1xuICAgICAgICAgICAgZXZlbnRzLmxpc3RlbihcInNpbXVsYXRlQmVnaW5cIiwgZnVuY3Rpb24oKSB7IGZwc1NpbS5iZWdpbigpOyB9KTtcbiAgICAgICAgICAgIGV2ZW50cy5saXN0ZW4oXCJzaW11bGF0ZUVuZFwiLCBmdW5jdGlvbigpIHsgZnBzU2ltLmVuZCgpOyB9KTtcblxuICAgICAgICAgICAgdmFyIGZwc1JlbmRlciA9IG5ldyBTdGF0cygpO1xuICAgICAgICAgICAgZnBzUmVuZGVyLnNldE1vZGUoMSk7XG4gICAgICAgICAgICAkKFwiI2Zwc1JlbmRlclwiKS5hcHBlbmQoZnBzUmVuZGVyLmRvbUVsZW1lbnQpO1xuICAgICAgICAgICAgZXZlbnRzLmxpc3RlbihcInJlbmRlckJlZ2luXCIsIGZ1bmN0aW9uKCkgeyBmcHNSZW5kZXIuYmVnaW4oKTsgfSk7XG4gICAgICAgICAgICBldmVudHMubGlzdGVuKFwicmVuZGVyRW5kXCIsIGZ1bmN0aW9uKCkgeyBmcHNSZW5kZXIuZW5kKCk7IH0pO1xuXG4gICAgICAgICAgICB2YXIgYW5pbUJ1dHRvbiA9ICQoXCIjYW5pbS1idXR0b25cIik7XG4gICAgICAgICAgICB2YXIgc3RlcEJ1dHRvbiA9ICQoXCIjc3RlcC1idXR0b25cIik7XG5cbiAgICAgICAgICAgIHZhciBhbmltYXRpb24gPSBkZW1vLmFuaW1hdG9yKGRvY3VtZW50LCBncmFwaC50aWNrKTtcblxuICAgICAgICAgICAgZnVuY3Rpb24gc3RhcnRBbmltYXRpb24oKSB7XG5cbiAgICAgICAgICAgICAgICBhbmltQnV0dG9uLnRleHQoXCJTdG9wXCIpO1xuICAgICAgICAgICAgICAgIHN0ZXBCdXR0b24ucHJvcChcImRpc2FibGVkXCIsIHRydWUpO1xuXG4gICAgICAgICAgICAgICAgYW5pbUJ1dHRvbi5vZmYoKS5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBhbmltYXRpb24uc3RvcEFuaW1hdGlvbigpO1xuICAgICAgICAgICAgICAgICAgICBzdGVwQnV0dG9uLnByb3AoXCJkaXNhYmxlZFwiLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgICAgIGFuaW1CdXR0b24udGV4dChcIkFuaW1hdGVcIik7XG4gICAgICAgICAgICAgICAgICAgIGFuaW1CdXR0b24ub2ZmKCkub24oXCJjbGlja1wiLCBzdGFydEFuaW1hdGlvbik7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICBhbmltYXRpb24uc3RhcnRBbmltYXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGFuaW1CdXR0b24ub24oXCJjbGlja1wiLCBzdGFydEFuaW1hdGlvbik7XG5cbiAgICAgICAgICAgIHN0ZXBCdXR0b24ub24oXCJjbGlja1wiLCBmdW5jdGlvbigpIHtcblxuICAgICAgICAgICAgICAgIGFuaW1hdGlvbi5zdG9wQW5pbWF0aW9uKCk7XG5cbiAgICAgICAgICAgICAgICBzdGVwQnV0dG9uLnByb3AoXCJkaXNhYmxlZFwiLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgIGdyYXBoLnRpY2soKVxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBzdGVwQnV0dG9uLnByb3AoXCJkaXNhYmxlZFwiLCBmYWxzZSk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgYW5pbUJ1dHRvbi5wcm9wKFwiZGlzYWJsZWRcIiwgZmFsc2UpO1xuICAgICAgICAgICAgc3RlcEJ1dHRvbi5wcm9wKFwiZGlzYWJsZWRcIiwgZmFsc2UpO1xuXG4gICAgICAgICAgICAvL3JldHVybiBncmFwaC50aWNrKCk7XG4gICAgICAgICAgICByZXR1cm4gZ3JhcGg7XG4gICAgICAgIH0pO1xuICAgIH1cblxuXG5cbiAgICBmdW5jdGlvbiBiaW5kU2xpZGVycyhncmFwaCkge1xuICAgICAgICBjb25zb2xlLmRlYnVnKCdzZXR0aW5nIHBoeXNpY3MnKTtcblxuICAgICAgICAkKCcjY2hhcmdlJykub24oJ2NoYW5nZScsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICB2YXIgdiA9ICQodGhpcykudmFsKCk7XG4gICAgICAgICAgICB2YXIgcmVzID0gMC4xO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAoMTAwLXYpOyBpKyspIHJlcyAvPSAxLjM7XG4gICAgICAgICAgICB2YXIgc2NhbGVkID0gLTEgKiByZXM7XG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKCdjaGFyZ2UnLCB2LCAnLT4nLCBzY2FsZWQpO1xuICAgICAgICAgICAgZ3JhcGguc2V0UGh5c2ljcyh7Y2hhcmdlOiBzY2FsZWR9KTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNncmF2aXR5Jykub24oJ2NoYW5nZScsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICB2YXIgdiA9ICQodGhpcykudmFsKCk7XG4gICAgICAgICAgICB2YXIgcmVzID0gMTAwLjA7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICgxMDAtdik7IGkrKykgcmVzIC89IDEuMztcbiAgICAgICAgICAgIHZhciBzY2FsZWQgPSAxICogcmVzO1xuICAgICAgICAgICAgLy8gICAgICBjb25zb2xlLmxvZygnZ3Jhdml0eScsIHYsICctPicsIHNjYWxlZCk7XG4gICAgICAgICAgICBncmFwaC5zZXRQaHlzaWNzKHtncmF2aXR5OiBzY2FsZWR9KTtcbiAgICAgICAgfSk7XG4gICAgICAgICQoJyNzdHJlbmd0aCcpLm9uKCdjaGFuZ2UnLCBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgdmFyIHYgPSAkKHRoaXMpLnZhbCgpO1xuICAgICAgICAgICAgdmFyIHJlcyA9IDEwMC4wO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCAoMTAwLXYpOyBpKyspIHJlcyAvPSAxLjM7XG4gICAgICAgICAgICB2YXIgc2NhbGVkID0gMSAqIHJlcztcbiAgICAgICAgICAgIC8vICAgICAgY29uc29sZS5sb2coJ3N0cmVuZ3RoJywgdiwgJy0+Jywgc2NhbGVkKTtcbiAgICAgICAgICAgIGdyYXBoLnNldFBoeXNpY3Moe2VkZ2VTdHJlbmd0aDogc2NhbGVkfSk7XG4gICAgICAgIH0pO1xuICAgICAgICAkKCcjbGVuZ3RoJykub24oJ2NoYW5nZScsIGZ1bmN0aW9uIChlKSB7XG4gICAgICAgICAgICB2YXIgdiA9ICQodGhpcykudmFsKCk7XG4gICAgICAgICAgICB2YXIgcmVzID0gMTAwLjA7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8ICgxMDAtdik7IGkrKykgcmVzIC89IDEuMztcbiAgICAgICAgICAgIHZhciBzY2FsZWQgPSAxICogcmVzO1xuICAgICAgICAgICAgLy8gICAgICBjb25zb2xlLmxvZygnbGVuZ3RoJywgdiwgJy0+Jywgc2NhbGVkKTtcbiAgICAgICAgICAgIGdyYXBoLnNldFBoeXNpY3Moe2VkZ2VEaXN0YW5jZTogc2NhbGVkfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIFsncG9pbnRzJywgJ2VkZ2VzJywgJ21pZHBvaW50cycsICdtaWRlZGdlcyddLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGJhbmcgKCkge1xuICAgICAgICAgICAgICAgIHZhciBvYmogPSB7fTtcbiAgICAgICAgICAgICAgICBvYmpbbmFtZV0gPSAkKHRoaXMpLmlzKCc6Y2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldFZpc2libGUob2JqKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAkKCcjJyArIG5hbWUpLm9uKCdjaGFuZ2UnLCBiYW5nKTtcbiAgICAgICAgICAgIGJhbmcuY2FsbCgkKCcjJyArIG5hbWUpKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgWydsb2NrUG9pbnRzJywgJ2xvY2tFZGdlcycsICdsb2NrTWlkcG9pbnRzJywgJ2xvY2tNaWRlZGdlcyddLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uIGJhbmcgKCkge1xuICAgICAgICAgICAgICAgIHZhciBvYmogPSB7fTtcbiAgICAgICAgICAgICAgICBvYmpbbmFtZV0gPSAkKHRoaXMpLmlzKCc6Y2hlY2tlZCcpO1xuICAgICAgICAgICAgICAgIGdyYXBoLnNldExvY2tlZChvYmopO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgJCgnIycgKyBuYW1lKS5vbignY2hhbmdlJywgYmFuZyk7XG4gICAgICAgICAgICBiYW5nLmNhbGwoJCgnIycgKyBuYW1lKSk7XG4gICAgICAgIH0pO1xuXG4gICAgfVxuXG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgIGZ1bmN0aW9uIHJlbmRlckRhdGFMaXN0KGRhdGFMaXN0LCBncmFwaCkge1xuXG4gICAgICAgIHZhciBkYXRhRWwgPSAkKFwiI2RhdGFzZXRzXCIpO1xuXG4gICAgICAgIGRhdGFMaXN0LmZvckVhY2goZnVuY3Rpb24oZGF0YVNldCwgaSkge1xuICAgICAgICAgICAgZGF0YUVsLmFwcGVuZCgkKCc8b3B0aW9uPjwvb3B0aW9uPicpXG4gICAgICAgICAgICAgICAgLmF0dHIoJ3ZhbHVlJywgaSlcbiAgICAgICAgICAgICAgICAudGV4dChkYXRhU2V0LmJhc2UgKyBcIiAoXCIgKyBkYXRhU2V0LnNpemUgKyBcIilcIilcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pXG5cbiAgICAgICAgLy8gU2V0IHRoZSBzdGFydGluZyBzZWxlY3Rpb24gb2YgdGhlIDxzZWxlY3Q+IGNvbnRyb2wgdG8gYmUgYmxhbmssIHNpbmNlIHdlIHN0YXJ0IHdpdGhcbiAgICAgICAgLy8gcmFuZG9tIGRhdGEgbG9hZGVkLCBub3QgYSBtYXRyaXhcbiAgICAgICAgZGF0YUVsLnByb3AoJ3NlbGVjdGVkSW5kZXgnLCAtMSlcblxuICAgICAgICAkKCcjZGF0YXNldHMnKVxuICAgICAgICAub24oJ2NoYW5nZScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBkYXRhU2V0ID0gZGF0YUxpc3RbcGFyc2VJbnQodGhpcy52YWx1ZSldO1xuXG4gICAgICAgICAgICByZXR1cm4gZGF0YVNldC5sb2FkZXIoZ3JhcGgsIGRhdGFTZXQuZilcbiAgICAgICAgICAgICAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGdyYXBoLnRpY2soKTtcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciBsb2FkaW5nIG1hdHJpeDpcIiwgZXJyKTtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9KTtcbiAgICB9XG5cblxuXG4gICAgJChmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgc2V0dXAoKS5cbiAgICAgICAgdGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoXCJTRVRVUCwgTE9BRElORyBEQVRBXCIpXG4gICAgICAgICAgICByZXR1cm4gZGVtby5sb2FkRGF0YUxpc3QoZ3JhcGgpO1xuICAgICAgICB9KS50aGVuKGZ1bmN0aW9uIChkYXRhTGlzdCkge1xuICAgICAgICAgICAgcmVuZGVyRGF0YUxpc3QoZGF0YUxpc3QsIGdyYXBoKTtcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKFwiTE9BREVEIERBVEEsIEJJTkRJTkdcIilcbiAgICAgICAgICAgIHJldHVybiBiaW5kU2xpZGVycyhncmFwaCk7XG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZ3JhcGgudGljaygpOyAvL2luaXRpYWwgdmlld1xuICAgICAgICB9KS50aGVuKFxuICAgICAgICAgICAgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmRlYnVnKCdET05FJykgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIpIHsgY29uc29sZS5lcnJvcignb29wcycsIGVyciwgZXJyLnN0YWNrKSB9KVxuXG4gICAgfSk7IiwidmFyICQgPSByZXF1aXJlKCdqUXVlcnknKTtcbnZhciBRID0gcmVxdWlyZSgnUScpO1xuXG5pZiAodHlwZW9mKHdpbmRvdykgPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB3ZWJnbCA9IHJlcXVpcmUoJ25vZGUtd2ViZ2wnKTtcbiAgICBJbWFnZSA9IHdlYmdsLkltYWdlO1xufVxuXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG5cbiAgICBmdW5jdGlvbiBnZXRTb3VyY2UoaWQpIHtcbiAgICAgICAgLy8gVE9ETzogQ291bGQgd2UgdXNlIEhUTUwgPHNjcmlwdD4gZWxlbWVudHMgaW5zdGVhZCBvZiBBSkFYIGZldGNoZXM/IFdlIGNvdWxkIHBvc3NpYmx5XG4gICAgICAgIC8vIHNldCB0aGUgc3JjIG9mIHRoZSBzY3JpcHQgdG8gb3VyIGNvbnRlbnQsIHRoZSB0eXBlIHRvIHNvbWV0aGluZyBvdGhlciB0aGFuIEpTLiBUaGVuLCB3ZVxuICAgICAgICAvLyBsaXN0ZW4gZm9yIHRoZSBvbmxvYWQgZXZlbnQuIEluIHRoaXMgd2F5LCB3ZSBtYXkgYmUgYWJsZSB0byBsb2FkIGNvbnRlbnQgZnJvbSBkaXNrXG4gICAgICAgIC8vIHdpdGhvdXQgcnVubmluZyBhIHNlcnZlci5cblxuICAgICAgICBpZiAodHlwZW9mIHdpbmRvdyA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgdmFyIGZzID0gcmVxdWlyZSgnZnMnKTtcbiAgICAgICAgICAgIHJldHVybiBRLmRlbm9kZWlmeShmcy5yZWFkRmlsZSkoJ3NoYWRlcnMvJyArIGlkLCB7ZW5jb2Rpbmc6ICd1dGY4J30pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHVybCA9IFwic2hhZGVycy9cIiArIGlkO1xuICAgICAgICAgICAgcmV0dXJuIFEoJC5hamF4KHVybCwge2RhdGFUeXBlOiBcInRleHRcIn0pKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZldGNoIGFuIGltYWdlIGFzIGFuIEhUTUwgSW1hZ2Ugb2JqZWN0XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyBhIHByb21pc2UgZnVsZmlsbGVkIHdpdGggdGhlIEhUTUwgSW1hZ2Ugb2JqZWN0LCBvbmNlIGxvYWRlZFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEltYWdlKHVybCkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBRLmRlZmVyKCk7XG4gICAgICAgIHZhciBpbWcgPSBuZXcgSW1hZ2UoKTtcblxuICAgICAgICBpbWcub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKCdJTUcgTE9BREVEJylcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoaW1nKTtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zb2xlLmRlYnVnKFwiU0VUVElORyBTT1VSQ0VcIiwgdXJsKVxuICAgICAgICBpbWcuc3JjID0gdXJsO1xuICAgICAgICBjb25zb2xlLmRlYnVnKFwiU0VUIFNPVVJDRVwiKVxuXG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH1cblxuXG4gICAgLy8gRXh0ZW5kcyB0YXJnZXQgYnkgYWRkaW5nIHRoZSBhdHRyaWJ1dGVzIG9mIG9uZSBvciBtb3JlIG90aGVyIG9iamVjdHMgdG8gaXRcbiAgICBmdW5jdGlvbiBleHRlbmQodGFyZ2V0LCBvYmplY3QxLCBvYmplY3ROKSB7XG4gICAgICAgIGZvciAodmFyIGFyZyA9IDE7IGFyZyA8IGFyZ3VtZW50cy5sZW5ndGg7IGFyZysrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpIGluIGFyZ3VtZW50c1thcmddKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W2ldID0gYXJndW1lbnRzW2FyZ11baV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRhcmdldDtcbiAgICB9XG5cblxuICAgIG1vZHVsZS5leHBvcnRzID0ge1xuICAgICAgICBcImdldFNvdXJjZVwiOiBnZXRTb3VyY2UsXG4gICAgICAgIFwiZ2V0SW1hZ2VcIjogZ2V0SW1hZ2UsXG4gICAgICAgIFwiZXh0ZW5kXCI6IGV4dGVuZFxuICAgIH07XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gdmltOnRzPTQ6c3RzPTQ6c3c9NDpcbi8qIVxuICpcbiAqIENvcHlyaWdodCAyMDA5LTIwMTIgS3JpcyBLb3dhbCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIE1JVFxuICogbGljZW5zZSBmb3VuZCBhdCBodHRwOi8vZ2l0aHViLmNvbS9rcmlza293YWwvcS9yYXcvbWFzdGVyL0xJQ0VOU0VcbiAqXG4gKiBXaXRoIHBhcnRzIGJ5IFR5bGVyIENsb3NlXG4gKiBDb3B5cmlnaHQgMjAwNy0yMDA5IFR5bGVyIENsb3NlIHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgTUlUIFggbGljZW5zZSBmb3VuZFxuICogYXQgaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5odG1sXG4gKiBGb3JrZWQgYXQgcmVmX3NlbmQuanMgdmVyc2lvbjogMjAwOS0wNS0xMVxuICpcbiAqIFdpdGggcGFydHMgYnkgTWFyayBNaWxsZXJcbiAqIENvcHlyaWdodCAoQykgMjAxMSBHb29nbGUgSW5jLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICpcbiAqL1xuXG4oZnVuY3Rpb24gKGRlZmluaXRpb24pIHtcbiAgICAvLyBUdXJuIG9mZiBzdHJpY3QgbW9kZSBmb3IgdGhpcyBmdW5jdGlvbiBzbyB3ZSBjYW4gYXNzaWduIHRvIGdsb2JhbC5RXG4gICAgLyoganNoaW50IHN0cmljdDogZmFsc2UgKi9cblxuICAgIC8vIFRoaXMgZmlsZSB3aWxsIGZ1bmN0aW9uIHByb3Blcmx5IGFzIGEgPHNjcmlwdD4gdGFnLCBvciBhIG1vZHVsZVxuICAgIC8vIHVzaW5nIENvbW1vbkpTIGFuZCBOb2RlSlMgb3IgUmVxdWlyZUpTIG1vZHVsZSBmb3JtYXRzLiAgSW5cbiAgICAvLyBDb21tb24vTm9kZS9SZXF1aXJlSlMsIHRoZSBtb2R1bGUgZXhwb3J0cyB0aGUgUSBBUEkgYW5kIHdoZW5cbiAgICAvLyBleGVjdXRlZCBhcyBhIHNpbXBsZSA8c2NyaXB0PiwgaXQgY3JlYXRlcyBhIFEgZ2xvYmFsIGluc3RlYWQuXG5cbiAgICAvLyBNb250YWdlIFJlcXVpcmVcbiAgICBpZiAodHlwZW9mIGJvb3RzdHJhcCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgIGJvb3RzdHJhcChcInByb21pc2VcIiwgZGVmaW5pdGlvbik7XG5cbiAgICAvLyBDb21tb25KU1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBkZWZpbml0aW9uKCk7XG5cbiAgICAvLyBSZXF1aXJlSlNcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZShkZWZpbml0aW9uKTtcblxuICAgIC8vIFNFUyAoU2VjdXJlIEVjbWFTY3JpcHQpXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIGlmICghc2VzLm9rKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlcy5tYWtlUSA9IGRlZmluaXRpb247XG4gICAgICAgIH1cblxuICAgIC8vIDxzY3JpcHQ+XG4gICAgfSBlbHNlIHtcbiAgICAgICAgUSA9IGRlZmluaXRpb24oKTtcbiAgICB9XG5cbn0pKGZ1bmN0aW9uICgpIHtcblwidXNlIHN0cmljdFwiO1xuXG52YXIgaGFzU3RhY2tzID0gZmFsc2U7XG50cnkge1xuICAgIHRocm93IG5ldyBFcnJvcigpO1xufSBjYXRjaCAoZSkge1xuICAgIGhhc1N0YWNrcyA9ICEhZS5zdGFjaztcbn1cblxuLy8gQWxsIGNvZGUgYWZ0ZXIgdGhpcyBwb2ludCB3aWxsIGJlIGZpbHRlcmVkIGZyb20gc3RhY2sgdHJhY2VzIHJlcG9ydGVkXG4vLyBieSBRLlxudmFyIHFTdGFydGluZ0xpbmUgPSBjYXB0dXJlTGluZSgpO1xudmFyIHFGaWxlTmFtZTtcblxuLy8gc2hpbXNcblxuLy8gdXNlZCBmb3IgZmFsbGJhY2sgaW4gXCJhbGxSZXNvbHZlZFwiXG52YXIgbm9vcCA9IGZ1bmN0aW9uICgpIHt9O1xuXG4vLyBVc2UgdGhlIGZhc3Rlc3QgcG9zc2libGUgbWVhbnMgdG8gZXhlY3V0ZSBhIHRhc2sgaW4gYSBmdXR1cmUgdHVyblxuLy8gb2YgdGhlIGV2ZW50IGxvb3AuXG52YXIgbmV4dFRpY2sgPShmdW5jdGlvbiAoKSB7XG4gICAgLy8gbGlua2VkIGxpc3Qgb2YgdGFza3MgKHNpbmdsZSwgd2l0aCBoZWFkIG5vZGUpXG4gICAgdmFyIGhlYWQgPSB7dGFzazogdm9pZCAwLCBuZXh0OiBudWxsfTtcbiAgICB2YXIgdGFpbCA9IGhlYWQ7XG4gICAgdmFyIGZsdXNoaW5nID0gZmFsc2U7XG4gICAgdmFyIHJlcXVlc3RUaWNrID0gdm9pZCAwO1xuICAgIHZhciBpc05vZGVKUyA9IGZhbHNlO1xuXG4gICAgZnVuY3Rpb24gZmx1c2goKSB7XG4gICAgICAgIC8qIGpzaGludCBsb29wZnVuYzogdHJ1ZSAqL1xuXG4gICAgICAgIHdoaWxlIChoZWFkLm5leHQpIHtcbiAgICAgICAgICAgIGhlYWQgPSBoZWFkLm5leHQ7XG4gICAgICAgICAgICB2YXIgdGFzayA9IGhlYWQudGFzaztcbiAgICAgICAgICAgIGhlYWQudGFzayA9IHZvaWQgMDtcbiAgICAgICAgICAgIHZhciBkb21haW4gPSBoZWFkLmRvbWFpbjtcblxuICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgIGhlYWQuZG9tYWluID0gdm9pZCAwO1xuICAgICAgICAgICAgICAgIGRvbWFpbi5lbnRlcigpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhc2soKTtcblxuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIGlmIChpc05vZGVKUykge1xuICAgICAgICAgICAgICAgICAgICAvLyBJbiBub2RlLCB1bmNhdWdodCBleGNlcHRpb25zIGFyZSBjb25zaWRlcmVkIGZhdGFsIGVycm9ycy5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtdGhyb3cgdGhlbSBzeW5jaHJvbm91c2x5IHRvIGludGVycnVwdCBmbHVzaGluZyFcblxuICAgICAgICAgICAgICAgICAgICAvLyBFbnN1cmUgY29udGludWF0aW9uIGlmIHRoZSB1bmNhdWdodCBleGNlcHRpb24gaXMgc3VwcHJlc3NlZFxuICAgICAgICAgICAgICAgICAgICAvLyBsaXN0ZW5pbmcgXCJ1bmNhdWdodEV4Y2VwdGlvblwiIGV2ZW50cyAoYXMgZG9tYWlucyBkb2VzKS5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgaW4gbmV4dCBldmVudCB0byBhdm9pZCB0aWNrIHJlY3Vyc2lvbi5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZG9tYWluLmV4aXQoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGRvbWFpbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZG9tYWluLmVudGVyKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBlO1xuXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW4gYnJvd3NlcnMsIHVuY2F1Z2h0IGV4Y2VwdGlvbnMgYXJlIG5vdCBmYXRhbC5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmUtdGhyb3cgdGhlbSBhc3luY2hyb25vdXNseSB0byBhdm9pZCBzbG93LWRvd25zLlxuICAgICAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICAgICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkb21haW4pIHtcbiAgICAgICAgICAgICAgICBkb21haW4uZXhpdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZmx1c2hpbmcgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBuZXh0VGljayA9IGZ1bmN0aW9uICh0YXNrKSB7XG4gICAgICAgIHRhaWwgPSB0YWlsLm5leHQgPSB7XG4gICAgICAgICAgICB0YXNrOiB0YXNrLFxuICAgICAgICAgICAgZG9tYWluOiBpc05vZGVKUyAmJiBwcm9jZXNzLmRvbWFpbixcbiAgICAgICAgICAgIG5leHQ6IG51bGxcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoIWZsdXNoaW5nKSB7XG4gICAgICAgICAgICBmbHVzaGluZyA9IHRydWU7XG4gICAgICAgICAgICByZXF1ZXN0VGljaygpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLm5leHRUaWNrKSB7XG4gICAgICAgIC8vIE5vZGUuanMgYmVmb3JlIDAuOS4gTm90ZSB0aGF0IHNvbWUgZmFrZS1Ob2RlIGVudmlyb25tZW50cywgbGlrZSB0aGVcbiAgICAgICAgLy8gTW9jaGEgdGVzdCBydW5uZXIsIGludHJvZHVjZSBhIGBwcm9jZXNzYCBnbG9iYWwgd2l0aG91dCBhIGBuZXh0VGlja2AuXG4gICAgICAgIGlzTm9kZUpTID0gdHJ1ZTtcblxuICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2soZmx1c2gpO1xuICAgICAgICB9O1xuXG4gICAgfSBlbHNlIGlmICh0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgLy8gSW4gSUUxMCwgTm9kZS5qcyAwLjkrLCBvciBodHRwczovL2dpdGh1Yi5jb20vTm9ibGVKUy9zZXRJbW1lZGlhdGVcbiAgICAgICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHJlcXVlc3RUaWNrID0gc2V0SW1tZWRpYXRlLmJpbmQod2luZG93LCBmbHVzaCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzZXRJbW1lZGlhdGUoZmx1c2gpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgfSBlbHNlIGlmICh0eXBlb2YgTWVzc2FnZUNoYW5uZWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgLy8gbW9kZXJuIGJyb3dzZXJzXG4gICAgICAgIC8vIGh0dHA6Ly93d3cubm9uYmxvY2tpbmcuaW8vMjAxMS8wNi93aW5kb3duZXh0dGljay5odG1sXG4gICAgICAgIHZhciBjaGFubmVsID0gbmV3IE1lc3NhZ2VDaGFubmVsKCk7XG4gICAgICAgIC8vIEF0IGxlYXN0IFNhZmFyaSBWZXJzaW9uIDYuMC41ICg4NTM2LjMwLjEpIGludGVybWl0dGVudGx5IGNhbm5vdCBjcmVhdGVcbiAgICAgICAgLy8gd29ya2luZyBtZXNzYWdlIHBvcnRzIHRoZSBmaXJzdCB0aW1lIGEgcGFnZSBsb2Fkcy5cbiAgICAgICAgY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXF1ZXN0VGljayA9IHJlcXVlc3RQb3J0VGljaztcbiAgICAgICAgICAgIGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gZmx1c2g7XG4gICAgICAgICAgICBmbHVzaCgpO1xuICAgICAgICB9O1xuICAgICAgICB2YXIgcmVxdWVzdFBvcnRUaWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gT3BlcmEgcmVxdWlyZXMgdXMgdG8gcHJvdmlkZSBhIG1lc3NhZ2UgcGF5bG9hZCwgcmVnYXJkbGVzcyBvZlxuICAgICAgICAgICAgLy8gd2hldGhlciB3ZSB1c2UgaXQuXG4gICAgICAgICAgICBjaGFubmVsLnBvcnQyLnBvc3RNZXNzYWdlKDApO1xuICAgICAgICB9O1xuICAgICAgICByZXF1ZXN0VGljayA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZmx1c2gsIDApO1xuICAgICAgICAgICAgcmVxdWVzdFBvcnRUaWNrKCk7XG4gICAgICAgIH07XG5cbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBvbGQgYnJvd3NlcnNcbiAgICAgICAgcmVxdWVzdFRpY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGZsdXNoLCAwKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV4dFRpY2s7XG59KSgpO1xuXG4vLyBBdHRlbXB0IHRvIG1ha2UgZ2VuZXJpY3Mgc2FmZSBpbiB0aGUgZmFjZSBvZiBkb3duc3RyZWFtXG4vLyBtb2RpZmljYXRpb25zLlxuLy8gVGhlcmUgaXMgbm8gc2l0dWF0aW9uIHdoZXJlIHRoaXMgaXMgbmVjZXNzYXJ5LlxuLy8gSWYgeW91IG5lZWQgYSBzZWN1cml0eSBndWFyYW50ZWUsIHRoZXNlIHByaW1vcmRpYWxzIG5lZWQgdG8gYmVcbi8vIGRlZXBseSBmcm96ZW4gYW55d2F5LCBhbmQgaWYgeW91IGRvbuKAmXQgbmVlZCBhIHNlY3VyaXR5IGd1YXJhbnRlZSxcbi8vIHRoaXMgaXMganVzdCBwbGFpbiBwYXJhbm9pZC5cbi8vIEhvd2V2ZXIsIHRoaXMgKiptaWdodCoqIGhhdmUgdGhlIG5pY2Ugc2lkZS1lZmZlY3Qgb2YgcmVkdWNpbmcgdGhlIHNpemUgb2Zcbi8vIHRoZSBtaW5pZmllZCBjb2RlIGJ5IHJlZHVjaW5nIHguY2FsbCgpIHRvIG1lcmVseSB4KClcbi8vIFNlZSBNYXJrIE1pbGxlcuKAmXMgZXhwbGFuYXRpb24gb2Ygd2hhdCB0aGlzIGRvZXMuXG4vLyBodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1jb252ZW50aW9uczpzYWZlX21ldGFfcHJvZ3JhbW1pbmdcbnZhciBjYWxsID0gRnVuY3Rpb24uY2FsbDtcbmZ1bmN0aW9uIHVuY3VycnlUaGlzKGYpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gY2FsbC5hcHBseShmLCBhcmd1bWVudHMpO1xuICAgIH07XG59XG4vLyBUaGlzIGlzIGVxdWl2YWxlbnQsIGJ1dCBzbG93ZXI6XG4vLyB1bmN1cnJ5VGhpcyA9IEZ1bmN0aW9uX2JpbmQuYmluZChGdW5jdGlvbl9iaW5kLmNhbGwpO1xuLy8gaHR0cDovL2pzcGVyZi5jb20vdW5jdXJyeXRoaXNcblxudmFyIGFycmF5X3NsaWNlID0gdW5jdXJyeVRoaXMoQXJyYXkucHJvdG90eXBlLnNsaWNlKTtcblxudmFyIGFycmF5X3JlZHVjZSA9IHVuY3VycnlUaGlzKFxuICAgIEFycmF5LnByb3RvdHlwZS5yZWR1Y2UgfHwgZnVuY3Rpb24gKGNhbGxiYWNrLCBiYXNpcykge1xuICAgICAgICB2YXIgaW5kZXggPSAwLFxuICAgICAgICAgICAgbGVuZ3RoID0gdGhpcy5sZW5ndGg7XG4gICAgICAgIC8vIGNvbmNlcm5pbmcgdGhlIGluaXRpYWwgdmFsdWUsIGlmIG9uZSBpcyBub3QgcHJvdmlkZWRcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgIC8vIHNlZWsgdG8gdGhlIGZpcnN0IHZhbHVlIGluIHRoZSBhcnJheSwgYWNjb3VudGluZ1xuICAgICAgICAgICAgLy8gZm9yIHRoZSBwb3NzaWJpbGl0eSB0aGF0IGlzIGlzIGEgc3BhcnNlIGFycmF5XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgaWYgKGluZGV4IGluIHRoaXMpIHtcbiAgICAgICAgICAgICAgICAgICAgYmFzaXMgPSB0aGlzW2luZGV4KytdO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCsraW5kZXggPj0gbGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IHdoaWxlICgxKTtcbiAgICAgICAgfVxuICAgICAgICAvLyByZWR1Y2VcbiAgICAgICAgZm9yICg7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgICAgICAvLyBhY2NvdW50IGZvciB0aGUgcG9zc2liaWxpdHkgdGhhdCB0aGUgYXJyYXkgaXMgc3BhcnNlXG4gICAgICAgICAgICBpZiAoaW5kZXggaW4gdGhpcykge1xuICAgICAgICAgICAgICAgIGJhc2lzID0gY2FsbGJhY2soYmFzaXMsIHRoaXNbaW5kZXhdLCBpbmRleCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJhc2lzO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9pbmRleE9mID0gdW5jdXJyeVRoaXMoXG4gICAgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgfHwgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIC8vIG5vdCBhIHZlcnkgZ29vZCBzaGltLCBidXQgZ29vZCBlbm91Z2ggZm9yIG91ciBvbmUgdXNlIG9mIGl0XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHRoaXNbaV0gPT09IHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbik7XG5cbnZhciBhcnJheV9tYXAgPSB1bmN1cnJ5VGhpcyhcbiAgICBBcnJheS5wcm90b3R5cGUubWFwIHx8IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3ApIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgY29sbGVjdCA9IFtdO1xuICAgICAgICBhcnJheV9yZWR1Y2Uoc2VsZiwgZnVuY3Rpb24gKHVuZGVmaW5lZCwgdmFsdWUsIGluZGV4KSB7XG4gICAgICAgICAgICBjb2xsZWN0LnB1c2goY2FsbGJhY2suY2FsbCh0aGlzcCwgdmFsdWUsIGluZGV4LCBzZWxmKSk7XG4gICAgICAgIH0sIHZvaWQgMCk7XG4gICAgICAgIHJldHVybiBjb2xsZWN0O1xuICAgIH1cbik7XG5cbnZhciBvYmplY3RfY3JlYXRlID0gT2JqZWN0LmNyZWF0ZSB8fCBmdW5jdGlvbiAocHJvdG90eXBlKSB7XG4gICAgZnVuY3Rpb24gVHlwZSgpIHsgfVxuICAgIFR5cGUucHJvdG90eXBlID0gcHJvdG90eXBlO1xuICAgIHJldHVybiBuZXcgVHlwZSgpO1xufTtcblxudmFyIG9iamVjdF9oYXNPd25Qcm9wZXJ0eSA9IHVuY3VycnlUaGlzKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkpO1xuXG52YXIgb2JqZWN0X2tleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChvYmplY3RfaGFzT3duUHJvcGVydHkob2JqZWN0LCBrZXkpKSB7XG4gICAgICAgICAgICBrZXlzLnB1c2goa2V5KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbnZhciBvYmplY3RfdG9TdHJpbmcgPSB1bmN1cnJ5VGhpcyhPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nKTtcblxuZnVuY3Rpb24gaXNPYmplY3QodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgPT09IE9iamVjdCh2YWx1ZSk7XG59XG5cbi8vIGdlbmVyYXRvciByZWxhdGVkIHNoaW1zXG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBmdW5jdGlvbiBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG5mdW5jdGlvbiBpc1N0b3BJdGVyYXRpb24oZXhjZXB0aW9uKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICAgb2JqZWN0X3RvU3RyaW5nKGV4Y2VwdGlvbikgPT09IFwiW29iamVjdCBTdG9wSXRlcmF0aW9uXVwiIHx8XG4gICAgICAgIGV4Y2VwdGlvbiBpbnN0YW5jZW9mIFFSZXR1cm5WYWx1ZVxuICAgICk7XG59XG5cbi8vIEZJWE1FOiBSZW1vdmUgdGhpcyBoZWxwZXIgYW5kIFEucmV0dXJuIG9uY2UgRVM2IGdlbmVyYXRvcnMgYXJlIGluXG4vLyBTcGlkZXJNb25rZXkuXG52YXIgUVJldHVyblZhbHVlO1xuaWYgKHR5cGVvZiBSZXR1cm5WYWx1ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIFFSZXR1cm5WYWx1ZSA9IFJldHVyblZhbHVlO1xufSBlbHNlIHtcbiAgICBRUmV0dXJuVmFsdWUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdGhpcy52YWx1ZSA9IHZhbHVlO1xuICAgIH07XG59XG5cbi8vIGxvbmcgc3RhY2sgdHJhY2VzXG5cbnZhciBTVEFDS19KVU1QX1NFUEFSQVRPUiA9IFwiRnJvbSBwcmV2aW91cyBldmVudDpcIjtcblxuZnVuY3Rpb24gbWFrZVN0YWNrVHJhY2VMb25nKGVycm9yLCBwcm9taXNlKSB7XG4gICAgLy8gSWYgcG9zc2libGUsIHRyYW5zZm9ybSB0aGUgZXJyb3Igc3RhY2sgdHJhY2UgYnkgcmVtb3ZpbmcgTm9kZSBhbmQgUVxuICAgIC8vIGNydWZ0LCB0aGVuIGNvbmNhdGVuYXRpbmcgd2l0aCB0aGUgc3RhY2sgdHJhY2Ugb2YgYHByb21pc2VgLiBTZWUgIzU3LlxuICAgIGlmIChoYXNTdGFja3MgJiZcbiAgICAgICAgcHJvbWlzZS5zdGFjayAmJlxuICAgICAgICB0eXBlb2YgZXJyb3IgPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgZXJyb3IgIT09IG51bGwgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2sgJiZcbiAgICAgICAgZXJyb3Iuc3RhY2suaW5kZXhPZihTVEFDS19KVU1QX1NFUEFSQVRPUikgPT09IC0xXG4gICAgKSB7XG4gICAgICAgIHZhciBzdGFja3MgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgcCA9IHByb21pc2U7ICEhcDsgcCA9IHAuc291cmNlKSB7XG4gICAgICAgICAgICBpZiAocC5zdGFjaykge1xuICAgICAgICAgICAgICAgIHN0YWNrcy51bnNoaWZ0KHAuc3RhY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YWNrcy51bnNoaWZ0KGVycm9yLnN0YWNrKTtcblxuICAgICAgICB2YXIgY29uY2F0ZWRTdGFja3MgPSBzdGFja3Muam9pbihcIlxcblwiICsgU1RBQ0tfSlVNUF9TRVBBUkFUT1IgKyBcIlxcblwiKTtcbiAgICAgICAgZXJyb3Iuc3RhY2sgPSBmaWx0ZXJTdGFja1N0cmluZyhjb25jYXRlZFN0YWNrcyk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmaWx0ZXJTdGFja1N0cmluZyhzdGFja1N0cmluZykge1xuICAgIHZhciBsaW5lcyA9IHN0YWNrU3RyaW5nLnNwbGl0KFwiXFxuXCIpO1xuICAgIHZhciBkZXNpcmVkTGluZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBsaW5lID0gbGluZXNbaV07XG5cbiAgICAgICAgaWYgKCFpc0ludGVybmFsRnJhbWUobGluZSkgJiYgIWlzTm9kZUZyYW1lKGxpbmUpICYmIGxpbmUpIHtcbiAgICAgICAgICAgIGRlc2lyZWRMaW5lcy5wdXNoKGxpbmUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkZXNpcmVkTGluZXMuam9pbihcIlxcblwiKTtcbn1cblxuZnVuY3Rpb24gaXNOb2RlRnJhbWUoc3RhY2tMaW5lKSB7XG4gICAgcmV0dXJuIHN0YWNrTGluZS5pbmRleE9mKFwiKG1vZHVsZS5qczpcIikgIT09IC0xIHx8XG4gICAgICAgICAgIHN0YWNrTGluZS5pbmRleE9mKFwiKG5vZGUuanM6XCIpICE9PSAtMTtcbn1cblxuZnVuY3Rpb24gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSkge1xuICAgIC8vIE5hbWVkIGZ1bmN0aW9uczogXCJhdCBmdW5jdGlvbk5hbWUgKGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyKVwiXG4gICAgLy8gSW4gSUUxMCBmdW5jdGlvbiBuYW1lIGNhbiBoYXZlIHNwYWNlcyAoXCJBbm9ueW1vdXMgZnVuY3Rpb25cIikgT19vXG4gICAgdmFyIGF0dGVtcHQxID0gL2F0IC4rIFxcKCguKyk6KFxcZCspOig/OlxcZCspXFwpJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0MSkge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQxWzFdLCBOdW1iZXIoYXR0ZW1wdDFbMl0pXTtcbiAgICB9XG5cbiAgICAvLyBBbm9ueW1vdXMgZnVuY3Rpb25zOiBcImF0IGZpbGVuYW1lOmxpbmVOdW1iZXI6Y29sdW1uTnVtYmVyXCJcbiAgICB2YXIgYXR0ZW1wdDIgPSAvYXQgKFteIF0rKTooXFxkKyk6KD86XFxkKykkLy5leGVjKHN0YWNrTGluZSk7XG4gICAgaWYgKGF0dGVtcHQyKSB7XG4gICAgICAgIHJldHVybiBbYXR0ZW1wdDJbMV0sIE51bWJlcihhdHRlbXB0MlsyXSldO1xuICAgIH1cblxuICAgIC8vIEZpcmVmb3ggc3R5bGU6IFwiZnVuY3Rpb25AZmlsZW5hbWU6bGluZU51bWJlciBvciBAZmlsZW5hbWU6bGluZU51bWJlclwiXG4gICAgdmFyIGF0dGVtcHQzID0gLy4qQCguKyk6KFxcZCspJC8uZXhlYyhzdGFja0xpbmUpO1xuICAgIGlmIChhdHRlbXB0Mykge1xuICAgICAgICByZXR1cm4gW2F0dGVtcHQzWzFdLCBOdW1iZXIoYXR0ZW1wdDNbMl0pXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGlzSW50ZXJuYWxGcmFtZShzdGFja0xpbmUpIHtcbiAgICB2YXIgZmlsZU5hbWVBbmRMaW5lTnVtYmVyID0gZ2V0RmlsZU5hbWVBbmRMaW5lTnVtYmVyKHN0YWNrTGluZSk7XG5cbiAgICBpZiAoIWZpbGVOYW1lQW5kTGluZU51bWJlcikge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgdmFyIGZpbGVOYW1lID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzBdO1xuICAgIHZhciBsaW5lTnVtYmVyID0gZmlsZU5hbWVBbmRMaW5lTnVtYmVyWzFdO1xuXG4gICAgcmV0dXJuIGZpbGVOYW1lID09PSBxRmlsZU5hbWUgJiZcbiAgICAgICAgbGluZU51bWJlciA+PSBxU3RhcnRpbmdMaW5lICYmXG4gICAgICAgIGxpbmVOdW1iZXIgPD0gcUVuZGluZ0xpbmU7XG59XG5cbi8vIGRpc2NvdmVyIG93biBmaWxlIG5hbWUgYW5kIGxpbmUgbnVtYmVyIHJhbmdlIGZvciBmaWx0ZXJpbmcgc3RhY2tcbi8vIHRyYWNlc1xuZnVuY3Rpb24gY2FwdHVyZUxpbmUoKSB7XG4gICAgaWYgKCFoYXNTdGFja3MpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdmFyIGxpbmVzID0gZS5zdGFjay5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgdmFyIGZpcnN0TGluZSA9IGxpbmVzWzBdLmluZGV4T2YoXCJAXCIpID4gMCA/IGxpbmVzWzFdIDogbGluZXNbMl07XG4gICAgICAgIHZhciBmaWxlTmFtZUFuZExpbmVOdW1iZXIgPSBnZXRGaWxlTmFtZUFuZExpbmVOdW1iZXIoZmlyc3RMaW5lKTtcbiAgICAgICAgaWYgKCFmaWxlTmFtZUFuZExpbmVOdW1iZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHFGaWxlTmFtZSA9IGZpbGVOYW1lQW5kTGluZU51bWJlclswXTtcbiAgICAgICAgcmV0dXJuIGZpbGVOYW1lQW5kTGluZU51bWJlclsxXTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRlcHJlY2F0ZShjYWxsYmFjaywgbmFtZSwgYWx0ZXJuYXRpdmUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIgJiZcbiAgICAgICAgICAgIHR5cGVvZiBjb25zb2xlLndhcm4gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKG5hbWUgKyBcIiBpcyBkZXByZWNhdGVkLCB1c2UgXCIgKyBhbHRlcm5hdGl2ZSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgXCIgaW5zdGVhZC5cIiwgbmV3IEVycm9yKFwiXCIpLnN0YWNrKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoY2FsbGJhY2ssIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cblxuLy8gZW5kIG9mIHNoaW1zXG4vLyBiZWdpbm5pbmcgb2YgcmVhbCB3b3JrXG5cbi8qKlxuICogQ29uc3RydWN0cyBhIHByb21pc2UgZm9yIGFuIGltbWVkaWF0ZSByZWZlcmVuY2UsIHBhc3NlcyBwcm9taXNlcyB0aHJvdWdoLCBvclxuICogY29lcmNlcyBwcm9taXNlcyBmcm9tIGRpZmZlcmVudCBzeXN0ZW1zLlxuICogQHBhcmFtIHZhbHVlIGltbWVkaWF0ZSByZWZlcmVuY2Ugb3IgcHJvbWlzZVxuICovXG5mdW5jdGlvbiBRKHZhbHVlKSB7XG4gICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbHJlYWR5IGEgUHJvbWlzZSwgcmV0dXJuIGl0IGRpcmVjdGx5LiAgVGhpcyBlbmFibGVzXG4gICAgLy8gdGhlIHJlc29sdmUgZnVuY3Rpb24gdG8gYm90aCBiZSB1c2VkIHRvIGNyZWF0ZWQgcmVmZXJlbmNlcyBmcm9tIG9iamVjdHMsXG4gICAgLy8gYnV0IHRvIHRvbGVyYWJseSBjb2VyY2Ugbm9uLXByb21pc2VzIHRvIHByb21pc2VzLlxuICAgIGlmIChpc1Byb21pc2UodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICAvLyBhc3NpbWlsYXRlIHRoZW5hYmxlc1xuICAgIGlmIChpc1Byb21pc2VBbGlrZSh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIGNvZXJjZSh2YWx1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGZ1bGZpbGwodmFsdWUpO1xuICAgIH1cbn1cblEucmVzb2x2ZSA9IFE7XG5cbi8qKlxuICogUGVyZm9ybXMgYSB0YXNrIGluIGEgZnV0dXJlIHR1cm4gb2YgdGhlIGV2ZW50IGxvb3AuXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSB0YXNrXG4gKi9cblEubmV4dFRpY2sgPSBuZXh0VGljaztcblxuLyoqXG4gKiBDb250cm9scyB3aGV0aGVyIG9yIG5vdCBsb25nIHN0YWNrIHRyYWNlcyB3aWxsIGJlIG9uXG4gKi9cblEubG9uZ1N0YWNrU3VwcG9ydCA9IGZhbHNlO1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSB7cHJvbWlzZSwgcmVzb2x2ZSwgcmVqZWN0fSBvYmplY3QuXG4gKlxuICogYHJlc29sdmVgIGlzIGEgY2FsbGJhY2sgdG8gaW52b2tlIHdpdGggYSBtb3JlIHJlc29sdmVkIHZhbHVlIGZvciB0aGVcbiAqIHByb21pc2UuIFRvIGZ1bGZpbGwgdGhlIHByb21pc2UsIGludm9rZSBgcmVzb2x2ZWAgd2l0aCBhbnkgdmFsdWUgdGhhdCBpc1xuICogbm90IGEgdGhlbmFibGUuIFRvIHJlamVjdCB0aGUgcHJvbWlzZSwgaW52b2tlIGByZXNvbHZlYCB3aXRoIGEgcmVqZWN0ZWRcbiAqIHRoZW5hYmxlLCBvciBpbnZva2UgYHJlamVjdGAgd2l0aCB0aGUgcmVhc29uIGRpcmVjdGx5LiBUbyByZXNvbHZlIHRoZVxuICogcHJvbWlzZSB0byBhbm90aGVyIHRoZW5hYmxlLCB0aHVzIHB1dHRpbmcgaXQgaW4gdGhlIHNhbWUgc3RhdGUsIGludm9rZVxuICogYHJlc29sdmVgIHdpdGggdGhhdCBvdGhlciB0aGVuYWJsZS5cbiAqL1xuUS5kZWZlciA9IGRlZmVyO1xuZnVuY3Rpb24gZGVmZXIoKSB7XG4gICAgLy8gaWYgXCJtZXNzYWdlc1wiIGlzIGFuIFwiQXJyYXlcIiwgdGhhdCBpbmRpY2F0ZXMgdGhhdCB0aGUgcHJvbWlzZSBoYXMgbm90IHlldFxuICAgIC8vIGJlZW4gcmVzb2x2ZWQuICBJZiBpdCBpcyBcInVuZGVmaW5lZFwiLCBpdCBoYXMgYmVlbiByZXNvbHZlZC4gIEVhY2hcbiAgICAvLyBlbGVtZW50IG9mIHRoZSBtZXNzYWdlcyBhcnJheSBpcyBpdHNlbGYgYW4gYXJyYXkgb2YgY29tcGxldGUgYXJndW1lbnRzIHRvXG4gICAgLy8gZm9yd2FyZCB0byB0aGUgcmVzb2x2ZWQgcHJvbWlzZS4gIFdlIGNvZXJjZSB0aGUgcmVzb2x1dGlvbiB2YWx1ZSB0byBhXG4gICAgLy8gcHJvbWlzZSB1c2luZyB0aGUgYHJlc29sdmVgIGZ1bmN0aW9uIGJlY2F1c2UgaXQgaGFuZGxlcyBib3RoIGZ1bGx5XG4gICAgLy8gbm9uLXRoZW5hYmxlIHZhbHVlcyBhbmQgb3RoZXIgdGhlbmFibGVzIGdyYWNlZnVsbHkuXG4gICAgdmFyIG1lc3NhZ2VzID0gW10sIHByb2dyZXNzTGlzdGVuZXJzID0gW10sIHJlc29sdmVkUHJvbWlzZTtcblxuICAgIHZhciBkZWZlcnJlZCA9IG9iamVjdF9jcmVhdGUoZGVmZXIucHJvdG90eXBlKTtcbiAgICB2YXIgcHJvbWlzZSA9IG9iamVjdF9jcmVhdGUoUHJvbWlzZS5wcm90b3R5cGUpO1xuXG4gICAgcHJvbWlzZS5wcm9taXNlRGlzcGF0Y2ggPSBmdW5jdGlvbiAocmVzb2x2ZSwgb3AsIG9wZXJhbmRzKSB7XG4gICAgICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzKTtcbiAgICAgICAgaWYgKG1lc3NhZ2VzKSB7XG4gICAgICAgICAgICBtZXNzYWdlcy5wdXNoKGFyZ3MpO1xuICAgICAgICAgICAgaWYgKG9wID09PSBcIndoZW5cIiAmJiBvcGVyYW5kc1sxXSkgeyAvLyBwcm9ncmVzcyBvcGVyYW5kXG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3NMaXN0ZW5lcnMucHVzaChvcGVyYW5kc1sxXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZWRQcm9taXNlLnByb21pc2VEaXNwYXRjaC5hcHBseShyZXNvbHZlZFByb21pc2UsIGFyZ3MpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gWFhYIGRlcHJlY2F0ZWRcbiAgICBwcm9taXNlLnZhbHVlT2YgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChtZXNzYWdlcykge1xuICAgICAgICAgICAgcmV0dXJuIHByb21pc2U7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIG5lYXJlclZhbHVlID0gbmVhcmVyKHJlc29sdmVkUHJvbWlzZSk7XG4gICAgICAgIGlmIChpc1Byb21pc2UobmVhcmVyVmFsdWUpKSB7XG4gICAgICAgICAgICByZXNvbHZlZFByb21pc2UgPSBuZWFyZXJWYWx1ZTsgLy8gc2hvcnRlbiBjaGFpblxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZWFyZXJWYWx1ZTtcbiAgICB9O1xuXG4gICAgcHJvbWlzZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoIXJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6IFwicGVuZGluZ1wiIH07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc29sdmVkUHJvbWlzZS5pbnNwZWN0KCk7XG4gICAgfTtcblxuICAgIGlmIChRLmxvbmdTdGFja1N1cHBvcnQgJiYgaGFzU3RhY2tzKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgLy8gTk9URTogZG9uJ3QgdHJ5IHRvIHVzZSBgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2VgIG9yIHRyYW5zZmVyIHRoZVxuICAgICAgICAgICAgLy8gYWNjZXNzb3IgYXJvdW5kOyB0aGF0IGNhdXNlcyBtZW1vcnkgbGVha3MgYXMgcGVyIEdILTExMS4gSnVzdFxuICAgICAgICAgICAgLy8gcmVpZnkgdGhlIHN0YWNrIHRyYWNlIGFzIGEgc3RyaW5nIEFTQVAuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gQXQgdGhlIHNhbWUgdGltZSwgY3V0IG9mZiB0aGUgZmlyc3QgbGluZTsgaXQncyBhbHdheXMganVzdFxuICAgICAgICAgICAgLy8gXCJbb2JqZWN0IFByb21pc2VdXFxuXCIsIGFzIHBlciB0aGUgYHRvU3RyaW5nYC5cbiAgICAgICAgICAgIHByb21pc2Uuc3RhY2sgPSBlLnN0YWNrLnN1YnN0cmluZyhlLnN0YWNrLmluZGV4T2YoXCJcXG5cIikgKyAxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIE5PVEU6IHdlIGRvIHRoZSBjaGVja3MgZm9yIGByZXNvbHZlZFByb21pc2VgIGluIGVhY2ggbWV0aG9kLCBpbnN0ZWFkIG9mXG4gICAgLy8gY29uc29saWRhdGluZyB0aGVtIGludG8gYGJlY29tZWAsIHNpbmNlIG90aGVyd2lzZSB3ZSdkIGNyZWF0ZSBuZXdcbiAgICAvLyBwcm9taXNlcyB3aXRoIHRoZSBsaW5lcyBgYmVjb21lKHdoYXRldmVyKHZhbHVlKSlgLiBTZWUgZS5nLiBHSC0yNTIuXG5cbiAgICBmdW5jdGlvbiBiZWNvbWUobmV3UHJvbWlzZSkge1xuICAgICAgICByZXNvbHZlZFByb21pc2UgPSBuZXdQcm9taXNlO1xuICAgICAgICBwcm9taXNlLnNvdXJjZSA9IG5ld1Byb21pc2U7XG5cbiAgICAgICAgYXJyYXlfcmVkdWNlKG1lc3NhZ2VzLCBmdW5jdGlvbiAodW5kZWZpbmVkLCBtZXNzYWdlKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbmV3UHJvbWlzZS5wcm9taXNlRGlzcGF0Y2guYXBwbHkobmV3UHJvbWlzZSwgbWVzc2FnZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgdm9pZCAwKTtcblxuICAgICAgICBtZXNzYWdlcyA9IHZvaWQgMDtcbiAgICAgICAgcHJvZ3Jlc3NMaXN0ZW5lcnMgPSB2b2lkIDA7XG4gICAgfVxuXG4gICAgZGVmZXJyZWQucHJvbWlzZSA9IHByb21pc2U7XG4gICAgZGVmZXJyZWQucmVzb2x2ZSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBpZiAocmVzb2x2ZWRQcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBiZWNvbWUoUSh2YWx1ZSkpO1xuICAgIH07XG5cbiAgICBkZWZlcnJlZC5mdWxmaWxsID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGJlY29tZShmdWxmaWxsKHZhbHVlKSk7XG4gICAgfTtcbiAgICBkZWZlcnJlZC5yZWplY3QgPSBmdW5jdGlvbiAocmVhc29uKSB7XG4gICAgICAgIGlmIChyZXNvbHZlZFByb21pc2UpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGJlY29tZShyZWplY3QocmVhc29uKSk7XG4gICAgfTtcbiAgICBkZWZlcnJlZC5ub3RpZnkgPSBmdW5jdGlvbiAocHJvZ3Jlc3MpIHtcbiAgICAgICAgaWYgKHJlc29sdmVkUHJvbWlzZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgYXJyYXlfcmVkdWNlKHByb2dyZXNzTGlzdGVuZXJzLCBmdW5jdGlvbiAodW5kZWZpbmVkLCBwcm9ncmVzc0xpc3RlbmVyKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcHJvZ3Jlc3NMaXN0ZW5lcihwcm9ncmVzcyk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSwgdm9pZCAwKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIGRlZmVycmVkO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBOb2RlLXN0eWxlIGNhbGxiYWNrIHRoYXQgd2lsbCByZXNvbHZlIG9yIHJlamVjdCB0aGUgZGVmZXJyZWRcbiAqIHByb21pc2UuXG4gKiBAcmV0dXJucyBhIG5vZGViYWNrXG4gKi9cbmRlZmVyLnByb3RvdHlwZS5tYWtlTm9kZVJlc29sdmVyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gZnVuY3Rpb24gKGVycm9yLCB2YWx1ZSkge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNlbGYucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSBlbHNlIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMikge1xuICAgICAgICAgICAgc2VsZi5yZXNvbHZlKGFycmF5X3NsaWNlKGFyZ3VtZW50cywgMSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgfVxuICAgIH07XG59O1xuXG4vKipcbiAqIEBwYXJhbSByZXNvbHZlciB7RnVuY3Rpb259IGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIG5vdGhpbmcgYW5kIGFjY2VwdHNcbiAqIHRoZSByZXNvbHZlLCByZWplY3QsIGFuZCBub3RpZnkgZnVuY3Rpb25zIGZvciBhIGRlZmVycmVkLlxuICogQHJldHVybnMgYSBwcm9taXNlIHRoYXQgbWF5IGJlIHJlc29sdmVkIHdpdGggdGhlIGdpdmVuIHJlc29sdmUgYW5kIHJlamVjdFxuICogZnVuY3Rpb25zLCBvciByZWplY3RlZCBieSBhIHRocm93biBleGNlcHRpb24gaW4gcmVzb2x2ZXJcbiAqL1xuUS5Qcm9taXNlID0gcHJvbWlzZTsgLy8gRVM2XG5RLnByb21pc2UgPSBwcm9taXNlO1xuZnVuY3Rpb24gcHJvbWlzZShyZXNvbHZlcikge1xuICAgIGlmICh0eXBlb2YgcmVzb2x2ZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwicmVzb2x2ZXIgbXVzdCBiZSBhIGZ1bmN0aW9uLlwiKTtcbiAgICB9XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICB0cnkge1xuICAgICAgICByZXNvbHZlcihkZWZlcnJlZC5yZXNvbHZlLCBkZWZlcnJlZC5yZWplY3QsIGRlZmVycmVkLm5vdGlmeSk7XG4gICAgfSBjYXRjaCAocmVhc29uKSB7XG4gICAgICAgIGRlZmVycmVkLnJlamVjdChyZWFzb24pO1xuICAgIH1cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn1cblxucHJvbWlzZS5yYWNlID0gcmFjZTsgLy8gRVM2XG5wcm9taXNlLmFsbCA9IGFsbDsgLy8gRVM2XG5wcm9taXNlLnJlamVjdCA9IHJlamVjdDsgLy8gRVM2XG5wcm9taXNlLnJlc29sdmUgPSBROyAvLyBFUzZcblxuLy8gWFhYIGV4cGVyaW1lbnRhbC4gIFRoaXMgbWV0aG9kIGlzIGEgd2F5IHRvIGRlbm90ZSB0aGF0IGEgbG9jYWwgdmFsdWUgaXNcbi8vIHNlcmlhbGl6YWJsZSBhbmQgc2hvdWxkIGJlIGltbWVkaWF0ZWx5IGRpc3BhdGNoZWQgdG8gYSByZW1vdGUgdXBvbiByZXF1ZXN0LFxuLy8gaW5zdGVhZCBvZiBwYXNzaW5nIGEgcmVmZXJlbmNlLlxuUS5wYXNzQnlDb3B5ID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIC8vZnJlZXplKG9iamVjdCk7XG4gICAgLy9wYXNzQnlDb3BpZXMuc2V0KG9iamVjdCwgdHJ1ZSk7XG4gICAgcmV0dXJuIG9iamVjdDtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnBhc3NCeUNvcHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgLy9mcmVlemUob2JqZWN0KTtcbiAgICAvL3Bhc3NCeUNvcGllcy5zZXQob2JqZWN0LCB0cnVlKTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogSWYgdHdvIHByb21pc2VzIGV2ZW50dWFsbHkgZnVsZmlsbCB0byB0aGUgc2FtZSB2YWx1ZSwgcHJvbWlzZXMgdGhhdCB2YWx1ZSxcbiAqIGJ1dCBvdGhlcndpc2UgcmVqZWN0cy5cbiAqIEBwYXJhbSB4IHtBbnkqfVxuICogQHBhcmFtIHkge0FueSp9XG4gKiBAcmV0dXJucyB7QW55Kn0gYSBwcm9taXNlIGZvciB4IGFuZCB5IGlmIHRoZXkgYXJlIHRoZSBzYW1lLCBidXQgYSByZWplY3Rpb25cbiAqIG90aGVyd2lzZS5cbiAqXG4gKi9cblEuam9pbiA9IGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgcmV0dXJuIFEoeCkuam9pbih5KTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmpvaW4gPSBmdW5jdGlvbiAodGhhdCkge1xuICAgIHJldHVybiBRKFt0aGlzLCB0aGF0XSkuc3ByZWFkKGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgIGlmICh4ID09PSB5KSB7XG4gICAgICAgICAgICAvLyBUT0RPOiBcIj09PVwiIHNob3VsZCBiZSBPYmplY3QuaXMgb3IgZXF1aXZcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgam9pbjogbm90IHRoZSBzYW1lOiBcIiArIHggKyBcIiBcIiArIHkpO1xuICAgICAgICB9XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgZmlyc3Qgb2YgYW4gYXJyYXkgb2YgcHJvbWlzZXMgdG8gYmVjb21lIGZ1bGZpbGxlZC5cbiAqIEBwYXJhbSBhbnN3ZXJzIHtBcnJheVtBbnkqXX0gcHJvbWlzZXMgdG8gcmFjZVxuICogQHJldHVybnMge0FueSp9IHRoZSBmaXJzdCBwcm9taXNlIHRvIGJlIGZ1bGZpbGxlZFxuICovXG5RLnJhY2UgPSByYWNlO1xuZnVuY3Rpb24gcmFjZShhbnN3ZXJQcykge1xuICAgIHJldHVybiBwcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xuICAgICAgICAvLyBTd2l0Y2ggdG8gdGhpcyBvbmNlIHdlIGNhbiBhc3N1bWUgYXQgbGVhc3QgRVM1XG4gICAgICAgIC8vIGFuc3dlclBzLmZvckVhY2goZnVuY3Rpb24oYW5zd2VyUCkge1xuICAgICAgICAvLyAgICAgUShhbnN3ZXJQKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIC8vIH0pO1xuICAgICAgICAvLyBVc2UgdGhpcyBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGFuc3dlclBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBRKGFuc3dlclBzW2ldKS50aGVuKHJlc29sdmUsIHJlamVjdCk7XG4gICAgICAgIH1cbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUucmFjZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKFEucmFjZSk7XG59O1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBQcm9taXNlIHdpdGggYSBwcm9taXNlIGRlc2NyaXB0b3Igb2JqZWN0IGFuZCBvcHRpb25hbCBmYWxsYmFja1xuICogZnVuY3Rpb24uICBUaGUgZGVzY3JpcHRvciBjb250YWlucyBtZXRob2RzIGxpa2Ugd2hlbihyZWplY3RlZCksIGdldChuYW1lKSxcbiAqIHNldChuYW1lLCB2YWx1ZSksIHBvc3QobmFtZSwgYXJncyksIGFuZCBkZWxldGUobmFtZSksIHdoaWNoIGFsbFxuICogcmV0dXJuIGVpdGhlciBhIHZhbHVlLCBhIHByb21pc2UgZm9yIGEgdmFsdWUsIG9yIGEgcmVqZWN0aW9uLiAgVGhlIGZhbGxiYWNrXG4gKiBhY2NlcHRzIHRoZSBvcGVyYXRpb24gbmFtZSwgYSByZXNvbHZlciwgYW5kIGFueSBmdXJ0aGVyIGFyZ3VtZW50cyB0aGF0IHdvdWxkXG4gKiBoYXZlIGJlZW4gZm9yd2FyZGVkIHRvIHRoZSBhcHByb3ByaWF0ZSBtZXRob2QgYWJvdmUgaGFkIGEgbWV0aG9kIGJlZW5cbiAqIHByb3ZpZGVkIHdpdGggdGhlIHByb3BlciBuYW1lLiAgVGhlIEFQSSBtYWtlcyBubyBndWFyYW50ZWVzIGFib3V0IHRoZSBuYXR1cmVcbiAqIG9mIHRoZSByZXR1cm5lZCBvYmplY3QsIGFwYXJ0IGZyb20gdGhhdCBpdCBpcyB1c2FibGUgd2hlcmVldmVyIHByb21pc2VzIGFyZVxuICogYm91Z2h0IGFuZCBzb2xkLlxuICovXG5RLm1ha2VQcm9taXNlID0gUHJvbWlzZTtcbmZ1bmN0aW9uIFByb21pc2UoZGVzY3JpcHRvciwgZmFsbGJhY2ssIGluc3BlY3QpIHtcbiAgICBpZiAoZmFsbGJhY2sgPT09IHZvaWQgMCkge1xuICAgICAgICBmYWxsYmFjayA9IGZ1bmN0aW9uIChvcCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgXCJQcm9taXNlIGRvZXMgbm90IHN1cHBvcnQgb3BlcmF0aW9uOiBcIiArIG9wXG4gICAgICAgICAgICApKTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgaWYgKGluc3BlY3QgPT09IHZvaWQgMCkge1xuICAgICAgICBpbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHtzdGF0ZTogXCJ1bmtub3duXCJ9O1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlID0gb2JqZWN0X2NyZWF0ZShQcm9taXNlLnByb3RvdHlwZSk7XG5cbiAgICBwcm9taXNlLnByb21pc2VEaXNwYXRjaCA9IGZ1bmN0aW9uIChyZXNvbHZlLCBvcCwgYXJncykge1xuICAgICAgICB2YXIgcmVzdWx0O1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGRlc2NyaXB0b3Jbb3BdKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ID0gZGVzY3JpcHRvcltvcF0uYXBwbHkocHJvbWlzZSwgYXJncyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IGZhbGxiYWNrLmNhbGwocHJvbWlzZSwgb3AsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHJlc3VsdCA9IHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXNvbHZlKSB7XG4gICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcHJvbWlzZS5pbnNwZWN0ID0gaW5zcGVjdDtcblxuICAgIC8vIFhYWCBkZXByZWNhdGVkIGB2YWx1ZU9mYCBhbmQgYGV4Y2VwdGlvbmAgc3VwcG9ydFxuICAgIGlmIChpbnNwZWN0KSB7XG4gICAgICAgIHZhciBpbnNwZWN0ZWQgPSBpbnNwZWN0KCk7XG4gICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicmVqZWN0ZWRcIikge1xuICAgICAgICAgICAgcHJvbWlzZS5leGNlcHRpb24gPSBpbnNwZWN0ZWQucmVhc29uO1xuICAgICAgICB9XG5cbiAgICAgICAgcHJvbWlzZS52YWx1ZU9mID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGluc3BlY3RlZCA9IGluc3BlY3QoKTtcbiAgICAgICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwicGVuZGluZ1wiIHx8XG4gICAgICAgICAgICAgICAgaW5zcGVjdGVkLnN0YXRlID09PSBcInJlamVjdGVkXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBpbnNwZWN0ZWQudmFsdWU7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb21pc2U7XG59XG5cblByb21pc2UucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBcIltvYmplY3QgUHJvbWlzZV1cIjtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbiAoZnVsZmlsbGVkLCByZWplY3RlZCwgcHJvZ3Jlc3NlZCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciBkb25lID0gZmFsc2U7ICAgLy8gZW5zdXJlIHRoZSB1bnRydXN0ZWQgcHJvbWlzZSBtYWtlcyBhdCBtb3N0IGFcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHNpbmdsZSBjYWxsIHRvIG9uZSBvZiB0aGUgY2FsbGJhY2tzXG5cbiAgICBmdW5jdGlvbiBfZnVsZmlsbGVkKHZhbHVlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXR1cm4gdHlwZW9mIGZ1bGZpbGxlZCA9PT0gXCJmdW5jdGlvblwiID8gZnVsZmlsbGVkKHZhbHVlKSA6IHZhbHVlO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiByZWplY3QoZXhjZXB0aW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9yZWplY3RlZChleGNlcHRpb24pIHtcbiAgICAgICAgaWYgKHR5cGVvZiByZWplY3RlZCA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBtYWtlU3RhY2tUcmFjZUxvbmcoZXhjZXB0aW9uLCBzZWxmKTtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdGVkKGV4Y2VwdGlvbik7XG4gICAgICAgICAgICB9IGNhdGNoIChuZXdFeGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KG5ld0V4Y2VwdGlvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIF9wcm9ncmVzc2VkKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgcHJvZ3Jlc3NlZCA9PT0gXCJmdW5jdGlvblwiID8gcHJvZ3Jlc3NlZCh2YWx1ZSkgOiB2YWx1ZTtcbiAgICB9XG5cbiAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgIHNlbGYucHJvbWlzZURpc3BhdGNoKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKGRvbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcblxuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShfZnVsZmlsbGVkKHZhbHVlKSk7XG4gICAgICAgIH0sIFwid2hlblwiLCBbZnVuY3Rpb24gKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgaWYgKGRvbmUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkb25lID0gdHJ1ZTtcblxuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZShfcmVqZWN0ZWQoZXhjZXB0aW9uKSk7XG4gICAgICAgIH1dKTtcbiAgICB9KTtcblxuICAgIC8vIFByb2dyZXNzIHByb3BhZ2F0b3IgbmVlZCB0byBiZSBhdHRhY2hlZCBpbiB0aGUgY3VycmVudCB0aWNrLlxuICAgIHNlbGYucHJvbWlzZURpc3BhdGNoKHZvaWQgMCwgXCJ3aGVuXCIsIFt2b2lkIDAsIGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB2YXIgbmV3VmFsdWU7XG4gICAgICAgIHZhciB0aHJldyA9IGZhbHNlO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbmV3VmFsdWUgPSBfcHJvZ3Jlc3NlZCh2YWx1ZSk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRocmV3ID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChRLm9uZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBRLm9uZXJyb3IoZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRocmV3KSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5ub3RpZnkobmV3VmFsdWUpO1xuICAgICAgICB9XG4gICAgfV0pO1xuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyBhbiBvYnNlcnZlciBvbiBhIHByb21pc2UuXG4gKlxuICogR3VhcmFudGVlczpcbiAqXG4gKiAxLiB0aGF0IGZ1bGZpbGxlZCBhbmQgcmVqZWN0ZWQgd2lsbCBiZSBjYWxsZWQgb25seSBvbmNlLlxuICogMi4gdGhhdCBlaXRoZXIgdGhlIGZ1bGZpbGxlZCBjYWxsYmFjayBvciB0aGUgcmVqZWN0ZWQgY2FsbGJhY2sgd2lsbCBiZVxuICogICAgY2FsbGVkLCBidXQgbm90IGJvdGguXG4gKiAzLiB0aGF0IGZ1bGZpbGxlZCBhbmQgcmVqZWN0ZWQgd2lsbCBub3QgYmUgY2FsbGVkIGluIHRoaXMgdHVybi5cbiAqXG4gKiBAcGFyYW0gdmFsdWUgICAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgdG8gb2JzZXJ2ZVxuICogQHBhcmFtIGZ1bGZpbGxlZCAgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdpdGggdGhlIGZ1bGZpbGxlZCB2YWx1ZVxuICogQHBhcmFtIHJlamVjdGVkICAgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdpdGggdGhlIHJlamVjdGlvbiBleGNlcHRpb25cbiAqIEBwYXJhbSBwcm9ncmVzc2VkIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBhbnkgcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uc1xuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlIGZyb20gdGhlIGludm9rZWQgY2FsbGJhY2tcbiAqL1xuUS53aGVuID0gd2hlbjtcbmZ1bmN0aW9uIHdoZW4odmFsdWUsIGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzZWQpIHtcbiAgICByZXR1cm4gUSh2YWx1ZSkudGhlbihmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzc2VkKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUudGhlblJlc29sdmUgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHZhbHVlOyB9KTtcbn07XG5cblEudGhlblJlc29sdmUgPSBmdW5jdGlvbiAocHJvbWlzZSwgdmFsdWUpIHtcbiAgICByZXR1cm4gUShwcm9taXNlKS50aGVuUmVzb2x2ZSh2YWx1ZSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS50aGVuUmVqZWN0ID0gZnVuY3Rpb24gKHJlYXNvbikge1xuICAgIHJldHVybiB0aGlzLnRoZW4oZnVuY3Rpb24gKCkgeyB0aHJvdyByZWFzb247IH0pO1xufTtcblxuUS50aGVuUmVqZWN0ID0gZnVuY3Rpb24gKHByb21pc2UsIHJlYXNvbikge1xuICAgIHJldHVybiBRKHByb21pc2UpLnRoZW5SZWplY3QocmVhc29uKTtcbn07XG5cbi8qKlxuICogSWYgYW4gb2JqZWN0IGlzIG5vdCBhIHByb21pc2UsIGl0IGlzIGFzIFwibmVhclwiIGFzIHBvc3NpYmxlLlxuICogSWYgYSBwcm9taXNlIGlzIHJlamVjdGVkLCBpdCBpcyBhcyBcIm5lYXJcIiBhcyBwb3NzaWJsZSB0b28uXG4gKiBJZiBpdOKAmXMgYSBmdWxmaWxsZWQgcHJvbWlzZSwgdGhlIGZ1bGZpbGxtZW50IHZhbHVlIGlzIG5lYXJlci5cbiAqIElmIGl04oCZcyBhIGRlZmVycmVkIHByb21pc2UgYW5kIHRoZSBkZWZlcnJlZCBoYXMgYmVlbiByZXNvbHZlZCwgdGhlXG4gKiByZXNvbHV0aW9uIGlzIFwibmVhcmVyXCIuXG4gKiBAcGFyYW0gb2JqZWN0XG4gKiBAcmV0dXJucyBtb3N0IHJlc29sdmVkIChuZWFyZXN0KSBmb3JtIG9mIHRoZSBvYmplY3RcbiAqL1xuXG4vLyBYWFggc2hvdWxkIHdlIHJlLWRvIHRoaXM/XG5RLm5lYXJlciA9IG5lYXJlcjtcbmZ1bmN0aW9uIG5lYXJlcih2YWx1ZSkge1xuICAgIGlmIChpc1Byb21pc2UodmFsdWUpKSB7XG4gICAgICAgIHZhciBpbnNwZWN0ZWQgPSB2YWx1ZS5pbnNwZWN0KCk7XG4gICAgICAgIGlmIChpbnNwZWN0ZWQuc3RhdGUgPT09IFwiZnVsZmlsbGVkXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBpbnNwZWN0ZWQudmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIHByb21pc2UuXG4gKiBPdGhlcndpc2UgaXQgaXMgYSBmdWxmaWxsZWQgdmFsdWUuXG4gKi9cblEuaXNQcm9taXNlID0gaXNQcm9taXNlO1xuZnVuY3Rpb24gaXNQcm9taXNlKG9iamVjdCkge1xuICAgIHJldHVybiBpc09iamVjdChvYmplY3QpICYmXG4gICAgICAgIHR5cGVvZiBvYmplY3QucHJvbWlzZURpc3BhdGNoID09PSBcImZ1bmN0aW9uXCIgJiZcbiAgICAgICAgdHlwZW9mIG9iamVjdC5pbnNwZWN0ID09PSBcImZ1bmN0aW9uXCI7XG59XG5cblEuaXNQcm9taXNlQWxpa2UgPSBpc1Byb21pc2VBbGlrZTtcbmZ1bmN0aW9uIGlzUHJvbWlzZUFsaWtlKG9iamVjdCkge1xuICAgIHJldHVybiBpc09iamVjdChvYmplY3QpICYmIHR5cGVvZiBvYmplY3QudGhlbiA9PT0gXCJmdW5jdGlvblwiO1xufVxuXG4vKipcbiAqIEByZXR1cm5zIHdoZXRoZXIgdGhlIGdpdmVuIG9iamVjdCBpcyBhIHBlbmRpbmcgcHJvbWlzZSwgbWVhbmluZyBub3RcbiAqIGZ1bGZpbGxlZCBvciByZWplY3RlZC5cbiAqL1xuUS5pc1BlbmRpbmcgPSBpc1BlbmRpbmc7XG5mdW5jdGlvbiBpc1BlbmRpbmcob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzUHJvbWlzZShvYmplY3QpICYmIG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwicGVuZGluZ1wiO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5pc1BlbmRpbmcgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5zcGVjdCgpLnN0YXRlID09PSBcInBlbmRpbmdcIjtcbn07XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgdmFsdWUgb3IgZnVsZmlsbGVkXG4gKiBwcm9taXNlLlxuICovXG5RLmlzRnVsZmlsbGVkID0gaXNGdWxmaWxsZWQ7XG5mdW5jdGlvbiBpc0Z1bGZpbGxlZChvYmplY3QpIHtcbiAgICByZXR1cm4gIWlzUHJvbWlzZShvYmplY3QpIHx8IG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwiZnVsZmlsbGVkXCI7XG59XG5cblByb21pc2UucHJvdG90eXBlLmlzRnVsZmlsbGVkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmluc3BlY3QoKS5zdGF0ZSA9PT0gXCJmdWxmaWxsZWRcIjtcbn07XG5cbi8qKlxuICogQHJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGEgcmVqZWN0ZWQgcHJvbWlzZS5cbiAqL1xuUS5pc1JlamVjdGVkID0gaXNSZWplY3RlZDtcbmZ1bmN0aW9uIGlzUmVqZWN0ZWQob2JqZWN0KSB7XG4gICAgcmV0dXJuIGlzUHJvbWlzZShvYmplY3QpICYmIG9iamVjdC5pbnNwZWN0KCkuc3RhdGUgPT09IFwicmVqZWN0ZWRcIjtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuaXNSZWplY3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pbnNwZWN0KCkuc3RhdGUgPT09IFwicmVqZWN0ZWRcIjtcbn07XG5cbi8vLy8gQkVHSU4gVU5IQU5ETEVEIFJFSkVDVElPTiBUUkFDS0lOR1xuXG4vLyBUaGlzIHByb21pc2UgbGlicmFyeSBjb25zdW1lcyBleGNlcHRpb25zIHRocm93biBpbiBoYW5kbGVycyBzbyB0aGV5IGNhbiBiZVxuLy8gaGFuZGxlZCBieSBhIHN1YnNlcXVlbnQgcHJvbWlzZS4gIFRoZSBleGNlcHRpb25zIGdldCBhZGRlZCB0byB0aGlzIGFycmF5IHdoZW5cbi8vIHRoZXkgYXJlIGNyZWF0ZWQsIGFuZCByZW1vdmVkIHdoZW4gdGhleSBhcmUgaGFuZGxlZC4gIE5vdGUgdGhhdCBpbiBFUzYgb3Jcbi8vIHNoaW1tZWQgZW52aXJvbm1lbnRzLCB0aGlzIHdvdWxkIG5hdHVyYWxseSBiZSBhIGBTZXRgLlxudmFyIHVuaGFuZGxlZFJlYXNvbnMgPSBbXTtcbnZhciB1bmhhbmRsZWRSZWplY3Rpb25zID0gW107XG52YXIgdHJhY2tVbmhhbmRsZWRSZWplY3Rpb25zID0gdHJ1ZTtcblxuZnVuY3Rpb24gcmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCkge1xuICAgIHVuaGFuZGxlZFJlYXNvbnMubGVuZ3RoID0gMDtcbiAgICB1bmhhbmRsZWRSZWplY3Rpb25zLmxlbmd0aCA9IDA7XG5cbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICB0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMgPSB0cnVlO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdHJhY2tSZWplY3Rpb24ocHJvbWlzZSwgcmVhc29uKSB7XG4gICAgaWYgKCF0cmFja1VuaGFuZGxlZFJlamVjdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHVuaGFuZGxlZFJlamVjdGlvbnMucHVzaChwcm9taXNlKTtcbiAgICBpZiAocmVhc29uICYmIHR5cGVvZiByZWFzb24uc3RhY2sgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKHJlYXNvbi5zdGFjayk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5wdXNoKFwiKG5vIHN0YWNrKSBcIiArIHJlYXNvbik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB1bnRyYWNrUmVqZWN0aW9uKHByb21pc2UpIHtcbiAgICBpZiAoIXRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGF0ID0gYXJyYXlfaW5kZXhPZih1bmhhbmRsZWRSZWplY3Rpb25zLCBwcm9taXNlKTtcbiAgICBpZiAoYXQgIT09IC0xKSB7XG4gICAgICAgIHVuaGFuZGxlZFJlamVjdGlvbnMuc3BsaWNlKGF0LCAxKTtcbiAgICAgICAgdW5oYW5kbGVkUmVhc29ucy5zcGxpY2UoYXQsIDEpO1xuICAgIH1cbn1cblxuUS5yZXNldFVuaGFuZGxlZFJlamVjdGlvbnMgPSByZXNldFVuaGFuZGxlZFJlamVjdGlvbnM7XG5cblEuZ2V0VW5oYW5kbGVkUmVhc29ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBNYWtlIGEgY29weSBzbyB0aGF0IGNvbnN1bWVycyBjYW4ndCBpbnRlcmZlcmUgd2l0aCBvdXIgaW50ZXJuYWwgc3RhdGUuXG4gICAgcmV0dXJuIHVuaGFuZGxlZFJlYXNvbnMuc2xpY2UoKTtcbn07XG5cblEuc3RvcFVuaGFuZGxlZFJlamVjdGlvblRyYWNraW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHJlc2V0VW5oYW5kbGVkUmVqZWN0aW9ucygpO1xuICAgIHRyYWNrVW5oYW5kbGVkUmVqZWN0aW9ucyA9IGZhbHNlO1xufTtcblxucmVzZXRVbmhhbmRsZWRSZWplY3Rpb25zKCk7XG5cbi8vLy8gRU5EIFVOSEFORExFRCBSRUpFQ1RJT04gVFJBQ0tJTkdcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgcmVqZWN0ZWQgcHJvbWlzZS5cbiAqIEBwYXJhbSByZWFzb24gdmFsdWUgZGVzY3JpYmluZyB0aGUgZmFpbHVyZVxuICovXG5RLnJlamVjdCA9IHJlamVjdDtcbmZ1bmN0aW9uIHJlamVjdChyZWFzb24pIHtcbiAgICB2YXIgcmVqZWN0aW9uID0gUHJvbWlzZSh7XG4gICAgICAgIFwid2hlblwiOiBmdW5jdGlvbiAocmVqZWN0ZWQpIHtcbiAgICAgICAgICAgIC8vIG5vdGUgdGhhdCB0aGUgZXJyb3IgaGFzIGJlZW4gaGFuZGxlZFxuICAgICAgICAgICAgaWYgKHJlamVjdGVkKSB7XG4gICAgICAgICAgICAgICAgdW50cmFja1JlamVjdGlvbih0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZWplY3RlZCA/IHJlamVjdGVkKHJlYXNvbikgOiB0aGlzO1xuICAgICAgICB9XG4gICAgfSwgZnVuY3Rpb24gZmFsbGJhY2soKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sIGZ1bmN0aW9uIGluc3BlY3QoKSB7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiBcInJlamVjdGVkXCIsIHJlYXNvbjogcmVhc29uIH07XG4gICAgfSk7XG5cbiAgICAvLyBOb3RlIHRoYXQgdGhlIHJlYXNvbiBoYXMgbm90IGJlZW4gaGFuZGxlZC5cbiAgICB0cmFja1JlamVjdGlvbihyZWplY3Rpb24sIHJlYXNvbik7XG5cbiAgICByZXR1cm4gcmVqZWN0aW9uO1xufVxuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBmdWxmaWxsZWQgcHJvbWlzZSBmb3IgYW4gaW1tZWRpYXRlIHJlZmVyZW5jZS5cbiAqIEBwYXJhbSB2YWx1ZSBpbW1lZGlhdGUgcmVmZXJlbmNlXG4gKi9cblEuZnVsZmlsbCA9IGZ1bGZpbGw7XG5mdW5jdGlvbiBmdWxmaWxsKHZhbHVlKSB7XG4gICAgcmV0dXJuIFByb21pc2Uoe1xuICAgICAgICBcIndoZW5cIjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBcImdldFwiOiBmdW5jdGlvbiAobmFtZSkge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlW25hbWVdO1xuICAgICAgICB9LFxuICAgICAgICBcInNldFwiOiBmdW5jdGlvbiAobmFtZSwgcmhzKSB7XG4gICAgICAgICAgICB2YWx1ZVtuYW1lXSA9IHJocztcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWxldGVcIjogZnVuY3Rpb24gKG5hbWUpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB2YWx1ZVtuYW1lXTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJwb3N0XCI6IGZ1bmN0aW9uIChuYW1lLCBhcmdzKSB7XG4gICAgICAgICAgICAvLyBNYXJrIE1pbGxlciBwcm9wb3NlcyB0aGF0IHBvc3Qgd2l0aCBubyBuYW1lIHNob3VsZCBhcHBseSBhXG4gICAgICAgICAgICAvLyBwcm9taXNlZCBmdW5jdGlvbi5cbiAgICAgICAgICAgIGlmIChuYW1lID09PSBudWxsIHx8IG5hbWUgPT09IHZvaWQgMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5hcHBseSh2b2lkIDAsIGFyZ3MpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWVbbmFtZV0uYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImFwcGx5XCI6IGZ1bmN0aW9uICh0aGlzcCwgYXJncykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmFwcGx5KHRoaXNwLCBhcmdzKTtcbiAgICAgICAgfSxcbiAgICAgICAgXCJrZXlzXCI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiBvYmplY3Rfa2V5cyh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICB9LCB2b2lkIDAsIGZ1bmN0aW9uIGluc3BlY3QoKSB7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiBcImZ1bGZpbGxlZFwiLCB2YWx1ZTogdmFsdWUgfTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyB0aGVuYWJsZXMgdG8gUSBwcm9taXNlcy5cbiAqIEBwYXJhbSBwcm9taXNlIHRoZW5hYmxlIHByb21pc2VcbiAqIEByZXR1cm5zIGEgUSBwcm9taXNlXG4gKi9cbmZ1bmN0aW9uIGNvZXJjZShwcm9taXNlKSB7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4oZGVmZXJyZWQucmVzb2x2ZSwgZGVmZXJyZWQucmVqZWN0LCBkZWZlcnJlZC5ub3RpZnkpO1xuICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChleGNlcHRpb24pO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59XG5cbi8qKlxuICogQW5ub3RhdGVzIGFuIG9iamVjdCBzdWNoIHRoYXQgaXQgd2lsbCBuZXZlciBiZVxuICogdHJhbnNmZXJyZWQgYXdheSBmcm9tIHRoaXMgcHJvY2VzcyBvdmVyIGFueSBwcm9taXNlXG4gKiBjb21tdW5pY2F0aW9uIGNoYW5uZWwuXG4gKiBAcGFyYW0gb2JqZWN0XG4gKiBAcmV0dXJucyBwcm9taXNlIGEgd3JhcHBpbmcgb2YgdGhhdCBvYmplY3QgdGhhdFxuICogYWRkaXRpb25hbGx5IHJlc3BvbmRzIHRvIHRoZSBcImlzRGVmXCIgbWVzc2FnZVxuICogd2l0aG91dCBhIHJlamVjdGlvbi5cbiAqL1xuUS5tYXN0ZXIgPSBtYXN0ZXI7XG5mdW5jdGlvbiBtYXN0ZXIob2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2Uoe1xuICAgICAgICBcImlzRGVmXCI6IGZ1bmN0aW9uICgpIHt9XG4gICAgfSwgZnVuY3Rpb24gZmFsbGJhY2sob3AsIGFyZ3MpIHtcbiAgICAgICAgcmV0dXJuIGRpc3BhdGNoKG9iamVjdCwgb3AsIGFyZ3MpO1xuICAgIH0sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIFEob2JqZWN0KS5pbnNwZWN0KCk7XG4gICAgfSk7XG59XG5cbi8qKlxuICogU3ByZWFkcyB0aGUgdmFsdWVzIG9mIGEgcHJvbWlzZWQgYXJyYXkgb2YgYXJndW1lbnRzIGludG8gdGhlXG4gKiBmdWxmaWxsbWVudCBjYWxsYmFjay5cbiAqIEBwYXJhbSBmdWxmaWxsZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB2YXJpYWRpYyBhcmd1bWVudHMgZnJvbSB0aGVcbiAqIHByb21pc2VkIGFycmF5XG4gKiBAcGFyYW0gcmVqZWN0ZWQgY2FsbGJhY2sgdGhhdCByZWNlaXZlcyB0aGUgZXhjZXB0aW9uIGlmIHRoZSBwcm9taXNlXG4gKiBpcyByZWplY3RlZC5cbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZSBvciB0aHJvd24gZXhjZXB0aW9uIG9mXG4gKiBlaXRoZXIgY2FsbGJhY2suXG4gKi9cblEuc3ByZWFkID0gc3ByZWFkO1xuZnVuY3Rpb24gc3ByZWFkKHZhbHVlLCBmdWxmaWxsZWQsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEodmFsdWUpLnNwcmVhZChmdWxmaWxsZWQsIHJlamVjdGVkKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuc3ByZWFkID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy5hbGwoKS50aGVuKGZ1bmN0aW9uIChhcnJheSkge1xuICAgICAgICByZXR1cm4gZnVsZmlsbGVkLmFwcGx5KHZvaWQgMCwgYXJyYXkpO1xuICAgIH0sIHJlamVjdGVkKTtcbn07XG5cbi8qKlxuICogVGhlIGFzeW5jIGZ1bmN0aW9uIGlzIGEgZGVjb3JhdG9yIGZvciBnZW5lcmF0b3IgZnVuY3Rpb25zLCB0dXJuaW5nXG4gKiB0aGVtIGludG8gYXN5bmNocm9ub3VzIGdlbmVyYXRvcnMuICBBbHRob3VnaCBnZW5lcmF0b3JzIGFyZSBvbmx5IHBhcnRcbiAqIG9mIHRoZSBuZXdlc3QgRUNNQVNjcmlwdCA2IGRyYWZ0cywgdGhpcyBjb2RlIGRvZXMgbm90IGNhdXNlIHN5bnRheFxuICogZXJyb3JzIGluIG9sZGVyIGVuZ2luZXMuICBUaGlzIGNvZGUgc2hvdWxkIGNvbnRpbnVlIHRvIHdvcmsgYW5kIHdpbGxcbiAqIGluIGZhY3QgaW1wcm92ZSBvdmVyIHRpbWUgYXMgdGhlIGxhbmd1YWdlIGltcHJvdmVzLlxuICpcbiAqIEVTNiBnZW5lcmF0b3JzIGFyZSBjdXJyZW50bHkgcGFydCBvZiBWOCB2ZXJzaW9uIDMuMTkgd2l0aCB0aGVcbiAqIC0taGFybW9ueS1nZW5lcmF0b3JzIHJ1bnRpbWUgZmxhZyBlbmFibGVkLiAgU3BpZGVyTW9ua2V5IGhhcyBoYWQgdGhlbVxuICogZm9yIGxvbmdlciwgYnV0IHVuZGVyIGFuIG9sZGVyIFB5dGhvbi1pbnNwaXJlZCBmb3JtLiAgVGhpcyBmdW5jdGlvblxuICogd29ya3Mgb24gYm90aCBraW5kcyBvZiBnZW5lcmF0b3JzLlxuICpcbiAqIERlY29yYXRlcyBhIGdlbmVyYXRvciBmdW5jdGlvbiBzdWNoIHRoYXQ6XG4gKiAgLSBpdCBtYXkgeWllbGQgcHJvbWlzZXNcbiAqICAtIGV4ZWN1dGlvbiB3aWxsIGNvbnRpbnVlIHdoZW4gdGhhdCBwcm9taXNlIGlzIGZ1bGZpbGxlZFxuICogIC0gdGhlIHZhbHVlIG9mIHRoZSB5aWVsZCBleHByZXNzaW9uIHdpbGwgYmUgdGhlIGZ1bGZpbGxlZCB2YWx1ZVxuICogIC0gaXQgcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgKHdoZW4gdGhlIGdlbmVyYXRvclxuICogICAgc3RvcHMgaXRlcmF0aW5nKVxuICogIC0gdGhlIGRlY29yYXRlZCBmdW5jdGlvbiByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICogICAgb2YgdGhlIGdlbmVyYXRvciBvciB0aGUgZmlyc3QgcmVqZWN0ZWQgcHJvbWlzZSBhbW9uZyB0aG9zZVxuICogICAgeWllbGRlZC5cbiAqICAtIGlmIGFuIGVycm9yIGlzIHRocm93biBpbiB0aGUgZ2VuZXJhdG9yLCBpdCBwcm9wYWdhdGVzIHRocm91Z2hcbiAqICAgIGV2ZXJ5IGZvbGxvd2luZyB5aWVsZCB1bnRpbCBpdCBpcyBjYXVnaHQsIG9yIHVudGlsIGl0IGVzY2FwZXNcbiAqICAgIHRoZSBnZW5lcmF0b3IgZnVuY3Rpb24gYWx0b2dldGhlciwgYW5kIGlzIHRyYW5zbGF0ZWQgaW50byBhXG4gKiAgICByZWplY3Rpb24gZm9yIHRoZSBwcm9taXNlIHJldHVybmVkIGJ5IHRoZSBkZWNvcmF0ZWQgZ2VuZXJhdG9yLlxuICovXG5RLmFzeW5jID0gYXN5bmM7XG5mdW5jdGlvbiBhc3luYyhtYWtlR2VuZXJhdG9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gd2hlbiB2ZXJiIGlzIFwic2VuZFwiLCBhcmcgaXMgYSB2YWx1ZVxuICAgICAgICAvLyB3aGVuIHZlcmIgaXMgXCJ0aHJvd1wiLCBhcmcgaXMgYW4gZXhjZXB0aW9uXG4gICAgICAgIGZ1bmN0aW9uIGNvbnRpbnVlcih2ZXJiLCBhcmcpIHtcbiAgICAgICAgICAgIHZhciByZXN1bHQ7XG5cbiAgICAgICAgICAgIC8vIFVudGlsIFY4IDMuMTkgLyBDaHJvbWl1bSAyOSBpcyByZWxlYXNlZCwgU3BpZGVyTW9ua2V5IGlzIHRoZSBvbmx5XG4gICAgICAgICAgICAvLyBlbmdpbmUgdGhhdCBoYXMgYSBkZXBsb3llZCBiYXNlIG9mIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBnZW5lcmF0b3JzLlxuICAgICAgICAgICAgLy8gSG93ZXZlciwgU00ncyBnZW5lcmF0b3JzIHVzZSB0aGUgUHl0aG9uLWluc3BpcmVkIHNlbWFudGljcyBvZlxuICAgICAgICAgICAgLy8gb3V0ZGF0ZWQgRVM2IGRyYWZ0cy4gIFdlIHdvdWxkIGxpa2UgdG8gc3VwcG9ydCBFUzYsIGJ1dCB3ZSdkIGFsc29cbiAgICAgICAgICAgIC8vIGxpa2UgdG8gbWFrZSBpdCBwb3NzaWJsZSB0byB1c2UgZ2VuZXJhdG9ycyBpbiBkZXBsb3llZCBicm93c2Vycywgc29cbiAgICAgICAgICAgIC8vIHdlIGFsc28gc3VwcG9ydCBQeXRob24tc3R5bGUgZ2VuZXJhdG9ycy4gIEF0IHNvbWUgcG9pbnQgd2UgY2FuIHJlbW92ZVxuICAgICAgICAgICAgLy8gdGhpcyBibG9jay5cblxuICAgICAgICAgICAgaWYgKHR5cGVvZiBTdG9wSXRlcmF0aW9uID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgLy8gRVM2IEdlbmVyYXRvcnNcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBnZW5lcmF0b3JbdmVyYl0oYXJnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChleGNlcHRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChleGNlcHRpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LmRvbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdC52YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2hlbihyZXN1bHQudmFsdWUsIGNhbGxiYWNrLCBlcnJiYWNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFNwaWRlck1vbmtleSBHZW5lcmF0b3JzXG4gICAgICAgICAgICAgICAgLy8gRklYTUU6IFJlbW92ZSB0aGlzIGNhc2Ugd2hlbiBTTSBkb2VzIEVTNiBnZW5lcmF0b3JzLlxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IGdlbmVyYXRvclt2ZXJiXShhcmcpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4Y2VwdGlvbikge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNTdG9wSXRlcmF0aW9uKGV4Y2VwdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBleGNlcHRpb24udmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHdoZW4ocmVzdWx0LCBjYWxsYmFjaywgZXJyYmFjayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGdlbmVyYXRvciA9IG1ha2VHZW5lcmF0b3IuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgdmFyIGNhbGxiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcIm5leHRcIik7XG4gICAgICAgIHZhciBlcnJiYWNrID0gY29udGludWVyLmJpbmQoY29udGludWVyLCBcInRocm93XCIpO1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soKTtcbiAgICB9O1xufVxuXG4vKipcbiAqIFRoZSBzcGF3biBmdW5jdGlvbiBpcyBhIHNtYWxsIHdyYXBwZXIgYXJvdW5kIGFzeW5jIHRoYXQgaW1tZWRpYXRlbHlcbiAqIGNhbGxzIHRoZSBnZW5lcmF0b3IgYW5kIGFsc28gZW5kcyB0aGUgcHJvbWlzZSBjaGFpbiwgc28gdGhhdCBhbnlcbiAqIHVuaGFuZGxlZCBlcnJvcnMgYXJlIHRocm93biBpbnN0ZWFkIG9mIGZvcndhcmRlZCB0byB0aGUgZXJyb3JcbiAqIGhhbmRsZXIuIFRoaXMgaXMgdXNlZnVsIGJlY2F1c2UgaXQncyBleHRyZW1lbHkgY29tbW9uIHRvIHJ1blxuICogZ2VuZXJhdG9ycyBhdCB0aGUgdG9wLWxldmVsIHRvIHdvcmsgd2l0aCBsaWJyYXJpZXMuXG4gKi9cblEuc3Bhd24gPSBzcGF3bjtcbmZ1bmN0aW9uIHNwYXduKG1ha2VHZW5lcmF0b3IpIHtcbiAgICBRLmRvbmUoUS5hc3luYyhtYWtlR2VuZXJhdG9yKSgpKTtcbn1cblxuLy8gRklYTUU6IFJlbW92ZSB0aGlzIGludGVyZmFjZSBvbmNlIEVTNiBnZW5lcmF0b3JzIGFyZSBpbiBTcGlkZXJNb25rZXkuXG4vKipcbiAqIFRocm93cyBhIFJldHVyblZhbHVlIGV4Y2VwdGlvbiB0byBzdG9wIGFuIGFzeW5jaHJvbm91cyBnZW5lcmF0b3IuXG4gKlxuICogVGhpcyBpbnRlcmZhY2UgaXMgYSBzdG9wLWdhcCBtZWFzdXJlIHRvIHN1cHBvcnQgZ2VuZXJhdG9yIHJldHVyblxuICogdmFsdWVzIGluIG9sZGVyIEZpcmVmb3gvU3BpZGVyTW9ua2V5LiAgSW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEVTNlxuICogZ2VuZXJhdG9ycyBsaWtlIENocm9taXVtIDI5LCBqdXN0IHVzZSBcInJldHVyblwiIGluIHlvdXIgZ2VuZXJhdG9yXG4gKiBmdW5jdGlvbnMuXG4gKlxuICogQHBhcmFtIHZhbHVlIHRoZSByZXR1cm4gdmFsdWUgZm9yIHRoZSBzdXJyb3VuZGluZyBnZW5lcmF0b3JcbiAqIEB0aHJvd3MgUmV0dXJuVmFsdWUgZXhjZXB0aW9uIHdpdGggdGhlIHZhbHVlLlxuICogQGV4YW1wbGVcbiAqIC8vIEVTNiBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiogKCkge1xuICogICAgICB2YXIgZm9vID0geWllbGQgZ2V0Rm9vUHJvbWlzZSgpO1xuICogICAgICB2YXIgYmFyID0geWllbGQgZ2V0QmFyUHJvbWlzZSgpO1xuICogICAgICByZXR1cm4gZm9vICsgYmFyO1xuICogfSlcbiAqIC8vIE9sZGVyIFNwaWRlck1vbmtleSBzdHlsZVxuICogUS5hc3luYyhmdW5jdGlvbiAoKSB7XG4gKiAgICAgIHZhciBmb28gPSB5aWVsZCBnZXRGb29Qcm9taXNlKCk7XG4gKiAgICAgIHZhciBiYXIgPSB5aWVsZCBnZXRCYXJQcm9taXNlKCk7XG4gKiAgICAgIFEucmV0dXJuKGZvbyArIGJhcik7XG4gKiB9KVxuICovXG5RW1wicmV0dXJuXCJdID0gX3JldHVybjtcbmZ1bmN0aW9uIF9yZXR1cm4odmFsdWUpIHtcbiAgICB0aHJvdyBuZXcgUVJldHVyblZhbHVlKHZhbHVlKTtcbn1cblxuLyoqXG4gKiBUaGUgcHJvbWlzZWQgZnVuY3Rpb24gZGVjb3JhdG9yIGVuc3VyZXMgdGhhdCBhbnkgcHJvbWlzZSBhcmd1bWVudHNcbiAqIGFyZSBzZXR0bGVkIGFuZCBwYXNzZWQgYXMgdmFsdWVzIChgdGhpc2AgaXMgYWxzbyBzZXR0bGVkIGFuZCBwYXNzZWRcbiAqIGFzIGEgdmFsdWUpLiAgSXQgd2lsbCBhbHNvIGVuc3VyZSB0aGF0IHRoZSByZXN1bHQgb2YgYSBmdW5jdGlvbiBpc1xuICogYWx3YXlzIGEgcHJvbWlzZS5cbiAqXG4gKiBAZXhhbXBsZVxuICogdmFyIGFkZCA9IFEucHJvbWlzZWQoZnVuY3Rpb24gKGEsIGIpIHtcbiAqICAgICByZXR1cm4gYSArIGI7XG4gKiB9KTtcbiAqIGFkZChRKGEpLCBRKEIpKTtcbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayBUaGUgZnVuY3Rpb24gdG8gZGVjb3JhdGVcbiAqIEByZXR1cm5zIHtmdW5jdGlvbn0gYSBmdW5jdGlvbiB0aGF0IGhhcyBiZWVuIGRlY29yYXRlZC5cbiAqL1xuUS5wcm9taXNlZCA9IHByb21pc2VkO1xuZnVuY3Rpb24gcHJvbWlzZWQoY2FsbGJhY2spIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gc3ByZWFkKFt0aGlzLCBhbGwoYXJndW1lbnRzKV0sIGZ1bmN0aW9uIChzZWxmLCBhcmdzKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2suYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgICAgIH0pO1xuICAgIH07XG59XG5cbi8qKlxuICogc2VuZHMgYSBtZXNzYWdlIHRvIGEgdmFsdWUgaW4gYSBmdXR1cmUgdHVyblxuICogQHBhcmFtIG9iamVjdCogdGhlIHJlY2lwaWVudFxuICogQHBhcmFtIG9wIHRoZSBuYW1lIG9mIHRoZSBtZXNzYWdlIG9wZXJhdGlvbiwgZS5nLiwgXCJ3aGVuXCIsXG4gKiBAcGFyYW0gYXJncyBmdXJ0aGVyIGFyZ3VtZW50cyB0byBiZSBmb3J3YXJkZWQgdG8gdGhlIG9wZXJhdGlvblxuICogQHJldHVybnMgcmVzdWx0IHtQcm9taXNlfSBhIHByb21pc2UgZm9yIHRoZSByZXN1bHQgb2YgdGhlIG9wZXJhdGlvblxuICovXG5RLmRpc3BhdGNoID0gZGlzcGF0Y2g7XG5mdW5jdGlvbiBkaXNwYXRjaChvYmplY3QsIG9wLCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChvcCwgYXJncyk7XG59XG5cblByb21pc2UucHJvdG90eXBlLmRpc3BhdGNoID0gZnVuY3Rpb24gKG9wLCBhcmdzKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICBzZWxmLnByb21pc2VEaXNwYXRjaChkZWZlcnJlZC5yZXNvbHZlLCBvcCwgYXJncyk7XG4gICAgfSk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIEdldHMgdGhlIHZhbHVlIG9mIGEgcHJvcGVydHkgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgcHJvcGVydHkgdG8gZ2V0XG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSBwcm9wZXJ0eSB2YWx1ZVxuICovXG5RLmdldCA9IGZ1bmN0aW9uIChvYmplY3QsIGtleSkge1xuICAgIHJldHVybiBRKG9iamVjdCkuZGlzcGF0Y2goXCJnZXRcIiwgW2tleV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGtleSkge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwiZ2V0XCIsIFtrZXldKTtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgdmFsdWUgb2YgYSBwcm9wZXJ0eSBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIG9iamVjdCBvYmplY3RcbiAqIEBwYXJhbSBuYW1lICAgICAgbmFtZSBvZiBwcm9wZXJ0eSB0byBzZXRcbiAqIEBwYXJhbSB2YWx1ZSAgICAgbmV3IHZhbHVlIG9mIHByb3BlcnR5XG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuUS5zZXQgPSBmdW5jdGlvbiAob2JqZWN0LCBrZXksIHZhbHVlKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcInNldFwiLCBba2V5LCB2YWx1ZV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcInNldFwiLCBba2V5LCB2YWx1ZV0pO1xufTtcblxuLyoqXG4gKiBEZWxldGVzIGEgcHJvcGVydHkgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgcHJvcGVydHkgdG8gZGVsZXRlXG4gKiBAcmV0dXJuIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWVcbiAqL1xuUS5kZWwgPSAvLyBYWFggbGVnYWN5XG5RW1wiZGVsZXRlXCJdID0gZnVuY3Rpb24gKG9iamVjdCwga2V5KSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImRlbGV0ZVwiLCBba2V5XSk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kZWwgPSAvLyBYWFggbGVnYWN5XG5Qcm9taXNlLnByb3RvdHlwZVtcImRlbGV0ZVwiXSA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImRlbGV0ZVwiLCBba2V5XSk7XG59O1xuXG4vKipcbiAqIEludm9rZXMgYSBtZXRob2QgaW4gYSBmdXR1cmUgdHVybi5cbiAqIEBwYXJhbSBvYmplY3QgICAgcHJvbWlzZSBvciBpbW1lZGlhdGUgcmVmZXJlbmNlIGZvciB0YXJnZXQgb2JqZWN0XG4gKiBAcGFyYW0gbmFtZSAgICAgIG5hbWUgb2YgbWV0aG9kIHRvIGludm9rZVxuICogQHBhcmFtIHZhbHVlICAgICBhIHZhbHVlIHRvIHBvc3QsIHR5cGljYWxseSBhbiBhcnJheSBvZlxuICogICAgICAgICAgICAgICAgICBpbnZvY2F0aW9uIGFyZ3VtZW50cyBmb3IgcHJvbWlzZXMgdGhhdFxuICogICAgICAgICAgICAgICAgICBhcmUgdWx0aW1hdGVseSBiYWNrZWQgd2l0aCBgcmVzb2x2ZWAgdmFsdWVzLFxuICogICAgICAgICAgICAgICAgICBhcyBvcHBvc2VkIHRvIHRob3NlIGJhY2tlZCB3aXRoIFVSTHNcbiAqICAgICAgICAgICAgICAgICAgd2hlcmVpbiB0aGUgcG9zdGVkIHZhbHVlIGNhbiBiZSBhbnlcbiAqICAgICAgICAgICAgICAgICAgSlNPTiBzZXJpYWxpemFibGUgb2JqZWN0LlxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUgcmV0dXJuIHZhbHVlXG4gKi9cbi8vIGJvdW5kIGxvY2FsbHkgYmVjYXVzZSBpdCBpcyB1c2VkIGJ5IG90aGVyIG1ldGhvZHNcblEubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblEucG9zdCA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUsIGFyZ3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJnc10pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubWFwcGx5ID0gLy8gWFhYIEFzIHByb3Bvc2VkIGJ5IFwiUmVkc2FuZHJvXCJcblByb21pc2UucHJvdG90eXBlLnBvc3QgPSBmdW5jdGlvbiAobmFtZSwgYXJncykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJnc10pO1xufTtcblxuLyoqXG4gKiBJbnZva2VzIGEgbWV0aG9kIGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHBhcmFtIG5hbWUgICAgICBuYW1lIG9mIG1ldGhvZCB0byBpbnZva2VcbiAqIEBwYXJhbSAuLi5hcmdzICAgYXJyYXkgb2YgaW52b2NhdGlvbiBhcmd1bWVudHNcbiAqIEByZXR1cm4gcHJvbWlzZSBmb3IgdGhlIHJldHVybiB2YWx1ZVxuICovXG5RLnNlbmQgPSAvLyBYWFggTWFyayBNaWxsZXIncyBwcm9wb3NlZCBwYXJsYW5jZVxuUS5tY2FsbCA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5RLmludm9rZSA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUgLyouLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAyKV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuc2VuZCA9IC8vIFhYWCBNYXJrIE1pbGxlcidzIHByb3Bvc2VkIHBhcmxhbmNlXG5Qcm9taXNlLnByb3RvdHlwZS5tY2FsbCA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5Qcm9taXNlLnByb3RvdHlwZS5pbnZva2UgPSBmdW5jdGlvbiAobmFtZSAvKi4uLmFyZ3MqLykge1xuICAgIHJldHVybiB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKV0pO1xufTtcblxuLyoqXG4gKiBBcHBsaWVzIHRoZSBwcm9taXNlZCBmdW5jdGlvbiBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBmdW5jdGlvblxuICogQHBhcmFtIGFyZ3MgICAgICBhcnJheSBvZiBhcHBsaWNhdGlvbiBhcmd1bWVudHNcbiAqL1xuUS5mYXBwbHkgPSBmdW5jdGlvbiAob2JqZWN0LCBhcmdzKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFyZ3NdKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLmZhcHBseSA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcGF0Y2goXCJhcHBseVwiLCBbdm9pZCAwLCBhcmdzXSk7XG59O1xuXG4vKipcbiAqIENhbGxzIHRoZSBwcm9taXNlZCBmdW5jdGlvbiBpbiBhIGZ1dHVyZSB0dXJuLlxuICogQHBhcmFtIG9iamVjdCAgICBwcm9taXNlIG9yIGltbWVkaWF0ZSByZWZlcmVuY2UgZm9yIHRhcmdldCBmdW5jdGlvblxuICogQHBhcmFtIC4uLmFyZ3MgICBhcnJheSBvZiBhcHBsaWNhdGlvbiBhcmd1bWVudHNcbiAqL1xuUVtcInRyeVwiXSA9XG5RLmZjYWxsID0gZnVuY3Rpb24gKG9iamVjdCAvKiAuLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gUShvYmplY3QpLmRpc3BhdGNoKFwiYXBwbHlcIiwgW3ZvaWQgMCwgYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKV0pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmNhbGwgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImFwcGx5XCIsIFt2b2lkIDAsIGFycmF5X3NsaWNlKGFyZ3VtZW50cyldKTtcbn07XG5cbi8qKlxuICogQmluZHMgdGhlIHByb21pc2VkIGZ1bmN0aW9uLCB0cmFuc2Zvcm1pbmcgcmV0dXJuIHZhbHVlcyBpbnRvIGEgZnVsZmlsbGVkXG4gKiBwcm9taXNlIGFuZCB0aHJvd24gZXJyb3JzIGludG8gYSByZWplY3RlZCBvbmUuXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IGZ1bmN0aW9uXG4gKiBAcGFyYW0gLi4uYXJncyAgIGFycmF5IG9mIGFwcGxpY2F0aW9uIGFyZ3VtZW50c1xuICovXG5RLmZiaW5kID0gZnVuY3Rpb24gKG9iamVjdCAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBwcm9taXNlID0gUShvYmplY3QpO1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gZmJvdW5kKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS5kaXNwYXRjaChcImFwcGx5XCIsIFtcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBhcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKVxuICAgICAgICBdKTtcbiAgICB9O1xufTtcblByb21pc2UucHJvdG90eXBlLmZiaW5kID0gZnVuY3Rpb24gKC8qLi4uYXJncyovKSB7XG4gICAgdmFyIHByb21pc2UgPSB0aGlzO1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gZmJvdW5kKCkge1xuICAgICAgICByZXR1cm4gcHJvbWlzZS5kaXNwYXRjaChcImFwcGx5XCIsIFtcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBhcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKVxuICAgICAgICBdKTtcbiAgICB9O1xufTtcblxuLyoqXG4gKiBSZXF1ZXN0cyB0aGUgbmFtZXMgb2YgdGhlIG93bmVkIHByb3BlcnRpZXMgb2YgYSBwcm9taXNlZFxuICogb2JqZWN0IGluIGEgZnV0dXJlIHR1cm4uXG4gKiBAcGFyYW0gb2JqZWN0ICAgIHByb21pc2Ugb3IgaW1tZWRpYXRlIHJlZmVyZW5jZSBmb3IgdGFyZ2V0IG9iamVjdFxuICogQHJldHVybiBwcm9taXNlIGZvciB0aGUga2V5cyBvZiB0aGUgZXZlbnR1YWxseSBzZXR0bGVkIG9iamVjdFxuICovXG5RLmtleXMgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5kaXNwYXRjaChcImtleXNcIiwgW10pO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUua2V5cyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5kaXNwYXRjaChcImtleXNcIiwgW10pO1xufTtcblxuLyoqXG4gKiBUdXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyBpbnRvIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkuICBJZiBhbnkgb2ZcbiAqIHRoZSBwcm9taXNlcyBnZXRzIHJlamVjdGVkLCB0aGUgd2hvbGUgYXJyYXkgaXMgcmVqZWN0ZWQgaW1tZWRpYXRlbHkuXG4gKiBAcGFyYW0ge0FycmF5Kn0gYW4gYXJyYXkgKG9yIHByb21pc2UgZm9yIGFuIGFycmF5KSBvZiB2YWx1ZXMgKG9yXG4gKiBwcm9taXNlcyBmb3IgdmFsdWVzKVxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciBhbiBhcnJheSBvZiB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXNcbiAqL1xuLy8gQnkgTWFyayBNaWxsZXJcbi8vIGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPXN0cmF3bWFuOmNvbmN1cnJlbmN5JnJldj0xMzA4Nzc2NTIxI2FsbGZ1bGZpbGxlZFxuUS5hbGwgPSBhbGw7XG5mdW5jdGlvbiBhbGwocHJvbWlzZXMpIHtcbiAgICByZXR1cm4gd2hlbihwcm9taXNlcywgZnVuY3Rpb24gKHByb21pc2VzKSB7XG4gICAgICAgIHZhciBjb3VudERvd24gPSAwO1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgICAgICBhcnJheV9yZWR1Y2UocHJvbWlzZXMsIGZ1bmN0aW9uICh1bmRlZmluZWQsIHByb21pc2UsIGluZGV4KSB7XG4gICAgICAgICAgICB2YXIgc25hcHNob3Q7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgaXNQcm9taXNlKHByb21pc2UpICYmXG4gICAgICAgICAgICAgICAgKHNuYXBzaG90ID0gcHJvbWlzZS5pbnNwZWN0KCkpLnN0YXRlID09PSBcImZ1bGZpbGxlZFwiXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICBwcm9taXNlc1tpbmRleF0gPSBzbmFwc2hvdC52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgKytjb3VudERvd247XG4gICAgICAgICAgICAgICAgd2hlbihcbiAgICAgICAgICAgICAgICAgICAgcHJvbWlzZSxcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9taXNlc1tpbmRleF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICgtLWNvdW50RG93biA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUocHJvbWlzZXMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QsXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChwcm9ncmVzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQubm90aWZ5KHsgaW5kZXg6IGluZGV4LCB2YWx1ZTogcHJvZ3Jlc3MgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCB2b2lkIDApO1xuICAgICAgICBpZiAoY291bnREb3duID09PSAwKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHByb21pc2VzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbiAgICB9KTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUuYWxsID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBhbGwodGhpcyk7XG59O1xuXG4vKipcbiAqIFdhaXRzIGZvciBhbGwgcHJvbWlzZXMgdG8gYmUgc2V0dGxlZCwgZWl0aGVyIGZ1bGZpbGxlZCBvclxuICogcmVqZWN0ZWQuICBUaGlzIGlzIGRpc3RpbmN0IGZyb20gYGFsbGAgc2luY2UgdGhhdCB3b3VsZCBzdG9wXG4gKiB3YWl0aW5nIGF0IHRoZSBmaXJzdCByZWplY3Rpb24uICBUaGUgcHJvbWlzZSByZXR1cm5lZCBieVxuICogYGFsbFJlc29sdmVkYCB3aWxsIG5ldmVyIGJlIHJlamVjdGVkLlxuICogQHBhcmFtIHByb21pc2VzIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgKG9yIGFuIGFycmF5KSBvZiBwcm9taXNlc1xuICogKG9yIHZhbHVlcylcbiAqIEByZXR1cm4gYSBwcm9taXNlIGZvciBhbiBhcnJheSBvZiBwcm9taXNlc1xuICovXG5RLmFsbFJlc29sdmVkID0gZGVwcmVjYXRlKGFsbFJlc29sdmVkLCBcImFsbFJlc29sdmVkXCIsIFwiYWxsU2V0dGxlZFwiKTtcbmZ1bmN0aW9uIGFsbFJlc29sdmVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIHdoZW4ocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICBwcm9taXNlcyA9IGFycmF5X21hcChwcm9taXNlcywgUSk7XG4gICAgICAgIHJldHVybiB3aGVuKGFsbChhcnJheV9tYXAocHJvbWlzZXMsIGZ1bmN0aW9uIChwcm9taXNlKSB7XG4gICAgICAgICAgICByZXR1cm4gd2hlbihwcm9taXNlLCBub29wLCBub29wKTtcbiAgICAgICAgfSkpLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZXM7XG4gICAgICAgIH0pO1xuICAgIH0pO1xufVxuXG5Qcm9taXNlLnByb3RvdHlwZS5hbGxSZXNvbHZlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gYWxsUmVzb2x2ZWQodGhpcyk7XG59O1xuXG4vKipcbiAqIEBzZWUgUHJvbWlzZSNhbGxTZXR0bGVkXG4gKi9cblEuYWxsU2V0dGxlZCA9IGFsbFNldHRsZWQ7XG5mdW5jdGlvbiBhbGxTZXR0bGVkKHByb21pc2VzKSB7XG4gICAgcmV0dXJuIFEocHJvbWlzZXMpLmFsbFNldHRsZWQoKTtcbn1cblxuLyoqXG4gKiBUdXJucyBhbiBhcnJheSBvZiBwcm9taXNlcyBpbnRvIGEgcHJvbWlzZSBmb3IgYW4gYXJyYXkgb2YgdGhlaXIgc3RhdGVzIChhc1xuICogcmV0dXJuZWQgYnkgYGluc3BlY3RgKSB3aGVuIHRoZXkgaGF2ZSBhbGwgc2V0dGxlZC5cbiAqIEBwYXJhbSB7QXJyYXlbQW55Kl19IHZhbHVlcyBhbiBhcnJheSAob3IgcHJvbWlzZSBmb3IgYW4gYXJyYXkpIG9mIHZhbHVlcyAob3JcbiAqIHByb21pc2VzIGZvciB2YWx1ZXMpXG4gKiBAcmV0dXJucyB7QXJyYXlbU3RhdGVdfSBhbiBhcnJheSBvZiBzdGF0ZXMgZm9yIHRoZSByZXNwZWN0aXZlIHZhbHVlcy5cbiAqL1xuUHJvbWlzZS5wcm90b3R5cGUuYWxsU2V0dGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uIChwcm9taXNlcykge1xuICAgICAgICByZXR1cm4gYWxsKGFycmF5X21hcChwcm9taXNlcywgZnVuY3Rpb24gKHByb21pc2UpIHtcbiAgICAgICAgICAgIHByb21pc2UgPSBRKHByb21pc2UpO1xuICAgICAgICAgICAgZnVuY3Rpb24gcmVnYXJkbGVzcygpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJvbWlzZS5pbnNwZWN0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlZ2FyZGxlc3MsIHJlZ2FyZGxlc3MpO1xuICAgICAgICB9KSk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIENhcHR1cmVzIHRoZSBmYWlsdXJlIG9mIGEgcHJvbWlzZSwgZ2l2aW5nIGFuIG9wb3J0dW5pdHkgdG8gcmVjb3ZlclxuICogd2l0aCBhIGNhbGxiYWNrLiAgSWYgdGhlIGdpdmVuIHByb21pc2UgaXMgZnVsZmlsbGVkLCB0aGUgcmV0dXJuZWRcbiAqIHByb21pc2UgaXMgZnVsZmlsbGVkLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGZvciBzb21ldGhpbmdcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIGZ1bGZpbGwgdGhlIHJldHVybmVkIHByb21pc2UgaWYgdGhlXG4gKiBnaXZlbiBwcm9taXNlIGlzIHJlamVjdGVkXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGNhbGxiYWNrXG4gKi9cblEuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblFbXCJjYXRjaFwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIHJlamVjdGVkKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmFpbCA9IC8vIFhYWCBsZWdhY3lcblByb21pc2UucHJvdG90eXBlW1wiY2F0Y2hcIl0gPSBmdW5jdGlvbiAocmVqZWN0ZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgcmVqZWN0ZWQpO1xufTtcblxuLyoqXG4gKiBBdHRhY2hlcyBhIGxpc3RlbmVyIHRoYXQgY2FuIHJlc3BvbmQgdG8gcHJvZ3Jlc3Mgbm90aWZpY2F0aW9ucyBmcm9tIGFcbiAqIHByb21pc2UncyBvcmlnaW5hdGluZyBkZWZlcnJlZC4gVGhpcyBsaXN0ZW5lciByZWNlaXZlcyB0aGUgZXhhY3QgYXJndW1lbnRzXG4gKiBwYXNzZWQgdG8gYGBkZWZlcnJlZC5ub3RpZnlgYC5cbiAqIEBwYXJhbSB7QW55Kn0gcHJvbWlzZSBmb3Igc29tZXRoaW5nXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayB0byByZWNlaXZlIGFueSBwcm9ncmVzcyBub3RpZmljYXRpb25zXG4gKiBAcmV0dXJucyB0aGUgZ2l2ZW4gcHJvbWlzZSwgdW5jaGFuZ2VkXG4gKi9cblEucHJvZ3Jlc3MgPSBwcm9ncmVzcztcbmZ1bmN0aW9uIHByb2dyZXNzKG9iamVjdCwgcHJvZ3Jlc3NlZCkge1xuICAgIHJldHVybiBRKG9iamVjdCkudGhlbih2b2lkIDAsIHZvaWQgMCwgcHJvZ3Jlc3NlZCk7XG59XG5cblByb21pc2UucHJvdG90eXBlLnByb2dyZXNzID0gZnVuY3Rpb24gKHByb2dyZXNzZWQpIHtcbiAgICByZXR1cm4gdGhpcy50aGVuKHZvaWQgMCwgdm9pZCAwLCBwcm9ncmVzc2VkKTtcbn07XG5cbi8qKlxuICogUHJvdmlkZXMgYW4gb3Bwb3J0dW5pdHkgdG8gb2JzZXJ2ZSB0aGUgc2V0dGxpbmcgb2YgYSBwcm9taXNlLFxuICogcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBwcm9taXNlIGlzIGZ1bGZpbGxlZCBvciByZWplY3RlZC4gIEZvcndhcmRzXG4gKiB0aGUgcmVzb2x1dGlvbiB0byB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aGVuIHRoZSBjYWxsYmFjayBpcyBkb25lLlxuICogVGhlIGNhbGxiYWNrIGNhbiByZXR1cm4gYSBwcm9taXNlIHRvIGRlZmVyIGNvbXBsZXRpb24uXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIHRvIG9ic2VydmUgdGhlIHJlc29sdXRpb24gb2YgdGhlIGdpdmVuXG4gKiBwcm9taXNlLCB0YWtlcyBubyBhcmd1bWVudHMuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIHdoZW5cbiAqIGBgZmluYGAgaXMgZG9uZS5cbiAqL1xuUS5maW4gPSAvLyBYWFggbGVnYWN5XG5RW1wiZmluYWxseVwiXSA9IGZ1bmN0aW9uIChvYmplY3QsIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KVtcImZpbmFsbHlcIl0oY2FsbGJhY2spO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUuZmluID0gLy8gWFhYIGxlZ2FjeVxuUHJvbWlzZS5wcm90b3R5cGVbXCJmaW5hbGx5XCJdID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgY2FsbGJhY2sgPSBRKGNhbGxiYWNrKTtcbiAgICByZXR1cm4gdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2suZmNhbGwoKS50aGVuKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSk7XG4gICAgfSwgZnVuY3Rpb24gKHJlYXNvbikge1xuICAgICAgICAvLyBUT0RPIGF0dGVtcHQgdG8gcmVjeWNsZSB0aGUgcmVqZWN0aW9uIHdpdGggXCJ0aGlzXCIuXG4gICAgICAgIHJldHVybiBjYWxsYmFjay5mY2FsbCgpLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhyb3cgcmVhc29uO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogVGVybWluYXRlcyBhIGNoYWluIG9mIHByb21pc2VzLCBmb3JjaW5nIHJlamVjdGlvbnMgdG8gYmVcbiAqIHRocm93biBhcyBleGNlcHRpb25zLlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlIGF0IHRoZSBlbmQgb2YgYSBjaGFpbiBvZiBwcm9taXNlc1xuICogQHJldHVybnMgbm90aGluZ1xuICovXG5RLmRvbmUgPSBmdW5jdGlvbiAob2JqZWN0LCBmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykge1xuICAgIHJldHVybiBRKG9iamVjdCkuZG9uZShmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcyk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kb25lID0gZnVuY3Rpb24gKGZ1bGZpbGxlZCwgcmVqZWN0ZWQsIHByb2dyZXNzKSB7XG4gICAgdmFyIG9uVW5oYW5kbGVkRXJyb3IgPSBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgLy8gZm9yd2FyZCB0byBhIGZ1dHVyZSB0dXJuIHNvIHRoYXQgYGB3aGVuYGBcbiAgICAgICAgLy8gZG9lcyBub3QgY2F0Y2ggaXQgYW5kIHR1cm4gaXQgaW50byBhIHJlamVjdGlvbi5cbiAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgbWFrZVN0YWNrVHJhY2VMb25nKGVycm9yLCBwcm9taXNlKTtcbiAgICAgICAgICAgIGlmIChRLm9uZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBRLm9uZXJyb3IoZXJyb3IpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIEF2b2lkIHVubmVjZXNzYXJ5IGBuZXh0VGlja2BpbmcgdmlhIGFuIHVubmVjZXNzYXJ5IGB3aGVuYC5cbiAgICB2YXIgcHJvbWlzZSA9IGZ1bGZpbGxlZCB8fCByZWplY3RlZCB8fCBwcm9ncmVzcyA/XG4gICAgICAgIHRoaXMudGhlbihmdWxmaWxsZWQsIHJlamVjdGVkLCBwcm9ncmVzcykgOlxuICAgICAgICB0aGlzO1xuXG4gICAgaWYgKHR5cGVvZiBwcm9jZXNzID09PSBcIm9iamVjdFwiICYmIHByb2Nlc3MgJiYgcHJvY2Vzcy5kb21haW4pIHtcbiAgICAgICAgb25VbmhhbmRsZWRFcnJvciA9IHByb2Nlc3MuZG9tYWluLmJpbmQob25VbmhhbmRsZWRFcnJvcik7XG4gICAgfVxuXG4gICAgcHJvbWlzZS50aGVuKHZvaWQgMCwgb25VbmhhbmRsZWRFcnJvcik7XG59O1xuXG4vKipcbiAqIENhdXNlcyBhIHByb21pc2UgdG8gYmUgcmVqZWN0ZWQgaWYgaXQgZG9lcyBub3QgZ2V0IGZ1bGZpbGxlZCBiZWZvcmVcbiAqIHNvbWUgbWlsbGlzZWNvbmRzIHRpbWUgb3V0LlxuICogQHBhcmFtIHtBbnkqfSBwcm9taXNlXG4gKiBAcGFyYW0ge051bWJlcn0gbWlsbGlzZWNvbmRzIHRpbWVvdXRcbiAqIEBwYXJhbSB7U3RyaW5nfSBjdXN0b20gZXJyb3IgbWVzc2FnZSAob3B0aW9uYWwpXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlIGlmIGl0IGlzXG4gKiBmdWxmaWxsZWQgYmVmb3JlIHRoZSB0aW1lb3V0LCBvdGhlcndpc2UgcmVqZWN0ZWQuXG4gKi9cblEudGltZW91dCA9IGZ1bmN0aW9uIChvYmplY3QsIG1zLCBtZXNzYWdlKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS50aW1lb3V0KG1zLCBtZXNzYWdlKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLnRpbWVvdXQgPSBmdW5jdGlvbiAobXMsIG1lc3NhZ2UpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIHZhciB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KG5ldyBFcnJvcihtZXNzYWdlIHx8IFwiVGltZWQgb3V0IGFmdGVyIFwiICsgbXMgKyBcIiBtc1wiKSk7XG4gICAgfSwgbXMpO1xuXG4gICAgdGhpcy50aGVuKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSh2YWx1ZSk7XG4gICAgfSwgZnVuY3Rpb24gKGV4Y2VwdGlvbikge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dElkKTtcbiAgICAgICAgZGVmZXJyZWQucmVqZWN0KGV4Y2VwdGlvbik7XG4gICAgfSwgZGVmZXJyZWQubm90aWZ5KTtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIGdpdmVuIHZhbHVlIChvciBwcm9taXNlZCB2YWx1ZSksIHNvbWVcbiAqIG1pbGxpc2Vjb25kcyBhZnRlciBpdCByZXNvbHZlZC4gUGFzc2VzIHJlamVjdGlvbnMgaW1tZWRpYXRlbHkuXG4gKiBAcGFyYW0ge0FueSp9IHByb21pc2VcbiAqIEBwYXJhbSB7TnVtYmVyfSBtaWxsaXNlY29uZHNcbiAqIEByZXR1cm5zIGEgcHJvbWlzZSBmb3IgdGhlIHJlc29sdXRpb24gb2YgdGhlIGdpdmVuIHByb21pc2UgYWZ0ZXIgbWlsbGlzZWNvbmRzXG4gKiB0aW1lIGhhcyBlbGFwc2VkIHNpbmNlIHRoZSByZXNvbHV0aW9uIG9mIHRoZSBnaXZlbiBwcm9taXNlLlxuICogSWYgdGhlIGdpdmVuIHByb21pc2UgcmVqZWN0cywgdGhhdCBpcyBwYXNzZWQgaW1tZWRpYXRlbHkuXG4gKi9cblEuZGVsYXkgPSBmdW5jdGlvbiAob2JqZWN0LCB0aW1lb3V0KSB7XG4gICAgaWYgKHRpbWVvdXQgPT09IHZvaWQgMCkge1xuICAgICAgICB0aW1lb3V0ID0gb2JqZWN0O1xuICAgICAgICBvYmplY3QgPSB2b2lkIDA7XG4gICAgfVxuICAgIHJldHVybiBRKG9iamVjdCkuZGVsYXkodGltZW91dCk7XG59O1xuXG5Qcm9taXNlLnByb3RvdHlwZS5kZWxheSA9IGZ1bmN0aW9uICh0aW1lb3V0KSB7XG4gICAgcmV0dXJuIHRoaXMudGhlbihmdW5jdGlvbiAodmFsdWUpIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBkZWZlcnJlZC5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgfSwgdGltZW91dCk7XG4gICAgICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBQYXNzZXMgYSBjb250aW51YXRpb24gdG8gYSBOb2RlIGZ1bmN0aW9uLCB3aGljaCBpcyBjYWxsZWQgd2l0aCB0aGUgZ2l2ZW5cbiAqIGFyZ3VtZW50cyBwcm92aWRlZCBhcyBhbiBhcnJheSwgYW5kIHJldHVybnMgYSBwcm9taXNlLlxuICpcbiAqICAgICAgUS5uZmFwcGx5KEZTLnJlYWRGaWxlLCBbX19maWxlbmFtZV0pXG4gKiAgICAgIC50aGVuKGZ1bmN0aW9uIChjb250ZW50KSB7XG4gKiAgICAgIH0pXG4gKlxuICovXG5RLm5mYXBwbHkgPSBmdW5jdGlvbiAoY2FsbGJhY2ssIGFyZ3MpIHtcbiAgICByZXR1cm4gUShjYWxsYmFjaykubmZhcHBseShhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mYXBwbHkgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJncyk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIHRoaXMuZmFwcGx5KG5vZGVBcmdzKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIFBhc3NlcyBhIGNvbnRpbnVhdGlvbiB0byBhIE5vZGUgZnVuY3Rpb24sIHdoaWNoIGlzIGNhbGxlZCB3aXRoIHRoZSBnaXZlblxuICogYXJndW1lbnRzIHByb3ZpZGVkIGluZGl2aWR1YWxseSwgYW5kIHJldHVybnMgYSBwcm9taXNlLlxuICogQGV4YW1wbGVcbiAqIFEubmZjYWxsKEZTLnJlYWRGaWxlLCBfX2ZpbGVuYW1lKVxuICogLnRoZW4oZnVuY3Rpb24gKGNvbnRlbnQpIHtcbiAqIH0pXG4gKlxuICovXG5RLm5mY2FsbCA9IGZ1bmN0aW9uIChjYWxsYmFjayAvKi4uLmFyZ3MqLykge1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gUShjYWxsYmFjaykubmZhcHBseShhcmdzKTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mY2FsbCA9IGZ1bmN0aW9uICgvKi4uLmFyZ3MqLykge1xuICAgIHZhciBub2RlQXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZTtcbn07XG5cbi8qKlxuICogV3JhcHMgYSBOb2RlSlMgY29udGludWF0aW9uIHBhc3NpbmcgZnVuY3Rpb24gYW5kIHJldHVybnMgYW4gZXF1aXZhbGVudFxuICogdmVyc2lvbiB0aGF0IHJldHVybnMgYSBwcm9taXNlLlxuICogQGV4YW1wbGVcbiAqIFEubmZiaW5kKEZTLnJlYWRGaWxlLCBfX2ZpbGVuYW1lKShcInV0Zi04XCIpXG4gKiAudGhlbihjb25zb2xlLmxvZylcbiAqIC5kb25lKClcbiAqL1xuUS5uZmJpbmQgPVxuUS5kZW5vZGVpZnkgPSBmdW5jdGlvbiAoY2FsbGJhY2sgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYmFzZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBub2RlQXJncyA9IGJhc2VBcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKTtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgICAgICBRKGNhbGxiYWNrKS5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5mYmluZCA9XG5Qcm9taXNlLnByb3RvdHlwZS5kZW5vZGVpZnkgPSBmdW5jdGlvbiAoLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYXJncyA9IGFycmF5X3NsaWNlKGFyZ3VtZW50cyk7XG4gICAgYXJncy51bnNoaWZ0KHRoaXMpO1xuICAgIHJldHVybiBRLmRlbm9kZWlmeS5hcHBseSh2b2lkIDAsIGFyZ3MpO1xufTtcblxuUS5uYmluZCA9IGZ1bmN0aW9uIChjYWxsYmFjaywgdGhpc3AgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgYmFzZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBub2RlQXJncyA9IGJhc2VBcmdzLmNvbmNhdChhcnJheV9zbGljZShhcmd1bWVudHMpKTtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICAgICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgICAgICBmdW5jdGlvbiBib3VuZCgpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjay5hcHBseSh0aGlzcCwgYXJndW1lbnRzKTtcbiAgICAgICAgfVxuICAgICAgICBRKGJvdW5kKS5mYXBwbHkobm9kZUFyZ3MpLmZhaWwoZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG4gICAgfTtcbn07XG5cblByb21pc2UucHJvdG90eXBlLm5iaW5kID0gZnVuY3Rpb24gKC8qdGhpc3AsIC4uLmFyZ3MqLykge1xuICAgIHZhciBhcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAwKTtcbiAgICBhcmdzLnVuc2hpZnQodGhpcyk7XG4gICAgcmV0dXJuIFEubmJpbmQuYXBwbHkodm9pZCAwLCBhcmdzKTtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBtZXRob2Qgb2YgYSBOb2RlLXN0eWxlIG9iamVjdCB0aGF0IGFjY2VwdHMgYSBOb2RlLXN0eWxlXG4gKiBjYWxsYmFjayB3aXRoIGEgZ2l2ZW4gYXJyYXkgb2YgYXJndW1lbnRzLCBwbHVzIGEgcHJvdmlkZWQgY2FsbGJhY2suXG4gKiBAcGFyYW0gb2JqZWN0IGFuIG9iamVjdCB0aGF0IGhhcyB0aGUgbmFtZWQgbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBuYW1lIG9mIHRoZSBtZXRob2Qgb2Ygb2JqZWN0XG4gKiBAcGFyYW0ge0FycmF5fSBhcmdzIGFyZ3VtZW50cyB0byBwYXNzIHRvIHRoZSBtZXRob2Q7IHRoZSBjYWxsYmFja1xuICogd2lsbCBiZSBwcm92aWRlZCBieSBRIGFuZCBhcHBlbmRlZCB0byB0aGVzZSBhcmd1bWVudHMuXG4gKiBAcmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSB2YWx1ZSBvciBlcnJvclxuICovXG5RLm5tYXBwbHkgPSAvLyBYWFggQXMgcHJvcG9zZWQgYnkgXCJSZWRzYW5kcm9cIlxuUS5ucG9zdCA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUsIGFyZ3MpIHtcbiAgICByZXR1cm4gUShvYmplY3QpLm5wb3N0KG5hbWUsIGFyZ3MpO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubm1hcHBseSA9IC8vIFhYWCBBcyBwcm9wb3NlZCBieSBcIlJlZHNhbmRyb1wiXG5Qcm9taXNlLnByb3RvdHlwZS5ucG9zdCA9IGZ1bmN0aW9uIChuYW1lLCBhcmdzKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJncyB8fCBbXSk7XG4gICAgdmFyIGRlZmVycmVkID0gZGVmZXIoKTtcbiAgICBub2RlQXJncy5wdXNoKGRlZmVycmVkLm1ha2VOb2RlUmVzb2x2ZXIoKSk7XG4gICAgdGhpcy5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuLyoqXG4gKiBDYWxscyBhIG1ldGhvZCBvZiBhIE5vZGUtc3R5bGUgb2JqZWN0IHRoYXQgYWNjZXB0cyBhIE5vZGUtc3R5bGVcbiAqIGNhbGxiYWNrLCBmb3J3YXJkaW5nIHRoZSBnaXZlbiB2YXJpYWRpYyBhcmd1bWVudHMsIHBsdXMgYSBwcm92aWRlZFxuICogY2FsbGJhY2sgYXJndW1lbnQuXG4gKiBAcGFyYW0gb2JqZWN0IGFuIG9iamVjdCB0aGF0IGhhcyB0aGUgbmFtZWQgbWV0aG9kXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSBuYW1lIG9mIHRoZSBtZXRob2Qgb2Ygb2JqZWN0XG4gKiBAcGFyYW0gLi4uYXJncyBhcmd1bWVudHMgdG8gcGFzcyB0byB0aGUgbWV0aG9kOyB0aGUgY2FsbGJhY2sgd2lsbFxuICogYmUgcHJvdmlkZWQgYnkgUSBhbmQgYXBwZW5kZWQgdG8gdGhlc2UgYXJndW1lbnRzLlxuICogQHJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgdmFsdWUgb3IgZXJyb3JcbiAqL1xuUS5uc2VuZCA9IC8vIFhYWCBCYXNlZCBvbiBNYXJrIE1pbGxlcidzIHByb3Bvc2VkIFwic2VuZFwiXG5RLm5tY2FsbCA9IC8vIFhYWCBCYXNlZCBvbiBcIlJlZHNhbmRybydzXCIgcHJvcG9zYWxcblEubmludm9rZSA9IGZ1bmN0aW9uIChvYmplY3QsIG5hbWUgLyouLi5hcmdzKi8pIHtcbiAgICB2YXIgbm9kZUFyZ3MgPSBhcnJheV9zbGljZShhcmd1bWVudHMsIDIpO1xuICAgIHZhciBkZWZlcnJlZCA9IGRlZmVyKCk7XG4gICAgbm9kZUFyZ3MucHVzaChkZWZlcnJlZC5tYWtlTm9kZVJlc29sdmVyKCkpO1xuICAgIFEob2JqZWN0KS5kaXNwYXRjaChcInBvc3RcIiwgW25hbWUsIG5vZGVBcmdzXSkuZmFpbChkZWZlcnJlZC5yZWplY3QpO1xuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlO1xufTtcblxuUHJvbWlzZS5wcm90b3R5cGUubnNlbmQgPSAvLyBYWFggQmFzZWQgb24gTWFyayBNaWxsZXIncyBwcm9wb3NlZCBcInNlbmRcIlxuUHJvbWlzZS5wcm90b3R5cGUubm1jYWxsID0gLy8gWFhYIEJhc2VkIG9uIFwiUmVkc2FuZHJvJ3NcIiBwcm9wb3NhbFxuUHJvbWlzZS5wcm90b3R5cGUubmludm9rZSA9IGZ1bmN0aW9uIChuYW1lIC8qLi4uYXJncyovKSB7XG4gICAgdmFyIG5vZGVBcmdzID0gYXJyYXlfc2xpY2UoYXJndW1lbnRzLCAxKTtcbiAgICB2YXIgZGVmZXJyZWQgPSBkZWZlcigpO1xuICAgIG5vZGVBcmdzLnB1c2goZGVmZXJyZWQubWFrZU5vZGVSZXNvbHZlcigpKTtcbiAgICB0aGlzLmRpc3BhdGNoKFwicG9zdFwiLCBbbmFtZSwgbm9kZUFyZ3NdKS5mYWlsKGRlZmVycmVkLnJlamVjdCk7XG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2U7XG59O1xuXG4vKipcbiAqIElmIGEgZnVuY3Rpb24gd291bGQgbGlrZSB0byBzdXBwb3J0IGJvdGggTm9kZSBjb250aW51YXRpb24tcGFzc2luZy1zdHlsZSBhbmRcbiAqIHByb21pc2UtcmV0dXJuaW5nLXN0eWxlLCBpdCBjYW4gZW5kIGl0cyBpbnRlcm5hbCBwcm9taXNlIGNoYWluIHdpdGhcbiAqIGBub2RlaWZ5KG5vZGViYWNrKWAsIGZvcndhcmRpbmcgdGhlIG9wdGlvbmFsIG5vZGViYWNrIGFyZ3VtZW50LiAgSWYgdGhlIHVzZXJcbiAqIGVsZWN0cyB0byB1c2UgYSBub2RlYmFjaywgdGhlIHJlc3VsdCB3aWxsIGJlIHNlbnQgdGhlcmUuICBJZiB0aGV5IGRvIG5vdFxuICogcGFzcyBhIG5vZGViYWNrLCB0aGV5IHdpbGwgcmVjZWl2ZSB0aGUgcmVzdWx0IHByb21pc2UuXG4gKiBAcGFyYW0gb2JqZWN0IGEgcmVzdWx0IChvciBhIHByb21pc2UgZm9yIGEgcmVzdWx0KVxuICogQHBhcmFtIHtGdW5jdGlvbn0gbm9kZWJhY2sgYSBOb2RlLmpzLXN0eWxlIGNhbGxiYWNrXG4gKiBAcmV0dXJucyBlaXRoZXIgdGhlIHByb21pc2Ugb3Igbm90aGluZ1xuICovXG5RLm5vZGVpZnkgPSBub2RlaWZ5O1xuZnVuY3Rpb24gbm9kZWlmeShvYmplY3QsIG5vZGViYWNrKSB7XG4gICAgcmV0dXJuIFEob2JqZWN0KS5ub2RlaWZ5KG5vZGViYWNrKTtcbn1cblxuUHJvbWlzZS5wcm90b3R5cGUubm9kZWlmeSA9IGZ1bmN0aW9uIChub2RlYmFjaykge1xuICAgIGlmIChub2RlYmFjaykge1xuICAgICAgICB0aGlzLnRoZW4oZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgICAgICBuZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgbm9kZWJhY2sobnVsbCwgdmFsdWUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIG5vZGViYWNrKGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG59O1xuXG4vLyBBbGwgY29kZSBiZWZvcmUgdGhpcyBwb2ludCB3aWxsIGJlIGZpbHRlcmVkIGZyb20gc3RhY2sgdHJhY2VzLlxudmFyIHFFbmRpbmdMaW5lID0gY2FwdHVyZUxpbmUoKTtcblxucmV0dXJuIFE7XG5cbn0pO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIklNbW5ralwiKSkiLCIvKipcbiAqIEBmaWxlb3ZlcnZpZXcgZ2wtbWF0cml4IC0gSGlnaCBwZXJmb3JtYW5jZSBtYXRyaXggYW5kIHZlY3RvciBvcGVyYXRpb25zXG4gKiBAYXV0aG9yIEJyYW5kb24gSm9uZXNcbiAqIEBhdXRob3IgQ29saW4gTWFjS2VuemllIElWXG4gKiBAdmVyc2lvbiAyLjEuMFxuICovXG5cbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cblxuKGZ1bmN0aW9uKCkge1xuICBcInVzZSBzdHJpY3RcIjtcblxuICB2YXIgc2hpbSA9IHt9O1xuICBpZiAodHlwZW9mKGV4cG9ydHMpID09PSAndW5kZWZpbmVkJykge1xuICAgIGlmKHR5cGVvZiBkZWZpbmUgPT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgZGVmaW5lLmFtZCA9PSAnb2JqZWN0JyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICBzaGltLmV4cG9ydHMgPSB7fTtcbiAgICAgIGRlZmluZShmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHNoaW0uZXhwb3J0cztcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBnbC1tYXRyaXggbGl2ZXMgaW4gYSBicm93c2VyLCBkZWZpbmUgaXRzIG5hbWVzcGFjZXMgaW4gZ2xvYmFsXG4gICAgICBzaGltLmV4cG9ydHMgPSB3aW5kb3c7XG4gICAgfSAgICBcbiAgfVxuICBlbHNlIHtcbiAgICAvLyBnbC1tYXRyaXggbGl2ZXMgaW4gY29tbW9uanMsIGRlZmluZSBpdHMgbmFtZXNwYWNlcyBpbiBleHBvcnRzXG4gICAgc2hpbS5leHBvcnRzID0gZXhwb3J0cztcbiAgfVxuXG4gIChmdW5jdGlvbihleHBvcnRzKSB7XG4gICAgLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuXG5pZighR0xNQVRfRVBTSUxPTikge1xuICAgIHZhciBHTE1BVF9FUFNJTE9OID0gMC4wMDAwMDE7XG59XG5cbmlmKCFHTE1BVF9BUlJBWV9UWVBFKSB7XG4gICAgdmFyIEdMTUFUX0FSUkFZX1RZUEUgPSAodHlwZW9mIEZsb2F0MzJBcnJheSAhPT0gJ3VuZGVmaW5lZCcpID8gRmxvYXQzMkFycmF5IDogQXJyYXk7XG59XG5cbi8qKlxuICogQGNsYXNzIENvbW1vbiB1dGlsaXRpZXNcbiAqIEBuYW1lIGdsTWF0cml4XG4gKi9cbnZhciBnbE1hdHJpeCA9IHt9O1xuXG4vKipcbiAqIFNldHMgdGhlIHR5cGUgb2YgYXJyYXkgdXNlZCB3aGVuIGNyZWF0aW5nIG5ldyB2ZWN0b3JzIGFuZCBtYXRyaWNpZXNcbiAqXG4gKiBAcGFyYW0ge1R5cGV9IHR5cGUgQXJyYXkgdHlwZSwgc3VjaCBhcyBGbG9hdDMyQXJyYXkgb3IgQXJyYXlcbiAqL1xuZ2xNYXRyaXguc2V0TWF0cml4QXJyYXlUeXBlID0gZnVuY3Rpb24odHlwZSkge1xuICAgIEdMTUFUX0FSUkFZX1RZUEUgPSB0eXBlO1xufVxuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5nbE1hdHJpeCA9IGdsTWF0cml4O1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgMiBEaW1lbnNpb25hbCBWZWN0b3JcbiAqIEBuYW1lIHZlYzJcbiAqL1xuXG52YXIgdmVjMiA9IHt9O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcsIGVtcHR5IHZlYzJcbiAqXG4gKiBAcmV0dXJucyB7dmVjMn0gYSBuZXcgMkQgdmVjdG9yXG4gKi9cbnZlYzIuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDIpO1xuICAgIG91dFswXSA9IDA7XG4gICAgb3V0WzFdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzIgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIGNsb25lXG4gKiBAcmV0dXJucyB7dmVjMn0gYSBuZXcgMkQgdmVjdG9yXG4gKi9cbnZlYzIuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDIpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzIgaW5pdGlhbGl6ZWQgd2l0aCB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjMn0gYSBuZXcgMkQgdmVjdG9yXG4gKi9cbnZlYzIuZnJvbVZhbHVlcyA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMik7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSB2ZWMyIHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBzb3VyY2UgdmVjdG9yXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGNvbXBvbmVudHMgb2YgYSB2ZWMyIHRvIHRoZSBnaXZlbiB2YWx1ZXNcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuc2V0ID0gZnVuY3Rpb24ob3V0LCB4LCB5KSB7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5hZGQgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICsgYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdICsgYlsxXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTdWJ0cmFjdHMgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5zdWJ0cmFjdCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gLSBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gLSBiWzFdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMi5zdWJ0cmFjdH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLnN1YiA9IHZlYzIuc3VidHJhY3Q7XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLm11bHRpcGx5ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAqIGJbMV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMyLm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzIubXVsID0gdmVjMi5tdWx0aXBseTtcblxuLyoqXG4gKiBEaXZpZGVzIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuZGl2aWRlID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAvIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAvIGJbMV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMyLmRpdmlkZX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLmRpdiA9IHZlYzIuZGl2aWRlO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG1pbmltdW0gb2YgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5taW4gPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBNYXRoLm1pbihhWzBdLCBiWzBdKTtcbiAgICBvdXRbMV0gPSBNYXRoLm1pbihhWzFdLCBiWzFdKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtYXhpbXVtIG9mIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIubWF4ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5tYXgoYVswXSwgYlswXSk7XG4gICAgb3V0WzFdID0gTWF0aC5tYXgoYVsxXSwgYlsxXSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2NhbGVzIGEgdmVjMiBieSBhIHNjYWxhciBudW1iZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSB2ZWN0b3IgdG8gc2NhbGVcbiAqIEBwYXJhbSB7TnVtYmVyfSBiIGFtb3VudCB0byBzY2FsZSB0aGUgdmVjdG9yIGJ5XG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuc2NhbGUgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICogYjtcbiAgICBvdXRbMV0gPSBhWzFdICogYjtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjMi5kaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV07XG4gICAgcmV0dXJuIE1hdGguc3FydCh4KnggKyB5KnkpO1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuZGlzdGFuY2V9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMi5kaXN0ID0gdmVjMi5kaXN0YW5jZTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGV1Y2xpZGlhbiBkaXN0YW5jZSBiZXR3ZWVuIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbnZlYzIuc3F1YXJlZERpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXTtcbiAgICByZXR1cm4geCp4ICsgeSp5O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuc3F1YXJlZERpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzIuc3FyRGlzdCA9IHZlYzIuc3F1YXJlZERpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHZlYzJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKi9cbnZlYzIubGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5KTtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMyLmxlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLmxlbiA9IHZlYzIubGVuZ3RoO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgbGVuZ3RoIG9mIGEgdmVjMlxuICpcbiAqIEBwYXJhbSB7dmVjMn0gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIHNxdWFyZWQgbGVuZ3RoIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGxlbmd0aCBvZiBhXG4gKi9cbnZlYzIuc3F1YXJlZExlbmd0aCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXTtcbiAgICByZXR1cm4geCp4ICsgeSp5O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuc3F1YXJlZExlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLnNxckxlbiA9IHZlYzIuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBOZWdhdGVzIHRoZSBjb21wb25lbnRzIG9mIGEgdmVjMlxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIG5lZ2F0ZVxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLm5lZ2F0ZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IC1hWzBdO1xuICAgIG91dFsxXSA9IC1hWzFdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBhIHZlYzJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHZlY3RvciB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5ub3JtYWxpemUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIHZhciBsZW4gPSB4KnggKyB5Knk7XG4gICAgaWYgKGxlbiA+IDApIHtcbiAgICAgICAgLy9UT0RPOiBldmFsdWF0ZSB1c2Ugb2YgZ2xtX2ludnNxcnQgaGVyZT9cbiAgICAgICAgbGVuID0gMSAvIE1hdGguc3FydChsZW4pO1xuICAgICAgICBvdXRbMF0gPSBhWzBdICogbGVuO1xuICAgICAgICBvdXRbMV0gPSBhWzFdICogbGVuO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkb3QgcHJvZHVjdCBvZiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkb3QgcHJvZHVjdCBvZiBhIGFuZCBiXG4gKi9cbnZlYzIuZG90ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdHdvIHZlYzInc1xuICogTm90ZSB0aGF0IHRoZSBjcm9zcyBwcm9kdWN0IG11c3QgYnkgZGVmaW5pdGlvbiBwcm9kdWNlIGEgM0QgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMyLmNyb3NzID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgdmFyIHogPSBhWzBdICogYlsxXSAtIGFbMV0gKiBiWzBdO1xuICAgIG91dFswXSA9IG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5sZXJwID0gZnVuY3Rpb24gKG91dCwgYSwgYiwgdCkge1xuICAgIHZhciBheCA9IGFbMF0sXG4gICAgICAgIGF5ID0gYVsxXTtcbiAgICBvdXRbMF0gPSBheCArIHQgKiAoYlswXSAtIGF4KTtcbiAgICBvdXRbMV0gPSBheSArIHQgKiAoYlsxXSAtIGF5KTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMyIHdpdGggYSBtYXQyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQyfSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnRyYW5zZm9ybU1hdDIgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVsyXSAqIHk7XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzNdICogeTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMyIHdpdGggYSBtYXQyZFxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7bWF0MmR9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIudHJhbnNmb3JtTWF0MmQgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVsyXSAqIHkgKyBtWzRdO1xuICAgIG91dFsxXSA9IG1bMV0gKiB4ICsgbVszXSAqIHkgKyBtWzVdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzIgd2l0aCBhIG1hdDNcbiAqIDNyZCB2ZWN0b3IgY29tcG9uZW50IGlzIGltcGxpY2l0bHkgJzEnXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQzfSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnRyYW5zZm9ybU1hdDMgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVszXSAqIHkgKyBtWzZdO1xuICAgIG91dFsxXSA9IG1bMV0gKiB4ICsgbVs0XSAqIHkgKyBtWzddO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzIgd2l0aCBhIG1hdDRcbiAqIDNyZCB2ZWN0b3IgY29tcG9uZW50IGlzIGltcGxpY2l0bHkgJzAnXG4gKiA0dGggdmVjdG9yIGNvbXBvbmVudCBpcyBpbXBsaWNpdGx5ICcxJ1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7bWF0NH0gbSBtYXRyaXggdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi50cmFuc2Zvcm1NYXQ0ID0gZnVuY3Rpb24ob3V0LCBhLCBtKSB7XG4gICAgdmFyIHggPSBhWzBdLCBcbiAgICAgICAgeSA9IGFbMV07XG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzRdICogeSArIG1bMTJdO1xuICAgIG91dFsxXSA9IG1bMV0gKiB4ICsgbVs1XSAqIHkgKyBtWzEzXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBQZXJmb3JtIHNvbWUgb3BlcmF0aW9uIG92ZXIgYW4gYXJyYXkgb2YgdmVjMnMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYSB0aGUgYXJyYXkgb2YgdmVjdG9ycyB0byBpdGVyYXRlIG92ZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdHJpZGUgTnVtYmVyIG9mIGVsZW1lbnRzIGJldHdlZW4gdGhlIHN0YXJ0IG9mIGVhY2ggdmVjMi4gSWYgMCBhc3N1bWVzIHRpZ2h0bHkgcGFja2VkXG4gKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IE51bWJlciBvZiBlbGVtZW50cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGFycmF5XG4gKiBAcGFyYW0ge051bWJlcn0gY291bnQgTnVtYmVyIG9mIHZlYzJzIHRvIGl0ZXJhdGUgb3Zlci4gSWYgMCBpdGVyYXRlcyBvdmVyIGVudGlyZSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gRnVuY3Rpb24gdG8gY2FsbCBmb3IgZWFjaCB2ZWN0b3IgaW4gdGhlIGFycmF5XG4gKiBAcGFyYW0ge09iamVjdH0gW2FyZ10gYWRkaXRpb25hbCBhcmd1bWVudCB0byBwYXNzIHRvIGZuXG4gKiBAcmV0dXJucyB7QXJyYXl9IGFcbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLmZvckVhY2ggPSAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZlYyA9IHZlYzIuY3JlYXRlKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oYSwgc3RyaWRlLCBvZmZzZXQsIGNvdW50LCBmbiwgYXJnKSB7XG4gICAgICAgIHZhciBpLCBsO1xuICAgICAgICBpZighc3RyaWRlKSB7XG4gICAgICAgICAgICBzdHJpZGUgPSAyO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIW9mZnNldCkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gMDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYoY291bnQpIHtcbiAgICAgICAgICAgIGwgPSBNYXRoLm1pbigoY291bnQgKiBzdHJpZGUpICsgb2Zmc2V0LCBhLmxlbmd0aCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsID0gYS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IoaSA9IG9mZnNldDsgaSA8IGw7IGkgKz0gc3RyaWRlKSB7XG4gICAgICAgICAgICB2ZWNbMF0gPSBhW2ldOyB2ZWNbMV0gPSBhW2krMV07XG4gICAgICAgICAgICBmbih2ZWMsIHZlYywgYXJnKTtcbiAgICAgICAgICAgIGFbaV0gPSB2ZWNbMF07IGFbaSsxXSA9IHZlY1sxXTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgfTtcbn0pKCk7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjMn0gdmVjIHZlY3RvciB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yXG4gKi9cbnZlYzIuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ3ZlYzIoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcpJztcbn07XG5cbmlmKHR5cGVvZihleHBvcnRzKSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBleHBvcnRzLnZlYzIgPSB2ZWMyO1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgMyBEaW1lbnNpb25hbCBWZWN0b3JcbiAqIEBuYW1lIHZlYzNcbiAqL1xuXG52YXIgdmVjMyA9IHt9O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcsIGVtcHR5IHZlYzNcbiAqXG4gKiBAcmV0dXJucyB7dmVjM30gYSBuZXcgM0QgdmVjdG9yXG4gKi9cbnZlYzMuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDMpO1xuICAgIG91dFswXSA9IDA7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjMyBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gY2xvbmVcbiAqIEByZXR1cm5zIHt2ZWMzfSBhIG5ldyAzRCB2ZWN0b3JcbiAqL1xudmVjMy5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMyk7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB2ZWMzIGluaXRpYWxpemVkIHdpdGggdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWMzfSBhIG5ldyAzRCB2ZWN0b3JcbiAqL1xudmVjMy5mcm9tVmFsdWVzID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgzKTtcbiAgICBvdXRbMF0gPSB4O1xuICAgIG91dFsxXSA9IHk7XG4gICAgb3V0WzJdID0gejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgdmVjMyB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgc291cmNlIHZlY3RvclxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGNvbXBvbmVudHMgb2YgYSB2ZWMzIHRvIHRoZSBnaXZlbiB2YWx1ZXNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geiBaIGNvbXBvbmVudFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnNldCA9IGZ1bmN0aW9uKG91dCwgeCwgeSwgeikge1xuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICBvdXRbMl0gPSB6O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5hZGQgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICsgYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdICsgYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdICsgYlsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTdWJ0cmFjdHMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5zdWJ0cmFjdCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gLSBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gLSBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gLSBiWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5zdWJ0cmFjdH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLnN1YiA9IHZlYzMuc3VidHJhY3Q7XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLm11bHRpcGx5ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAqIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSAqIGJbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMubXVsID0gdmVjMy5tdWx0aXBseTtcblxuLyoqXG4gKiBEaXZpZGVzIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuZGl2aWRlID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAvIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAvIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSAvIGJbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLmRpdmlkZX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLmRpdiA9IHZlYzMuZGl2aWRlO1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG1pbmltdW0gb2YgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5taW4gPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBNYXRoLm1pbihhWzBdLCBiWzBdKTtcbiAgICBvdXRbMV0gPSBNYXRoLm1pbihhWzFdLCBiWzFdKTtcbiAgICBvdXRbMl0gPSBNYXRoLm1pbihhWzJdLCBiWzJdKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtYXhpbXVtIG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubWF4ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5tYXgoYVswXSwgYlswXSk7XG4gICAgb3V0WzFdID0gTWF0aC5tYXgoYVsxXSwgYlsxXSk7XG4gICAgb3V0WzJdID0gTWF0aC5tYXgoYVsyXSwgYlsyXSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2NhbGVzIGEgdmVjMyBieSBhIHNjYWxhciBudW1iZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gc2NhbGVcbiAqIEBwYXJhbSB7TnVtYmVyfSBiIGFtb3VudCB0byBzY2FsZSB0aGUgdmVjdG9yIGJ5XG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuc2NhbGUgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICogYjtcbiAgICBvdXRbMV0gPSBhWzFdICogYjtcbiAgICBvdXRbMl0gPSBhWzJdICogYjtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjMy5kaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV0sXG4gICAgICAgIHogPSBiWzJdIC0gYVsyXTtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSArIHoqeik7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5kaXN0YW5jZX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLmRpc3QgPSB2ZWMzLmRpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgZXVjbGlkaWFuIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjMy5zcXVhcmVkRGlzdGFuY2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgdmFyIHggPSBiWzBdIC0gYVswXSxcbiAgICAgICAgeSA9IGJbMV0gLSBhWzFdLFxuICAgICAgICB6ID0gYlsyXSAtIGFbMl07XG4gICAgcmV0dXJuIHgqeCArIHkqeSArIHoqejtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLnNxdWFyZWREaXN0YW5jZX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLnNxckRpc3QgPSB2ZWMzLnNxdWFyZWREaXN0YW5jZTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBsZW5ndGggb2YgYSB2ZWMzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBjYWxjdWxhdGUgbGVuZ3RoIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBsZW5ndGggb2YgYVxuICovXG52ZWMzLmxlbmd0aCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl07XG4gICAgcmV0dXJuIE1hdGguc3FydCh4KnggKyB5KnkgKyB6KnopO1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMubGVuZ3RofVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMubGVuID0gdmVjMy5sZW5ndGg7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBsZW5ndGggb2YgYSB2ZWMzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBjYWxjdWxhdGUgc3F1YXJlZCBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgbGVuZ3RoIG9mIGFcbiAqL1xudmVjMy5zcXVhcmVkTGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXTtcbiAgICByZXR1cm4geCp4ICsgeSp5ICsgeip6O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMuc3F1YXJlZExlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLnNxckxlbiA9IHZlYzMuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBOZWdhdGVzIHRoZSBjb21wb25lbnRzIG9mIGEgdmVjM1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIG5lZ2F0ZVxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLm5lZ2F0ZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IC1hWzBdO1xuICAgIG91dFsxXSA9IC1hWzFdO1xuICAgIG91dFsyXSA9IC1hWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5ub3JtYWxpemUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXTtcbiAgICB2YXIgbGVuID0geCp4ICsgeSp5ICsgeip6O1xuICAgIGlmIChsZW4gPiAwKSB7XG4gICAgICAgIC8vVE9ETzogZXZhbHVhdGUgdXNlIG9mIGdsbV9pbnZzcXJ0IGhlcmU/XG4gICAgICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQobGVuKTtcbiAgICAgICAgb3V0WzBdID0gYVswXSAqIGxlbjtcbiAgICAgICAgb3V0WzFdID0gYVsxXSAqIGxlbjtcbiAgICAgICAgb3V0WzJdID0gYVsyXSAqIGxlbjtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZG90IHByb2R1Y3Qgb2YgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZG90IHByb2R1Y3Qgb2YgYSBhbmQgYlxuICovXG52ZWMzLmRvdCA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gICAgcmV0dXJuIGFbMF0gKiBiWzBdICsgYVsxXSAqIGJbMV0gKyBhWzJdICogYlsyXTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5jcm9zcyA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIHZhciBheCA9IGFbMF0sIGF5ID0gYVsxXSwgYXogPSBhWzJdLFxuICAgICAgICBieCA9IGJbMF0sIGJ5ID0gYlsxXSwgYnogPSBiWzJdO1xuXG4gICAgb3V0WzBdID0gYXkgKiBieiAtIGF6ICogYnk7XG4gICAgb3V0WzFdID0gYXogKiBieCAtIGF4ICogYno7XG4gICAgb3V0WzJdID0gYXggKiBieSAtIGF5ICogYng7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUGVyZm9ybXMgYSBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcGFyYW0ge051bWJlcn0gdCBpbnRlcnBvbGF0aW9uIGFtb3VudCBiZXR3ZWVuIHRoZSB0d28gaW5wdXRzXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubGVycCA9IGZ1bmN0aW9uIChvdXQsIGEsIGIsIHQpIHtcbiAgICB2YXIgYXggPSBhWzBdLFxuICAgICAgICBheSA9IGFbMV0sXG4gICAgICAgIGF6ID0gYVsyXTtcbiAgICBvdXRbMF0gPSBheCArIHQgKiAoYlswXSAtIGF4KTtcbiAgICBvdXRbMV0gPSBheSArIHQgKiAoYlsxXSAtIGF5KTtcbiAgICBvdXRbMl0gPSBheiArIHQgKiAoYlsyXSAtIGF6KTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMzIHdpdGggYSBtYXQ0LlxuICogNHRoIHZlY3RvciBjb21wb25lbnQgaXMgaW1wbGljaXRseSAnMSdcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDR9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMudHJhbnNmb3JtTWF0NCA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSwgeSA9IGFbMV0sIHogPSBhWzJdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVs0XSAqIHkgKyBtWzhdICogeiArIG1bMTJdO1xuICAgIG91dFsxXSA9IG1bMV0gKiB4ICsgbVs1XSAqIHkgKyBtWzldICogeiArIG1bMTNdO1xuICAgIG91dFsyXSA9IG1bMl0gKiB4ICsgbVs2XSAqIHkgKyBtWzEwXSAqIHogKyBtWzE0XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMzIHdpdGggYSBxdWF0XG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHtxdWF0fSBxIHF1YXRlcm5pb24gdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy50cmFuc2Zvcm1RdWF0ID0gZnVuY3Rpb24ob3V0LCBhLCBxKSB7XG4gICAgdmFyIHggPSBhWzBdLCB5ID0gYVsxXSwgeiA9IGFbMl0sXG4gICAgICAgIHF4ID0gcVswXSwgcXkgPSBxWzFdLCBxeiA9IHFbMl0sIHF3ID0gcVszXSxcblxuICAgICAgICAvLyBjYWxjdWxhdGUgcXVhdCAqIHZlY1xuICAgICAgICBpeCA9IHF3ICogeCArIHF5ICogeiAtIHF6ICogeSxcbiAgICAgICAgaXkgPSBxdyAqIHkgKyBxeiAqIHggLSBxeCAqIHosXG4gICAgICAgIGl6ID0gcXcgKiB6ICsgcXggKiB5IC0gcXkgKiB4LFxuICAgICAgICBpdyA9IC1xeCAqIHggLSBxeSAqIHkgLSBxeiAqIHo7XG5cbiAgICAvLyBjYWxjdWxhdGUgcmVzdWx0ICogaW52ZXJzZSBxdWF0XG4gICAgb3V0WzBdID0gaXggKiBxdyArIGl3ICogLXF4ICsgaXkgKiAtcXogLSBpeiAqIC1xeTtcbiAgICBvdXRbMV0gPSBpeSAqIHF3ICsgaXcgKiAtcXkgKyBpeiAqIC1xeCAtIGl4ICogLXF6O1xuICAgIG91dFsyXSA9IGl6ICogcXcgKyBpdyAqIC1xeiArIGl4ICogLXF5IC0gaXkgKiAtcXg7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUGVyZm9ybSBzb21lIG9wZXJhdGlvbiBvdmVyIGFuIGFycmF5IG9mIHZlYzNzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGEgdGhlIGFycmF5IG9mIHZlY3RvcnMgdG8gaXRlcmF0ZSBvdmVyXG4gKiBAcGFyYW0ge051bWJlcn0gc3RyaWRlIE51bWJlciBvZiBlbGVtZW50cyBiZXR3ZWVuIHRoZSBzdGFydCBvZiBlYWNoIHZlYzMuIElmIDAgYXNzdW1lcyB0aWdodGx5IHBhY2tlZFxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBOdW1iZXIgb2YgZWxlbWVudHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50IE51bWJlciBvZiB2ZWMzcyB0byBpdGVyYXRlIG92ZXIuIElmIDAgaXRlcmF0ZXMgb3ZlciBlbnRpcmUgYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIEZ1bmN0aW9uIHRvIGNhbGwgZm9yIGVhY2ggdmVjdG9yIGluIHRoZSBhcnJheVxuICogQHBhcmFtIHtPYmplY3R9IFthcmddIGFkZGl0aW9uYWwgYXJndW1lbnQgdG8gcGFzcyB0byBmblxuICogQHJldHVybnMge0FycmF5fSBhXG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5mb3JFYWNoID0gKGZ1bmN0aW9uKCkge1xuICAgIHZhciB2ZWMgPSB2ZWMzLmNyZWF0ZSgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGEsIHN0cmlkZSwgb2Zmc2V0LCBjb3VudCwgZm4sIGFyZykge1xuICAgICAgICB2YXIgaSwgbDtcbiAgICAgICAgaWYoIXN0cmlkZSkge1xuICAgICAgICAgICAgc3RyaWRlID0gMztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFvZmZzZXQpIHtcbiAgICAgICAgICAgIG9mZnNldCA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKGNvdW50KSB7XG4gICAgICAgICAgICBsID0gTWF0aC5taW4oKGNvdW50ICogc3RyaWRlKSArIG9mZnNldCwgYS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbCA9IGEubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yKGkgPSBvZmZzZXQ7IGkgPCBsOyBpICs9IHN0cmlkZSkge1xuICAgICAgICAgICAgdmVjWzBdID0gYVtpXTsgdmVjWzFdID0gYVtpKzFdOyB2ZWNbMl0gPSBhW2krMl07XG4gICAgICAgICAgICBmbih2ZWMsIHZlYywgYXJnKTtcbiAgICAgICAgICAgIGFbaV0gPSB2ZWNbMF07IGFbaSsxXSA9IHZlY1sxXTsgYVtpKzJdID0gdmVjWzJdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYTtcbiAgICB9O1xufSkoKTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMzfSB2ZWMgdmVjdG9yIHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB2ZWN0b3JcbiAqL1xudmVjMy5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAndmVjMygnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnKSc7XG59O1xuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy52ZWMzID0gdmVjMztcbn1cbjtcbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDQgRGltZW5zaW9uYWwgVmVjdG9yXG4gKiBAbmFtZSB2ZWM0XG4gKi9cblxudmFyIHZlYzQgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3LCBlbXB0eSB2ZWM0XG4gKlxuICogQHJldHVybnMge3ZlYzR9IGEgbmV3IDREIHZlY3RvclxuICovXG52ZWM0LmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSg0KTtcbiAgICBvdXRbMF0gPSAwO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjNCBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjNH0gYSB2ZWN0b3IgdG8gY2xvbmVcbiAqIEByZXR1cm5zIHt2ZWM0fSBhIG5ldyA0RCB2ZWN0b3JcbiAqL1xudmVjNC5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzQgaW5pdGlhbGl6ZWQgd2l0aCB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geiBaIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHcgVyBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWM0fSBhIG5ldyA0RCB2ZWN0b3JcbiAqL1xudmVjNC5mcm9tVmFsdWVzID0gZnVuY3Rpb24oeCwgeSwgeiwgdykge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSg0KTtcbiAgICBvdXRbMF0gPSB4O1xuICAgIG91dFsxXSA9IHk7XG4gICAgb3V0WzJdID0gejtcbiAgICBvdXRbM10gPSB3O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSB2ZWM0IHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBzb3VyY2UgdmVjdG9yXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IHRoZSBjb21wb25lbnRzIG9mIGEgdmVjNCB0byB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB3IFcgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQuc2V0ID0gZnVuY3Rpb24ob3V0LCB4LCB5LCB6LCB3KSB7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIG91dFsyXSA9IHo7XG4gICAgb3V0WzNdID0gdztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBZGRzIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQuYWRkID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSArIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSArIGJbMl07XG4gICAgb3V0WzNdID0gYVszXSArIGJbM107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU3VidHJhY3RzIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQuc3VidHJhY3QgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC0gYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdIC0gYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdIC0gYlsyXTtcbiAgICBvdXRbM10gPSBhWzNdIC0gYlszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQuc3VidHJhY3R9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5zdWIgPSB2ZWM0LnN1YnRyYWN0O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIHZlYzQnc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjNH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5tdWx0aXBseSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gKiBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gKiBiWzJdO1xuICAgIG91dFszXSA9IGFbM10gKiBiWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjNC5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWM0Lm11bCA9IHZlYzQubXVsdGlwbHk7XG5cbi8qKlxuICogRGl2aWRlcyB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LmRpdmlkZSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gLyBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gLyBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gLyBiWzJdO1xuICAgIG91dFszXSA9IGFbM10gLyBiWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjNC5kaXZpZGV9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5kaXYgPSB2ZWM0LmRpdmlkZTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtaW5pbXVtIG9mIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQubWluID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5taW4oYVswXSwgYlswXSk7XG4gICAgb3V0WzFdID0gTWF0aC5taW4oYVsxXSwgYlsxXSk7XG4gICAgb3V0WzJdID0gTWF0aC5taW4oYVsyXSwgYlsyXSk7XG4gICAgb3V0WzNdID0gTWF0aC5taW4oYVszXSwgYlszXSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF4aW11bSBvZiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0Lm1heCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWF4KGFbMF0sIGJbMF0pO1xuICAgIG91dFsxXSA9IE1hdGgubWF4KGFbMV0sIGJbMV0pO1xuICAgIG91dFsyXSA9IE1hdGgubWF4KGFbMl0sIGJbMl0pO1xuICAgIG91dFszXSA9IE1hdGgubWF4KGFbM10sIGJbM10pO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyBhIHZlYzQgYnkgYSBzY2FsYXIgbnVtYmVyXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgdmVjdG9yIHRvIHNjYWxlXG4gKiBAcGFyYW0ge051bWJlcn0gYiBhbW91bnQgdG8gc2NhbGUgdGhlIHZlY3RvciBieVxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGI7XG4gICAgb3V0WzFdID0gYVsxXSAqIGI7XG4gICAgb3V0WzJdID0gYVsyXSAqIGI7XG4gICAgb3V0WzNdID0gYVszXSAqIGI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZXVjbGlkaWFuIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlYzQnc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbnZlYzQuZGlzdGFuY2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgdmFyIHggPSBiWzBdIC0gYVswXSxcbiAgICAgICAgeSA9IGJbMV0gLSBhWzFdLFxuICAgICAgICB6ID0gYlsyXSAtIGFbMl0sXG4gICAgICAgIHcgPSBiWzNdIC0gYVszXTtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSArIHoqeiArIHcqdyk7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjNC5kaXN0YW5jZX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWM0LmRpc3QgPSB2ZWM0LmRpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgZXVjbGlkaWFuIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlYzQnc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjNC5zcXVhcmVkRGlzdGFuY2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgdmFyIHggPSBiWzBdIC0gYVswXSxcbiAgICAgICAgeSA9IGJbMV0gLSBhWzFdLFxuICAgICAgICB6ID0gYlsyXSAtIGFbMl0sXG4gICAgICAgIHcgPSBiWzNdIC0gYVszXTtcbiAgICByZXR1cm4geCp4ICsgeSp5ICsgeip6ICsgdyp3O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQuc3F1YXJlZERpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzQuc3FyRGlzdCA9IHZlYzQuc3F1YXJlZERpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHZlYzRcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKi9cbnZlYzQubGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXSxcbiAgICAgICAgdyA9IGFbM107XG4gICAgcmV0dXJuIE1hdGguc3FydCh4KnggKyB5KnkgKyB6KnogKyB3KncpO1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQubGVuZ3RofVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzQubGVuID0gdmVjNC5sZW5ndGg7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBsZW5ndGggb2YgYSB2ZWM0XG4gKlxuICogQHBhcmFtIHt2ZWM0fSBhIHZlY3RvciB0byBjYWxjdWxhdGUgc3F1YXJlZCBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgbGVuZ3RoIG9mIGFcbiAqL1xudmVjNC5zcXVhcmVkTGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXSxcbiAgICAgICAgdyA9IGFbM107XG4gICAgcmV0dXJuIHgqeCArIHkqeSArIHoqeiArIHcqdztcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWM0LnNxdWFyZWRMZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5zcXJMZW4gPSB2ZWM0LnNxdWFyZWRMZW5ndGg7XG5cbi8qKlxuICogTmVnYXRlcyB0aGUgY29tcG9uZW50cyBvZiBhIHZlYzRcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHZlY3RvciB0byBuZWdhdGVcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5uZWdhdGUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSAtYVswXTtcbiAgICBvdXRbMV0gPSAtYVsxXTtcbiAgICBvdXRbMl0gPSAtYVsyXTtcbiAgICBvdXRbM10gPSAtYVszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgYSB2ZWM0XG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB2ZWN0b3IgdG8gbm9ybWFsaXplXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQubm9ybWFsaXplID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl0sXG4gICAgICAgIHcgPSBhWzNdO1xuICAgIHZhciBsZW4gPSB4KnggKyB5KnkgKyB6KnogKyB3Knc7XG4gICAgaWYgKGxlbiA+IDApIHtcbiAgICAgICAgbGVuID0gMSAvIE1hdGguc3FydChsZW4pO1xuICAgICAgICBvdXRbMF0gPSBhWzBdICogbGVuO1xuICAgICAgICBvdXRbMV0gPSBhWzFdICogbGVuO1xuICAgICAgICBvdXRbMl0gPSBhWzJdICogbGVuO1xuICAgICAgICBvdXRbM10gPSBhWzNdICogbGVuO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkb3QgcHJvZHVjdCBvZiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkb3QgcHJvZHVjdCBvZiBhIGFuZCBiXG4gKi9cbnZlYzQuZG90ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXSArIGFbMl0gKiBiWzJdICsgYVszXSAqIGJbM107XG59O1xuXG4vKipcbiAqIFBlcmZvcm1zIGEgbGluZWFyIGludGVycG9sYXRpb24gYmV0d2VlbiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHQgaW50ZXJwb2xhdGlvbiBhbW91bnQgYmV0d2VlbiB0aGUgdHdvIGlucHV0c1xuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LmxlcnAgPSBmdW5jdGlvbiAob3V0LCBhLCBiLCB0KSB7XG4gICAgdmFyIGF4ID0gYVswXSxcbiAgICAgICAgYXkgPSBhWzFdLFxuICAgICAgICBheiA9IGFbMl0sXG4gICAgICAgIGF3ID0gYVszXTtcbiAgICBvdXRbMF0gPSBheCArIHQgKiAoYlswXSAtIGF4KTtcbiAgICBvdXRbMV0gPSBheSArIHQgKiAoYlsxXSAtIGF5KTtcbiAgICBvdXRbMl0gPSBheiArIHQgKiAoYlsyXSAtIGF6KTtcbiAgICBvdXRbM10gPSBhdyArIHQgKiAoYlszXSAtIGF3KTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWM0IHdpdGggYSBtYXQ0LlxuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7bWF0NH0gbSBtYXRyaXggdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC50cmFuc2Zvcm1NYXQ0ID0gZnVuY3Rpb24ob3V0LCBhLCBtKSB7XG4gICAgdmFyIHggPSBhWzBdLCB5ID0gYVsxXSwgeiA9IGFbMl0sIHcgPSBhWzNdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVs0XSAqIHkgKyBtWzhdICogeiArIG1bMTJdICogdztcbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bNV0gKiB5ICsgbVs5XSAqIHogKyBtWzEzXSAqIHc7XG4gICAgb3V0WzJdID0gbVsyXSAqIHggKyBtWzZdICogeSArIG1bMTBdICogeiArIG1bMTRdICogdztcbiAgICBvdXRbM10gPSBtWzNdICogeCArIG1bN10gKiB5ICsgbVsxMV0gKiB6ICsgbVsxNV0gKiB3O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzQgd2l0aCBhIHF1YXRcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge3F1YXR9IHEgcXVhdGVybmlvbiB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LnRyYW5zZm9ybVF1YXQgPSBmdW5jdGlvbihvdXQsIGEsIHEpIHtcbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXSxcbiAgICAgICAgcXggPSBxWzBdLCBxeSA9IHFbMV0sIHF6ID0gcVsyXSwgcXcgPSBxWzNdLFxuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSBxdWF0ICogdmVjXG4gICAgICAgIGl4ID0gcXcgKiB4ICsgcXkgKiB6IC0gcXogKiB5LFxuICAgICAgICBpeSA9IHF3ICogeSArIHF6ICogeCAtIHF4ICogeixcbiAgICAgICAgaXogPSBxdyAqIHogKyBxeCAqIHkgLSBxeSAqIHgsXG4gICAgICAgIGl3ID0gLXF4ICogeCAtIHF5ICogeSAtIHF6ICogejtcblxuICAgIC8vIGNhbGN1bGF0ZSByZXN1bHQgKiBpbnZlcnNlIHF1YXRcbiAgICBvdXRbMF0gPSBpeCAqIHF3ICsgaXcgKiAtcXggKyBpeSAqIC1xeiAtIGl6ICogLXF5O1xuICAgIG91dFsxXSA9IGl5ICogcXcgKyBpdyAqIC1xeSArIGl6ICogLXF4IC0gaXggKiAtcXo7XG4gICAgb3V0WzJdID0gaXogKiBxdyArIGl3ICogLXF6ICsgaXggKiAtcXkgLSBpeSAqIC1xeDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBQZXJmb3JtIHNvbWUgb3BlcmF0aW9uIG92ZXIgYW4gYXJyYXkgb2YgdmVjNHMuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYSB0aGUgYXJyYXkgb2YgdmVjdG9ycyB0byBpdGVyYXRlIG92ZXJcbiAqIEBwYXJhbSB7TnVtYmVyfSBzdHJpZGUgTnVtYmVyIG9mIGVsZW1lbnRzIGJldHdlZW4gdGhlIHN0YXJ0IG9mIGVhY2ggdmVjNC4gSWYgMCBhc3N1bWVzIHRpZ2h0bHkgcGFja2VkXG4gKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IE51bWJlciBvZiBlbGVtZW50cyB0byBza2lwIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGFycmF5XG4gKiBAcGFyYW0ge051bWJlcn0gY291bnQgTnVtYmVyIG9mIHZlYzJzIHRvIGl0ZXJhdGUgb3Zlci4gSWYgMCBpdGVyYXRlcyBvdmVyIGVudGlyZSBhcnJheVxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm4gRnVuY3Rpb24gdG8gY2FsbCBmb3IgZWFjaCB2ZWN0b3IgaW4gdGhlIGFycmF5XG4gKiBAcGFyYW0ge09iamVjdH0gW2FyZ10gYWRkaXRpb25hbCBhcmd1bWVudCB0byBwYXNzIHRvIGZuXG4gKiBAcmV0dXJucyB7QXJyYXl9IGFcbiAqIEBmdW5jdGlvblxuICovXG52ZWM0LmZvckVhY2ggPSAoZnVuY3Rpb24oKSB7XG4gICAgdmFyIHZlYyA9IHZlYzQuY3JlYXRlKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oYSwgc3RyaWRlLCBvZmZzZXQsIGNvdW50LCBmbiwgYXJnKSB7XG4gICAgICAgIHZhciBpLCBsO1xuICAgICAgICBpZighc3RyaWRlKSB7XG4gICAgICAgICAgICBzdHJpZGUgPSA0O1xuICAgICAgICB9XG5cbiAgICAgICAgaWYoIW9mZnNldCkge1xuICAgICAgICAgICAgb2Zmc2V0ID0gMDtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYoY291bnQpIHtcbiAgICAgICAgICAgIGwgPSBNYXRoLm1pbigoY291bnQgKiBzdHJpZGUpICsgb2Zmc2V0LCBhLmxlbmd0aCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsID0gYS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IoaSA9IG9mZnNldDsgaSA8IGw7IGkgKz0gc3RyaWRlKSB7XG4gICAgICAgICAgICB2ZWNbMF0gPSBhW2ldOyB2ZWNbMV0gPSBhW2krMV07IHZlY1syXSA9IGFbaSsyXTsgdmVjWzNdID0gYVtpKzNdO1xuICAgICAgICAgICAgZm4odmVjLCB2ZWMsIGFyZyk7XG4gICAgICAgICAgICBhW2ldID0gdmVjWzBdOyBhW2krMV0gPSB2ZWNbMV07IGFbaSsyXSA9IHZlY1syXTsgYVtpKzNdID0gdmVjWzNdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYTtcbiAgICB9O1xufSkoKTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWM0fSB2ZWMgdmVjdG9yIHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB2ZWN0b3JcbiAqL1xudmVjNC5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAndmVjNCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgYVszXSArICcpJztcbn07XG5cbmlmKHR5cGVvZihleHBvcnRzKSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBleHBvcnRzLnZlYzQgPSB2ZWM0O1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgMngyIE1hdHJpeFxuICogQG5hbWUgbWF0MlxuICovXG5cbnZhciBtYXQyID0ge307XG5cbnZhciBtYXQySWRlbnRpdHkgPSBuZXcgRmxvYXQzMkFycmF5KFtcbiAgICAxLCAwLFxuICAgIDAsIDFcbl0pO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgaWRlbnRpdHkgbWF0MlxuICpcbiAqIEByZXR1cm5zIHttYXQyfSBhIG5ldyAyeDIgbWF0cml4XG4gKi9cbm1hdDIuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDQpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBtYXQyIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQyfSBhIG1hdHJpeCB0byBjbG9uZVxuICogQHJldHVybnMge21hdDJ9IGEgbmV3IDJ4MiBtYXRyaXhcbiAqL1xubWF0Mi5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgbWF0MiB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHttYXQyfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDJ9IG91dFxuICovXG5tYXQyLmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCBhIG1hdDIgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0Mn0gb3V0XG4gKi9cbm1hdDIuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zcG9zZSB0aGUgdmFsdWVzIG9mIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi50cmFuc3Bvc2UgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICAvLyBJZiB3ZSBhcmUgdHJhbnNwb3Npbmcgb3Vyc2VsdmVzIHdlIGNhbiBza2lwIGEgZmV3IHN0ZXBzIGJ1dCBoYXZlIHRvIGNhY2hlIHNvbWUgdmFsdWVzXG4gICAgaWYgKG91dCA9PT0gYSkge1xuICAgICAgICB2YXIgYTEgPSBhWzFdO1xuICAgICAgICBvdXRbMV0gPSBhWzJdO1xuICAgICAgICBvdXRbMl0gPSBhMTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXRbMF0gPSBhWzBdO1xuICAgICAgICBvdXRbMV0gPSBhWzJdO1xuICAgICAgICBvdXRbMl0gPSBhWzFdO1xuICAgICAgICBvdXRbM10gPSBhWzNdO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5pbnZlcnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYTAgKiBhMyAtIGEyICogYTE7XG5cbiAgICBpZiAoIWRldCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuICAgIFxuICAgIG91dFswXSA9ICBhMyAqIGRldDtcbiAgICBvdXRbMV0gPSAtYTEgKiBkZXQ7XG4gICAgb3V0WzJdID0gLWEyICogZGV0O1xuICAgIG91dFszXSA9ICBhMCAqIGRldDtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5hZGpvaW50ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgLy8gQ2FjaGluZyB0aGlzIHZhbHVlIGlzIG5lc3NlY2FyeSBpZiBvdXQgPT0gYVxuICAgIHZhciBhMCA9IGFbMF07XG4gICAgb3V0WzBdID0gIGFbM107XG4gICAgb3V0WzFdID0gLWFbMV07XG4gICAgb3V0WzJdID0gLWFbMl07XG4gICAgb3V0WzNdID0gIGEwO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQyXG4gKlxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkZXRlcm1pbmFudCBvZiBhXG4gKi9cbm1hdDIuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiBhWzBdICogYVszXSAtIGFbMl0gKiBhWzFdO1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQyJ3NcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0Mn0gb3V0XG4gKi9cbm1hdDIubXVsdGlwbHkgPSBmdW5jdGlvbiAob3V0LCBhLCBiKSB7XG4gICAgdmFyIGEwID0gYVswXSwgYTEgPSBhWzFdLCBhMiA9IGFbMl0sIGEzID0gYVszXTtcbiAgICB2YXIgYjAgPSBiWzBdLCBiMSA9IGJbMV0sIGIyID0gYlsyXSwgYjMgPSBiWzNdO1xuICAgIG91dFswXSA9IGEwICogYjAgKyBhMSAqIGIyO1xuICAgIG91dFsxXSA9IGEwICogYjEgKyBhMSAqIGIzO1xuICAgIG91dFsyXSA9IGEyICogYjAgKyBhMyAqIGIyO1xuICAgIG91dFszXSA9IGEyICogYjEgKyBhMyAqIGIzO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0Mi5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQyLm11bCA9IG1hdDIubXVsdGlwbHk7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDIgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQyfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5yb3RhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuICAgICAgICBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgb3V0WzBdID0gYTAgKiAgYyArIGExICogcztcbiAgICBvdXRbMV0gPSBhMCAqIC1zICsgYTEgKiBjO1xuICAgIG91dFsyXSA9IGEyICogIGMgKyBhMyAqIHM7XG4gICAgb3V0WzNdID0gYTIgKiAtcyArIGEzICogYztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDIgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzJcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge3ZlYzJ9IHYgdGhlIHZlYzIgdG8gc2NhbGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDJ9IG91dFxuICoqL1xubWF0Mi5zY2FsZSA9IGZ1bmN0aW9uKG91dCwgYSwgdikge1xuICAgIHZhciBhMCA9IGFbMF0sIGExID0gYVsxXSwgYTIgPSBhWzJdLCBhMyA9IGFbM10sXG4gICAgICAgIHYwID0gdlswXSwgdjEgPSB2WzFdO1xuICAgIG91dFswXSA9IGEwICogdjA7XG4gICAgb3V0WzFdID0gYTEgKiB2MTtcbiAgICBvdXRbMl0gPSBhMiAqIHYwO1xuICAgIG91dFszXSA9IGEzICogdjE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDJcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5tYXQyLnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQyKCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBhWzNdICsgJyknO1xufTtcblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMubWF0MiA9IG1hdDI7XG59XG47XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyAyeDMgTWF0cml4XG4gKiBAbmFtZSBtYXQyZFxuICogXG4gKiBAZGVzY3JpcHRpb24gXG4gKiBBIG1hdDJkIGNvbnRhaW5zIHNpeCBlbGVtZW50cyBkZWZpbmVkIGFzOlxuICogPHByZT5cbiAqIFthLCBiLFxuICogIGMsIGQsXG4gKiAgdHgsdHldXG4gKiA8L3ByZT5cbiAqIFRoaXMgaXMgYSBzaG9ydCBmb3JtIGZvciB0aGUgM3gzIG1hdHJpeDpcbiAqIDxwcmU+XG4gKiBbYSwgYiwgMFxuICogIGMsIGQsIDBcbiAqICB0eCx0eSwxXVxuICogPC9wcmU+XG4gKiBUaGUgbGFzdCBjb2x1bW4gaXMgaWdub3JlZCBzbyB0aGUgYXJyYXkgaXMgc2hvcnRlciBhbmQgb3BlcmF0aW9ucyBhcmUgZmFzdGVyLlxuICovXG5cbnZhciBtYXQyZCA9IHt9O1xuXG52YXIgbWF0MmRJZGVudGl0eSA9IG5ldyBGbG9hdDMyQXJyYXkoW1xuICAgIDEsIDAsXG4gICAgMCwgMSxcbiAgICAwLCAwXG5dKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDJkXG4gKlxuICogQHJldHVybnMge21hdDJkfSBhIG5ldyAyeDMgbWF0cml4XG4gKi9cbm1hdDJkLmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSg2KTtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAxO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IG1hdDJkIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQyZH0gYSBtYXRyaXggdG8gY2xvbmVcbiAqIEByZXR1cm5zIHttYXQyZH0gYSBuZXcgMngzIG1hdHJpeFxuICovXG5tYXQyZC5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNik7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIG1hdDJkIHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyZH0gb3V0XG4gKi9cbm1hdDJkLmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIG91dFs0XSA9IGFbNF07XG4gICAgb3V0WzVdID0gYVs1XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTZXQgYSBtYXQyZCB0byB0aGUgaWRlbnRpdHkgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQyZH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICovXG5tYXQyZC5pZGVudGl0eSA9IGZ1bmN0aW9uKG91dCkge1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDE7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEludmVydHMgYSBtYXQyZFxuICpcbiAqIEBwYXJhbSB7bWF0MmR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyZH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDJkfSBvdXRcbiAqL1xubWF0MmQuaW52ZXJ0ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGFhID0gYVswXSwgYWIgPSBhWzFdLCBhYyA9IGFbMl0sIGFkID0gYVszXSxcbiAgICAgICAgYXR4ID0gYVs0XSwgYXR5ID0gYVs1XTtcblxuICAgIHZhciBkZXQgPSBhYSAqIGFkIC0gYWIgKiBhYztcbiAgICBpZighZGV0KXtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGRldCA9IDEuMCAvIGRldDtcblxuICAgIG91dFswXSA9IGFkICogZGV0O1xuICAgIG91dFsxXSA9IC1hYiAqIGRldDtcbiAgICBvdXRbMl0gPSAtYWMgKiBkZXQ7XG4gICAgb3V0WzNdID0gYWEgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGFjICogYXR5IC0gYWQgKiBhdHgpICogZGV0O1xuICAgIG91dFs1XSA9IChhYiAqIGF0eCAtIGFhICogYXR5KSAqIGRldDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDJkXG4gKlxuICogQHBhcmFtIHttYXQyZH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge051bWJlcn0gZGV0ZXJtaW5hbnQgb2YgYVxuICovXG5tYXQyZC5kZXRlcm1pbmFudCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuIGFbMF0gKiBhWzNdIC0gYVsxXSAqIGFbMl07XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIG1hdDJkJ3NcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7bWF0MmR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICovXG5tYXQyZC5tdWx0aXBseSA9IGZ1bmN0aW9uIChvdXQsIGEsIGIpIHtcbiAgICB2YXIgYWEgPSBhWzBdLCBhYiA9IGFbMV0sIGFjID0gYVsyXSwgYWQgPSBhWzNdLFxuICAgICAgICBhdHggPSBhWzRdLCBhdHkgPSBhWzVdLFxuICAgICAgICBiYSA9IGJbMF0sIGJiID0gYlsxXSwgYmMgPSBiWzJdLCBiZCA9IGJbM10sXG4gICAgICAgIGJ0eCA9IGJbNF0sIGJ0eSA9IGJbNV07XG5cbiAgICBvdXRbMF0gPSBhYSpiYSArIGFiKmJjO1xuICAgIG91dFsxXSA9IGFhKmJiICsgYWIqYmQ7XG4gICAgb3V0WzJdID0gYWMqYmEgKyBhZCpiYztcbiAgICBvdXRbM10gPSBhYypiYiArIGFkKmJkO1xuICAgIG91dFs0XSA9IGJhKmF0eCArIGJjKmF0eSArIGJ0eDtcbiAgICBvdXRbNV0gPSBiYiphdHggKyBiZCphdHkgKyBidHk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBtYXQyZC5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQyZC5tdWwgPSBtYXQyZC5tdWx0aXBseTtcblxuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXQyZCBieSB0aGUgZ2l2ZW4gYW5nbGVcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICovXG5tYXQyZC5yb3RhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgYWEgPSBhWzBdLFxuICAgICAgICBhYiA9IGFbMV0sXG4gICAgICAgIGFjID0gYVsyXSxcbiAgICAgICAgYWQgPSBhWzNdLFxuICAgICAgICBhdHggPSBhWzRdLFxuICAgICAgICBhdHkgPSBhWzVdLFxuICAgICAgICBzdCA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGN0ID0gTWF0aC5jb3MocmFkKTtcblxuICAgIG91dFswXSA9IGFhKmN0ICsgYWIqc3Q7XG4gICAgb3V0WzFdID0gLWFhKnN0ICsgYWIqY3Q7XG4gICAgb3V0WzJdID0gYWMqY3QgKyBhZCpzdDtcbiAgICBvdXRbM10gPSAtYWMqc3QgKyBjdCphZDtcbiAgICBvdXRbNF0gPSBjdCphdHggKyBzdCphdHk7XG4gICAgb3V0WzVdID0gY3QqYXR5IC0gc3QqYXR4O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0MmQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzJcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7bWF0MmR9IHYgdGhlIHZlYzIgdG8gc2NhbGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDJkfSBvdXRcbiAqKi9cbm1hdDJkLnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgdmFyIHZ4ID0gdlswXSwgdnkgPSB2WzFdO1xuICAgIG91dFswXSA9IGFbMF0gKiB2eDtcbiAgICBvdXRbMV0gPSBhWzFdICogdnk7XG4gICAgb3V0WzJdID0gYVsyXSAqIHZ4O1xuICAgIG91dFszXSA9IGFbM10gKiB2eTtcbiAgICBvdXRbNF0gPSBhWzRdICogdng7XG4gICAgb3V0WzVdID0gYVs1XSAqIHZ5O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zbGF0ZXMgdGhlIG1hdDJkIGJ5IHRoZSBkaW1lbnNpb25zIGluIHRoZSBnaXZlbiB2ZWMyXG4gKlxuICogQHBhcmFtIHttYXQyZH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBtYXRyaXggdG8gdHJhbnNsYXRlXG4gKiBAcGFyYW0ge21hdDJkfSB2IHRoZSB2ZWMyIHRvIHRyYW5zbGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICoqL1xubWF0MmQudHJhbnNsYXRlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdICsgdlswXTtcbiAgICBvdXRbNV0gPSBhWzVdICsgdlsxXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgbWF0MmRcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBhIG1hdHJpeCB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgbWF0cml4XG4gKi9cbm1hdDJkLnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQyZCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgXG4gICAgICAgICAgICAgICAgICAgIGFbM10gKyAnLCAnICsgYVs0XSArICcsICcgKyBhWzVdICsgJyknO1xufTtcblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMubWF0MmQgPSBtYXQyZDtcbn1cbjtcbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDN4MyBNYXRyaXhcbiAqIEBuYW1lIG1hdDNcbiAqL1xuXG52YXIgbWF0MyA9IHt9O1xuXG52YXIgbWF0M0lkZW50aXR5ID0gbmV3IEZsb2F0MzJBcnJheShbXG4gICAgMSwgMCwgMCxcbiAgICAwLCAxLCAwLFxuICAgIDAsIDAsIDFcbl0pO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgaWRlbnRpdHkgbWF0M1xuICpcbiAqIEByZXR1cm5zIHttYXQzfSBhIG5ldyAzeDMgbWF0cml4XG4gKi9cbm1hdDMuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDkpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMTtcbiAgICBvdXRbNV0gPSAwO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgbWF0MyBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0M30gYSBtYXRyaXggdG8gY2xvbmVcbiAqIEByZXR1cm5zIHttYXQzfSBhIG5ldyAzeDMgbWF0cml4XG4gKi9cbm1hdDMuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDkpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQzIHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCBhIG1hdDMgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDE7XG4gICAgb3V0WzVdID0gMDtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc3Bvc2UgdGhlIHZhbHVlcyBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMudHJhbnNwb3NlID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGExMiA9IGFbNV07XG4gICAgICAgIG91dFsxXSA9IGFbM107XG4gICAgICAgIG91dFsyXSA9IGFbNl07XG4gICAgICAgIG91dFszXSA9IGEwMTtcbiAgICAgICAgb3V0WzVdID0gYVs3XTtcbiAgICAgICAgb3V0WzZdID0gYTAyO1xuICAgICAgICBvdXRbN10gPSBhMTI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVszXTtcbiAgICAgICAgb3V0WzJdID0gYVs2XTtcbiAgICAgICAgb3V0WzNdID0gYVsxXTtcbiAgICAgICAgb3V0WzRdID0gYVs0XTtcbiAgICAgICAgb3V0WzVdID0gYVs3XTtcbiAgICAgICAgb3V0WzZdID0gYVsyXTtcbiAgICAgICAgb3V0WzddID0gYVs1XTtcbiAgICAgICAgb3V0WzhdID0gYVs4XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuaW52ZXJ0ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF0sXG5cbiAgICAgICAgYjAxID0gYTIyICogYTExIC0gYTEyICogYTIxLFxuICAgICAgICBiMTEgPSAtYTIyICogYTEwICsgYTEyICogYTIwLFxuICAgICAgICBiMjEgPSBhMjEgKiBhMTAgLSBhMTEgKiBhMjAsXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgICAgICBkZXQgPSBhMDAgKiBiMDEgKyBhMDEgKiBiMTEgKyBhMDIgKiBiMjE7XG5cbiAgICBpZiAoIWRldCkgeyBcbiAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSBiMDEgKiBkZXQ7XG4gICAgb3V0WzFdID0gKC1hMjIgKiBhMDEgKyBhMDIgKiBhMjEpICogZGV0O1xuICAgIG91dFsyXSA9IChhMTIgKiBhMDEgLSBhMDIgKiBhMTEpICogZGV0O1xuICAgIG91dFszXSA9IGIxMSAqIGRldDtcbiAgICBvdXRbNF0gPSAoYTIyICogYTAwIC0gYTAyICogYTIwKSAqIGRldDtcbiAgICBvdXRbNV0gPSAoLWExMiAqIGEwMCArIGEwMiAqIGExMCkgKiBkZXQ7XG4gICAgb3V0WzZdID0gYjIxICogZGV0O1xuICAgIG91dFs3XSA9ICgtYTIxICogYTAwICsgYTAxICogYTIwKSAqIGRldDtcbiAgICBvdXRbOF0gPSAoYTExICogYTAwIC0gYTAxICogYTEwKSAqIGRldDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBhZGp1Z2F0ZSBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuYWRqb2ludCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdO1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGEyMiAtIGExMiAqIGEyMSk7XG4gICAgb3V0WzFdID0gKGEwMiAqIGEyMSAtIGEwMSAqIGEyMik7XG4gICAgb3V0WzJdID0gKGEwMSAqIGExMiAtIGEwMiAqIGExMSk7XG4gICAgb3V0WzNdID0gKGExMiAqIGEyMCAtIGExMCAqIGEyMik7XG4gICAgb3V0WzRdID0gKGEwMCAqIGEyMiAtIGEwMiAqIGEyMCk7XG4gICAgb3V0WzVdID0gKGEwMiAqIGExMCAtIGEwMCAqIGExMik7XG4gICAgb3V0WzZdID0gKGExMCAqIGEyMSAtIGExMSAqIGEyMCk7XG4gICAgb3V0WzddID0gKGEwMSAqIGEyMCAtIGEwMCAqIGEyMSk7XG4gICAgb3V0WzhdID0gKGEwMCAqIGExMSAtIGEwMSAqIGExMCk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQzXG4gKlxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkZXRlcm1pbmFudCBvZiBhXG4gKi9cbm1hdDMuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdO1xuXG4gICAgcmV0dXJuIGEwMCAqIChhMjIgKiBhMTEgLSBhMTIgKiBhMjEpICsgYTAxICogKC1hMjIgKiBhMTAgKyBhMTIgKiBhMjApICsgYTAyICogKGEyMSAqIGExMCAtIGExMSAqIGEyMCk7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIG1hdDMnc1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7bWF0M30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5tdWx0aXBseSA9IGZ1bmN0aW9uIChvdXQsIGEsIGIpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcblxuICAgICAgICBiMDAgPSBiWzBdLCBiMDEgPSBiWzFdLCBiMDIgPSBiWzJdLFxuICAgICAgICBiMTAgPSBiWzNdLCBiMTEgPSBiWzRdLCBiMTIgPSBiWzVdLFxuICAgICAgICBiMjAgPSBiWzZdLCBiMjEgPSBiWzddLCBiMjIgPSBiWzhdO1xuXG4gICAgb3V0WzBdID0gYjAwICogYTAwICsgYjAxICogYTEwICsgYjAyICogYTIwO1xuICAgIG91dFsxXSA9IGIwMCAqIGEwMSArIGIwMSAqIGExMSArIGIwMiAqIGEyMTtcbiAgICBvdXRbMl0gPSBiMDAgKiBhMDIgKyBiMDEgKiBhMTIgKyBiMDIgKiBhMjI7XG5cbiAgICBvdXRbM10gPSBiMTAgKiBhMDAgKyBiMTEgKiBhMTAgKyBiMTIgKiBhMjA7XG4gICAgb3V0WzRdID0gYjEwICogYTAxICsgYjExICogYTExICsgYjEyICogYTIxO1xuICAgIG91dFs1XSA9IGIxMCAqIGEwMiArIGIxMSAqIGExMiArIGIxMiAqIGEyMjtcblxuICAgIG91dFs2XSA9IGIyMCAqIGEwMCArIGIyMSAqIGExMCArIGIyMiAqIGEyMDtcbiAgICBvdXRbN10gPSBiMjAgKiBhMDEgKyBiMjEgKiBhMTEgKyBiMjIgKiBhMjE7XG4gICAgb3V0WzhdID0gYjIwICogYTAyICsgYjIxICogYTEyICsgYjIyICogYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0My5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQzLm11bCA9IG1hdDMubXVsdGlwbHk7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEgbWF0MyBieSB0aGUgZ2l2ZW4gdmVjdG9yXG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0M30gYSB0aGUgbWF0cml4IHRvIHRyYW5zbGF0ZVxuICogQHBhcmFtIHt2ZWMyfSB2IHZlY3RvciB0byB0cmFuc2xhdGUgYnlcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My50cmFuc2xhdGUgPSBmdW5jdGlvbihvdXQsIGEsIHYpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcbiAgICAgICAgeCA9IHZbMF0sIHkgPSB2WzFdO1xuXG4gICAgb3V0WzBdID0gYTAwO1xuICAgIG91dFsxXSA9IGEwMTtcbiAgICBvdXRbMl0gPSBhMDI7XG5cbiAgICBvdXRbM10gPSBhMTA7XG4gICAgb3V0WzRdID0gYTExO1xuICAgIG91dFs1XSA9IGExMjtcblxuICAgIG91dFs2XSA9IHggKiBhMDAgKyB5ICogYTEwICsgYTIwO1xuICAgIG91dFs3XSA9IHggKiBhMDEgKyB5ICogYTExICsgYTIxO1xuICAgIG91dFs4XSA9IHggKiBhMDIgKyB5ICogYTEyICsgYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXQzIGJ5IHRoZSBnaXZlbiBhbmdsZVxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMucm90YXRlID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF0sXG5cbiAgICAgICAgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpO1xuXG4gICAgb3V0WzBdID0gYyAqIGEwMCArIHMgKiBhMTA7XG4gICAgb3V0WzFdID0gYyAqIGEwMSArIHMgKiBhMTE7XG4gICAgb3V0WzJdID0gYyAqIGEwMiArIHMgKiBhMTI7XG5cbiAgICBvdXRbM10gPSBjICogYTEwIC0gcyAqIGEwMDtcbiAgICBvdXRbNF0gPSBjICogYTExIC0gcyAqIGEwMTtcbiAgICBvdXRbNV0gPSBjICogYTEyIC0gcyAqIGEwMjtcblxuICAgIG91dFs2XSA9IGEyMDtcbiAgICBvdXRbN10gPSBhMjE7XG4gICAgb3V0WzhdID0gYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0MyBieSB0aGUgZGltZW5zaW9ucyBpbiB0aGUgZ2l2ZW4gdmVjMlxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7dmVjMn0gdiB0aGUgdmVjMiB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKiovXG5tYXQzLnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgdmFyIHggPSB2WzBdLCB5ID0gdlsyXTtcblxuICAgIG91dFswXSA9IHggKiBhWzBdO1xuICAgIG91dFsxXSA9IHggKiBhWzFdO1xuICAgIG91dFsyXSA9IHggKiBhWzJdO1xuXG4gICAgb3V0WzNdID0geSAqIGFbM107XG4gICAgb3V0WzRdID0geSAqIGFbNF07XG4gICAgb3V0WzVdID0geSAqIGFbNV07XG5cbiAgICBvdXRbNl0gPSBhWzZdO1xuICAgIG91dFs3XSA9IGFbN107XG4gICAgb3V0WzhdID0gYVs4XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3BpZXMgdGhlIHZhbHVlcyBmcm9tIGEgbWF0MmQgaW50byBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge3ZlYzJ9IHYgdGhlIHZlYzIgdG8gc2NhbGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDN9IG91dFxuICoqL1xubWF0My5mcm9tTWF0MmQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gMDtcblxuICAgIG91dFszXSA9IGFbMl07XG4gICAgb3V0WzRdID0gYVszXTtcbiAgICBvdXRbNV0gPSAwO1xuXG4gICAgb3V0WzZdID0gYVs0XTtcbiAgICBvdXRbN10gPSBhWzVdO1xuICAgIG91dFs4XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuKiBDYWxjdWxhdGVzIGEgM3gzIG1hdHJpeCBmcm9tIHRoZSBnaXZlbiBxdWF0ZXJuaW9uXG4qXG4qIEBwYXJhbSB7bWF0M30gb3V0IG1hdDMgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiogQHBhcmFtIHtxdWF0fSBxIFF1YXRlcm5pb24gdG8gY3JlYXRlIG1hdHJpeCBmcm9tXG4qXG4qIEByZXR1cm5zIHttYXQzfSBvdXRcbiovXG5tYXQzLmZyb21RdWF0ID0gZnVuY3Rpb24gKG91dCwgcSkge1xuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeHkgPSB4ICogeTIsXG4gICAgICAgIHh6ID0geCAqIHoyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgeXogPSB5ICogejIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtICh5eSArIHp6KTtcbiAgICBvdXRbMV0gPSB4eSArIHd6O1xuICAgIG91dFsyXSA9IHh6IC0gd3k7XG5cbiAgICBvdXRbM10gPSB4eSAtIHd6O1xuICAgIG91dFs0XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzVdID0geXogKyB3eDtcblxuICAgIG91dFs2XSA9IHh6ICsgd3k7XG4gICAgb3V0WzddID0geXogLSB3eDtcbiAgICBvdXRbOF0gPSAxIC0gKHh4ICsgeXkpO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5tYXQzLnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQzKCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVszXSArICcsICcgKyBhWzRdICsgJywgJyArIGFbNV0gKyAnLCAnICsgXG4gICAgICAgICAgICAgICAgICAgIGFbNl0gKyAnLCAnICsgYVs3XSArICcsICcgKyBhWzhdICsgJyknO1xufTtcblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMubWF0MyA9IG1hdDM7XG59XG47XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyA0eDQgTWF0cml4XG4gKiBAbmFtZSBtYXQ0XG4gKi9cblxudmFyIG1hdDQgPSB7fTtcblxudmFyIG1hdDRJZGVudGl0eSA9IG5ldyBGbG9hdDMyQXJyYXkoW1xuICAgIDEsIDAsIDAsIDAsXG4gICAgMCwgMSwgMCwgMCxcbiAgICAwLCAwLCAxLCAwLFxuICAgIDAsIDAsIDAsIDFcbl0pO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgaWRlbnRpdHkgbWF0NFxuICpcbiAqIEByZXR1cm5zIHttYXQ0fSBhIG5ldyA0eDQgbWF0cml4XG4gKi9cbm1hdDQuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDE2KTtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMTtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAxO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgbWF0NCBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gYSBtYXRyaXggdG8gY2xvbmVcbiAqIEByZXR1cm5zIHttYXQ0fSBhIG5ldyA0eDQgbWF0cml4XG4gKi9cbm1hdDQuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDE2KTtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIG91dFs0XSA9IGFbNF07XG4gICAgb3V0WzVdID0gYVs1XTtcbiAgICBvdXRbNl0gPSBhWzZdO1xuICAgIG91dFs3XSA9IGFbN107XG4gICAgb3V0WzhdID0gYVs4XTtcbiAgICBvdXRbOV0gPSBhWzldO1xuICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQ0IHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIG91dFs5XSA9IGFbOV07XG4gICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IGEgbWF0NCB0byB0aGUgaWRlbnRpdHkgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5pZGVudGl0eSA9IGZ1bmN0aW9uKG91dCkge1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNwb3NlIHRoZSB2YWx1ZXMgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnRyYW5zcG9zZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIC8vIElmIHdlIGFyZSB0cmFuc3Bvc2luZyBvdXJzZWx2ZXMgd2UgY2FuIHNraXAgYSBmZXcgc3RlcHMgYnV0IGhhdmUgdG8gY2FjaGUgc29tZSB2YWx1ZXNcbiAgICBpZiAob3V0ID09PSBhKSB7XG4gICAgICAgIHZhciBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICAgICAgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgICAgIG91dFsxXSA9IGFbNF07XG4gICAgICAgIG91dFsyXSA9IGFbOF07XG4gICAgICAgIG91dFszXSA9IGFbMTJdO1xuICAgICAgICBvdXRbNF0gPSBhMDE7XG4gICAgICAgIG91dFs2XSA9IGFbOV07XG4gICAgICAgIG91dFs3XSA9IGFbMTNdO1xuICAgICAgICBvdXRbOF0gPSBhMDI7XG4gICAgICAgIG91dFs5XSA9IGExMjtcbiAgICAgICAgb3V0WzExXSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTJdID0gYTAzO1xuICAgICAgICBvdXRbMTNdID0gYTEzO1xuICAgICAgICBvdXRbMTRdID0gYTIzO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG91dFswXSA9IGFbMF07XG4gICAgICAgIG91dFsxXSA9IGFbNF07XG4gICAgICAgIG91dFsyXSA9IGFbOF07XG4gICAgICAgIG91dFszXSA9IGFbMTJdO1xuICAgICAgICBvdXRbNF0gPSBhWzFdO1xuICAgICAgICBvdXRbNV0gPSBhWzVdO1xuICAgICAgICBvdXRbNl0gPSBhWzldO1xuICAgICAgICBvdXRbN10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzhdID0gYVsyXTtcbiAgICAgICAgb3V0WzldID0gYVs2XTtcbiAgICAgICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgICAgICBvdXRbMTFdID0gYVsxNF07XG4gICAgICAgIG91dFsxMl0gPSBhWzNdO1xuICAgICAgICBvdXRbMTNdID0gYVs3XTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTFdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuICAgIFxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEludmVydHMgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LmludmVydCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzIsXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgICAgICBkZXQgPSBiMDAgKiBiMTEgLSBiMDEgKiBiMTAgKyBiMDIgKiBiMDkgKyBiMDMgKiBiMDggLSBiMDQgKiBiMDcgKyBiMDUgKiBiMDY7XG5cbiAgICBpZiAoIWRldCkgeyBcbiAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSAoYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5KSAqIGRldDtcbiAgICBvdXRbMV0gPSAoYTAyICogYjEwIC0gYTAxICogYjExIC0gYTAzICogYjA5KSAqIGRldDtcbiAgICBvdXRbMl0gPSAoYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzKSAqIGRldDtcbiAgICBvdXRbM10gPSAoYTIyICogYjA0IC0gYTIxICogYjA1IC0gYTIzICogYjAzKSAqIGRldDtcbiAgICBvdXRbNF0gPSAoYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3KSAqIGRldDtcbiAgICBvdXRbNV0gPSAoYTAwICogYjExIC0gYTAyICogYjA4ICsgYTAzICogYjA3KSAqIGRldDtcbiAgICBvdXRbNl0gPSAoYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxKSAqIGRldDtcbiAgICBvdXRbN10gPSAoYTIwICogYjA1IC0gYTIyICogYjAyICsgYTIzICogYjAxKSAqIGRldDtcbiAgICBvdXRbOF0gPSAoYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2KSAqIGRldDtcbiAgICBvdXRbOV0gPSAoYTAxICogYjA4IC0gYTAwICogYjEwIC0gYTAzICogYjA2KSAqIGRldDtcbiAgICBvdXRbMTBdID0gKGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCkgKiBkZXQ7XG4gICAgb3V0WzExXSA9IChhMjEgKiBiMDIgLSBhMjAgKiBiMDQgLSBhMjMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMl0gPSAoYTExICogYjA3IC0gYTEwICogYjA5IC0gYTEyICogYjA2KSAqIGRldDtcbiAgICBvdXRbMTNdID0gKGEwMCAqIGIwOSAtIGEwMSAqIGIwNyArIGEwMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzE0XSA9IChhMzEgKiBiMDEgLSBhMzAgKiBiMDMgLSBhMzIgKiBiMDApICogZGV0O1xuICAgIG91dFsxNV0gPSAoYTIwICogYjAzIC0gYTIxICogYjAxICsgYTIyICogYjAwKSAqIGRldDtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5hZGpvaW50ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV07XG5cbiAgICBvdXRbMF0gID0gIChhMTEgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMSAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpICsgYTMxICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikpO1xuICAgIG91dFsxXSAgPSAtKGEwMSAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIxICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzEgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSk7XG4gICAgb3V0WzJdICA9ICAoYTAxICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgLSBhMTEgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMSAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbM10gID0gLShhMDEgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSAtIGExMSAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpICsgYTIxICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFs0XSAgPSAtKGExMCAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIwICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgKyBhMzAgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSk7XG4gICAgb3V0WzVdICA9ICAoYTAwICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjAgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMCAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpKTtcbiAgICBvdXRbNl0gID0gLShhMDAgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSAtIGExMCAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMwICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFs3XSAgPSAgKGEwMCAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpIC0gYTEwICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikgKyBhMjAgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzhdICA9ICAoYTEwICogKGEyMSAqIGEzMyAtIGEyMyAqIGEzMSkgLSBhMjAgKiAoYTExICogYTMzIC0gYTEzICogYTMxKSArIGEzMCAqIChhMTEgKiBhMjMgLSBhMTMgKiBhMjEpKTtcbiAgICBvdXRbOV0gID0gLShhMDAgKiAoYTIxICogYTMzIC0gYTIzICogYTMxKSAtIGEyMCAqIChhMDEgKiBhMzMgLSBhMDMgKiBhMzEpICsgYTMwICogKGEwMSAqIGEyMyAtIGEwMyAqIGEyMSkpO1xuICAgIG91dFsxMF0gPSAgKGEwMCAqIChhMTEgKiBhMzMgLSBhMTMgKiBhMzEpIC0gYTEwICogKGEwMSAqIGEzMyAtIGEwMyAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTEzIC0gYTAzICogYTExKSk7XG4gICAgb3V0WzExXSA9IC0oYTAwICogKGExMSAqIGEyMyAtIGExMyAqIGEyMSkgLSBhMTAgKiAoYTAxICogYTIzIC0gYTAzICogYTIxKSArIGEyMCAqIChhMDEgKiBhMTMgLSBhMDMgKiBhMTEpKTtcbiAgICBvdXRbMTJdID0gLShhMTAgKiAoYTIxICogYTMyIC0gYTIyICogYTMxKSAtIGEyMCAqIChhMTEgKiBhMzIgLSBhMTIgKiBhMzEpICsgYTMwICogKGExMSAqIGEyMiAtIGExMiAqIGEyMSkpO1xuICAgIG91dFsxM10gPSAgKGEwMCAqIChhMjEgKiBhMzIgLSBhMjIgKiBhMzEpIC0gYTIwICogKGEwMSAqIGEzMiAtIGEwMiAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTIyIC0gYTAyICogYTIxKSk7XG4gICAgb3V0WzE0XSA9IC0oYTAwICogKGExMSAqIGEzMiAtIGExMiAqIGEzMSkgLSBhMTAgKiAoYTAxICogYTMyIC0gYTAyICogYTMxKSArIGEzMCAqIChhMDEgKiBhMTIgLSBhMDIgKiBhMTEpKTtcbiAgICBvdXRbMTVdID0gIChhMDAgKiAoYTExICogYTIyIC0gYTEyICogYTIxKSAtIGExMCAqIChhMDEgKiBhMjIgLSBhMDIgKiBhMjEpICsgYTIwICogKGEwMSAqIGExMiAtIGEwMiAqIGExMSkpO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRldGVybWluYW50IG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge051bWJlcn0gZGV0ZXJtaW5hbnQgb2YgYVxuICovXG5tYXQ0LmRldGVybWluYW50ID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XSxcblxuICAgICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyO1xuXG4gICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgIHJldHVybiBiMDAgKiBiMTEgLSBiMDEgKiBiMTAgKyBiMDIgKiBiMDkgKyBiMDMgKiBiMDggLSBiMDQgKiBiMDcgKyBiMDUgKiBiMDY7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIG1hdDQnc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7bWF0NH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5tdWx0aXBseSA9IGZ1bmN0aW9uIChvdXQsIGEsIGIpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XTtcblxuICAgIC8vIENhY2hlIG9ubHkgdGhlIGN1cnJlbnQgbGluZSBvZiB0aGUgc2Vjb25kIG1hdHJpeFxuICAgIHZhciBiMCAgPSBiWzBdLCBiMSA9IGJbMV0sIGIyID0gYlsyXSwgYjMgPSBiWzNdOyAgXG4gICAgb3V0WzBdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFsxXSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMl0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzNdID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzRdOyBiMSA9IGJbNV07IGIyID0gYls2XTsgYjMgPSBiWzddO1xuICAgIG91dFs0XSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbNV0gPSBiMCphMDEgKyBiMSphMTEgKyBiMiphMjEgKyBiMyphMzE7XG4gICAgb3V0WzZdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFs3XSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcblxuICAgIGIwID0gYls4XTsgYjEgPSBiWzldOyBiMiA9IGJbMTBdOyBiMyA9IGJbMTFdO1xuICAgIG91dFs4XSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbOV0gPSBiMCphMDEgKyBiMSphMTEgKyBiMiphMjEgKyBiMyphMzE7XG4gICAgb3V0WzEwXSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbMTFdID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzEyXTsgYjEgPSBiWzEzXTsgYjIgPSBiWzE0XTsgYjMgPSBiWzE1XTtcbiAgICBvdXRbMTJdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFsxM10gPSBiMCphMDEgKyBiMSphMTEgKyBiMiphMjEgKyBiMyphMzE7XG4gICAgb3V0WzE0XSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbMTVdID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0NC5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQ0Lm11bCA9IG1hdDQubXVsdGlwbHk7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEgbWF0NCBieSB0aGUgZ2l2ZW4gdmVjdG9yXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHRyYW5zbGF0ZVxuICogQHBhcmFtIHt2ZWMzfSB2IHZlY3RvciB0byB0cmFuc2xhdGUgYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC50cmFuc2xhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCB2KSB7XG4gICAgdmFyIHggPSB2WzBdLCB5ID0gdlsxXSwgeiA9IHZbMl0sXG4gICAgICAgIGEwMCwgYTAxLCBhMDIsIGEwMyxcbiAgICAgICAgYTEwLCBhMTEsIGExMiwgYTEzLFxuICAgICAgICBhMjAsIGEyMSwgYTIyLCBhMjM7XG5cbiAgICBpZiAoYSA9PT0gb3V0KSB7XG4gICAgICAgIG91dFsxMl0gPSBhWzBdICogeCArIGFbNF0gKiB5ICsgYVs4XSAqIHogKyBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMV0gKiB4ICsgYVs1XSAqIHkgKyBhWzldICogeiArIGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsyXSAqIHggKyBhWzZdICogeSArIGFbMTBdICogeiArIGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVszXSAqIHggKyBhWzddICogeSArIGFbMTFdICogeiArIGFbMTVdO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGEwMCA9IGFbMF07IGEwMSA9IGFbMV07IGEwMiA9IGFbMl07IGEwMyA9IGFbM107XG4gICAgICAgIGExMCA9IGFbNF07IGExMSA9IGFbNV07IGExMiA9IGFbNl07IGExMyA9IGFbN107XG4gICAgICAgIGEyMCA9IGFbOF07IGEyMSA9IGFbOV07IGEyMiA9IGFbMTBdOyBhMjMgPSBhWzExXTtcblxuICAgICAgICBvdXRbMF0gPSBhMDA7IG91dFsxXSA9IGEwMTsgb3V0WzJdID0gYTAyOyBvdXRbM10gPSBhMDM7XG4gICAgICAgIG91dFs0XSA9IGExMDsgb3V0WzVdID0gYTExOyBvdXRbNl0gPSBhMTI7IG91dFs3XSA9IGExMztcbiAgICAgICAgb3V0WzhdID0gYTIwOyBvdXRbOV0gPSBhMjE7IG91dFsxMF0gPSBhMjI7IG91dFsxMV0gPSBhMjM7XG5cbiAgICAgICAgb3V0WzEyXSA9IGEwMCAqIHggKyBhMTAgKiB5ICsgYTIwICogeiArIGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYTAxICogeCArIGExMSAqIHkgKyBhMjEgKiB6ICsgYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhMDIgKiB4ICsgYTEyICogeSArIGEyMiAqIHogKyBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGEwMyAqIHggKyBhMTMgKiB5ICsgYTIzICogeiArIGFbMTVdO1xuICAgIH1cblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0NCBieSB0aGUgZGltZW5zaW9ucyBpbiB0aGUgZ2l2ZW4gdmVjM1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byBzY2FsZVxuICogQHBhcmFtIHt2ZWMzfSB2IHRoZSB2ZWMzIHRvIHNjYWxlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqKi9cbm1hdDQuc2NhbGUgPSBmdW5jdGlvbihvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXTtcblxuICAgIG91dFswXSA9IGFbMF0gKiB4O1xuICAgIG91dFsxXSA9IGFbMV0gKiB4O1xuICAgIG91dFsyXSA9IGFbMl0gKiB4O1xuICAgIG91dFszXSA9IGFbM10gKiB4O1xuICAgIG91dFs0XSA9IGFbNF0gKiB5O1xuICAgIG91dFs1XSA9IGFbNV0gKiB5O1xuICAgIG91dFs2XSA9IGFbNl0gKiB5O1xuICAgIG91dFs3XSA9IGFbN10gKiB5O1xuICAgIG91dFs4XSA9IGFbOF0gKiB6O1xuICAgIG91dFs5XSA9IGFbOV0gKiB6O1xuICAgIG91dFsxMF0gPSBhWzEwXSAqIHo7XG4gICAgb3V0WzExXSA9IGFbMTFdICogejtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDQgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEBwYXJhbSB7dmVjM30gYXhpcyB0aGUgYXhpcyB0byByb3RhdGUgYXJvdW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucm90YXRlID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkLCBheGlzKSB7XG4gICAgdmFyIHggPSBheGlzWzBdLCB5ID0gYXhpc1sxXSwgeiA9IGF4aXNbMl0sXG4gICAgICAgIGxlbiA9IE1hdGguc3FydCh4ICogeCArIHkgKiB5ICsgeiAqIHopLFxuICAgICAgICBzLCBjLCB0LFxuICAgICAgICBhMDAsIGEwMSwgYTAyLCBhMDMsXG4gICAgICAgIGExMCwgYTExLCBhMTIsIGExMyxcbiAgICAgICAgYTIwLCBhMjEsIGEyMiwgYTIzLFxuICAgICAgICBiMDAsIGIwMSwgYjAyLFxuICAgICAgICBiMTAsIGIxMSwgYjEyLFxuICAgICAgICBiMjAsIGIyMSwgYjIyO1xuXG4gICAgaWYgKE1hdGguYWJzKGxlbikgPCBHTE1BVF9FUFNJTE9OKSB7IHJldHVybiBudWxsOyB9XG4gICAgXG4gICAgbGVuID0gMSAvIGxlbjtcbiAgICB4ICo9IGxlbjtcbiAgICB5ICo9IGxlbjtcbiAgICB6ICo9IGxlbjtcblxuICAgIHMgPSBNYXRoLnNpbihyYWQpO1xuICAgIGMgPSBNYXRoLmNvcyhyYWQpO1xuICAgIHQgPSAxIC0gYztcblxuICAgIGEwMCA9IGFbMF07IGEwMSA9IGFbMV07IGEwMiA9IGFbMl07IGEwMyA9IGFbM107XG4gICAgYTEwID0gYVs0XTsgYTExID0gYVs1XTsgYTEyID0gYVs2XTsgYTEzID0gYVs3XTtcbiAgICBhMjAgPSBhWzhdOyBhMjEgPSBhWzldOyBhMjIgPSBhWzEwXTsgYTIzID0gYVsxMV07XG5cbiAgICAvLyBDb25zdHJ1Y3QgdGhlIGVsZW1lbnRzIG9mIHRoZSByb3RhdGlvbiBtYXRyaXhcbiAgICBiMDAgPSB4ICogeCAqIHQgKyBjOyBiMDEgPSB5ICogeCAqIHQgKyB6ICogczsgYjAyID0geiAqIHggKiB0IC0geSAqIHM7XG4gICAgYjEwID0geCAqIHkgKiB0IC0geiAqIHM7IGIxMSA9IHkgKiB5ICogdCArIGM7IGIxMiA9IHogKiB5ICogdCArIHggKiBzO1xuICAgIGIyMCA9IHggKiB6ICogdCArIHkgKiBzOyBiMjEgPSB5ICogeiAqIHQgLSB4ICogczsgYjIyID0geiAqIHogKiB0ICsgYztcblxuICAgIC8vIFBlcmZvcm0gcm90YXRpb24tc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYjAwICsgYTEwICogYjAxICsgYTIwICogYjAyO1xuICAgIG91dFsxXSA9IGEwMSAqIGIwMCArIGExMSAqIGIwMSArIGEyMSAqIGIwMjtcbiAgICBvdXRbMl0gPSBhMDIgKiBiMDAgKyBhMTIgKiBiMDEgKyBhMjIgKiBiMDI7XG4gICAgb3V0WzNdID0gYTAzICogYjAwICsgYTEzICogYjAxICsgYTIzICogYjAyO1xuICAgIG91dFs0XSA9IGEwMCAqIGIxMCArIGExMCAqIGIxMSArIGEyMCAqIGIxMjtcbiAgICBvdXRbNV0gPSBhMDEgKiBiMTAgKyBhMTEgKiBiMTEgKyBhMjEgKiBiMTI7XG4gICAgb3V0WzZdID0gYTAyICogYjEwICsgYTEyICogYjExICsgYTIyICogYjEyO1xuICAgIG91dFs3XSA9IGEwMyAqIGIxMCArIGExMyAqIGIxMSArIGEyMyAqIGIxMjtcbiAgICBvdXRbOF0gPSBhMDAgKiBiMjAgKyBhMTAgKiBiMjEgKyBhMjAgKiBiMjI7XG4gICAgb3V0WzldID0gYTAxICogYjIwICsgYTExICogYjIxICsgYTIxICogYjIyO1xuICAgIG91dFsxMF0gPSBhMDIgKiBiMjAgKyBhMTIgKiBiMjEgKyBhMjIgKiBiMjI7XG4gICAgb3V0WzExXSA9IGEwMyAqIGIyMCArIGExMyAqIGIyMSArIGEyMyAqIGIyMjtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgbGFzdCByb3dcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFggYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucm90YXRlWCA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sXG4gICAgICAgIGEyMSA9IGFbOV0sXG4gICAgICAgIGEyMiA9IGFbMTBdLFxuICAgICAgICBhMjMgPSBhWzExXTtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgcm93c1xuICAgICAgICBvdXRbMF0gID0gYVswXTtcbiAgICAgICAgb3V0WzFdICA9IGFbMV07XG4gICAgICAgIG91dFsyXSAgPSBhWzJdO1xuICAgICAgICBvdXRbM10gID0gYVszXTtcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cblxuICAgIC8vIFBlcmZvcm0gYXhpcy1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbNF0gPSBhMTAgKiBjICsgYTIwICogcztcbiAgICBvdXRbNV0gPSBhMTEgKiBjICsgYTIxICogcztcbiAgICBvdXRbNl0gPSBhMTIgKiBjICsgYTIyICogcztcbiAgICBvdXRbN10gPSBhMTMgKiBjICsgYTIzICogcztcbiAgICBvdXRbOF0gPSBhMjAgKiBjIC0gYTEwICogcztcbiAgICBvdXRbOV0gPSBhMjEgKiBjIC0gYTExICogcztcbiAgICBvdXRbMTBdID0gYTIyICogYyAtIGExMiAqIHM7XG4gICAgb3V0WzExXSA9IGEyMyAqIGMgLSBhMTMgKiBzO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWSBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5yb3RhdGVZID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTIwID0gYVs4XSxcbiAgICAgICAgYTIxID0gYVs5XSxcbiAgICAgICAgYTIyID0gYVsxMF0sXG4gICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCByb3dzXG4gICAgICAgIG91dFs0XSAgPSBhWzRdO1xuICAgICAgICBvdXRbNV0gID0gYVs1XTtcbiAgICAgICAgb3V0WzZdICA9IGFbNl07XG4gICAgICAgIG91dFs3XSAgPSBhWzddO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGMgLSBhMjAgKiBzO1xuICAgIG91dFsxXSA9IGEwMSAqIGMgLSBhMjEgKiBzO1xuICAgIG91dFsyXSA9IGEwMiAqIGMgLSBhMjIgKiBzO1xuICAgIG91dFszXSA9IGEwMyAqIGMgLSBhMjMgKiBzO1xuICAgIG91dFs4XSA9IGEwMCAqIHMgKyBhMjAgKiBjO1xuICAgIG91dFs5XSA9IGEwMSAqIHMgKyBhMjEgKiBjO1xuICAgIG91dFsxMF0gPSBhMDIgKiBzICsgYTIyICogYztcbiAgICBvdXRbMTFdID0gYTAzICogcyArIGEyMyAqIGM7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBaIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnJvdGF0ZVogPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMDAgPSBhWzBdLFxuICAgICAgICBhMDEgPSBhWzFdLFxuICAgICAgICBhMDIgPSBhWzJdLFxuICAgICAgICBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLFxuICAgICAgICBhMTEgPSBhWzVdLFxuICAgICAgICBhMTIgPSBhWzZdLFxuICAgICAgICBhMTMgPSBhWzddO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCBsYXN0IHJvd1xuICAgICAgICBvdXRbOF0gID0gYVs4XTtcbiAgICAgICAgb3V0WzldICA9IGFbOV07XG4gICAgICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICAgICAgb3V0WzExXSA9IGFbMTFdO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGMgKyBhMTAgKiBzO1xuICAgIG91dFsxXSA9IGEwMSAqIGMgKyBhMTEgKiBzO1xuICAgIG91dFsyXSA9IGEwMiAqIGMgKyBhMTIgKiBzO1xuICAgIG91dFszXSA9IGEwMyAqIGMgKyBhMTMgKiBzO1xuICAgIG91dFs0XSA9IGExMCAqIGMgLSBhMDAgKiBzO1xuICAgIG91dFs1XSA9IGExMSAqIGMgLSBhMDEgKiBzO1xuICAgIG91dFs2XSA9IGExMiAqIGMgLSBhMDIgKiBzO1xuICAgIG91dFs3XSA9IGExMyAqIGMgLSBhMDMgKiBzO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXRyaXggZnJvbSBhIHF1YXRlcm5pb24gcm90YXRpb24gYW5kIHZlY3RvciB0cmFuc2xhdGlvblxuICogVGhpcyBpcyBlcXVpdmFsZW50IHRvIChidXQgbXVjaCBmYXN0ZXIgdGhhbik6XG4gKlxuICogICAgIG1hdDQuaWRlbnRpdHkoZGVzdCk7XG4gKiAgICAgbWF0NC50cmFuc2xhdGUoZGVzdCwgdmVjKTtcbiAqICAgICB2YXIgcXVhdE1hdCA9IG1hdDQuY3JlYXRlKCk7XG4gKiAgICAgcXVhdDQudG9NYXQ0KHF1YXQsIHF1YXRNYXQpO1xuICogICAgIG1hdDQubXVsdGlwbHkoZGVzdCwgcXVhdE1hdCk7XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0NH0gcSBSb3RhdGlvbiBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHYgVHJhbnNsYXRpb24gdmVjdG9yXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuZnJvbVJvdGF0aW9uVHJhbnNsYXRpb24gPSBmdW5jdGlvbiAob3V0LCBxLCB2KSB7XG4gICAgLy8gUXVhdGVybmlvbiBtYXRoXG4gICAgdmFyIHggPSBxWzBdLCB5ID0gcVsxXSwgeiA9IHFbMl0sIHcgPSBxWzNdLFxuICAgICAgICB4MiA9IHggKyB4LFxuICAgICAgICB5MiA9IHkgKyB5LFxuICAgICAgICB6MiA9IHogKyB6LFxuXG4gICAgICAgIHh4ID0geCAqIHgyLFxuICAgICAgICB4eSA9IHggKiB5MixcbiAgICAgICAgeHogPSB4ICogejIsXG4gICAgICAgIHl5ID0geSAqIHkyLFxuICAgICAgICB5eiA9IHkgKiB6MixcbiAgICAgICAgenogPSB6ICogejIsXG4gICAgICAgIHd4ID0gdyAqIHgyLFxuICAgICAgICB3eSA9IHcgKiB5MixcbiAgICAgICAgd3ogPSB3ICogejI7XG5cbiAgICBvdXRbMF0gPSAxIC0gKHl5ICsgenopO1xuICAgIG91dFsxXSA9IHh5ICsgd3o7XG4gICAgb3V0WzJdID0geHogLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHh5IC0gd3o7XG4gICAgb3V0WzVdID0gMSAtICh4eCArIHp6KTtcbiAgICBvdXRbNl0gPSB5eiArIHd4O1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geHogKyB3eTtcbiAgICBvdXRbOV0gPSB5eiAtIHd4O1xuICAgIG91dFsxMF0gPSAxIC0gKHh4ICsgeXkpO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSB2WzBdO1xuICAgIG91dFsxM10gPSB2WzFdO1xuICAgIG91dFsxNF0gPSB2WzJdO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIFxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiogQ2FsY3VsYXRlcyBhIDR4NCBtYXRyaXggZnJvbSB0aGUgZ2l2ZW4gcXVhdGVybmlvblxuKlxuKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4qIEBwYXJhbSB7cXVhdH0gcSBRdWF0ZXJuaW9uIHRvIGNyZWF0ZSBtYXRyaXggZnJvbVxuKlxuKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4qL1xubWF0NC5mcm9tUXVhdCA9IGZ1bmN0aW9uIChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHh5ID0geCAqIHkyLFxuICAgICAgICB4eiA9IHggKiB6MixcbiAgICAgICAgeXkgPSB5ICogeTIsXG4gICAgICAgIHl6ID0geSAqIHoyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSAoeXkgKyB6eik7XG4gICAgb3V0WzFdID0geHkgKyB3ejtcbiAgICBvdXRbMl0gPSB4eiAtIHd5O1xuICAgIG91dFszXSA9IDA7XG5cbiAgICBvdXRbNF0gPSB4eSAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzZdID0geXogKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuXG4gICAgb3V0WzhdID0geHogKyB3eTtcbiAgICBvdXRbOV0gPSB5eiAtIHd4O1xuICAgIG91dFsxMF0gPSAxIC0gKHh4ICsgeXkpO1xuICAgIG91dFsxMV0gPSAwO1xuXG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBmcnVzdHVtIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge051bWJlcn0gbGVmdCBMZWZ0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gcmlnaHQgUmlnaHQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBib3R0b20gQm90dG9tIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gdG9wIFRvcCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IG5lYXIgTmVhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IGZhciBGYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5mcnVzdHVtID0gZnVuY3Rpb24gKG91dCwgbGVmdCwgcmlnaHQsIGJvdHRvbSwgdG9wLCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgcmwgPSAxIC8gKHJpZ2h0IC0gbGVmdCksXG4gICAgICAgIHRiID0gMSAvICh0b3AgLSBib3R0b20pLFxuICAgICAgICBuZiA9IDEgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzBdID0gKG5lYXIgKiAyKSAqIHJsO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gKG5lYXIgKiAyKSAqIHRiO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAocmlnaHQgKyBsZWZ0KSAqIHJsO1xuICAgIG91dFs5XSA9ICh0b3AgKyBib3R0b20pICogdGI7XG4gICAgb3V0WzEwXSA9IChmYXIgKyBuZWFyKSAqIG5mO1xuICAgIG91dFsxMV0gPSAtMTtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gKGZhciAqIG5lYXIgKiAyKSAqIG5mO1xuICAgIG91dFsxNV0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBmb3Z5IFZlcnRpY2FsIGZpZWxkIG9mIHZpZXcgaW4gcmFkaWFuc1xuICogQHBhcmFtIHtudW1iZXJ9IGFzcGVjdCBBc3BlY3QgcmF0aW8uIHR5cGljYWxseSB2aWV3cG9ydCB3aWR0aC9oZWlnaHRcbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucGVyc3BlY3RpdmUgPSBmdW5jdGlvbiAob3V0LCBmb3Z5LCBhc3BlY3QsIG5lYXIsIGZhcikge1xuICAgIHZhciBmID0gMS4wIC8gTWF0aC50YW4oZm92eSAvIDIpLFxuICAgICAgICBuZiA9IDEgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzBdID0gZiAvIGFzcGVjdDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IGY7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzExXSA9IC0xO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAoMiAqIGZhciAqIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgb3J0aG9nb25hbCBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gbGVmdCBMZWZ0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gcmlnaHQgUmlnaHQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBib3R0b20gQm90dG9tIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gdG9wIFRvcCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IG5lYXIgTmVhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IGZhciBGYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5vcnRobyA9IGZ1bmN0aW9uIChvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGxyID0gMSAvIChsZWZ0IC0gcmlnaHQpLFxuICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IC0yICogbHI7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAtMiAqIGJ0O1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDIgKiBuZjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gKGxlZnQgKyByaWdodCkgKiBscjtcbiAgICBvdXRbMTNdID0gKHRvcCArIGJvdHRvbSkgKiBidDtcbiAgICBvdXRbMTRdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgbG9vay1hdCBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZXllIHBvc2l0aW9uLCBmb2NhbCBwb2ludCwgYW5kIHVwIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge3ZlYzN9IGV5ZSBQb3NpdGlvbiBvZiB0aGUgdmlld2VyXG4gKiBAcGFyYW0ge3ZlYzN9IGNlbnRlciBQb2ludCB0aGUgdmlld2VyIGlzIGxvb2tpbmcgYXRcbiAqIEBwYXJhbSB7dmVjM30gdXAgdmVjMyBwb2ludGluZyB1cFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0Lmxvb2tBdCA9IGZ1bmN0aW9uIChvdXQsIGV5ZSwgY2VudGVyLCB1cCkge1xuICAgIHZhciB4MCwgeDEsIHgyLCB5MCwgeTEsIHkyLCB6MCwgejEsIHoyLCBsZW4sXG4gICAgICAgIGV5ZXggPSBleWVbMF0sXG4gICAgICAgIGV5ZXkgPSBleWVbMV0sXG4gICAgICAgIGV5ZXogPSBleWVbMl0sXG4gICAgICAgIHVweCA9IHVwWzBdLFxuICAgICAgICB1cHkgPSB1cFsxXSxcbiAgICAgICAgdXB6ID0gdXBbMl0sXG4gICAgICAgIGNlbnRlcnggPSBjZW50ZXJbMF0sXG4gICAgICAgIGNlbnRlcnkgPSBjZW50ZXJbMV0sXG4gICAgICAgIGNlbnRlcnogPSBjZW50ZXJbMl07XG5cbiAgICBpZiAoTWF0aC5hYnMoZXlleCAtIGNlbnRlcngpIDwgR0xNQVRfRVBTSUxPTiAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCBHTE1BVF9FUFNJTE9OICYmXG4gICAgICAgIE1hdGguYWJzKGV5ZXogLSBjZW50ZXJ6KSA8IEdMTUFUX0VQU0lMT04pIHtcbiAgICAgICAgcmV0dXJuIG1hdDQuaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5tYXQ0LnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQ0KCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBhWzNdICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbNF0gKyAnLCAnICsgYVs1XSArICcsICcgKyBhWzZdICsgJywgJyArIGFbN10gKyAnLCAnICtcbiAgICAgICAgICAgICAgICAgICAgYVs4XSArICcsICcgKyBhWzldICsgJywgJyArIGFbMTBdICsgJywgJyArIGFbMTFdICsgJywgJyArIFxuICAgICAgICAgICAgICAgICAgICBhWzEyXSArICcsICcgKyBhWzEzXSArICcsICcgKyBhWzE0XSArICcsICcgKyBhWzE1XSArICcpJztcbn07XG5cbmlmKHR5cGVvZihleHBvcnRzKSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBleHBvcnRzLm1hdDQgPSBtYXQ0O1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgUXVhdGVybmlvblxuICogQG5hbWUgcXVhdFxuICovXG5cbnZhciBxdWF0ID0ge307XG5cbnZhciBxdWF0SWRlbnRpdHkgPSBuZXcgRmxvYXQzMkFycmF5KFswLCAwLCAwLCAxXSk7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBpZGVudGl0eSBxdWF0XG4gKlxuICogQHJldHVybnMge3F1YXR9IGEgbmV3IHF1YXRlcm5pb25cbiAqL1xucXVhdC5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gMDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHF1YXQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBxdWF0ZXJuaW9uXG4gKlxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXRlcm5pb24gdG8gY2xvbmVcbiAqIEByZXR1cm5zIHtxdWF0fSBhIG5ldyBxdWF0ZXJuaW9uXG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5jbG9uZSA9IHZlYzQuY2xvbmU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBxdWF0IGluaXRpYWxpemVkIHdpdGggdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB3IFcgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7cXVhdH0gYSBuZXcgcXVhdGVybmlvblxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuZnJvbVZhbHVlcyA9IHZlYzQuZnJvbVZhbHVlcztcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgcXVhdCB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIHNvdXJjZSBxdWF0ZXJuaW9uXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5jb3B5ID0gdmVjNC5jb3B5O1xuXG4vKipcbiAqIFNldCB0aGUgY29tcG9uZW50cyBvZiBhIHF1YXQgdG8gdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geiBaIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHcgVyBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNldCA9IHZlYzQuc2V0O1xuXG4vKipcbiAqIFNldCBhIHF1YXQgdG8gdGhlIGlkZW50aXR5IHF1YXRlcm5pb25cbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5pZGVudGl0eSA9IGZ1bmN0aW9uKG91dCkge1xuICAgIG91dFswXSA9IDA7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0cyBhIHF1YXQgZnJvbSB0aGUgZ2l2ZW4gYW5nbGUgYW5kIHJvdGF0aW9uIGF4aXMsXG4gKiB0aGVuIHJldHVybnMgaXQuXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IGF4aXMgdGhlIGF4aXMgYXJvdW5kIHdoaWNoIHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgaW4gcmFkaWFuc1xuICogQHJldHVybnMge3F1YXR9IG91dFxuICoqL1xucXVhdC5zZXRBeGlzQW5nbGUgPSBmdW5jdGlvbihvdXQsIGF4aXMsIHJhZCkge1xuICAgIHJhZCA9IHJhZCAqIDAuNTtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgb3V0WzBdID0gcyAqIGF4aXNbMF07XG4gICAgb3V0WzFdID0gcyAqIGF4aXNbMV07XG4gICAgb3V0WzJdID0gcyAqIGF4aXNbMl07XG4gICAgb3V0WzNdID0gTWF0aC5jb3MocmFkKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBZGRzIHR3byBxdWF0J3NcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3F1YXR9IG91dFxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuYWRkID0gdmVjNC5hZGQ7XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gcXVhdCdzXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7cXVhdH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5tdWx0aXBseSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIHZhciBheCA9IGFbMF0sIGF5ID0gYVsxXSwgYXogPSBhWzJdLCBhdyA9IGFbM10sXG4gICAgICAgIGJ4ID0gYlswXSwgYnkgPSBiWzFdLCBieiA9IGJbMl0sIGJ3ID0gYlszXTtcblxuICAgIG91dFswXSA9IGF4ICogYncgKyBhdyAqIGJ4ICsgYXkgKiBieiAtIGF6ICogYnk7XG4gICAgb3V0WzFdID0gYXkgKiBidyArIGF3ICogYnkgKyBheiAqIGJ4IC0gYXggKiBiejtcbiAgICBvdXRbMl0gPSBheiAqIGJ3ICsgYXcgKiBieiArIGF4ICogYnkgLSBheSAqIGJ4O1xuICAgIG91dFszXSA9IGF3ICogYncgLSBheCAqIGJ4IC0gYXkgKiBieSAtIGF6ICogYno7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBxdWF0Lm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQubXVsID0gcXVhdC5tdWx0aXBseTtcblxuLyoqXG4gKiBTY2FsZXMgYSBxdWF0IGJ5IGEgc2NhbGFyIG51bWJlclxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIHZlY3RvciB0byBzY2FsZVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgYW1vdW50IHRvIHNjYWxlIHRoZSB2ZWN0b3IgYnlcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNjYWxlID0gdmVjNC5zY2FsZTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgcXVhdGVybmlvbiBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBYIGF4aXNcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCBxdWF0IHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdCB0byByb3RhdGVcbiAqIEBwYXJhbSB7bnVtYmVyfSByYWQgYW5nbGUgKGluIHJhZGlhbnMpIHRvIHJvdGF0ZVxuICogQHJldHVybnMge3F1YXR9IG91dFxuICovXG5xdWF0LnJvdGF0ZVggPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICByYWQgKj0gMC41OyBcblxuICAgIHZhciBheCA9IGFbMF0sIGF5ID0gYVsxXSwgYXogPSBhWzJdLCBhdyA9IGFbM10sXG4gICAgICAgIGJ4ID0gTWF0aC5zaW4ocmFkKSwgYncgPSBNYXRoLmNvcyhyYWQpO1xuXG4gICAgb3V0WzBdID0gYXggKiBidyArIGF3ICogYng7XG4gICAgb3V0WzFdID0gYXkgKiBidyArIGF6ICogYng7XG4gICAgb3V0WzJdID0gYXogKiBidyAtIGF5ICogYng7XG4gICAgb3V0WzNdID0gYXcgKiBidyAtIGF4ICogYng7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIHF1YXRlcm5pb24gYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWSBheGlzXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgcXVhdCByZWNlaXZpbmcgb3BlcmF0aW9uIHJlc3VsdFxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXQgdG8gcm90YXRlXG4gKiBAcGFyYW0ge251bWJlcn0gcmFkIGFuZ2xlIChpbiByYWRpYW5zKSB0byByb3RhdGVcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5yb3RhdGVZID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgcmFkICo9IDAuNTsgXG5cbiAgICB2YXIgYXggPSBhWzBdLCBheSA9IGFbMV0sIGF6ID0gYVsyXSwgYXcgPSBhWzNdLFxuICAgICAgICBieSA9IE1hdGguc2luKHJhZCksIGJ3ID0gTWF0aC5jb3MocmFkKTtcblxuICAgIG91dFswXSA9IGF4ICogYncgLSBheiAqIGJ5O1xuICAgIG91dFsxXSA9IGF5ICogYncgKyBhdyAqIGJ5O1xuICAgIG91dFsyXSA9IGF6ICogYncgKyBheCAqIGJ5O1xuICAgIG91dFszXSA9IGF3ICogYncgLSBheSAqIGJ5O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBxdWF0ZXJuaW9uIGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFogYXhpc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHF1YXQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdH0gYSBxdWF0IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHJhZCBhbmdsZSAoaW4gcmFkaWFucykgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQucm90YXRlWiA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHJhZCAqPSAwLjU7IFxuXG4gICAgdmFyIGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl0sIGF3ID0gYVszXSxcbiAgICAgICAgYnogPSBNYXRoLnNpbihyYWQpLCBidyA9IE1hdGguY29zKHJhZCk7XG5cbiAgICBvdXRbMF0gPSBheCAqIGJ3ICsgYXkgKiBiejtcbiAgICBvdXRbMV0gPSBheSAqIGJ3IC0gYXggKiBiejtcbiAgICBvdXRbMl0gPSBheiAqIGJ3ICsgYXcgKiBiejtcbiAgICBvdXRbM10gPSBhdyAqIGJ3IC0gYXogKiBiejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBXIGNvbXBvbmVudCBvZiBhIHF1YXQgZnJvbSB0aGUgWCwgWSwgYW5kIFogY29tcG9uZW50cy5cbiAqIEFzc3VtZXMgdGhhdCBxdWF0ZXJuaW9uIGlzIDEgdW5pdCBpbiBsZW5ndGguXG4gKiBBbnkgZXhpc3RpbmcgVyBjb21wb25lbnQgd2lsbCBiZSBpZ25vcmVkLlxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXQgdG8gY2FsY3VsYXRlIFcgY29tcG9uZW50IG9mXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQuY2FsY3VsYXRlVyA9IGZ1bmN0aW9uIChvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXTtcblxuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICBvdXRbMl0gPSB6O1xuICAgIG91dFszXSA9IC1NYXRoLnNxcnQoTWF0aC5hYnMoMS4wIC0geCAqIHggLSB5ICogeSAtIHogKiB6KSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZG90IHByb2R1Y3Qgb2YgdHdvIHF1YXQnc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZG90IHByb2R1Y3Qgb2YgYSBhbmQgYlxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuZG90ID0gdmVjNC5kb3Q7XG5cbi8qKlxuICogUGVyZm9ybXMgYSBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBxdWF0J3NcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHQgaW50ZXJwb2xhdGlvbiBhbW91bnQgYmV0d2VlbiB0aGUgdHdvIGlucHV0c1xuICogQHJldHVybnMge3F1YXR9IG91dFxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQubGVycCA9IHZlYzQubGVycDtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIHNwaGVyaWNhbCBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7cXVhdH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5zbGVycCA9IGZ1bmN0aW9uIChvdXQsIGEsIGIsIHQpIHtcbiAgICB2YXIgYXggPSBhWzBdLCBheSA9IGFbMV0sIGF6ID0gYVsyXSwgYXcgPSBhWzNdLFxuICAgICAgICBieCA9IGJbMF0sIGJ5ID0gYlsxXSwgYnogPSBiWzJdLCBidyA9IGJbM107XG5cbiAgICB2YXIgY29zSGFsZlRoZXRhID0gYXggKiBieCArIGF5ICogYnkgKyBheiAqIGJ6ICsgYXcgKiBidyxcbiAgICAgICAgaGFsZlRoZXRhLFxuICAgICAgICBzaW5IYWxmVGhldGEsXG4gICAgICAgIHJhdGlvQSxcbiAgICAgICAgcmF0aW9CO1xuXG4gICAgaWYgKE1hdGguYWJzKGNvc0hhbGZUaGV0YSkgPj0gMS4wKSB7XG4gICAgICAgIGlmIChvdXQgIT09IGEpIHtcbiAgICAgICAgICAgIG91dFswXSA9IGF4O1xuICAgICAgICAgICAgb3V0WzFdID0gYXk7XG4gICAgICAgICAgICBvdXRbMl0gPSBhejtcbiAgICAgICAgICAgIG91dFszXSA9IGF3O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuXG4gICAgaGFsZlRoZXRhID0gTWF0aC5hY29zKGNvc0hhbGZUaGV0YSk7XG4gICAgc2luSGFsZlRoZXRhID0gTWF0aC5zcXJ0KDEuMCAtIGNvc0hhbGZUaGV0YSAqIGNvc0hhbGZUaGV0YSk7XG5cbiAgICBpZiAoTWF0aC5hYnMoc2luSGFsZlRoZXRhKSA8IDAuMDAxKSB7XG4gICAgICAgIG91dFswXSA9IChheCAqIDAuNSArIGJ4ICogMC41KTtcbiAgICAgICAgb3V0WzFdID0gKGF5ICogMC41ICsgYnkgKiAwLjUpO1xuICAgICAgICBvdXRbMl0gPSAoYXogKiAwLjUgKyBieiAqIDAuNSk7XG4gICAgICAgIG91dFszXSA9IChhdyAqIDAuNSArIGJ3ICogMC41KTtcbiAgICAgICAgcmV0dXJuIG91dDtcbiAgICB9XG5cbiAgICByYXRpb0EgPSBNYXRoLnNpbigoMSAtIHQpICogaGFsZlRoZXRhKSAvIHNpbkhhbGZUaGV0YTtcbiAgICByYXRpb0IgPSBNYXRoLnNpbih0ICogaGFsZlRoZXRhKSAvIHNpbkhhbGZUaGV0YTtcblxuICAgIG91dFswXSA9IChheCAqIHJhdGlvQSArIGJ4ICogcmF0aW9CKTtcbiAgICBvdXRbMV0gPSAoYXkgKiByYXRpb0EgKyBieSAqIHJhdGlvQik7XG4gICAgb3V0WzJdID0gKGF6ICogcmF0aW9BICsgYnogKiByYXRpb0IpO1xuICAgIG91dFszXSA9IChhdyAqIHJhdGlvQSArIGJ3ICogcmF0aW9CKTtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGludmVyc2Ugb2YgYSBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdCB0byBjYWxjdWxhdGUgaW52ZXJzZSBvZlxuICogQHJldHVybnMge3F1YXR9IG91dFxuICovXG5xdWF0LmludmVydCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhMCA9IGFbMF0sIGExID0gYVsxXSwgYTIgPSBhWzJdLCBhMyA9IGFbM10sXG4gICAgICAgIGRvdCA9IGEwKmEwICsgYTEqYTEgKyBhMiphMiArIGEzKmEzLFxuICAgICAgICBpbnZEb3QgPSBkb3QgPyAxLjAvZG90IDogMDtcbiAgICBcbiAgICAvLyBUT0RPOiBXb3VsZCBiZSBmYXN0ZXIgdG8gcmV0dXJuIFswLDAsMCwwXSBpbW1lZGlhdGVseSBpZiBkb3QgPT0gMFxuXG4gICAgb3V0WzBdID0gLWEwKmludkRvdDtcbiAgICBvdXRbMV0gPSAtYTEqaW52RG90O1xuICAgIG91dFsyXSA9IC1hMippbnZEb3Q7XG4gICAgb3V0WzNdID0gYTMqaW52RG90O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGNvbmp1Z2F0ZSBvZiBhIHF1YXRcbiAqIElmIHRoZSBxdWF0ZXJuaW9uIGlzIG5vcm1hbGl6ZWQsIHRoaXMgZnVuY3Rpb24gaXMgZmFzdGVyIHRoYW4gcXVhdC5pbnZlcnNlIGFuZCBwcm9kdWNlcyB0aGUgc2FtZSByZXN1bHQuXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdCB0byBjYWxjdWxhdGUgY29uanVnYXRlIG9mXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQuY29uanVnYXRlID0gZnVuY3Rpb24gKG91dCwgYSkge1xuICAgIG91dFswXSA9IC1hWzBdO1xuICAgIG91dFsxXSA9IC1hWzFdO1xuICAgIG91dFsyXSA9IC1hWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgbGVuZ3RoIG9mIGEgcXVhdFxuICpcbiAqIEBwYXJhbSB7cXVhdH0gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gbGVuZ3RoIG9mIGFcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0Lmxlbmd0aCA9IHZlYzQubGVuZ3RoO1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgcXVhdC5sZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5sZW4gPSBxdWF0Lmxlbmd0aDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGxlbmd0aCBvZiBhIHF1YXRcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBzcXVhcmVkIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBsZW5ndGggb2YgYVxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuc3F1YXJlZExlbmd0aCA9IHZlYzQuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHF1YXQuc3F1YXJlZExlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNxckxlbiA9IHF1YXQuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBOb3JtYWxpemUgYSBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgcXVhdGVybmlvbiB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0Lm5vcm1hbGl6ZSA9IHZlYzQubm9ybWFsaXplO1xuXG4vKipcbiAqIENyZWF0ZXMgYSBxdWF0ZXJuaW9uIGZyb20gdGhlIGdpdmVuIDN4MyByb3RhdGlvbiBtYXRyaXguXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge21hdDN9IG0gcm90YXRpb24gbWF0cml4XG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5mcm9tTWF0MyA9IChmdW5jdGlvbigpIHtcbiAgICB2YXIgc19pTmV4dCA9IFsxLDIsMF07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG91dCwgbSkge1xuICAgICAgICAvLyBBbGdvcml0aG0gaW4gS2VuIFNob2VtYWtlJ3MgYXJ0aWNsZSBpbiAxOTg3IFNJR0dSQVBIIGNvdXJzZSBub3Rlc1xuICAgICAgICAvLyBhcnRpY2xlIFwiUXVhdGVybmlvbiBDYWxjdWx1cyBhbmQgRmFzdCBBbmltYXRpb25cIi5cbiAgICAgICAgdmFyIGZUcmFjZSA9IG1bMF0gKyBtWzRdICsgbVs4XTtcbiAgICAgICAgdmFyIGZSb290O1xuXG4gICAgICAgIGlmICggZlRyYWNlID4gMC4wICkge1xuICAgICAgICAgICAgLy8gfHd8ID4gMS8yLCBtYXkgYXMgd2VsbCBjaG9vc2UgdyA+IDEvMlxuICAgICAgICAgICAgZlJvb3QgPSBNYXRoLnNxcnQoZlRyYWNlICsgMS4wKTsgIC8vIDJ3XG4gICAgICAgICAgICBvdXRbM10gPSAwLjUgKiBmUm9vdDtcbiAgICAgICAgICAgIGZSb290ID0gMC41L2ZSb290OyAgLy8gMS8oNHcpXG4gICAgICAgICAgICBvdXRbMF0gPSAobVs3XS1tWzVdKSpmUm9vdDtcbiAgICAgICAgICAgIG91dFsxXSA9IChtWzJdLW1bNl0pKmZSb290O1xuICAgICAgICAgICAgb3V0WzJdID0gKG1bM10tbVsxXSkqZlJvb3Q7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyB8d3wgPD0gMS8yXG4gICAgICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgICAgICBpZiAoIG1bNF0gPiBtWzBdIClcbiAgICAgICAgICAgICAgaSA9IDE7XG4gICAgICAgICAgICBpZiAoIG1bOF0gPiBtW2kqMytpXSApXG4gICAgICAgICAgICAgIGkgPSAyO1xuICAgICAgICAgICAgdmFyIGogPSBzX2lOZXh0W2ldO1xuICAgICAgICAgICAgdmFyIGsgPSBzX2lOZXh0W2pdO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBmUm9vdCA9IE1hdGguc3FydChtW2kqMytpXS1tW2oqMytqXS1tW2sqMytrXSArIDEuMCk7XG4gICAgICAgICAgICBvdXRbaV0gPSAwLjUgKiBmUm9vdDtcbiAgICAgICAgICAgIGZSb290ID0gMC41IC8gZlJvb3Q7XG4gICAgICAgICAgICBvdXRbM10gPSAobVtrKjMral0gLSBtW2oqMytrXSkgKiBmUm9vdDtcbiAgICAgICAgICAgIG91dFtqXSA9IChtW2oqMytpXSArIG1baSozK2pdKSAqIGZSb290O1xuICAgICAgICAgICAgb3V0W2tdID0gKG1bayozK2ldICsgbVtpKjMra10pICogZlJvb3Q7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBvdXQ7XG4gICAgfTtcbn0pKCk7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIHF1YXRlbmlvblxuICpcbiAqIEBwYXJhbSB7cXVhdH0gdmVjIHZlY3RvciB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yXG4gKi9cbnF1YXQuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ3F1YXQoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcsICcgKyBhWzJdICsgJywgJyArIGFbM10gKyAnKSc7XG59O1xuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5xdWF0ID0gcXVhdDtcbn1cbjtcblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuICB9KShzaGltLmV4cG9ydHMpO1xufSkoKTtcbiIsbnVsbCwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iXX0=
(11)
});
