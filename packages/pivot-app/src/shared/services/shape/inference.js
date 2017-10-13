// [ edge ] -> [ edge ]
// When hyperedges of the same event and refType link different entities,
// emit new edges that directly link those entities
// forall events e, reftypes r. { a-->b | e--[refType:r]-->a && e--[refType:r]--b }
function inferenceEdges(edges) {
    const hyperedges = edges.filter(
        edge => edge.refType && edge.edgeType.indexOf('EventID->') === 0
    );

    //[ [edge] ]
    const hyperedgesGroupedBySourceRef = Object.values(
        _.groupBy(hyperedges, edge => JSON.stringify([edge.source, edge.refType]))
    );

    //[ [edge] ]
    // groups of at least 2 uniq entities
    const equalityClasses = hyperedgesGroupedBySourceRef
        .map(edges => _.uniq(edges, 'destination'))
        .filter(edges => edges.length > 1);

    //[ [ [edge] ] ]
    // create edges from cross-product (diagnonal)
    const newEdgesByClass = equalityClasses.map(edges =>
        edges.map((edgeA, i) =>
            edges.filter((edgeB, j) => j > i).map(edgeB => ({
                //avoid multiedges via id that merges across events, pivots
                edge: `ref:${edgeA.refType}:${edgeA.destination}:${edgeB.destination}`,
                source: edgeA.destination,
                destination: edgeB.destination,
                edgeType: `ref:${edgeA.refType}`,
                refType: edgeA.refType,
                edgeTitle: `${edgeA.refType}:${edgeA.destination}->${edgeB.destination}`
            }))
        )
    );

    return [].concat.apply([], [].concat.apply([], newEdgesByClass));
}

// nodes * edges -> ()
function decorateNodesWithRefTypes({ nodes, edges }) {
    const entityMap = {};
    nodes.forEach(node => {
        if (node.type !== 'EventID') {
            entityMap[node.node] = node;
        }
    });

    edges.filter(({ refType }) => refType).forEach(({ refType, destination }) => {
        const node = entityMap[destination];
        if (!node.refTypes) {
            node.refTypes = [];
        }
        if (node.refTypes.indexOf(refType) === -1) {
            node.refTypes.push(refType);
        }
    });
}

// [ edge ] -> [ edge ]
// Merge edges with same src/dst/refType
// Take care to be functional
export function dedupeHyperedges(edges) {
    const edgeMap = {};

    //order-preserving
    const result = [];

    edges.forEach(edge => {
        if (!(edge.refType && edge.edgeType && edge.edgeType.indexOf('EventID->') === 0)) {
            result.push(edge);
            return;
        }

        //reclassify edgeid as by ref group instead of col
        const id = `${edge.source}:${edge.refType}:${edge.destination}`;
        const existingCanonicalEdge = edgeMap[id];
        if (existingCanonicalEdge) {
            //merge
            existingCanonicalEdge.cols.push(edge.col);
        } else {
            //swap hyperedge singleton with a hyperedge group
            const newEdge = { ...edge, edge: id, cols: [edge.col] };
            delete newEdge.col;
            edgeMap[id] = newEdge; //rename ID
            result.push(newEdge);
        }
    });

    return result;
}

// Link entities when they share a refType under the same event
//   Ex: Event20 (srcIP=127.0.0.1, srcMac=a.b.c) => [(127.0.0.1<>a.b.c)]
//   Decorates entities with the refTypes they're used with
//   New edges are introduced, so run encodings on them
// { nodes, edges, encodings } -> edges   (and mutate nodes[].refTypes)
export function inference({ nodes = [], edges = [], encodings } = {}) {
    decorateNodesWithRefTypes({ nodes, edges });
    const newEdges = inferenceEdges(edges);

    if (encodings && encodings.edge) {
        newEdges.map(edge =>
            Object.keys(encodings.edge).map(key => {
                // eslint-disable-line array-callback-return
                encodings.edge[key](edge);
            })
        );
    }

    return newEdges;
}
