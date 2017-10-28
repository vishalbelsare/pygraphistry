import { mergeByKey } from '../support/mergeByKey';

export const bindings = {
    sourceField: 'source',
    destinationField: 'destination',
    typeField: 'type',
    idField: 'node',
    idEdgeField: 'edge'
};

//https://jsperf.com/array-union-b/1
function arrUnion(arr1 = [], arr2 = []) {
    if (!arr1.length) {
        return arr2;
    } else if (!arr2.length) {
        return arr1;
    } else if (arr1.length === 1 && arr2.length === 1) {
        return arr1[0] === arr2[0] ? arr1 : [arr1[0], arr2[0]];
    } else {
        const out = arr1.slice();
        for (let i = 0; i < arr2.length; i++) {
            const v = arr2[i];
            if (arr1.indexOf(arr2[i]) === -1) {
                out.push(v);
            }
        }
        return out;
    }
}

//?{nodes: [], edges: []} * ?{nodes: [], edges: []} * ?str * ?str -> ?{nodes: [], edges: []}
// NOTE: order preserving
export function graphUnion(g1, g2, nodeKey, edgeKey) {
    if (!g1) {
        return g2;
    }
    if (!g2) {
        return g1;
    }

    const nodes = mergeByKey((g1.nodes || []).concat(g2.nodes || []), nodeKey, {
        cols: arrUnion,
        refTypes: arrUnion,
        Pivot: Math.min
    });

    const rawEdges = (g1.edges || []).concat(g2.edges || []);
    const edges =
        edgeKey !== undefined
            ? mergeByKey(rawEdges, edgeKey, { cols: arrUnion, Pivot: Math.min })
            : rawEdges;

    return { nodes, edges };
}
