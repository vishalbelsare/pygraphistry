'use strict';

var _ = require('underscore');

var vgloader = require('./libs/VGraphLoader.js');


function defaultLabels (graph, labels) {

    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph);

    return labels.map(
        function (rawIdx) {
            var idx = offset + rawIdx;

            var outDegree = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped[idx];
            var inDegree = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped[idx];
            var degree = outDegree + inDegree;

            var titleOverride = attribs.hasOwnProperty('pointTitle');

            var rows = _.sortBy(
                    _.flatten(
                        [
                            [
                                ['_degree', '<div style="text-align:center"><span style="float:left"><b>' + degree + '</b></span>&nbsp;(' + inDegree + ' in <span style="float:right">&nbsp;' + outDegree + ' out)</span></div>']
                                //, ['_index', idx]
                            ],
                            _.keys(attribs)
                                .filter(function (name) { return attribs[name].target === vgloader.types.VERTEX; })
                                .filter(function (name) {
                                    return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel']
                                        .indexOf(name) === -1;
                                })
                                .filter(function (name) { return titleOverride || (name != 'node'); })
                                .map(function (name) {
                                    return [name, attribs[name].values[idx]];
                                })
                        ],
                        true),
                    function (kvPair) { return kvPair[0]; });

            var title = attribs[titleOverride ? 'pointTitle' : 'node'].values[idx];

            return '<div class="graph-label-container graph-label-default">'
                + '<span class="graph-label-title">' + title + '</span>'
                + '<div class="graph-label-contents"><table>'
                + _.map(rows, function (kvPair) {
                    return '<tr class="graph-label-pair"><td class="graph-label-key">' + kvPair[0] + '</td><td class="graph-label-value"><div class="graph-label-value-wrapper">' + kvPair[1] + '</div></td></tr>';
                }).join(' ')
                + '</table></div></div>';
        });
}

function presetLabels (graph, labels) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return labels.map(function (idx) {
        return '<div class="graph-label-container graph-label-preset"><span class="graph-label-title">'
            + graph.simulator.labels[offset + idx]
            + '</span></div>';
    });
}


module.exports = {
    labels:
        function (graph, labels) {

            if (!graph.simulator.labels.length) {
                return defaultLabels(graph, labels);
            }

            return presetLabels(graph, labels);
        }
};

