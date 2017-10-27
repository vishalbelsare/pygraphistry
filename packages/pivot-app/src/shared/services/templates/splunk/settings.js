import { colTypes, refTypes, desiredEntities } from './vendors/index.js';

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

const colNames = Object.keys(colTypes);

export const typeSizes = colNames.reduce((acc, col) => {
    acc[col] = typesToSizes[colTypes[col]];
    if (acc[col] === undefined) {
        acc[col] = 2;
    }
    return acc;
}, {});

export const encodings = {
    point: {
        pointSizes: function(node) {
            node.pointSize = typeSizes[node.type];
            if (node.pointSize === undefined) {
                node.pointSize = 2.0;
            }
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
