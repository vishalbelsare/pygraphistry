'use strict';

//Declaratively define stock CL buffers used by the simulation and potentially passed to the browser

var debug   = require('debug')('graphistry:graph-viz:buffers');
var _       = require('underscore');

var util    = require('./util.js');



// (simulator * array * int -> () ) U 'a ->
//   (simulator * array * int -> () )
function makeMapper(v) {
    if (typeof(v) == 'function') {
        return v;
    } else {
        return function (simulator, outArr, len) {
            for (var i = 0; i < len; i++) {
                outArr[i] =v;
            }
        }
    }
}


function getDegree(simulator, i) {
    return simulator.dataframe.getHostBuffer('forwardsEdges').degreesTyped[i]
        + simulator.dataframe.getHostBuffer('backwardsEdges').degreesTyped[i];
}

//CL+GL+local vbos & setters will be created/exported, no need to modify anything else
var FIELDS =     ['setterName',     'arrType',      'dims',     'defV'];
var NAMED_CLGL_BUFFERS_SETUP = {
    pointColors: ['setColors',      Uint32Array,    'numPoints',
        function (simulator, outArr, len) {

            //use hash of highest degree neighbor

            var compare = function (initBest, simulator, buffers, i) {
                var best = initBest;

                var worklist = buffers.srcToWorkItem[i];
                var firstEdge = buffers.workItemsTyped[i * 4];
                var numEdges = buffers.workItemsTyped[i * 4 + 1];
                for (var j = 0; j < numEdges; j++) {
                    var dst = buffers.edgesTyped[firstEdge*2 + j*2 + 1];
                    var degree = getDegree(simulator, dst);
                    if (   (degree > best.degree)
                        || (degree == best.degree && dst > best.id)) {
                        best = {id: dst, degree: degree};
                    }
                }

                return best;
            };

            var palette = util.palettes.qual_palette2;
            var pLen = palette.length;
            for (var i = 0; i < len; i++) {
                var best = {id: i, degree: getDegree(simulator, i)};
                var bestOut = compare(best, simulator, simulator.dataframe.getHostBuffer('forwardsEdges'), i);
                var bestIn = compare(bestOut, simulator, simulator.dataframe.getHostBuffer('backwardsEdges'), i);
                var color = palette[bestIn.id % pLen];
                outArr[i] = color;
            }
        }],
    pointSizes:  ['setSizes',       Uint8Array,     'numPoints',
        function (simulator, outArr, len) {

            var minDegree = Number.MAX_VALUE;
            var maxDegree = 0;
            for (var i = 0; i < len; i++) {
                var degree = getDegree(simulator, i);
                minDegree = Math.min(minDegree, degree);
                maxDegree = Math.max(maxDegree, degree);
            }

            var offset = 5 - minDegree;
            var scalar = 20 / Math.max((maxDegree - minDegree),1);

            for (var i = 0; i < len; i++) {
                var degree = getDegree(simulator, i);
                outArr[i] = (degree + offset) + (degree - minDegree) * scalar;
            }
        }
    ],
    pointTags:   ['setPointTags',   Uint8Array,     'numPoints', 0],
    edgeTags:    ['setEdgeTags',    Uint8Array,     'numEdges',  0]
};

//{<str>: {setterName: str, arrType: Function, dims: string, defV: 'a'}}
var NAMED_CLGL_BUFFERS =
    _.object(_.map(NAMED_CLGL_BUFFERS_SETUP,
        function (cfg, name) {
            return [
                name,
                _.object(cfg.map(function (v, i) { return [FIELDS[i], v]; }))];
        }));


module.exports = {NAMED_CLGL_BUFFERS: NAMED_CLGL_BUFFERS};
