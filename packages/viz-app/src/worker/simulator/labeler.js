'use strict';

const _ = require('underscore');
import * as palettes from './palettes';
import * as dataTypeUtil from './dataTypes.js';

const DimCodes = {
    point: 1,
    edge: 2
};

/** @typedef {Object} LabelCell
 * @property value
 * @property {String} displayName
 * @property {String} key
 * @property {String} dataType
 */

/**
 * @param {Dataframe} dataframe
 * @param {Mask} indices
 * @param {GraphComponentTypes} type
 * @param {String[]} columnNames
 * @returns {{title: String, columns: LabelCell[]}}[]
 */
function defaultLabels(
    dataframe,
    indices,
    type,
    columnNames = dataframe.publicColumnNamesByType(type)
) {
    const rows = dataframe.getRows(indices, type, columnNames);
    const dataTypesByColumnName = {};
    const colorMappedByColumnName = {};
    if (columnNames) {
        columnNames.forEach(columnName => {
            dataTypesByColumnName[columnName] = dataframe.getDataType(columnName, type);
            if (dataframe.doesColumnRepresentColorPaletteMap(type, columnName)) {
                colorMappedByColumnName[columnName] = true;
            }
        });
    }

    const titleColumnName = '_title';

    return rows.map(row => {
        const columnValuesInRow = [];
        (columnNames || _.keys(row)).forEach(columnName => {
            if (columnName === titleColumnName) {
                return;
            }
            const value = row[columnName];
            if (dataTypeUtil.valueSignifiesUndefined(value)) {
                return;
            }
            let displayName;
            if (colorMappedByColumnName.hasOwnProperty(columnName)) {
                displayName = palettes.intToHex(palettes.bindings[value]);
            }

            columnValuesInRow.push({
                value: value,
                displayName: displayName,
                key: columnName,
                dataType: dataTypesByColumnName[columnName]
            });
        });

        return {
            title: row[titleColumnName],
            columns: columnValuesInRow
        };
    });
}

function labelBufferNameForType(type) {
    return DimCodes.hasOwnProperty(type) ? type + 'Labels' : '';
}

function presetLabels(dataframe, indices, type) {
    const name = labelBufferNameForType(type);

    return indices.map(idx => {
        const label = dataframe.getCell(idx, 'hostBuffer', name);
        return { formatted: label };
    });
}

/**
 * @param {Dataframe} dataframe
 * @param {Mask} indices
 * @param {DimCodes} dim
 * @param {String[]} columnNames
 * @returns {{title: String, columns: LabelCell[]}}[]
 */
export function getLabels(dataframe, indices, dim, columnNames = undefined) {
    const type = _.findKey(DimCodes, dimCode => dimCode === dim);

    const hasPrecomputedLabels = dataframe.hasHostBuffer(labelBufferNameForType(type));

    if (hasPrecomputedLabels) {
        return presetLabels(dataframe, indices, type);
    }

    return defaultLabels(dataframe, indices, type, columnNames);
}

export const getDefaultLabels = defaultLabels;
