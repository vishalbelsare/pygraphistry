'use strict';

var _ = require('underscore');

function defaultLabels (graph, labels) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return labels.map(
        function (rawIdx) {
            var idx = offset + rawIdx;

            var outDegree = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped[idx];
            var inDegree = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped[idx];
            var degree = outDegree + inDegree;

            var data = [
                {'degree': degree + ' (' + inDegree + ' in + ' + outDegree + ' out)'},
                {'index': idx}
            ];

            return '<div class="graph-label-container graph-label-default">'
                + '<span class="graph-label-title">node_' + (offset + idx) + '</span>'
                + '<div class="graph-label-contents">'
                + _.map(data, function (row) {
                    var name = _.keys(row)[0];
                    return '<span class="graph-label-pair"><span class="graph-label-key">' + name + '</span><span class="graph-label-value">' + row[name] + '</span></span>';
                }).join(' ')
                + '</div></div>';
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

