'use strict';

var   debug = require('debug')('graphistry:graph-viz:cl:selectnodes'),
       cljs = require('./cl.js'),
       util = require('./util.js'),
          Q = require('q'),
     Kernel = require('./kernel.js');

function SelectNodes(simulator, clContext) {
    debug('Creating selectNodes kernel');

    var args = ['top', 'left', 'bottom', 'right', 'positions', 'mask'];
    var argsType = {
        top: cljs.types.float_t,
        left: cljs.types.float_t,
        bottom: cljs.types.float_t,
        right: cljs.types.float_t,
        positions: null,
        mask:null
    }
    this.selectNodes = new Kernel('selectNodes', args, argsType, 'selectNodes.cl', clContext);

    this.bytes = simulator.numPoints * Uint8Array.BYTES_PER_ELEMENT;
    this.qMask = simulator.cl.createBuffer(this.bytes, 'mask');
}


SelectNodes.prototype.run = function (simulator, selection, delta) {
    var that = this;
    return that.qMask.then(function (mask) {
        debug('Computing selection mask');
        var resources = [simulator.buffers.curPoints];

        this.selectNodes.set({
            top: selection.tl.y,
            left: selection.tl.x,
            bottom: selection.br.y,
            right: selection.br.x,
            positions: simulator.buffers.curPoints.buffer,
            mask: mask.buffer
        });

        simulator.tickBuffers(['nextPoints', 'curPoints']);

        debug('Running selectNodes');
        return this.selectNodes.exec([simulator.numPoints], resources)
            .then(function () {
                var result = new Uint8Array(that.bytes);
                return mask.read(result);
            }).fail(util.makeErrorHandler('Kernel selectNodes failed'));
    }).fail(util.makeErrorHandler('Node selection failed'));

}

module.exports = SelectNodes;
