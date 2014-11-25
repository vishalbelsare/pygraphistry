#!/usr/bin/env node

'use strict';

//prebaked script to load uber data
//similar to main.js


var Q = require("q"),
    Rx = require("rx"),
    _ = require('underscore'),

    request = require('request'),
    debug = require("debug")("StreamGL:driver"),

    NBody = require("./NBody.js"),
    RenderNull = require('./RenderNull.js'),
    SimCL = require("./SimCL.js"),

    metrics = require("./metrics.js"),
    loader = require("./data-loader.js");

metrics.init('StreamGL:driver');

var WIDTH = 600,
    HEIGHT = 600,
    USE_GEO = true;

var numPoints = 10000,//1024,//2048,//16384,
    numEdges = numPoints,
    dimensions = [1,1]; //[960,960];

var SIMULATION_TIME = 3000; //seconds


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


    /* dumped from playing with web version */
    /*
    physicsControls.charge(-0.00008385510126037207);
    physicsControls.gravity(0.00015448596582229787);
    physicsControls.edgeStrength(0.00015448596582229787);
    physicsControls.edgeDistance(0.0002610812822396834);
    */

    //all off by default
    physicsControls.forceAtlas(0);
    locks.lockPoints(true);
    locks.lockEdges(true);
    locks.lockMidpoints(true);
    locks.lockMidedges(true);
    renderingControls.points(false);
    renderingControls.edges(false);
    renderingControls.midpoints(false);
    renderingControls.midedges(false);

    physicsControls.charge      (-0.000029360001841802474);
    physicsControls.gravity     ( 0.020083175556898723);
    physicsControls.edgeStrength( 4.292198241799153);
    physicsControls.edgeDistance( 0.0000158);


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
    } else if (false) {

        renderingControls.points(true);
        renderingControls.edges(true);
        renderingControls.midpoints(false);
        renderingControls.midedges(false);
        locks.lockPoints(false);
        locks.lockEdges(false);
        locks.lockMidpoints(true);
        locks.lockMidedges(true);
    } else {
        locks.lockMidpoints(false);
        locks.lockMidedges(false);
        renderingControls.points(true);
        renderingControls.midedges(true);


    }


    return {
        physicsControls: physicsControls,
        renderingControls: renderingControls,
        locks: locks
    };
}


function getBufferVersion (graph, bufferName) {
    var deviceBuffers = ["curPoints", "springsPos", "midSpringsPos", "curMidPoints", "midSpringsColorCoord"];
    var localBuffers = ['pointSizes', 'pointColors', 'edgeColors'];

    if (deviceBuffers.indexOf(bufferName) > -1) {
        return graph.simulator.versions.buffers[bufferName];
    } else if (localBuffers.indexOf(bufferName) > -1) {
        return graph.simulator.versions.buffers[bufferName];
    } else {
        throw new Error("could not find buffer", bufferName);
    }
}


