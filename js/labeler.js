'use strict';

var _ = require('underscore');
var sprintf = require('sprintf-js').sprintf;
var vgloader = require('./libs/VGraphLoader.js');


function pickTitleField (attribs) {
    var prioritized = ['pointTitle', 'node', 'label', 'ip'];
    for (var i = 0; i < prioritized.length; i++) {
        var field = prioritized[i];
        if (attribs.hasOwnProperty(field)) {
            return field;
        }
    }
    return undefined;
}


function infoFrame(graph, indices) {

    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph);

    var titleOverride = attribs.hasOwnProperty('pointTitle');
    var maybeTitleField = pickTitleField(attribs);

    return indices.map(
        function (rawIdx) {
            var idx = Math.max(0, Math.min(offset + rawIdx, graph.simulator.numPoints));

            var outDegree = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped[idx];
            var inDegree = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped[idx];
            var degree = outDegree + inDegree;

            var rows = _.sortBy(
                    _.flatten(
                        [
                            [
                                ['degree', sprintf('%d (%d in, %d out)', degree, inDegree, outDegree)]
                            ],
                            _.keys(attribs)
                                .filter(function (name) { return attribs[name].target === vgloader.types.VERTEX; })
                                .filter(function (name) {
                                    return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel, degree']
                                        .indexOf(name) === -1;
                                })
                                .filter(function (name) { return name !== maybeTitleField; })
                                .map(function (name) {
                                    return [name, attribs[name].values[idx]];
                                })
                        ],
                        true),
                    function (kvPair) { return kvPair[0]; });

            return {
                title: maybeTitleField ? attribs[maybeTitleField].values[idx] : idx,
                rows: rows,
            };
        });
}

function presetLabels (graph, indices) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return indices.map(function (idx) {
        return { formatted: graph.simulator.labels[offset + idx] };
    });
}


function getLabels(graph, indices) {
    if (graph.simulator.labels.length) {
        return presetLabels(graph, indices);
    } else {
        return infoFrame(graph, indices);
    }
}

module.exports = {
    getLabels: getLabels,
    infoFrame: infoFrame
};

