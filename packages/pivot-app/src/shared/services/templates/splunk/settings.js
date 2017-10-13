import { colTypes, refTypes, desiredEntities } from './vendors/index.js';

import { colorShorthands, typeColors as typesToColors } from './colors.js';

export * from './vendors/index.js';

export const typesToSizes = {
    alert: 9.9,
    event: 2.0,
    file: 9.9,
    geo: 9.9,
    hash: 9.9,
    id: 9.9,
    ip: 9.9,
    mac: 9.9,
    port: 9.9,
    tag: 9.9,
    url: 9.9,
    user: 9.9
};

export const typesToIcons = {
    alert: 'bell',
    event: 'exclamation-circle',
    file: 'file',
    geo: 'globe',
    hash: 'hashtag',
    id: 'barcode',
    ip: 'laptop',
    mac: 'laptop',
    port: 'microchip',
    tag: 'tag',
    url: 'globe',
    user: 'user'
};

const colNames = Object.keys(colTypes);

export const typeColors = colNames.reduce((acc, col) => {
    acc[col] = typesToColors[colTypes[col]];
    if (acc[col] === undefined) {
        acc[col] = colorShorthands.gray;
    }
    return acc;
}, {});
export const typeSizes = colNames.reduce((acc, col) => {
    acc[col] = typesToSizes[colTypes[col]];
    if (acc[col] === undefined) {
        acc[col] = 2;
    }
    return acc;
}, {});
export const typeIcons = colNames.reduce((acc, col) => {
    acc[col] = typesToIcons[colTypes[col]];
    return acc;
}, {});

export const encodings = {
    point: {
        pointColor: node => {
            node.pointColor = typeColors[node.type];
            if (node.pointColor === undefined) {
                //node.pointColor = stringhash(node.type) % 12;
                node.pointColor = colorShorthands.gray;
            }
        },
        pointSizes: function(node) {
            node.pointSize = typeSizes[node.type];
            if (node.pointSize === undefined) {
                node.pointSize = 2.0;
            }
        },
        pointIcon: function(node) {
            node.pointIcon = typeIcons[node.type];
        },
        pointCanonicalType: node => {
            node.canonicalType = colTypes[node.type];
        }
    },
    edge: {
        edgeRefType: function(edge) {
            if (edge.edgeType && edge.edgeType.indexOf('EventID->') === 0) {
                edge.refType = refTypes[edge.edgeType.slice('EventID->'.length)];
            }
        }
    }
};
