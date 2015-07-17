'use strict';

var _ = require('underscore');


function pickTitleField (attribs, prioritized) {
    for (var i = 0; i < prioritized.length; i++) {
        var field = prioritized[i];
        if (attribs.hasOwnProperty(field)) {
            return field;
        }
    }
    return undefined;
}


function defaultLabels(graph, indices, type) {

    var rows = graph.dataframe.getRows(indices, type);
    return rows.map(function (row) {
        return {
            title: row._title,
            columns: _.sortBy(
                _.pairs(_.omit(row, '_title')),
                function (kvPair) { return kvPair[0]; }
            )
        };
    });
}


function presetLabels (labels, indices, range) {
    var offset = range.startIdx;

    return indices.map(function (idx) {
        return { formatted: labels[offset + idx] };
    });
}


function getLabels(graph, indices, dim) {
    var type = (dim === 2) ? 'edge' : 'point';
    var simulator = graph.simulator;

    if (type === 'point' && simulator.pointLabels.length) {
        return presetLabels(simulator.pointLabels, indices, simulator.timeSubset.pointsRange);
    } else if (type === 'edge' && simulator.edgeLabels.length) {
        return presetLabels(simulator.edgeLabels, indices, simulator.timeSubset.edgeRange);
    } else {
        return defaultLabels(graph, indices, type);
    }
}


module.exports = {
    getLabels: getLabels
};