// ... -> {<name>: {buffer: ArrayBuffer, version: int}}
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
        buffersToFetch.map(function(name) {
            targetArrays[name] = {
                buffer: new ArrayBuffer(bufferSizes[name]),
                version: graph.simulator.versions.buffers[name]
            };
            return graph.simulator.buffers[name].read(new Float32Array(targetArrays[name].buffer));
    }))
    .then(function() {

        var localBuffers = {
            'pointSizes': graph.simulator.buffersLocal.pointSizes.buffer,
            'pointColors': graph.simulator.buffersLocal.pointColors.buffer,
            'edgeColors': graph.simulator.buffersLocal.edgeColors.buffer
        };
        for (var i in localBuffers) {
            if (bufferNames.indexOf(i) != -1) {
                targetArrays[i] = {
                    buffer: localBuffers[i],
                    version: graph.simulator.versions.buffers[i]
                };
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
        midedgeculled: graph.renderer.numMidEdges * 2,
        midedgetextured: graph.renderer.numMidEdges * 2,
        points: graph.renderer.numPoints,
        pointculled: graph.renderer.numPoints,
        pointpicking: graph.renderer.numPoints,
        pointpickingScreen: graph.renderer.numPoints,
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
        midSpringsPos: graph.renderer.numMidEdges * 2 * 2 * Float32Array.BYTES_PER_ELEMENT,
        midSpringsColorCoord: graph.renderer.numMidEdges * 2 * 2 * Float32Array.BYTES_PER_ELEMENT
    };
}


function init() {
    debug("Running Naive N-body simulation");
    console.log("Running Naive N-body simulation");

    var document = null;
    var canvasStandin = {
        width: WIDTH,
        height: HEIGHT,
        clientWidth: WIDTH,
        clientHeight: HEIGHT
    };

    return NBody.create(SimCL, RenderNull, document, canvasStandin, [255,255,255,1.0], dimensions, 3);
}


function loadDataIntoSim(graph) {
    return loader.loadDataList(graph)
    .then(function (datalist) {
        if (USE_GEO) {
            var which = 0;
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


/**
 * Returns an Observable that fires an event in `delay` ms, with the given `value`
 * @param  {number}   [delay=16]    - the time, in milliseconds, before the event is fired
 * @param  {*}        [value=false] - the value of the event (`delay` must be given if `value` is)
 * @return {Rx.Observable} A Rx Observable stream that emits `value` after `delay`, and finishes
 */
function delayObservableGenerator(delay, value, cb) {
    if(arguments.length < 2) {
        cb = arguments[0];
        delay = 16;
        value = false;
    } else if(arguments.length < 3) {
        cb = arguments[1];
        value = false;
    }

    return Rx.Observable.return(value)
        .delay(delay)
        .flatMap(function(v1) {
            return Rx.Observable.fromNodeCallback(function(v2, cb) {
                setImmediate(function() { cb(v2); });
            })(v1);
        });
};


///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////


function createAnimation() {
    debug("STARTING DRIVER");

    var userInteractions = new Rx.Subject();

    // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
    // the contents of each VBO
    var animStepSubj = new Rx.BehaviorSubject(null);

    animStepSubj.subscribe(function () {
        debug("NOTIFYING OF BIG STEP")
    })

    var theGraph = init();

    theGraph.then(function (graph) {
        debug("APPLYING SETTINGS");
        controls(graph);

        userInteractions.subscribe(function (settings){
            debug('updating settings..');
            graph.updateSettings(settings);
        });

        return graph;
    })
    .then(function (graph) {
        debug("LOADING DATA");
        return loadDataIntoSim(graph);
    })
    .then(function (graph) {
        debug("ANIMATING");


        var isRunning =
            Rx.Observable.merge(
                //run beginning & after every interaction
                userInteractions.merge(Rx.Observable.return())
                    .map(_.constant(true)),
                //...  but stop a bit after last one
                userInteractions.merge(Rx.Observable.return())
                    .throttle(SIMULATION_TIME).map(_.constant(false)));

        var isRunningRecent = new Rx.ReplaySubject(1);

        isRunningRecent.subscribe(function (v) {
            debug('=============================isRunningRecent:', v)
        });

        isRunning.subscribe(isRunningRecent);

        // Loop simulation by recursively expanding each tick event into a new sequence
        // Gate by isRunning
        Rx.Observable.fromPromise(graph.tick())
            .expand(function() {
                var now = Date.now();
                //return (Rx.Observable.fromCallback(graph.renderer.document.requestAnimationFrame))()
                return Rx.Observable.return()
                    // Add in a delay to allow nodejs' event loop some breathing room
                    .flatMap(function() {
                        return delayObservableGenerator(16, false);
                    })
                    .flatMap(function () {
                        return isRunningRecent.filter(_.identity).take(1);
                    })
                    .flatMap(function(v) {
                        debug('step..')
                        return (Rx.Observable.fromPromise(
                            graph
                                .tick()
                                .then(function () {
                                    debug('ticked');
                                    metrics.info({metric: {'tick_durationMS': Date.now() - now} });
                                })
                        ));
                    })
                    .map(_.constant(graph));
            })
            .subscribe(animStepSubj);

    })
    .then(function (graph) {
        debug("Graph created");
    }, function (err) {
        console.error("\n\n~~~~~ SETUP ERROR\n", err, ". Stack:", err.stack);
        console.error("\n\nEXITING\n\n");
        process.exit(-1);
    })
    .done();

    return {
        proxy: function (settings) {
            userInteractions.onNext(settings);
        },
        ticks: animStepSubj.skip(1)
    }
}


/**
 * Fetches compressed VBO data and # of elements for active buffers and programs
 * @returns {Rx.Observable} an observable sequence containing one item, an Object with the 'buffers'
 * property set to an Object mapping buffer names to ArrayBuffer data; and the 'elements' Object
 * mapping render item names to number of elements that should be rendered for the given buffers.
 */
function fetchData(graph, compress, bufferNames, bufferVersions, programNames) {

    bufferVersions = bufferVersions || _.object(bufferNames.map(function (name) { return [name, -1]}));

    var neededBuffers =
        bufferNames.filter(function (name) {
            var clientVersion = bufferVersions[name];
            var liveVersion = getBufferVersion(graph, name);
            return clientVersion < liveVersion;
        });
    bufferNames = neededBuffers;

    var now = Date.now();
    return Rx.Observable.fromPromise(fetchVBOs(graph, bufferNames))
        .flatMap(function (vbos) {
            //metrics.info({metric: {'fetchVBOs_lastVersions': bufferVersions}});
            metrics.info({metric: {'fetchVBOs_buffers': bufferNames}});
            metrics.info({metric: {'fetchVBOs_durationMS': Date.now() - now}});

            bufferNames.forEach(function (bufferName) {
                if (!vbos.hasOwnProperty(bufferName)) {
                    throw new Error('vbos does not have buffer', bufferName);
                }
            })

            //[ {buffer, version, compressed} ] ordered by bufferName
            var now = Date.now();
            var compressed =
                bufferNames.map(function (bufferName) {
                    var now = Date.now();
                    return Rx.Observable.fromNodeCallback(compress.deflate)(
                        vbos[bufferName].buffer,//binary,
                        {output: new Buffer(
                            Math.max(1024, Math.round(vbos[bufferName].buffer.byteLength * 1.5)))})
                        .map(function (compressed) {
                            debug('compress bufferName', bufferName);
                            metrics.info({metric: {'compress_buffer': bufferName} });
                            metrics.info({metric: {'compress_inputBytes': vbos[bufferName].buffer.byteLength} });
                            metrics.info({metric: {'compress_outputBytes': compressed.length} });
                            metrics.info({metric: {'compress_durationMS': Date.now() - now} });
                            return _.extend({}, vbos[bufferName], {compressed: compressed});
                        })
                });

            return Rx.Observable.zipArray(compressed).take(1)
                .do(function () { metrics.info({metric: {'compressAll_durationMS': Date.now() - now} }) });

        })
        .map(function(compressedVbos) {

            var buffers =
                _.object(_.zip(
                        bufferNames,
                        bufferNames.map(function (_, i) {  return compressedVbos[i].compressed[0]; })));

            var versions =
                _.object(_.zip(
                        bufferNames,
                        bufferNames.map(function (_, i) {  return compressedVbos[i].version; })));

            return {
                compressed: buffers,
                elements: _.pick(fetchNumElements(graph), programNames),
                bufferByteLengths: _.pick(fetchBufferByteLengths(graph), bufferNames),
                versions: versions
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
