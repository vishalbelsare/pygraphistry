'use strict';

var   debug = require("debug")("graphistry:graph-viz:cl:movenodes"),
       cljs = require('./cl.js'),
          Q = require('q'),
GaussSeidel = require('./gaussseidel.js'),
     Kernel = require('./kernel.js');

function MoveNodes(clContext) {
    debug('Creating moveNodes kernel');

    var args = ['top', 'left', 'bottom', 'right', 'deltaX', 'deltaY',
                'inputPositions', 'outputPositions'];
    var argsType = {
        top: cljs.types.float_t,
        left: cljs.types.float_t,
        bottom: cljs.types.float_t,
        right: cljs.types.float_t,
        deltaX: cljs.types.float_t,
        deltaY: cljs.types.float_t,
        inputPositions: null,
        outputPositions: null
    }
    this.moveNodes = new Kernel('moveNodes', args, argsType, 'moveNodes.cl', clContext);

    this.gsGather = new Kernel('gaussSeidelSpringsGather', GaussSeidel.argsGather,
                               GaussSeidel.argsType, 'gaussSeidel.cl', clContext);
}

function kMove(moveNodes, simulator, selection, delta) {
    debug('Moving nodes');
    var resources = [simulator.buffers.curPoints, simulator.buffers.nextPoints];

    moveNodes.set({
        top: selection.tl.y,
        left: selection.tl.x,
        bottom: selection.br.y,
        right: selection.br.x,
        deltaX: delta.x,
        deltaY: delta.y,
        inputPositions: simulator.buffers.curPoints.buffer,
        outputPositions: simulator.buffers.nextPoints.buffer,
    });

    simulator.tickBuffers(['nextPoints', 'curPoints']);

    debug('Running moveNodes');
    return moveNodes.exec([simulator.numPoints], resources)
        .fail(function (err) {
            console.error("ERROR Kernel moveNodes failed ", (err||{}).stack);
        });
}

function gather(gsGather, simulator) {
    var buffers = simulator.buffers;
    var resources = [
        buffers.forwardsEdges,
        buffers.curPoints,
        buffers.springsPos
    ];

    var numSprings = simulator.numEdges;
    gsGather.set({
        springs: simulator.buffers.forwardsEdges.buffer,
        inputPoints: simulator.buffers.curPoints.buffer,
        numSprings: simulator.numEdges,
        springPositions: simulator.buffers.springsPos.buffer,
    });

    simulator.tickBuffers(['springsPos']);

    debug("Running gaussSeidelSpringsGather (forceatlas2) kernel");
    return gsGather.exec([simulator.numForwardsWorkItems], resources)
        .fail(function (err) {
            console.error("ERROR Kernel gsGather failed ", (err||{}).stack);
        });
}

MoveNodes.prototype.move = function (simulator, selection, delta) {
    var that = this;
    return kMove(that.moveNodes, simulator, selection, delta)
        .then(function () {
            return simulator.buffers.nextPoints.copyInto(simulator.buffers.curPoints);
        }).then(function () {
            return gather(that.gsGather, simulator);
        }).fail(function (err) {
            console.error("ERROR Kernel moveNodes failed ", (err||{}).stack);
        });
}

module.exports = MoveNodes;
