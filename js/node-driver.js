#!/usr/bin/env node

"use strict";

//prebaked script to load uber data
//similar to main.js


var Q = require("q"),
    Rx = require("rx"),

    chalk = require("chalk"),

    webgl = require("node-webgl"),

    NBody = require("./NBody.js"),
    RenderGL = require("./RenderGL.js"),
    SimCL = require("./SimCL.js"),

    loader = require("./data-loader.js");


var WIDTH = 600;
var HEIGHT = 600;
var USE_GEO = true;

var numPoints = 10000,//1024,//2048,//16384,
    num,
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
    physicsControls.gravity     ( 0.00020083175556898723);
    physicsControls.edgeStrength( 4.292198241799153);
    physicsControls.edgeDistance( 0.0000158);


    var renderingControls =
        ["points", "edges", "midpoints", "midedges"]
            .reduce(function (o, lbl) {
                var cmd = {};
                cmd[lbl] = false;
                o[lbl] = function (v) {
                    cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                    console.error("setting", cmd);
                    graph.setVisible(cmd);
                };
                return o;
            }, {});


    renderingControls.points(false);
    renderingControls.edges(false);
    renderingControls.midpoints(false);
    renderingControls.midedges(true);


    var locks =
        ["lockPoints", "lockEdges", "lockMidpoints", "lockMidedges"]
            .reduce(function (o, lbl) {
                var cmd = {};
                cmd[lbl] = true;
                o[lbl] = function (v) {
                    cmd[lbl] = v === undefined ? !cmd[lbl] : v;
                    console.error("setting", cmd);
                    graph.setLocked(cmd);
                };
                return o;
            }, {});

    locks.lockPoints(true);
    locks.lockEdges(true);
    locks.lockMidpoints(false);
    locks.lockMidedges(false);

    return {
        physicsControls: physicsControls,
        renderingControls: renderingControls,
        locks: locks
    };
}


function fetchVBOs(graph) {
    var buffersToFetch =
        ["curPoints", "springsPos", "midSpringsPos", "curMidPoints", "midSpringsColorCoord"];
    var targetArrays = {};

    return Q.all(
        buffersToFetch.map(function(val, idx, arr) {
            targetArrays[val] = new ArrayBuffer(graph.simulator.buffers[val].size)
            return graph.simulator.buffers[val].read(new Float32Array(targetArrays[val]));
        })
    )
    .then(function() {
        return targetArrays;
    });
}


function fetchNumElements(graph) {
    return {
        edges: graph.renderer.numEdges * 2,
        midedges: graph.renderer.numMidEdges * 2,
        midedgestextured: graph.renderer.numMidEdges * 2,
        points: graph.renderer.numPoints,
        midpoints: graph.renderer.numMidPoints
    };
}


function init() {
    console.log("Running Naive N-body simulation");

    var document = webgl.document();
    document.setTitle("Graphviz");
    var canvas = document.createElement("canvas", WIDTH, HEIGHT);
    canvas.clientWidth = canvas.width = WIDTH;
    canvas.clientHeight = canvas.height = HEIGHT;

    return NBody.create(SimCL, RenderGL, document, canvas, [255,255,255,1.0], dimensions, 3)
}


function loadDataIntoSim(graph) {
    return loader.loadDataList(graph)
    .then(function (datalist) {
        if (USE_GEO) {
            console.error("loading data")
            var which = 0;
            console.error("which", datalist[which])
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
    })
}


///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////


function create() {
    console.debug(chalk.inverse("\n~~~~~~~ START"));

    // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
    // the contents of each VBO
    var vboUpdateSig = new Rx.BehaviorSubject({
        buffers: {
            curPoints: new ArrayBuffer(0),
            springs: new ArrayBuffer(0),
            curMidPoints: new ArrayBuffer(0),
            midSprings: new ArrayBuffer(0),
            midSpringsColorCoord: new ArrayBuffer(0),
        }
    });

    init()
    .then(function (graph) {
        console.debug(chalk.inverse("\n~~~~~~~ LOADING DATA"));
        return loadDataIntoSim(graph);
    })
    .then(function (graph) {
        console.debug(chalk.inverse("\n~~~~~~~ SETTINGS"));
        var api = controls(graph);

        console.debug(chalk.inverse("\n~~~~~~~ ANIMATING"));

        // Run the animation loop by recursively expanding each tick event into a new sequence with
        // [a requestAnimationFrame() callback mapped to graph.tick()]
        var stepSignal = Rx.Observable.fromPromise(graph.tick())
            .expand(function() {
                return (Rx.Observable.fromCallback(graph.renderer.document.requestAnimationFrame))()
                    .flatMap(function() {
                        return Rx.Observable.fromPromise(graph.tick());
                    });
            })

        stepSignal
            .sample(30)
            .flatMap(function() {
                return Rx.Observable.fromPromise(fetchVBOs(graph));
            })
            .map(function(vbos) {
                var numElements = fetchNumElements(graph);
                return {buffers: vbos, elements: numElements};
            })
            .subscribe(vboUpdateSig);
    })
    .then(function () {
        console.debug("\n" + chalk.bgBlue("\n======= GRAPH CREATED") + "\n");
    }, function (err) {
        console.error(chalk.bgRed("~~~~~Setup error:", err, ". Stack:", err.stack));
    })
    .done();

    return vboUpdateSig.share().skip(1);
}



exports.create = create;


// If the user invoked this script directly from the terminal, run init()
if(require.main === module) {
    var vbosUpdated = create();

    vbosUpdated.subscribe(function(vbos) { console.debug("Got updated VBOs"); } );
}
