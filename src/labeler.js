'use strict';

const _ = require('underscore');
const palettes = require('./palettes');

const DimCodes = {
    point: 1,
    edge: 2
};


/**
 * @param {Dataframe} dataframe
 * @param {Mask} indices
 * @param {GraphComponentTypes} type
 * @returns {*}
 */
function defaultLabels (dataframe, indices, type) {
    const rows = dataframe.getRows(indices, type);

    return rows.map((row) => {
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


function getLabels (dataframe, indices, dim) {
    const type = _.findKey(DimCodes, (dimCode) => dimCode === dim);

    const hasPrecomputedLabels = dataframe.hasHostBuffer(labelBufferNameForType(type));

    if (hasPrecomputedLabels) {
        return presetLabels(dataframe, indices, type);
    }

    return defaultLabels(dataframe, indices, type);
}


module.exports = {
    getDefaultLabels: defaultLabels,
    getLabels: getLabels
};
