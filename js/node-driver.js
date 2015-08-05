#!/usr/bin/env node

'use strict';

//prebaked script to load uber data
//similar to main.js


var Q = require("q"),
    Rx = require("rx"),
    _ = require('underscore'),
    request = require('request'),
    NBody = require("./NBody.js"),
    RenderNull = require('./RenderNull.js'),
    rConf = require('./renderer.config.js'),
    lConf = require('./layout.config.js'),
    webcl = require('node-webcl'),
    metrics = require("./metrics.js"),
    loader = require("./data-loader.js");

var log         = require('common/logger.js');
var logger      = log.createLogger('graph-viz:data:data-loader');
var perf        = require('common/perfStats.js').createPerfMonitor();


//number/offset of graph elements and how they relate to various models
//num: # of vertices
//offset: in vertices
//graph -> {<model>: {num: int, offset: int

function graphCounts(graph) {
    var numRenderedSplits = graph.simulator.dataframe.getNumElements('renderedSplits');

    // var numPoints       = graph.simulator.timeSubset.pointsRange.len;
    // var numEdges        = graph.simulator.timeSubset.edgeRange.len;
    // var offsetPoint     = graph.simulator.timeSubset.pointsRange.startIdx;
    // var offsetEdge      = graph.simulator.timeSubset.edgeRange.startIdx;
    // var numMidPoints    = graph.simulator.timeSubset.midPointsRange.len;
    // var numMidEdges     = graph.simulator.timeSubset.midEdgeRange.len;
    // var offsetMidPoints = graph.simulator.timeSubset.midPointsRange.startIdx;
    // var offsetMidEdges  = graph.simulator.timeSubset.midEdgeRange.startIdx;

    var numPoints       = graph.dataframe.getNumElements('point');
    var numEdges        = graph.dataframe.getNumElements('edge')*2;
    var offsetPoint     = 0;
    var offsetEdge      = 0;
    var numMidPoints    = graph.dataframe.getNumElements('midPoints');
    var numMidEdges     = graph.dataframe.getNumElements('midEdges');
    var offsetMidPoints = 0;
    var offsetMidEdges  = 0;
    var numForwardsEdgeStartEndIdxs = graph.dataframe.getNumElements('point')*2;
    var numBackwardsEdgeStartEndIdxs = graph.dataframe.getNumElements('point')*2;
    var offsetEdgeStartEndIdxs = 0;

    var point       = {num: numPoints,    offset: offsetPoint};
    var edge        = {num: numEdges,     offset: offsetEdge};
    var midPoint    = {num: numMidPoints, offset: offsetMidPoints};
    var midEdge     = {num: numMidEdges,  offset: offsetMidEdges};
    var midEdgeColor ={num: numEdges * (numRenderedSplits + 1), offset:offsetMidEdges};
    var forwardsEdgeStartEndIdxs = {num: numForwardsEdgeStartEndIdxs, offset: offsetEdgeStartEndIdxs};
    var backwardsEdgeStartEndIdxs = {num: numBackwardsEdgeStartEndIdxs, offset: offsetEdgeStartEndIdxs};

    var counts = {
        curPoints: point,
        springsPos: edge,
        logicalEdges: edge,
        pointSizes: point,
        pointColors: point,
        edgeColors: edge,
        curMidPoints: midPoint,
        midSpringsPos: midEdge,
        midSpringsColorCoord: midEdge,
        midEdgeColors: midEdgeColor,
        forwardsEdgeStartEndIdxs: forwardsEdgeStartEndIdxs,
        backwardsEdgeStartEndIdxs: backwardsEdgeStartEndIdxs
    };

    // console.log('counts: ', counts);
    // _.each(_.keys(graph.dataframe.rawdata), function (key1) {
    //     console.log(key1 + ': ' + _.keys(graph.dataframe.rawdata[key1]));
    // });
    // console.log('Simulator Buffer Keys: ', _.keys(graph.dataframe.rawdata.buffers.simulator));
    // console.log('Host Buffer Point: ', graph.dataframe.rawdata.hostBuffers.points);


    // console.log('dataframe: ', graph.dataframe.rawdata);

    return counts;
}



function getBufferVersion (graph, bufferName) {
    var buffers = graph.simulator.versions.buffers;
    if (!(bufferName in buffers))
        logger.die('Cannot find version of buffer %s', bufferName);

    return buffers[bufferName];
}



