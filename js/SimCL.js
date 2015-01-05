"use strict";

var Q = require('q');
var util = require('./util.js');
var cljs = require('./cl.js');
var _ = require('underscore');
var debug = require("debug")("graphistry:graph-viz:graph:simcl");

if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

Q.longStackSupport = true;
var randLength = 73;


//CL+GL+local vbos & setters will be created/exported, no need to modify anything else
var NAMED_CLGL_BUFFERS = {
    'pointColors': 'setColors',
    'pointSizes': 'setSizes',
    'pointTags': 'setPointTags',
    'edgeTags': 'setEdgeTags'
};

function create(renderer, dimensions, numSplits, locked, layoutAlgorithms) {
    return cljs.create(renderer)
    .then(function(cl) {
        debug("Creating CL object with GL context");

        var kernels = _.chain(layoutAlgorithms).pluck('kernels').flatten().value();
        var kernelFileMap = {};

        _.each(kernels, function (kernel) {
            if (!(kernelFileMap[kernel.file]))
                kernelFileMap[kernel.file] = [kernel.name];
            else
                kernelFileMap[kernel.file].push(kernel.name);
        })
        debug('Kernels selected for compilation: %o', kernelFileMap);

        return Q.all(_.map(kernelFileMap, function (kName, kFile) {
            debug('Retrieving kernel source: %s', kFile);

            // Temporary Hack to avoid interfering with Paden's work
            var loader = (kFile === 'apply-forces.cl') ? util.getShaderSource : util.getKernelSource;

            return loader(kFile).then(function (source) {
                return cl.compile(source, kernelFileMap[kFile]);
            }).fail(function (err) {
                console.error("Failure while compiling kernels ", (err||{}).stack);
            });
        })).then(function (compiledKernels) {
            debug("All kernels successfully compiled");
            var mergedKernels = {};
            for (var i = 0; i < compiledKernels.length; i++)
                _.extend(mergedKernels, compiledKernels[i]);
            return mergedKernels;
        }).then(function(kernels) {
            debug("Creating SimCL...")

            var simObj = {
                renderer: renderer,
                NAMED_CLGL_BUFFERS: NAMED_CLGL_BUFFERS,
                cl: cl,
                elementsPerPoint: 2,
                kernels: kernels,
                versions: {
                    tick: 0,
                    buffers: { }
                },
                layoutAlgorithms: layoutAlgorithms
            };


            simObj.buffersLocal = {};
            createSetters(simObj);


            simObj.tick = tick.bind(this, simObj);

            simObj.setPoints = setPoints.bind(this, simObj);

            simObj.setEdges = setEdges.bind(this, renderer, simObj);
            simObj.setEdgeColors = setEdgeColors.bind(this, simObj);
            simObj.setMidEdgeColors = setMidEdgeColors.bind(this, simObj);
            simObj.setLabels = setLabels.bind(this, simObj);
            simObj.setLocked = setLocked.bind(this, simObj);
            simObj.setPhysics = setPhysics.bind(this, simObj);
            simObj.setTimeSubset = setTimeSubset.bind(this, renderer, simObj);
            simObj.resetBuffers = resetBuffers.bind(this, simObj);
            simObj.tickBuffers = tickBuffers.bind(this, simObj);

            simObj.dimensions = dimensions;
            simObj.numSplits = numSplits;
            simObj.numPoints = 0;
            simObj.numEdges = 0;
            simObj.numForwardsWorkItems = 0;
            simObj.numBackwardsWorkItems = 0;
            simObj.numMidPoints = 0;
            simObj.numMidEdges = 0;
            simObj.locked = locked || {};
            simObj.labels = [];


            simObj.bufferHostCopies = {
                forwardsEdges: null
            };

            simObj.buffers = {
                nextPoints: null,
                randValues: null,
                curPoints: null,
                forwardsEdges: null,
                forwardsDegrees: null,
                forwardsWorkItems: null,
                backwardsEdges: null,
                backwardsDegrees: null,
                backwardsWorkItems: null,
                springsPos: null,
                midSpringsPos: null,
                midSpringsColorCoord: null,
                nextMidPoints: null,
                curMidPoints: null
            };

            simObj.timeSubset = {
                relRange: {min: 0, max: 100},
                pointsRange:    {startIdx: 0, len: renderer.numPoints},
                edgeRange:      {startIdx: 0, len: renderer.numEdges},
                midPointsRange: {startIdx: 0, len: renderer.numPoints * numSplits},
                midEdgeRange:   {startIdx: 0, len: renderer.numEdges * numSplits}
            };

            Object.seal(simObj.buffers);
            Object.seal(simObj);

            debug("WebCL simulator created");
            return simObj
        })
    }).fail(function (err) {
        console.error("Cannot create SimCL ", (err||{}).stack);
    });
}


