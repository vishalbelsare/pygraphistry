'use strict';

const _ = require('underscore');
const palettes = require('./palettes');

const DimCodes = {
    point: 1,
    edge: 2
};

function pickTitleField (attribs, prioritized) {
    for (let i = 0; i < prioritized.length; i++) {
        const field = prioritized[i];
        if (attribs.hasOwnProperty(field)) {
            return field;
        }
    }
    return undefined;
}


function defaultLabels(graph, indices, type) {

    /** @type Dataframe */
    const dataframe = graph.dataframe;
    const rows = dataframe.getRows(indices, type);

    const structuredData = rows.map((row) => {
        const title = row._title;
        const filteredRow = _.omit(row, '_title');

        const unsortedColumns = _.map(_.keys(filteredRow), (columnName) => {
            const dataType = dataframe.getDataType(columnName, type);
            const value = filteredRow[columnName];
            let displayName;
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

        const sortedColumns = _.sortBy(unsortedColumns, (obj) => obj.key);

        return {
            title: title,
            columns: sortedColumns
        };
    });

    return structuredData;
}


function labelBufferNameForType (type) {
    return DimCodes.hasOwnProperty(type) ? type + 'Labels' : '';
}

function presetLabels (dataframe, indices, type) {

    const name = labelBufferNameForType(type);

    return indices.map((idx) => {
        const label = dataframe.getCell(idx, 'hostBuffer', name);
        return { formatted: label };
    });

}


function getLabels (graph, indices, dim) {
    const type = _.findKey(DimCodes, (dimCode) => dimCode === dim);

    const hasPrecomputedLabels = graph.dataframe.hasHostBuffer(labelBufferNameForType(type));

    if (hasPrecomputedLabels) {
        return presetLabels(graph.dataframe, indices, type);
    }

    return defaultLabels(graph, indices, type);
}


module.exports = {
    getDefaultLabels: defaultLabels,
    getLabels: getLabels
};