// ... -> {<name>: {buffer: ArrayBuffer, version: int}}
function fetchVBOs(graph, renderConfig, bufferNames, counts) {
    var bufferSizes = fetchBufferByteLengths(counts, renderConfig);
    var targetArrays = {};

    var layouts = _.object(_.map(bufferNames, function (name) {
        var model = renderConfig.models[name];
        if (_.values(model).length != 1) {
            logger.die('Currently assumes one view per model');
        }

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

                logger.trace('Reading device buffer %s, stride %d', name, stride);

                return graph.simulator.dataframe.getBuffer(name, 'simulator').read(
                    new Float32Array(targetArrays[name].buffer),
                        counts[name].offset * stride,
                        counts[name].num * stride);
            })
        ).then(function () {
            _.each(hostBufs, function (layout, name) {
                var stride = layout.stride || (layout.count * rConf.gl2Bytes(layout.type));

                logger.trace('Fetching host buffer %s', name);
                if (!graph.simulator.dataframe.getLocalBuffer(name)) {
                    throw new Error('missing buffersLocal base buffer: ' + name);
                }

                var localBuffer = graph.simulator.dataframe.getLocalBuffer(name);
                var bytes_per_element = localBuffer.BYTES_PER_ELEMENT;

                // This will create another array (of type buffersLocal[name]) on top
                // of the exisiting array

                logger.debug('Copying hostBuffer[' + name + ']. Orig Buffer len: ', localBuffer.length, 'counts: ', counts[name]);
                logger.debug('constructor: ', localBuffer.constructor);

                targetArrays[name] = {
                    buffer: new localBuffer.constructor(
                        localBuffer.buffer,
                        counts[name].offset * bytes_per_element,
                        counts[name].num),
                    version: graph.simulator.versions.buffers[name]
                };
            });
            return targetArrays;
        }).fail(log.makeQErrorHandler(logger, 'node-driver.fetchVBO'));
}



//counts -> {<itemName>: int}
//For each render item, find a serverside model and send its count
function fetchNumElements(counts, renderConfig) {
    return _.object(
        _.keys(renderConfig.items)
            .map(function (item) {
                var itemDef = renderConfig.items[item];
                var aServersideModelName;
                if (itemDef.index) {
                    aServersideModelName = itemDef.index[0];
                } else {
                    var serversideModelBindings = _.values(renderConfig.items[item].bindings)
                        .filter(function (binding) {
                            var model = renderConfig.models[binding[0]];
                            return rConf.isBufServerSide(model);
                        });
                    if (serversideModelBindings.length !== 0) {
                        aServersideModelName = serversideModelBindings[0][0];
                    }
                }
                return [item, aServersideModelName ? counts[aServersideModelName].num : 0];
            }));
}


//counts -> {<model>: int}
//Find num bytes needed for each model
function fetchBufferByteLengths(counts, renderConfig) {

    return _.chain(renderConfig.models).omit(function (model, name) {
        return rConf.isBufClientSide(model);
    }).map(function (model, name) {
        var layout = _.values(model)[0];
        var count = counts[name].num;
        return [name, count * (layout.stride || (rConf.gl2Bytes(layout.type) * layout.count))];
    }).object().value();
}


function init(device, vendor, controls) {
    logger.trace("Starting initialization");

    /* Example of RenderGL instatiation.
     * Left for historical purposes, probably broken!
     *
    var document = null;
    var canvasStandin = {width: WIDTH, height: HEIGHT, clientWidth: WIDTH,
                         clientHeight: HEIGHT};
    var bgColor = [255, 255, 255, 1.0];
    RenderGl.create(document, canvasStandin, bgColor, global.dimensions);
    */

    return RenderNull.create(null)
        .then(function (renderer) {
            return NBody.create(renderer, device, vendor, controls);
        }).fail(log.makeQErrorHandler(logger, 'Failure in NBody creation'));
}



function getControls(controlsName) {
    var controls = lConf.controls.default;
    if (controlsName in lConf.controls) {
        controls = lConf.controls[controlsName];
    }
    else {
        logger.warn('Unknown controls "%s", using defaults.', controlsName);
    }

    return controls;
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
}