/**
 * Simulator * ?[ String ] * ?int -> ()
 * Increase buffer version to tick number, signifying its contents may have changed
 * (Same version number signifies no change since last read of that buffer)
 * If not tick provided, increment global and use that
 **/

var tickBuffers = function (simulator, bufferNames, tick) {

    if (tick === undefined) {
        simulator.versions.tick++;
        tick = simulator.versions.tick;
    }

    if (bufferNames) {
        bufferNames.forEach(function (name) {
            simulator.versions.buffers[name] = tick;
        });
    } else {
        _.keys(simulator.versions.buffers).forEach(function (name) {
            simulator.versions.buffers[name] = tick;
            console.log('tick', name, tick);
        });
    }

};


/**
 * Given an array of (potentially null) buffers, delete the non-null buffers and set their
 * variable in the simulator buffer object to null.
 * NOTE: erase from host immediately, though device may take longer (unobservable)
 */
var resetBuffers = function(simulator, buffers) {

    if (!buffers.length) {
        return;
    }

    var buffNames = buffers
        .filter(_.identity)
        .map(function (buffer) {
            for(var buff in simulator.buffers) {
                if(simulator.buffers.hasOwnProperty(buff) && simulator.buffers[buff] == buffer) {
                    return buff;
                }
            }
            throw new Error("Could not find buffer", buffer);
        });

    tickBuffers(simulator, buffNames);

    //delete old
    buffNames.forEach(function(buffName) {
        simulator.buffers[buffName].delete();
        simulator.buffers[buffName] = null;
    });
};


