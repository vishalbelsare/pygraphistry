'use strict';

var _ = require('underscore');

var DimCodes = {
    point: 1,
    edge: 2
};

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
    var type = _.findKey(DimCodes, function (dimCode) { return dimCode === dim; });
    var simulator = graph.simulator;

    var precomputedLabels = simulator.dataframe.getLabels(type);
    if (precomputedLabels && precomputedLabels.length) {
        var range;
        switch (type) {
            case 'point':
                range = simulator.timeSubset.pointsRange;
                break;
            case 'edge':
                range = simulator.timeSubset.edgeRange;
                break;
        }
        return presetLabels(precomputedLabels, indices, range);
    }
    return defaultLabels(graph, indices, type);
}


module.exports = {
    getLabels: getLabels
};