///////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////


function create(dataset) {
    logger.trace("STARTING DRIVER");

    //Observable {play: bool, layout: bool, ... cfg settings ...}
    //  play: animation stream
    //  layout: whether to actually call layout algs (e.g., don't for filtering)
    var userInteractions = new Rx.Subject();

    // This signal is emitted whenever the renderer's VBOs change, and contains Typed Arraysn for
    // the contents of each VBO
    var animStepSubj = new Rx.BehaviorSubject(null);
    var controls = getControls(dataset.metadata.controls);
    var device = dataset.metadata.device;
    var vendor = dataset.metadata.vendor;

    var graph = init(device, vendor, controls).then(function (graph) {
        logger.trace('LOADING DATASET');
        return loader.loadDatasetIntoSim(graph, dataset)

    }).then(function (graph) {
        // Load into dataframe data attributes that rely on the simulator existing.
        var outDegrees = graph.simulator.dataframe.getHostBuffer('forwardsEdges').degreesTyped;
        var inDegrees = graph.simulator.dataframe.getHostBuffer('backwardsEdges').degreesTyped;
        var unsortedEdges = graph.simulator.dataframe.getHostBuffer('unsortedEdges');

        graph.dataframe.loadDegrees(outDegrees, inDegrees);
        graph.dataframe.loadEdgeDestinations(unsortedEdges);
        return graph;

    }).then(function (graph) {
        logger.trace('ANIMATING');

        var play = userInteractions.filter(function (o) { return o && o.play; });

        //Observable {play: bool, layout: bool}
        var isRunning =
            Rx.Observable.merge(
                //run beginning & after every interaction
                play.merge(Rx.Observable.return({play: true, layout: false})),
                //...  but stop a bit after last one
                play.filter(function (o) { return o && o.layout; })
                    .merge(Rx.Observable.return())
                    .delay(graph.globalControls.simulationTime)
                    .map(_.constant({play: false, layout: false})),
                play.filter(function (o) { return !o || !o.layout; })
                    .merge(Rx.Observable.return())
                    .delay(4)
                    .map(_.constant({play: false, layout: false})));

        var isRunningRecent = new Rx.ReplaySubject(1);

        isRunningRecent.subscribe(function (v) {
            logger.trace('=============================isRunningRecent:', v);
        });

        isRunning.subscribe(isRunningRecent);

        // Loop simulation by recursively expanding each tick event into a new sequence
        // Gate by isRunning
        Rx.Observable.return(graph)
            //.flatMap(function () {
            //    return Rx.Observable.fromPromise(graph.tick(0, {play: true, layout: false}));
            //})
            .expand(function(graph) {
                perf.startTiming('tick_durationMS');
                //return (Rx.Observable.fromCallback(graph.renderer.document.requestAnimationFrame))()
                return Rx.Observable.return()
                    // Add in a delay to allow nodejs' event loop some breathing room
                    .flatMap(function() {
                        return delayObservableGenerator(1, false);
                    })
                    .flatMap(function () {
                        return isRunningRecent.filter(function (o) { return o.play; }).take(1);
                    })
                    .flatMap(function(v) {
                        return Rx.Observable.fromPromise(
                            graph.updateSettings(v).then(function () {
                                return graph.tick(v);
                            }).then(function () {
                                perf.endTiming('tick_durationMS');
                            })
                        );
                    })
                    .map(_.constant(graph));
            })
            .subscribe(
                animStepSubj,
                log.makeRxErrorHandler(logger, 'node-driver: tick failed')
            );

        logger.trace('Graph created');
        return graph;
    })
    .fail(function (err) {
        logger.die(err, 'Driver initialization error');
    })
    .done();

    return {
        interact: function (settings) {
            userInteractions.onNext(settings);
        },
        ticks: animStepSubj.skip(1),
        graph: graph
    };
}

function extendDataVersions (data, bufferVersions, graph) {
    var versions = data.versions;

    _.each(_.keys(bufferVersions), function (key) {
        if (versions[key] === undefined) {
            versions[key] = bufferVersions[key];
        }
    });
    _.each(_.keys(graph.simulator.versions.buffers), function (key) {
        if (versions[key] === undefined) {
            versions[key] = graph.simulator.versions.buffers[key];
        }
    });

    return data;
}


