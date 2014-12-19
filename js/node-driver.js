#!/usr/bin/env node

'use strict';

//prebaked script to load uber data
//similar to main.js


var Q = require("q"),
    Rx = require("rx"),
    _ = require('underscore'),

    request = require('request'),
    debug = require("debug")("graphistry:graph-viz:driver:node-driver"),
    util = require('./util.js'),

    NBody = require("./NBody.js"),
    RenderNull = require('./RenderNull.js'),
    SimCL = require("./SimCL.js"),

    metrics = require("./metrics.js"),
    loader = require("./data-loader.js");


var rConf = require('./renderer.config.js');
var renderConfig = rConf.scenes.netflow; // Still hardcode default config for now...

metrics.init('StreamGL:driver');

var WIDTH = 600,
    HEIGHT = 600;

var SIMULATION_TIME = 3000; //seconds
var dimensions = [1,1];




//number/offset of graph elements and how they relate to various models
//graph -> {<model>: {num: int, offset: int}
function graphCounts(graph) {
    var numPoints   = graph.simulator.timeSubset.pointsRange.len;
    var numEdges    = graph.simulator.timeSubset.edgeRange.len;
    var offsetPoint     = graph.simulator.timeSubset.pointsRange.startIdx;
    var offsetEdge      = graph.simulator.timeSubset.edgeRange.startIdx;
    var numMidPoints    = graph.simulator.timeSubset.midPointsRange.len;
    var numMidEdges     = graph.simulator.timeSubset.midEdgeRange.len;
    var offsetMidPoints = graph.simulator.timeSubset.midPointsRange.startIdx;
    var offsetMidEdges  = graph.simulator.timeSubset.midEdgeRange.startIdx;

    var point       = {num: numPoints,      offset: offsetPoint};
    var edge        = {num: numEdges,       offset: offsetMidEdges};
    var midPoint    = {num: numMidPoints,   offset: offsetMidPoints};
    var midEdge     = {num: numMidEdges,    offset: offsetMidEdges};

    return {
        curPoints: point,
        springsPos: edge,
        pointSizes: point,
        pointColors: point,
        edgeColors: edge,
        curMidPoints: midPoint,
        midSpringsPos: midEdge,
        midSpringsColorCoord: midEdge
    };

}


function applyControls(graph, cfgName) {
    var controls = require('./layout.config.js');
    var cfg = controls.default;
    if (cfgName) {
        if (controls[cfgName])
            cfg = controls[cfgName];
        else
          console.warn("WARNING Unknown sim controls: %s. Using defaults.", cfgName)
    }
    debug("Applying layout settings: %o", cfg);

    var simulator = cfg.simulator || SimCL
    var algoEntries = cfg.layoutAlgorithms || [];
    var layoutAlgorithms = []

    for (var i = 0; i < algoEntries.length; i++) {
        var entry = algoEntries[i];
        var params = entry.params || {}
        entry.algo.setPhysics(params)
        layoutAlgorithms.push(entry.algo);
    }

    var lockCtrl = cfg.locks || controls.default.lockCtrl;
    return graph.initSimulation(simulator, layoutAlgorithms, lockCtrl);
}


function getBufferVersion (graph, bufferName) {
    var buffers = graph.simulator.versions.buffers;
    if (!(bufferName in buffers))
        util.die('Cannot find version of buffer %s', bufferName);
    
    return buffers[bufferName];
}



