import { mergeByKey } from '../support/mergeByKey';

export const bindings = {
    "sourceField": "source",
    "destinationField": "destination",
    "typeField": "type",
    "idField": "node",
    "idEdgeField": "edge"
};

function arrUnion (arr1 = [], arr2 = []) {
    return arr1.concat(arr2.filter((x) => arr1.indexOf(x) === -1));
}


//?{nodes: [], edges: []} * ?{nodes: [], edges: []} * ?str * ?str -> ?{nodes: [], edges: []}
export function graphUnion(g1, g2, nodeKey, edgeKey) {
    if (!g1) { return g2; }
    if (!g2) { return g1; }

    const nodes = mergeByKey(
        (g1.nodes || []).concat(g2.nodes || []),
        nodeKey,
        { 'cols': arrUnion, 'refTypes': arrUnion });

    const rawEdges = (g1.edges || []).concat(g2.edges || []);
    const edges = edgeKey !== undefined ? 
        mergeByKey(rawEdges, edgeKey, {'cols': arrUnion}) 
        : rawEdges;

    return { nodes, edges };

}


//str * str -> [ {str_1, str_2} ] -> ()
//First field name must be a comparable field, second must be for a string field
function sortInplaceMajorComparableMinorString(key1, key2) {
    return function (elts) {
        elts.sort(({[key1]: a1, [key2]: a2}, {[key1]: b1, [key2]: b2}) => {
            const c1 = a1 - b1;
            if (c1 !== 0) { return c1; }
            return String(a2).localeCompare(String(b2));
        });
    };
}

// [ {node, Pivot, ...} ] => ()
export const sortNodesInplaceByPivotAndID = sortInplaceMajorComparableMinorString('Pivot', 'node');

// [ {edge, Pivot, ...} ] => ()
export const sortEdgesInplaceByPivotAndID = sortInplaceMajorComparableMinorString('Pivot', 'edge');

    