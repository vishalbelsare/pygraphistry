import { mergeByKey } from '../support/mergeByKey';


//?{nodes: [], edges: []} * ?{nodes: [], edges: []} * ?str * ?str -> ?{nodes: [], edges: []}
export function graphUnion(g1, g2, nodeKey, edgeKey) {
    if (!g1) { return g2; }
    if (!g2) { return g1; }

    const nodes = mergeByKey((g1.nodes || []).concat(g2.nodes || []), nodeKey);

    const rawEdges = (g1.edges || []).concat(g2.edges || []);
    const edges = edgeKey !== undefined ? mergeByKey(rawEdges, edgeKey) : rawEdges;

    return { nodes, edges };

}