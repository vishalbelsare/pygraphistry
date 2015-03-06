'use strict';

function defaultLabels (graph, labels) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return labels.map(
        function (idx) { return 'node ' + (offset + idx); });
}

function presetLabels (graph, labels) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    var hits = labels.map(function (idx) {
        return graph.simulator.labels[offset + idx];
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

