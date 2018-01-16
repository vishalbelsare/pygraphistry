import { colTypes, refTypes } from './vendors/index.js';

export * from './vendors/index.js';

export const encodings = {
    point: {
        pointCanonicalType: node => {
            node.canonicalType = colTypes[node.type];

            if (node.canonicalType === undefined && node.cols && node.cols instanceof Array) {
                for (let i = 0; i < node.cols.length; i++) {
                    const v = colTypes[node.cols[i]];
                    if (v !== undefined) {
                        node.canonicalType = v;
                        return;
                    }
                }
            }
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
