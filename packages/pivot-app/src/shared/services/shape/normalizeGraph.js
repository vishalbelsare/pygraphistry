import { bindings } from './graph';

export function generateEdgeOpacity(nodeDegrees) {
    const edgeCount = Object.values(nodeDegrees).length;
    return 2.0 / Math.log10(100 + edgeCount);
}

// [{idField: n}] -> () // [{idField: n, x: Int, y: Int}]
export function decorateGraphLabelsWithXY(labels, xy) {
    const i = bindings.idField;
    _.each(labels, function(label) {
            label.x = xy[label[i]].x;
            label.y = xy[label[i]].y;
        });
}


export function isMac(e) {
    return e.canonicalType === "mac";
}


//str -> str
export function normalizeMac(weirdMac) {
    return weirdMac
        .replace(/[^0-9a-f]/g,'')
        .split(/(..)/)
        .filter(v => v.length)
        .join('-')
}

// {data: {labels: [ node ]}} * {id -> id} -> ()
export function relabelGraph(g, renames) {
    g.data.labels.forEach((n) => {
        if(renames[n.node]) {
            n.node = renames[n.node];
        }});
    g.data.graph.forEach((e) => {
        if(renames[e.source]) {
            e.source = renames[e.source];
        }
        if(renames[e.destination]) {
            e.destination = renames[e.destination];
        }
        if(renames[e.node]) {
            e.node = renames[e.node];
        }});
}


// {data: {labels: [ node ]}} -> {id -> id}
export function graphMacsToRelabel(g) {
    const macs = g.data.labels.filter(({canonicalType}) => canonicalType === "mac").map(({node}) => node);
    const h = {};
    macs.forEach(m => {
        if(normalizeMac(m) !== m) {
            h[m] = normalizeMac(m);
        }
    });
    return h;
}

// {data: {labels: [ node ]}} -> {data: {labels: [ node ]}}
// NOTE: mutates nodes, edges to use normalized IDs
export function normalizeGraph(g) {
    // So far, just relabel mac addresses.
    relabelGraph(g, graphMacsToRelabel(g));
    return g;
}