// ... -> {<name>: {buffer: ArrayBuffer, version: int}}
function fetchVBOs(graph, bufferNames) {
    var targetArrays = {};
    var bufferSizes = fetchBufferByteLengths(graph);
    var counts = graphCounts(graph);

    var layouts = _.object(_.map(bufferNames, function (name) {
        var model = renderConfig.models[name];
        if (_.values(model).length != 1)
            util.die('Currently assumes one view per model');

        return [name, _.values(model)[0]];

    }));
    var hostBufs = _.omit(layouts, function (layout) {
        return layout.datasource !== 'HOST';
    });
    var devBufs = _.omit(layouts, function (layout) {
        return layout.datasource !== 'DEVICE';
    });

    // TODO: Instead of doing blocking CL reads, use CL events and wait on those.
    // node-webcl's event arguments to enqueue commands seems busted at the moment, but
    // maybe enqueueing a event barrier and using its event might work?
    return Q.all(
            _.map(devBufs, function (layout, name) {
                var stride = layout.stride || (layout.count * rConf.gl2Bytes(layout.type));

                targetArrays[name] = {
                    buffer: new ArrayBuffer(bufferSizes[name]),
                    version: graph.simulator.versions.buffers[name]
                };

                debug('Reading device buffer %s', name);
                return graph.simulator.buffers[name].read(
                    new Float32Array(targetArrays[name].buffer),
                    counts[name].offset * stride,
                    counts[name].num * stride);
            })
        ).then(function () {
            _.each(hostBufs, function (layout, name) {
                var stride = layout.stride || (layout.count * rConf.gl2Bytes(layout.type));

                debug('Fetching host buffer %s', name);
                targetArrays[name] = {
                    buffer: new graph.simulator.buffersLocal[name].constructor(
                        graph.simulator.buffersLocal[name],
                        counts[name].offset * stride,
                        counts[name].num * stride),
                    version: graph.simulator.versions.buffers[name]
                };
            });
            return targetArrays;
        }).fail(function (err) {
            console.error("ERROR Failure in node-driver.fetchVBO ", (err||{}).stack);
        });
}



//graph -> {<itemName>: int}
//For each render item, find a serverside model and send its count
function fetchNumElements(graph) {

    var counts = graphCounts(graph);

    return _.object(
        _.keys(renderConfig.items)
            .map(function (item) {
                var serversideModelBindings =
                    _.values(renderConfig.items[item].bindings)
                        .filter(function (binding) {
                            var model = renderConfig.models[binding[0]];
                            return rConf.isBufServerSide(model);
                        });
                var aServersideModelName = serversideModelBindings[0][0];
                return [item, counts[aServersideModelName].num];
            }));

}


//graph -> {<model>: int}
//Find num bytes needed for each model
function fetchBufferByteLengths(graph) {

    var counts = graphCounts(graph);

    return _.chain(renderConfig.models).omit(function (model, name) {
        return rConf.isBufClientSide(model);
    }).map(function (model, name) {
        var layout = _.values(model)[0];
        var count = counts[name].num;
        return [name, count * (layout.stride || (rConf.gl2Bytes(layout.type) * layout.count))];
    }).object().value();
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

    return NBody.create(RenderNull, document, canvasStandin, [255,255,255,1.0], dimensions, 3)
        .fail(function (err) {
            console.error("ERROR Nbody.create failed ", (err||{}).stack);
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


function createAnimation(config) {
    debug("STARTING DRIVER");

    var userInteractions = new Rx.Subject();

    // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
    // the contents of each VBO
    var animStepSubj = new Rx.BehaviorSubject(null);

    //animStepSubj.subscribe(function () {
    //    debug("NOTIFYING OF BIG STEP")
    //})

    var dataConfig = {
        'listURI': config.DATALISTURI,
        'name': config.DATASETNAME,
        'idx': config.DATASETIDX
    }

    debug('dataConfig: %o', dataConfig);

    var theDataset = loader.getDataset(dataConfig);
    var theGraph = init();

    Q.all([theGraph, theDataset]).spread(function (graph, dataset) {
        debug("Dataset %o", dataset);
        return Q.all([
            applyControls(graph, dataset.config['simControls']),
            dataset
        ]);
    }).spread(function (graph, dataset) {
        userInteractions.subscribe(function (settings){
            debug('Updating settings..');
            graph.updateSettings(settings);
        })

        debug("LOADING DATASET");
        return loader.loadDatasetIntoSim(graph, dataset)
    }).then(function (graph) {
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
                        //debug('step..')
                        return (Rx.Observable.fromPromise(
                            graph
                                .tick()
                                .then(function () {
                                    //debug('ticked');
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
        ticks: animStepSubj.skip(1),
        graph: theGraph
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
                    util.die('Vbos does not have buffer %s', bufferName);
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
                            debug('compress bufferName %s (size %d)', bufferName,vbos[bufferName].buffer.byteLength);
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

            //want all versions
            _.extend(versions, graph.simulator.versions.buffers);

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
exports.renderConfig = renderConfig;


// If the user invoked this script directly from the terminal, run init()
if(require.main === module) {
    var config  = require('./config.js')();
    var vbosUpdated = createAnimation(config);

    vbosUpdated.subscribe(function() { debug("Got updated VBOs"); } );
}