/**
 * Fetches compressed VBO data and # of elements for active buffers and programs
 * @returns {Rx.Observable} an observable sequence containing one item, an Object with the 'buffers'
 * property set to an Object mapping buffer names to ArrayBuffer data; and the 'elements' Object
 * mapping render item names to number of elements that should be rendered for the given buffers.
 */
function fetchData(graph, renderConfig, compress, bufferNames, bufferVersions, programNames) {
    var counts = graphCounts(graph);


    bufferVersions = bufferVersions || _.object(bufferNames.map(function (name) { return [name, -1]}));
    var bufferByteLengths = _.pick(fetchBufferByteLengths(counts, renderConfig),
                                          bufferNames);

    var elements = _.pick(fetchNumElements(counts, renderConfig), programNames);
    var neededBuffers =
        bufferNames.filter(function (name) {
            var clientVersion = bufferVersions[name];
            var liveVersion = getBufferVersion(graph, name);
            return clientVersion < liveVersion;
        });
    bufferNames = neededBuffers;

    if (bufferNames.length === 0) {
        var obj = {
            compressed: [],
            uncompressed: [],
            elements: [],
            bufferByteLengths: [],
            versions: []
        };
        extendDataVersions(obj, bufferVersions, graph);
        logger.debug('fetchData has no requested buffers. Returning empty arrays.');
        return Rx.Observable.from([obj]);
    }

    perf.startTiming('fetchVBOs_durationMS');
    return Rx.Observable.fromPromise(fetchVBOs(graph, renderConfig, bufferNames, counts))
        .flatMap(function (vbos) {
            //perf.getMetric({metric: {'fetchVBOs_lastVersions': bufferVersions}});
            perf.endTiming('fetchVBOs_durationMS');

            bufferNames.forEach(function (bufferName) {
                if (!vbos.hasOwnProperty(bufferName)) {
                    logger.die('Vbos does not have buffer %s', bufferName);
                }
            });

            _.each(bufferNames, function (bufferName) {
                var actualByteLength = vbos[bufferName].buffer.byteLength;
                var expectedByteLength = bufferByteLengths[bufferName];
                if( actualByteLength !== expectedByteLength) {
                    logger.error('Mismatch length for VBO %s (Expected:%d Got:%d)',
                               bufferName, expectedByteLength, actualByteLength);
                }
            });

            //[ {buffer, version, compressed} ] ordered by bufferName
            perf.startTiming('compressAll_durationMS');
            var compressed =
                bufferNames.map(function (bufferName) {
                    perf.startTiming('compress_durationMS');
                    return Rx.Observable.fromNodeCallback(compress.deflate)(
                        vbos[bufferName].buffer,//binary,
                        {output: new Buffer(
                            Math.max(1024, Math.round(vbos[bufferName].buffer.byteLength * 1.5)))})
                        .map(function (compressed) {
                            logger.trace('compress bufferName %s (size %d)', bufferName, vbos[bufferName].buffer.byteLength);
                            perf.histogram('compress_inputBytes', vbos[bufferName].buffer.byteLength);
                            perf.histogram('compress_outputBytes', compressed.length);
                            perf.endTiming('compress_durationMS');
                            return _.extend({}, vbos[bufferName], {compressed: compressed});
                        });
                });

            return Rx.Observable.zipArray(compressed).take(1)
                .do(function () { perf.endTiming('compressAll_durationMS');

        })
        .map(function(compressedVbos) {

            var buffers =
                _.object(_.zip(
                        bufferNames,
                        bufferNames.map(function (_, i) {  return compressedVbos[i].compressed[0]; })));

            var uncompressed =
                _.object(_.zip(
                        bufferNames,
                        bufferNames.map(function (_, i) {  return compressedVbos[i].buffer.buffer || compressedVbos[i].buffer; })));

            var versions =
                _.object(_.zip(
                        bufferNames,
                        bufferNames.map(function (_, i) {  return compressedVbos[i].version; })));

            var bundledData = {
                compressed: buffers,
                uncompressed: uncompressed,
                elements: elements,
                bufferByteLengths:bufferByteLengths,
                versions: versions
            };

            extendDataVersions(bundledData, bufferVersions, graph);
            return bundledData;
        });
});
}


exports.create = create;
exports.fetchData = fetchData;