/**
 * Set the initial positions of the points in the NBody simulation (curPoints)
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

    simulator.resetBuffers([
        simulator.buffers.nextPoints,
        simulator.buffers.randValues,
        simulator.buffers.curPoints])

    simulator.numPoints = points.length / simulator.elementsPerPoint;
    simulator.renderer.numPoints = simulator.numPoints;

    debug("Number of points in simulation: %d", simulator.renderer.numPoints);

    // Create buffers and write initial data to them, then set
    simulator.tickBuffers(['curPoints', 'randValues']);

    return Q.all([
        simulator.renderer.createBuffer(points, 'curPoints'),
        simulator.cl.createBuffer(points.byteLength, 'nextPoints'),
        simulator.cl.createBuffer(randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT,
            'randValues')])
    .spread(function(pointsVBO, nextPointsBuffer, randBuffer) {
        debug('Created most of the points');
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
    })
    .then(function () {
        _.each(simulator.layoutAlgorithms, function (la) {
            la.setPoints(simulator);
        });
        return simulator;
    })
    .fail(function (err) {
        console.error("Failure in SimCl.setPoints ", (err||{}).stack);
    });
}


//string -> simulator * typedarray -> Q simulator
// Create and store buffer on host and device with passed in defaults
// returns corresponding setter
function makeSetter(simulator, name) {

    return function (data) {

        simulator.buffersLocal[name] = null;
        simulator.renderer.buffers[name] = null;

        simulator.buffersLocal[name] = data;
        simulator.resetBuffers([simulator.buffers[name]])
        simulator.tickBuffers([name]);

        return simulator.renderer.createBuffer(data, name)
        .then(function(vbo) {
            debug('Created %s VBO', name);
            simulator.renderer.buffers[name] = vbo;
            return simulator;
        }).fail(function (err) {
            console.error("ERROR Failure in SimCl.set %s", name, (err||{}).stack)
        });

    };
}


// ex:  simulator.setSizes(pointSizes).then(...)
function createSetters (simulator) {
    _.each(NAMED_CLGL_BUFFERS, function (setterName, bufferName) {
        simulator[setterName] = makeSetter(simulator, bufferName);
    });
}

//Simulator * ?[HtmlString] -> ()
function setLabels(simulator, labels) {
    simulator.labels = labels || [];
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
function setEdges(renderer, simulator, forwardsEdges, backwardsEdges, midPoints) {
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

    simulator.bufferHostCopies.forwardsEdges = forwardsEdges;

    simulator.resetBuffers([
        simulator.buffers.forwardsEdges,
        simulator.buffers.forwardsDegrees,
        simulator.buffers.forwardsWorkItems,
        simulator.buffers.backwardsEdges,
        simulator.buffers.backwardsDegrees,
        simulator.buffers.backwardsWorkItems,
        simulator.buffers.springsPos,
        simulator.buffers.midSpringsPos,
        simulator.buffers.midSpringsColorCoord]);

    return Q().then(function() {
        // Init constant
        simulator.numEdges = forwardsEdges.edgesTyped.length / elementsPerEdge;
        debug("Number of edges in simulation: %d", simulator.numEdges);

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
            simulator.cl.createBuffer(forwardsEdges.degreesTyped.byteLength, 'forwardsDegrees'),
            simulator.cl.createBuffer(forwardsEdges.workItemsTyped.byteLength, 'forwardsWorkItems'),
            simulator.cl.createBuffer(backwardsEdges.edgesTyped.byteLength, 'backwardsEdges'),
            simulator.cl.createBuffer(backwardsEdges.degreesTyped.byteLength, 'backwardsDegrees'),
            simulator.cl.createBuffer(backwardsEdges.workItemsTyped.byteLength, 'backwardsWorkItems'),
            simulator.cl.createBuffer(midPoints.byteLength, 'nextMidPoints'),
            simulator.renderer.createBuffer(simulator.numEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'springs'),
            simulator.renderer.createBuffer(midPoints, 'curMidPoints'),
            simulator.renderer.createBuffer(simulator.numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSprings'),
            simulator.renderer.createBuffer(simulator.numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT, 'midSpringsColorCoord')]);
    })
    .spread(function(forwardsEdgesBuffer, forwardsDegreesBuffer, forwardsWorkItemsBuffer,
                     backwardsEdgesBuffer, backwardsDegreesBuffer, backwardsWorkItemsBuffer,
                     nextMidPointsBuffer, springsVBO,
                     midPointsVBO, midSpringsVBO, midSpringsColorCoordVBO) {
        // Bind buffers
        simulator.buffers.forwardsEdges = forwardsEdgesBuffer;
        simulator.buffers.forwardsDegrees = forwardsDegreesBuffer;
        simulator.buffers.forwardsWorkItems = forwardsWorkItemsBuffer;
        simulator.buffers.backwardsEdges = backwardsEdgesBuffer;
        simulator.buffers.backwardsDegrees = backwardsDegreesBuffer;
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
            simulator.buffers.forwardsDegrees.write(forwardsEdges.degreesTyped),
            simulator.buffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
            simulator.buffers.backwardsEdges.write(backwardsEdges.edgesTyped),
            simulator.buffers.backwardsDegrees.write(backwardsEdges.degreesTyped),
            simulator.buffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
        ]);
    })
    .spread(function(springsBuffer, midPointsBuf, midSpringsBuffer, midSpringsColorCoordBuffer) {
        simulator.buffers.springsPos = springsBuffer;
        simulator.buffers.midSpringsPos = midSpringsBuffer;
        simulator.buffers.curMidPoints = midPointsBuf;
        simulator.buffers.midSpringsColorCoord = midSpringsColorCoordBuffer;
    })
    .then( function () {
        return Q.all(
            simulator.layoutAlgorithms
                .map(function (alg) {
                    return alg.setEdges(simulator);
                }));
    })
    .then(function () {
        setTimeSubset(renderer, simulator, simulator.timeSubset.relRange);
        return simulator;
    })
    .fail(function (err) {
        console.error('ERROR in SetEdges ', (err||{}).stack);
    });
}


/**
 * Sets the edge colors for the graph
 *
 * @param simulator - the simulator object to set the edges for
 * @param {Uint32Array} edgeColors - dense array of edge start and end colors
 */
