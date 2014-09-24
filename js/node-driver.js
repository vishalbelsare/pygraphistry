#!/usr/bin/env node

"use strict";

//prebaked script to load uber data
//similar to main.js


var Q = require("q"),
    Rx = require("rx"),
    _ = require('underscore'),

    chalk = require("chalk"),
    debug = require("debug")("StreamGL:driver"),

    webgl = require("node-webgl"),

    NBody = require("./NBody.js"),
    RenderGL = require("./RenderGL.js"),
    SimCL = require("./SimCL.js"),

    loader = require("./data-loader.js");


var WIDTH = 600,
    HEIGHT = 600,
    USE_GEO = true;

var numPoints = 10000,//1024,//2048,//16384,
    numEdges = numPoints,
    dimensions = [1,1]; //[960,960];


/*
    graph ->
    {
        physicsControls: {
            charge,gravity,edgeStrength,edgeDistance: v -> ()
        },
        renderingControls: {
            points,edges,midpoints,midedges: () -> ()
        },

    }
*/
function controls(graph) {
    var physicsControls =
        ["charge", "gravity", "edgeStrength", "edgeDistance"]
        .concat(['scalingRatio', 'edgeInfluence', 'forceAtlas', 'preventOverlap', 'strongGravity', 'dissuadeHubs', 'linLog'])
            .reduce(function (o, lbl) {
                o[lbl] = function (v) {
                    var cmd = {};
                    cmd[lbl] = v;
                    graph.setPhysics(cmd);
                };
                return o;
            }, {});

    /* dumped from playing with web version */
    /*
    physicsControls.charge(-0.00008385510126037207);
    physicsControls.gravity(0.00015448596582229787);
    physicsControls.edgeStrength(0.00015448596582229787);
    physicsControls.edgeDistance(0.0002610812822396834);
    */

    physicsControls.charge      (-0.000029360001841802474);
    physicsControls.gravity     ( 0.020083175556898723);
    physicsControls.edgeStrength( 4.292198241799153);
    physicsControls.edgeDistance( 0.0000158);


    var renderingControls =
        ["points", "edges", "midpoints", "midedges"]
            .reduce(function (o, lbl) {
                var cmd = {};
                cmd[lbl] = false;
                o[lbl] = function (v) {
                    cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                    debug("Setting %o", cmd);
                    graph.setVisible(cmd);
                };
                return o;
            }, {});



    var locks =
        ["lockPoints", "lockEdges", "lockMidpoints", "lockMidedges"]
            .reduce(function (o, lbl) {
                var cmd = {};
                cmd[lbl] = true;
                o[lbl] = function (v) {
                    cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                    debug("Setting %o", cmd);
                    graph.setLocked(cmd);
                };
                return o;
            }, {});



    if (false) {
        physicsControls.forceAtlas(1);
        physicsControls.scalingRatio(0.1);
        physicsControls.gravity(0.005);
        physicsControls.edgeInfluence(1);

        physicsControls.preventOverlap(0);
        physicsControls.strongGravity(0);
        physicsControls.dissuadeHubs(0);
        physicsControls.linLog(1);

        renderingControls.points(true);
        renderingControls.edges(true);
        renderingControls.midpoints(false);
        renderingControls.midedges(false);
        locks.lockPoints(true);
        locks.lockEdges(true);
        locks.lockMidpoints(true);
        locks.lockMidedges(true);



        //physicsContorls.//', 'preventOverlap', 'strongGravity', 'dissuadeHubs'
    } else {


        renderingControls.points(true);
        renderingControls.edges(true);
        renderingControls.midpoints(false);
        renderingControls.midedges(false);
        locks.lockPoints(false);
        locks.lockEdges(false);
        locks.lockMidpoints(true);
        locks.lockMidedges(true);



    }


    return {
        physicsControls: physicsControls,
        renderingControls: renderingControls,
        locks: locks
    };
}


function fetchVBOs(graph, bufferNames) {

    var targetArrays = {};

    // TODO: Reuse existing ArrayBuffers once we're sure we're sure it's safe to do so (we've
    // written the CL data to it, and written it to the socket sent to the client.)
    var buffersToFetch =
        ["curPoints", "springsPos", "midSpringsPos", "curMidPoints", "midSpringsColorCoord"]
        .filter(function (name) {
            return bufferNames.indexOf(name) != -1;
        });

    var bufferSizes = fetchBufferByteLengths(graph);

    // TODO: Instead of doing blocking CL reads, use CL events and wait on those.
    // node-webcl's event arguments to enqueue commands seems busted at the moment, but
    // maybe enqueueing a event barrier and using its event might work?
    return Q.all(
        buffersToFetch.map(function(val) {
            targetArrays[val] = new ArrayBuffer(bufferSizes[val]);
            return graph.simulator.buffers[val].read(new Float32Array(targetArrays[val]));
        })
    )
    .then(function() {

        var localBuffers = {
            'pointSizes': graph.simulator.buffersLocal.pointSizes.buffer,
            'pointColors': graph.simulator.buffersLocal.pointColors.buffer,
            'edgeColors': graph.simulator.buffersLocal.edgeColors.buffer
        };
        for (var i in localBuffers) {
            if (bufferNames.indexOf(i) != -1) {
                targetArrays[i] = localBuffers[i];
            }
        }

        return targetArrays;
    });
}


