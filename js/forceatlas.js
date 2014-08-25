
if (typeof(window) == 'undefined') {
    var webcl = require('node-webcl');
} else if (typeof(webcl) == 'undefined') {
    var webcl = window.webcl;
}

//corresponds to apply-forces.cl
//webcl.type ? [1] : new Uint32Array([localPosSize]),
var graphArgs =
    webcl.type ? [[1], [1], [0], [0]]
    : [new Float32Array([1]), new Float32Array([1]), new Uint32Array([0]), new Uint32Array([0])];
var graphArgs_t = webcl.type ? [null, null, null, null] : null;



module.exports = {
    tick: function (simulator, stepNumber) {

        if (simulator.physics.forceAtlas) {

            var atlasEdgesKernelSeq = function (edges, workItems, numWorkItems, fromPoints, toPoints) {

                var resources = [edges, workItems, fromPoints, toPoints];

                simulator.attractEdgesAndApplyForcesKernel.setArgs(
                    graphArgs.map(function () { return null; })
                        .concat(
                            [edges.buffer, workItems.buffer, fromPoints.buffer, webcl.type ? [stepNumber] : new Uint32Array([stepNumber]),
                            toPoints.buffer]),
                    webcl.type ? graphArgs_t.map(function () { return null; })
                        .concat([null, null, null, cljs.types.uint_t, null])
                        : undefined);

                return simulator.attractEdgesAndApplyForcesKernel.call(numWorkItems, resources);
            };

            var resources = [
                simulator.buffers.curPoints,
                simulator.buffers.forwardsDegrees,
                simulator.buffers.backwardsDegrees,
                simulator.buffers.nextPoints,
            ];

            simulator.repulsePointsAndApplyGravityKernel.setArgs(
                graphArgs.map(function () { return null; })
                    .concat([null, null, null, null, null, null, null, webcl.type ? [stepNumber] : new Uint32Array([stepNumber])]),
                webcl.type ? graphArgs_t.map(function () { return null; })
                    .concat([null, null, null, null, null, null, null, cljs.types.uint_t])
                    : undefined);

            var appliedForces = simulator.repulsePointsAndApplyGravityKernel.call(simulator.numPoints, resources);

            return appliedForces
                .then(function () {
                    if(simulator.numEdges > 0) {
                        return atlasEdgesKernelSeq(
                                simulator.buffers.forwardsEdges, simulator.buffers.forwardsWorkItems, simulator.numForwardsWorkItems,
                                simulator.buffers.nextPoints, simulator.buffers.curPoints)
                            .then(function () {
                                 return atlasEdgesKernelSeq(
                                    simulator.buffers.backwardsEdges, simulator.buffers.backwardsWorkItems, simulator.numBackwardsWorkItems,
                                    simulator.buffers.curPoints, simulator.buffers.nextPoints);
                            })
                            .then(function () {
                                return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
                            });
                    }
                });
        }
    }
};