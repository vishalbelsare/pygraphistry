define(["Q", "util", "cl"], function(Q, util, cljs) {
    "use strict";

    //Q.longStackSupport = true;
    var randLength = 73;


    function create(renderer, dimensions, numSplits, locked) {
        return cljs.create(renderer.gl)
        .then(function(cl) {
            // Compile the WebCL kernels
            return util.getSource("apply-forces.cl")
            .then(function(source) {
                return cl.compile(source, ["apply_points", "apply_springs", "apply_midpoints", "apply_midsprings"]);
            })
            .then(function(kernels) {
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
                simObj.dimensions = dimensions;
                simObj.numSplits = numSplits;
                simObj.numPoints = 0;
                simObj.numEdges = 0;
                simObj.locked = util.extend(
                    {lockPoints: false, lockMidpoints: true, lockEdges: false, lockMidedges: true},
                    (locked || {})
                );
                simObj.buffers = {};

                console.debug("WebCL simulator created");
                return simObj
            });
        })

    }


    function setPoints(simulator, points) {
        if(points.length % simulator.elementsPerPoint !== 0) {
            throw new Error("The points buffer is an invalid size (must be a multiple of " + simulator.elementsPerPoint + ")");
        }

        return Q.all(
                [ simulator.buffers.nextPoints,
                  simulator.buffers.randValues,
                  simulator.buffers.curPoints ]
            .filter(function(val) { return !(!val); })
            .map(function(val) { return val.delete(); })
        )
        .then(function() {
            // Reset
            simulator.buffers.nextPoints = null;
            simulator.buffers.randValues = null;
            simulator.buffers.curPoints = null;

            simulator.numPoints = 0;
            simulator.renderer.numPoints = 0;

            if (simulator.renderer.buffers.curPoints) {
                return simulator.renderer.buffers.curPoints.delete()
                .then(function() {
                    simulator.renderer.buffers.curPoints = null;
                })
            } else {
                return null;
            }
        })
        .then(function() {
            // Create buffers
            simulator.numPoints = points.length / simulator.elementsPerPoint;
            simulator.renderer.numPoints = simulator.numPoints;

            // If there are 0 points, then don't create any of the buffers
            if(simulator.numPoints < 1) {
                throw "zero-points";
            }

            console.debug("Number of points:", simulator.renderer.numPoints);

            // Create buffers and write initial data to them, then set
            return Q.all([simulator.renderer.createBuffer(points),
                   simulator.cl.createBuffer(points.byteLength),
                   simulator.cl.createBuffer(randLength * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT)]);
        })
        .spread(function(pointsVBO, nextPointsBuffer, randBuffer) {
            // Bind buffers
            simulator.renderer.buffers.curPoints = pointsVBO;
            simulator.buffers.nextPoints = nextPointsBuffer;
            simulator.buffers.randValues = randBuffer;

            var rands = new Float32Array(randLength * simulator.elementsPerPoint);
            for(var i = 0; i < rands.length; i++) {
                rands[i] = Math.random();
            }

            var pointsBuf = simulator.cl.createBufferGL(pointsVBO).then(function (pointsBuf) {
                simulator.buffers.curPoints = pointsBuf;
                return pointsBuf;
            })

            return Q.all([pointsBuf, simulator.buffers.randValues.write(rands)]);
        })
        .spread(function(pointsBuf, randValues) {
            // Point kernel params
            var types = [];
            if(!cljs.CURRENT_CL) {
                // FIXME: find the old WebCL platform type for float2
                types = [cljs.types.uint_t, null, null , cljs.types.local_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, null, cljs.types.uint_t];
            }

            var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
            return simulator.pointKernel.setArgs(
                [new Uint32Array([simulator.numPoints]),
                 simulator.buffers.curPoints.buffer,
                 simulator.buffers.nextPoints.buffer,
                 new Uint32Array([localPos]),
                 new Float32Array([simulator.dimensions[0]]),
                 new Float32Array([simulator.dimensions[1]]),
                 new Float32Array([-0.00001]),
                 new Float32Array([0.2]),
                 simulator.buffers.randValues.buffer,
                 new Uint32Array([0])],
                types);
        })
        .then(
            function() { return simulator; },
            function(err) {
                if (err === "zero-points") {
                    return simulator;
                } else {
                    throw err;
                }
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

        // Delete all the existing edge buffers
        return Q.all(
            [ simulator.buffers.forwardsEdges,
              simulator.buffers.forwardsWorkItems,
              simulator.buffers.backwardsEdges,
              simulator.buffers.backwardsWorkItems,
              simulator.buffers.springsPos,
              simulator.buffers.midSpringsPos ]
            .filter(function(val) { return !(!val); })
            .map(function(val) { return val.delete(); }))
        .then(function() {
            // Reset
            simulator.buffers.forwardsEdges = null;
            simulator.buffers.forwardsWorkItems = null;
            simulator.buffers.springsPos = null;
            simulator.buffers.backwardsEdges = null;
            simulator.buffers.backwardsWorkItems = null;

            simulator.numEdges = 0;
            simulator.renderer.numEdges = 0;
            simulator.numForwardsWorkItems = 0;
            simulator.numBackwardsWorkItems = 0;

            simulator.numMidPoints = 0;
            simulator.renderer.numMidPoints = 0;
            simulator.numMidEdges = 0;
            simulator.renderer.numMidEdges = 0;

            //FIXME encapsulate and repeat for midSprings
            if(simulator.renderer.buffers.springs) {
                return simulator.renderer.buffers.springs.delete()
                .then(function() {
                    simulator.renderer.buffers.springs = null;
                })
            } else {
                return null;
            }
        })
        .then(function() {
            // Init constant
            if(forwardsEdges.edgesTyped.length % elementsPerEdge !== 0) {
                throw new Error("The edge buffer size is invalid (must be a multiple of " + elementsPerEdge + ")");
            }
            if(forwardsEdges.workItemsTyped.length % elementsPerWorkItem !== 0) {
                throw new Error("The work item buffer size is invalid (must be a multiple of " + elementsPerWorkItem + ")");
            }

            simulator.numEdges = forwardsEdges.edgesTyped.length / elementsPerEdge;
            simulator.renderer.numEdges = simulator.numEdges;
            simulator.numForwardsWorkItems = forwardsEdges.workItemsTyped.length / elementsPerWorkItem;
            simulator.numBackwardsWorkItems = backwardsEdges.workItemsTyped.length / elementsPerWorkItem;

            simulator.numMidPoints = midPoints.length / simulator.elementsPerPoint;
            simulator.renderer.numMidPoints = simulator.numMidPoints;
            simulator.numMidEdges = simulator.numMidPoints + simulator.numEdges;
            simulator.renderer.numMidEdges = simulator.numMidEdges;
        })
        .then(function() {
            // Create buffers
            return Q.all([
                simulator.cl.createBuffer(forwardsEdges.edgesTyped.byteLength),
                simulator.cl.createBuffer(forwardsEdges.workItemsTyped.byteLength),
                simulator.cl.createBuffer(backwardsEdges.edgesTyped.byteLength),
                simulator.cl.createBuffer(backwardsEdges.workItemsTyped.byteLength),
                simulator.renderer.createBuffer(simulator.numEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT),
                simulator.renderer.createBuffer(midPoints),
                simulator.cl.createBuffer(midPoints.byteLength),
                simulator.renderer.createBuffer(simulator.numMidEdges * elementsPerEdge * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT)]);
        })
        .spread(function(forwardsEdgesBuffer, forwardsWorkItemsBuffer,
                         backwardsEdgesBuffer, backwardsWorkItemsBuffer, springsVBO, midPointsVBO,
                         nextMidPointsBuffer, midSpringsVBO) {
            // Bind buffers
            simulator.buffers.forwardsEdges = forwardsEdgesBuffer;
            simulator.buffers.forwardsWorkItems = forwardsWorkItemsBuffer;
            simulator.buffers.backwardsEdges = backwardsEdgesBuffer;
            simulator.buffers.backwardsWorkItems = backwardsWorkItemsBuffer;
            simulator.renderer.buffers.springs = springsVBO;

            simulator.renderer.buffers.curMidPoints = midPointsVBO;
            simulator.buffers.nextMidPoints = nextMidPointsBuffer;
            simulator.renderer.buffers.midSprings = midSpringsVBO;

            return Q.all([simulator.cl.createBufferGL(springsVBO),
                          simulator.buffers.forwardsEdges.write(forwardsEdges.edgesTyped),
                          simulator.buffers.forwardsWorkItems.write(forwardsEdges.workItemsTyped),
                          simulator.buffers.backwardsEdges.write(backwardsEdges.edgesTyped),
                          simulator.buffers.backwardsWorkItems.write(backwardsEdges.workItemsTyped),
                          simulator.cl.createBufferGL(midPointsVBO),
                          simulator.cl.createBufferGL(midSpringsVBO)]);
        })
        .spread(function (springsBuffer, fwdEdges, fwdWorkItems, bkwdEdges, bkwdWorkItems,
                          midPointsBuf, midSpringsBuffer) {
            // Midpoints kernel paramters
            simulator.buffers.curMidPoints = midPointsBuf;

            var types = [];
            if(!cljs.CURRENT_CL) {
                // FIXME: find the old WebCL platform type for float2
                types = [cljs.types.uint_t, cljs.types.uint_t, null, null , cljs.types.local_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, cljs.types.float_t, null, cljs.types.uint_t];
            }

            var localPos = Math.min(simulator.cl.maxThreads, simulator.numMidPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;

            return simulator.midPointKernel.setArgs(
                [new Uint32Array([simulator.numMidPoints]),
                 new Uint32Array([simulator.numSplits]),
                 simulator.buffers.curMidPoints.buffer,
                 simulator.buffers.nextMidPoints.buffer,
                 new Uint32Array([localPos]),
                 new Float32Array([simulator.dimensions[0]]),
                 new Float32Array([simulator.dimensions[1]]),
                 new Float32Array([-0.00001]),
                 new Float32Array([0.2]),
                 simulator.buffers.randValues.buffer,
                 new Uint32Array([0])],
                types)
            .then(function() {
                return [springsBuffer, midPointsBuf, midSpringsBuffer];
            });
        })
        .spread(function(springsBuffer, midPointsBuf, midSpringsBuffer) {
            // Edges kernel params
            simulator.buffers.springsPos = springsBuffer;
            simulator.buffers.midSpringsPos = midSpringsBuffer;

            var types = [];
            if(!cljs.CURRENT_CL) {
                types = [null, null , null, null, null, cljs.types.float_t, cljs.types.float_t, null];
            }

            var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
            return simulator.edgesKernel.setArgs(
                [null, //forwards/backwards picked dynamically
                 null, //forwards/backwards picked dynamically
                 null, //simulator.buffers.curPoints.buffer then simulator.buffers.nextPoints.buffer
                 null, //simulator.buffers.nextPoints.buffer then simulator.buffers.curPoints.buffer
                 simulator.buffers.springsPos.buffer,
                 new Float32Array([1.0]),
                 new Float32Array([0.1]),
                 null],
                types);
        })
        .then(function() {
            // Mid-edges kernel params
            var types = [];
            if (!cljs.CURRENT_CL)
                types = [cljs.types.uint_t, null, null, null, null , null, null, cljs.types.float_t, cljs.types.float_t, null];

            var localPos = Math.min(simulator.cl.maxThreads, simulator.numPoints) * simulator.elementsPerPoint * Float32Array.BYTES_PER_ELEMENT;
            return simulator.midEdgesKernel.setArgs(
                [new Uint32Array([simulator.numSplits]),
                 simulator.buffers.forwardsEdges.buffer, //only need one direction as guaranteed to be chains
                 simulator.buffers.forwardsWorkItems.buffer,
                 simulator.buffers.curPoints.buffer,
                 simulator.buffers.nextMidPoints.buffer,
                 simulator.buffers.curMidPoints.buffer,
                 simulator.buffers.midSpringsPos.buffer, //
                 new Float32Array([1.0]),
                 new Float32Array([0.1]),
                 null
                 ],
                types);
        })
    }


    function setLocked(simulator, cfg, stepNumber) {
        cfg = cfg || {};
        stepNumber = stepNumber || 0;
        $.extend(simulator.locked, cfg);
    }


    function setPhysics(simulator, cfg, stepNumber) {
        // TODO: Instead of setting these kernel args immediately, we should make the physics values
        // properties of the simulator object, and just change those properties. Then, when we run
        // the kernels, we set the arg using the object property (the same way we set stepNumber.)

        stepNumber = stepNumber || 0;
        cfg = cfg || {};

        if(cfg.charge || cfg.gravity) {
            var charge = cfg.charge ? new Float32Array([cfg.charge]) : null;
            var charge_t = cfg.charge ? cljs.types.float_t : null;

            var gravity = cfg.gravity ? new Float32Array([cfg.gravity]) : null;
            var gravity_t = cfg.gravity ? cljs.types.float_t : null;

            simulator.pointKernel.setArgs(
                [null, null, null, null, null, null, charge, gravity, null, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, charge_t, gravity_t, null, cljs.types.uint_t]);

            simulator.midPointKernel.setArgs(
                [null, null, null, null, null, null, null, charge, gravity, null, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, charge_t, gravity_t, null, cljs.types.uint_t]);

        }

        if(cfg.edgeDistance || cfg.edgeStrength) {
            var edgeDistance = cfg.edgeDistance ? new Float32Array([cfg.edgeDistance]) : null;
            var edgeDistance_t = cfg.edgeDistance ? cljs.types.float_t : null;

            var edgeStrength = cfg.edgeStrength ? new Float32Array([cfg.edgeStrength]) : null;
            var edgeStrength_t = cfg.edgeStrength ? cljs.types.float_t : null;

            simulator.edgesKernel.setArgs(
                [null, null, null, null, null, edgeStrength, edgeDistance, new Uint32Array([stepNumber])],
                [null, null, null, null, null, edgeStrength_t, edgeDistance_t, cljs.types.uint_t]);

            simulator.midEdgesKernel.setArgs(
                [null, null, null, null, null, null, null, edgeStrength, edgeDistance, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, edgeStrength_t, edgeDistance_t, cljs.types.uint_t]);
        }
    }


    function tick(simulator, stepNumber) {

        function edgeKernelSeq (edges, workItems, numWorkItems, fromPoints, toPoints) {
            simulator.edgesKernel.setArgs(
                [edges.buffer, workItems.buffer, fromPoints.buffer, toPoints.buffer, null, null, null, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, cljs.types.uint_t]);
            return simulator.edgesKernel.call(numWorkItems, [])
        }

        // If there are no points in the graph, don't run the simulation
        if(simulator.numPoints < 1) {
            return Q(simulator);
        }

        ////////////////////////////
        // Run the points kernel
        return Q()
        .then(function () {
            simulator.pointKernel.setArgs(
                [null, null, null, null, null, null, null, null, null, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
        })
        .then(function () { return simulator.buffers.curPoints.acquire(); })
        .then(function() {
            return simulator.locked.lockPoints ? false : simulator.pointKernel.call(simulator.numPoints, []);
        })
        .then(function () { return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints); })
        .then(function() {
            if(simulator.numEdges > 0) {
                if (simulator.locked.lockEdges) {
                    return simulator;
                } else {
                    return edgeKernelSeq(
                        simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                        simulator.buffers.curPoints, simulator.buffers.nextPoints)
                    .then(function () {
                         return edgeKernelSeq(
                            simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                            simulator.buffers.nextPoints, simulator.buffers.curPoints); });
                }
            } else {
                return simulator;
            }
        })
        ////////////////////////////
        // Run the edges kernel
        .then(function () {
            simulator.midPointKernel.setArgs(
                [null, null, null, null, null, null, null, null, null, null, new Uint32Array([stepNumber])],
                [null, null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
        })
        .then(function () { return simulator.buffers.curMidPoints.acquire(); })
        .then(function () {
            return simulator.locked.lockMidpoints ? simulator : simulator.midPointKernel.call(simulator.numMidPoints, []);  // APPLY MID-FORCES
        })
        .then(function() {
            return simulator.buffers.nextMidPoints.copyInto(simulator.buffers.curMidPoints);
        })
        .then(function () {
            if (simulator.numEdges > 0 && !simulator.locked.lockMidedges) {
                simulator.midEdgesKernel.setArgs(
                    [null, null, null, null, null, null, null, null, null, new Uint32Array([stepNumber])],
                    [null, null, null, null, null, null, null, null, null, cljs.types.uint_t]);
                return simulator.midEdgesKernel.call(simulator.numForwardsWorkItems, [])
                .then(function() {
                    return simulator;
                })
            } else {
                return simulator;
            }
        })
        ////////////////////////////
        .then(function () {
            return Q.all(
                ['curPoints', 'springsPos', 'curMidPoints', 'midSpringsPos']
                    .map(function (name) { return simulator.buffers[name]; })
                    .map(function (buf) { return buf.release(); })
            );
        })
        .then(function () {
            simulator.cl.queue.finish(); //FIXME use callback arg
            return simulator;
        });
    }



    return {
        "create": create,
        "setLocked": setLocked,
        "setPoints": setPoints,
        "setEdges": setEdges,
        "tick": tick
    };
});