function fetchNumElements(graph) {
    return {
        edges: graph.renderer.numEdges * 2,
        edgeculled: graph.renderer.numEdges * 2,
        midedges: graph.renderer.numMidEdges * 2,
        midedgestextured: graph.renderer.numMidEdges * 2,
        points: graph.renderer.numPoints,
        pointculled: graph.renderer.numPoints,
        pointpicking: graph.renderer.numPoints,
        midpoints: graph.renderer.numMidPoints
    };
}
function fetchBufferByteLengths(graph) {
    //FIXME generate from renderConfig
    //form: elements * ?dimensions * points * BYTES_PER_ELEMENT
    return {
        springsPos: graph.renderer.numEdges * 2 * 2 * Float32Array.BYTES_PER_ELEMENT,
        curPoints: graph.renderer.numPoints * 2 * Float32Array.BYTES_PER_ELEMENT,
        pointSizes: graph.renderer.numPoints * Uint8Array.BYTES_PER_ELEMENT,
        pointColors: graph.renderer.numPoints * 4 * Uint8Array.BYTES_PER_ELEMENT,
        edgeColors: graph.renderer.numEdges * 2 * 4 * Uint8Array.BYTES_PER_ELEMENT,
        curMidPoints: graph.renderer.numMidPoints * 2 * Float32Array.BYTES_PER_ELEMENT,
        midSpringsPos: graph.renderer.numMidEdges * 2 * 2 * Float32Array.BYTES_PER_ELEMENT
    };
}


function init() {
    console.log("Running Naive N-body simulation");

    var document = webgl.document();
    document.setTitle("Graphviz");
    var canvas = document.createElement("canvas", WIDTH, HEIGHT);
    canvas.clientWidth = canvas.width = WIDTH;
    canvas.clientHeight = canvas.height = HEIGHT;

    return NBody.create(SimCL, RenderGL, document, canvas, [255,255,255,1.0], dimensions, 3);
}


function loadDataIntoSim(graph) {
    return loader.loadDataList(graph)
    .then(function (datalist) {
        if (USE_GEO) {
            var which = 2;
            debug("Loading data: %o", datalist[which]);
            return datalist[which].loader(graph, datalist[which].f);

        } else {
            var points = loader.createPoints(numPoints, dimensions);
            var edges = loader.createEdges(numEdges, numPoints);

            return Q.all([
                graph.setPoints(points),
                points,
                edges,
            ]).spread(function(graph, points, edges) {
                graph.setColorMap("test-colormap2.png");
                return graph.setEdges(edges);
            });
        }
    });
}


///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////


function createAnimation() {
    debug("STARTING DRIVER");

    // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
    // the contents of each VBO
    var animStepSubj = new Rx.BehaviorSubject(null);

    init()
    .then(function (graph) {
        debug("LOADING DATA");
        return loadDataIntoSim(graph);
    })
    .then(function (graph) {
        debug("APPLYING SETTINGS");
        controls(graph);

        debug("ANIMATING");

        // Run the animation loop by recursively expanding each tick event into a new sequence with
        // [a requestAnimationFrame() callback mapped to graph.tick()]
        Rx.Observable.fromPromise(graph.tick())
            .expand(function() {
                return (Rx.Observable.fromCallback(graph.renderer.document.requestAnimationFrame))()
                    .flatMap(function() { return Rx.Observable.fromPromise(graph.tick()); })
                    .map(function() { return graph; });
            })
            .subscribe(animStepSubj);

    })
    .then(function () {
        debug("Graph created");
    }, function (err) {
        console.error("\n" + chalk.bgRed("\n~~~~~ SETUP ERROR") + "\n", err, ". Stack:", err.stack);
        console.error("\n" + chalk.bgRed("\nEXITING") + "\n");
        process.exit(-1);
    })
    .done();

    return animStepSubj.skip(1);
}


/**
 * Fetches compressed VBO data and # of elements for active buffers and programs
 * @returns {Rx.Observable} an observable sequence containing one item, an Object with the 'buffers'
 * property set to an Object mapping buffer names to ArrayBuffer data; and the 'elements' Object
 * mapping render item names to number of elements that should be rendered for the given buffers.
 */
function fetchData(graph, compress, bufferNames, programNames) {


    return Rx.Observable.fromPromise(fetchVBOs(graph, bufferNames))
        .flatMap(function (vbos) {

            bufferNames.forEach(function (bufferName) {
                if (!vbos.hasOwnProperty(bufferName)) {
                    throw new Error('vbos does not have buffer', bufferName);
                }
            })

            var compressed =
                bufferNames.map(function (bufferName) {
                    return Rx.Observable.fromNodeCallback(compress.deflate)(
                        vbos[bufferName],//binary,
                        {output: new Buffer(
                            Math.max(1024, Math.round(vbos[bufferName].byteLength * 1.5)))});
                });

            return Rx.Observable.zipArray(compressed).take(1);

        })
        .map(function(compressedVbos) {

            var buffers = {};
            bufferNames.forEach(function (name, i) {
                buffers[name] = compressedVbos[i][0];
            });

            return {
                compressed: buffers,
                elements: _.pick(fetchNumElements(graph), programNames),
                bufferByteLengths: _.pick(fetchBufferByteLengths(graph), bufferNames)
            };
        });
}



exports.create = createAnimation;
exports.fetchData = fetchData;


// If the user invoked this script directly from the terminal, run init()
if(require.main === module) {
    var vbosUpdated = createAnimation();

    vbosUpdated.subscribe(function() { debug("Got updated VBOs"); } );
}
