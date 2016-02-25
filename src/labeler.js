'use strict';

var _ = require('underscore');
var palettes = require('./palettes');

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

    /** @type Dataframe */
    var dataframe = graph.dataframe;
    var rows = dataframe.getRows(indices, type);

    var structuredData = rows.map(function (row) {
        var title = row._title;
        var filteredRow = _.omit(row, '_title');

        var unsortedColumns = _.map(_.keys(filteredRow), function (columnName) {
            var dataType = dataframe.getDataType(columnName, type);
            var value = filteredRow[columnName],
                displayName;
            if (dataType !== undefined && dataframe.doesColumnRepresentColorPaletteMap(type, columnName)) {
                displayName = palettes.intToHex(palettes.bindings[value]);
            }

            return {
                value: value,
                displayName: displayName,
                key: columnName,
                dataType: dataType
            };
        });

        var sortedColumns = _.sortBy(unsortedColumns, function (obj) {
            return obj.key;
        });

        return {
            title: title,
            columns: sortedColumns
        };
    });

    return structuredData;
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
    getDefaultLabels: defaultLabels,
    getLabels: getLabels
};
