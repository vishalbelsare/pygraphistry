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
        return arr1[0] === arr2[0] ? arr1 : [ arr1[0], arr2[0] ];
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
export function graphUnion(g1, g2, nodeKey, edgeKey, fldMergeOverrides) {
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
        edgeKey !== undefined ? mergeByKey(rawEdges, edgeKey, { cols: arrUnion, Pivot: Math.min }) : rawEdges;

    return { nodes, edges };
}

//str * str -> [ {str_1, str_2} ] -> ()
//First field name must be a comparable field, second must be for a string field
function sortInplaceMajorComparableMinorString(key1, key2) {
    return function(elts) {
        elts.sort(({ [key1]: a1, [key2]: a2 }, { [key1]: b1, [key2]: b2 }) => {
            const c1 = a1 - b1;
            if (c1 !== 0) {
                return c1;
            }
            return String(a2).localeCompare(String(b2));
        });
    };
}

// [ {node, Pivot, ...} ] => ()
export const sortNodesInplaceByPivotAndID = sortInplaceMajorComparableMinorString('Pivot', 'node');

// [ {edge, Pivot, ...} ] => ()
export const sortEdgesInplaceByPivotAndID = sortInplaceMajorComparableMinorString('Pivot', 'edge');
