import { colTypes, refTypes } from './vendors/index.js';

export * from './vendors/index.js';

export const encodings = {
    point: {
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