function setEdgeColors(simulator, edgeColors) {
    if (!edgeColors) {
        debug('Using default edge colors')
        var forwardsEdges = simulator.bufferHostCopies.forwardsEdges;
        edgeColors = new Uint32Array(forwardsEdges.edgesTyped.length);
        for (var i = 0; i < edgeColors.length; i++) {
            var nodeIdx = forwardsEdges.edgesTyped[i];
            edgeColors[i] = simulator.buffersLocal.pointColors[nodeIdx];
        }
    }


    simulator.buffersLocal.edgeColors = edgeColors;
    simulator.tickBuffers(['edgeColors']);

    return simulator;
}

function setMidEdgeColors(simulator, midEdgeColors) {
    console.error("TODO: Code setMidEdgeColors")
}

function setLocked(simulator, cfg) {
    _.extend(simulator.locked, cfg || {});
}



function setPhysics(simulator, cfg) {
    _.each(simulator.layoutAlgorithms, function (algo) {
        if (algo.name in cfg) {
            algo.setPhysics(cfg[algo.name]);
        }
    });
}

//renderer * simulator * {min: 0--100, max: 0--100}
function setTimeSubset(renderer, simulator, range) {

    //points
    var startIdx = Math.round(renderer.numPoints * 0.01 * range.min);
    var numPoints = Math.round(renderer.numPoints * 0.01 * range.max) - startIdx;


    var pointToEdgeIdx = function (ptIdx) {
        var edgeList = simulator.bufferHostCopies.forwardsEdges.srcToWorkItem[ptIdx];
        return simulator.bufferHostCopies.forwardsEdges.workItemsTyped[2 * edgeList];
    };

    //edges: sorted by start, so just compare start vs stop
    var startEdgeIdx = pointToEdgeIdx(Math.round(renderer.numPoints * 0.01 * range.min));
    var endEdgeIdx = pointToEdgeIdx(Math.round(renderer.numPoints * 0.01 * range.max));

    var numEdges = endEdgeIdx - startEdgeIdx;

    simulator.timeSubset =
        {relRange: range, //%
         pointsRange:       {startIdx: startIdx, len: numPoints},
         edgeRange:         {startIdx: startEdgeIdx, len: numEdges},
         midPointsRange:    {
                startIdx: startIdx      * simulator.numSplits,
                len: numPoints          * simulator.numSplits},
         midEdgeRange:      {
                startIdx: startEdgeIdx  * (1 + simulator.numSplits),
                len: numEdges           * (1 + simulator.numSplits)}};


    simulator.tickBuffers([
        //points/edges
        'curPoints', 'nextPoints', 'springsPos',

        //style
        'edgeColors',

        //midpoints/midedges
        'curMidPoints', 'nextMidPoints', 'curMidPoints', 'midSpringsPos', 'midSpringsColorCoord'

        ].concat(_.keys(NAMED_CLGL_BUFFERS)));

}


//simulator * int * {play: bool, layout: bool} -> ()
//input positions: curPoints
//output positions: nextPoints
function tick(simulator, stepNumber, cfg) {

    // If there are no points in the graph, don't run the simulation
    if(simulator.numPoints < 1) {
        return Q(simulator);
    }

    simulator.versions.tick++;

    if (!cfg.layout) {
        debug('No layout algs to run, early exit');
        return Q(simulator);
    }


    //run each algorithm to completion before calling next
    var tickAllHelper = function (remainingAlgorithms) {
        if (!remainingAlgorithms.length) return;
        var algorithm = remainingAlgorithms.shift();
        return Q()
            .then(function () {
                return algorithm.tick(simulator, stepNumber);
            })
            .then(function () {
                return tickAllHelper(remainingAlgorithms);
            });
    };

    var res = Q()
    .then(function () { 
        return tickAllHelper(simulator.layoutAlgorithms.slice(0)); 
    }).then(function() {
        // This cl.queue.finish() needs to be here because, without it, the queue appears to outside
        // code as running really fast, and tons of ticks will be called, flooding the GPU/CPU with
        // more stuff than they can handle.
        // What we really want here is to give finish() a callback and resolve the promise when it's
        // called, but node-webcl is out-of-date and doesn't support WebCL 1.0's optional callback
        // argument to finish().
        simulator.cl.queue.finish();
        simulator.renderer.finish();
    }).fail(function (err) {
        console.error('SimCl tick fail! ', err, (err||{}).stack);
    })

    return res;
}


module.exports = {
    'create': create,
    NAMED_CLGL_BUFFERS: NAMED_CLGL_BUFFERS
};
