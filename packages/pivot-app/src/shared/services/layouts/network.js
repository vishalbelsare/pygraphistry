import { isIP, isPrivateIP } from '../support/ip';
import { decorateGraphLabelsWithXY } from '../shape/normalizeGraph';
import { bindings } from '../shape/graph';

/*eslint-disable */
export const UNDEFINED = 0; // = const UNDEFINED_UNDEFINED
export const IN = 1; // = const IN_UNDEFINED
export const OUT = 2; // = const OUT_UNDEFINED
export const INOUT = 3;
export const UNDEFINED_IN = 4;
export const IN_IN = 5;
export const OUT_IN = 6;
//IN & OUT _ IN     = 7;
export const UNDEFINED_OUT = 8;
export const IN_OUT = 9;
export const OUT_OUT = 10;
//IN & OUT _ IN     = 11;
//...
/*eslint-enable */

export function mergeLabels(x, y) {
    return x | y;
}

export function mergeSrcDstLabels(src, dst) {
    return src | (dst << 2);
}

export function isUnlabeled(x) {
    return (x | 0) === 0;
}

export const directionToName = {
    [IN]: 'inside',
    [OUT]: 'outside',
    [UNDEFINED_IN]: 'inside',
    [IN_IN]: 'inside',
    [OUT_IN]: 'mixed', //"outside->inside"
    [UNDEFINED_OUT]: 'outside',
    [IN_OUT]: 'mixed', //"inside->outside"
    [OUT_OUT]: 'outside'
};

// { edges: [{source,destination}], nodeIDs: {string->{node}} }
// -> {EventID -> {[refType] -> [ {node, ...} ] }}
export function computeEventNeighborhood({ edges, nodeIDs }) {
    const eventNeighborhood = {};
    edges.forEach(({ source, destination, refType }) => {
        if (nodeIDs[source].type !== 'EventID') {
            return;
        }
        const neighborhood = eventNeighborhood[source];
        const refGroupName = refType || 'all';
        if (!neighborhood) {
            eventNeighborhood[source] = { [refGroupName]: [nodeIDs[destination]] };
        } else {
            const refGroup = neighborhood[refGroupName];
            if (!refGroup) {
                neighborhood[refGroupName] = [nodeIDs[destination]];
            } else {
                refGroup.push(nodeIDs[destination]);
            }
        }
    });
    return eventNeighborhood;
}

// [{node}] -> {node -> DIRECTION}
export function labelIPs(nodes) {
    const ip_io = {};
    nodes.forEach(({ node: id }) => {
        if (isIP(id)) {
            ip_io[id] = isPrivateIP(id) ? IN : OUT;
        }
    });
    return ip_io;
}

// { ip_io: {node -> DIRECTION}. eventNeighborhood: {EventID -> {[refType] -> [ {node, ...} ] }} }
// -> {node-> DIRECTION}
export function computeSrcDst({ ip_io, eventNeighborhood }) {
    const srcdst_io = Object.assign({}, ip_io);
    Object.values(eventNeighborhood).forEach(({ src = [], dst = [] }) => {
        //TODO do all ref groups?
        [src, dst].forEach(group => {
            const label = group.reduce((acc, { node }) => mergeLabels(acc, ip_io[node]), UNDEFINED);
            if (label !== UNDEFINED) {
                group.forEach(({ node }) => {
                    srcdst_io[node] = mergeLabels(srcdst_io[node], label);
                });
            }
        });
    });
    return srcdst_io;
}

export function labelAll({ events, eventNeighborhood, srcdst_io }) {
    const all_io = Object.assign({}, srcdst_io); //misses non-hypernodes..
    events.forEach(e => {
        const { src = [], dst = [], ...otherAttrs } = eventNeighborhood[e.node] || {};
        const [srcLabel, dstLabel] = [src, dst].map(group => {
            const label = group.reduce(
                (acc, { node }) => mergeLabels(acc, srcdst_io[node]),
                UNDEFINED
            );
            return label;
        });
        const label = mergeSrcDstLabels(srcLabel, dstLabel);

        all_io[e.node] = label;

        Object.values(otherAttrs).forEach(group => {
            group.forEach(({ node }) => {
                const hasRawLabel = srcdst_io.hasOwnProperty(node);
                const entityLabelRaw = srcdst_io[node];
                all_io[node] = hasRawLabel ? entityLabelRaw : mergeLabels(all_io[node], label);
            });
        });
    });
    return all_io;
}

//NOTE: Use edges instead of fields b/c normalization changes mac etc names
export function decorateInsideness(graph) {
    const events = graph.data.labels.filter(({ type }) => type === 'EventID');

    const nodeIDs = {};
    graph.data.labels.forEach(node => {
        nodeIDs[node.node] = node;
    });

    //{EventID -> {[refType] -> [ {node, ...} ] }}
    const eventNeighborhood = computeEventNeighborhood({
        edges: graph.data.graph,
        nodeIDs
    });

    // 1. Decorate nodes with IP-address names as either IN or OUT
    //{nodeid -> flag}
    const ip_io = labelIPs(graph.data.labels);

    // 2. Compute insideness of src* IPs (dst* IPs) and propagate to all src* entities (dst* entities)
    //    There may be conflicts.
    const srcdst_io = computeSrcDst({ ip_io, eventNeighborhood });

    // 3. Compute the insideness of events, and every node without an insideness gets the insideness of the event.
    //  This may be diff from 2. b/c merges on fields
    //  Take care to track directionality
    const all_io = labelAll({ events, eventNeighborhood, srcdst_io });

    // 4. Decorate nodes in the graph accordingly.
    graph.data.labels.forEach(n => {
        const label = all_io[n.node];
        n.canonicalInsideness = directionToName[label] || 'mixed';
    });
    return graph;
}

const allOrderedZones = ['inside', 'inside->outside', 'mixed', '', 'outside->inside', 'outside'];
const alwaysOnZones = ['inside', 'mixed', 'outside'];
const insideOrder = ['mac', 'ip', 'host', 'user', 'event', 'alert', 'hash', 'filepath', 'file'];
const outsideOrder = ['mac', 'ip', 'host', 'user', 'alert', 'event', 'hash', 'filepath', 'file'];
const mixedOrder = ['alert', 'event', 'hash', 'file', 'filepath'];
const spacerSeparator = 400;
const typeSeparator = 200;
const spacerNode = {};

// V0.
// For all nodes n, set a ternary to labels[n[bindings.idField]].typeField ~ /Internal/ | /External/.
// Internal is 1xx level, External is 5xx level, Neither is 3xx.
// For each ternary t, for each type, r = t.level + typeidx * 100 / |types|; for each node, ϕ = nodeidx * 360 / |nodes|.
export function network(graph) {
    //{canonicalInsideness -> nodetype -> [ node ] }
    const zoneTypenodes = {};
    const idField = bindings.idField;
    const canonicalTypeField = 'canonicalType';
    const typeField = bindings.typeField;
    graph.data.labels.forEach(n => {
        const zoneIdx = n.canonicalInsideness || '';
        if (zoneTypenodes[zoneIdx] === undefined) {
            zoneTypenodes[zoneIdx] = {};
        }
        const zone = zoneTypenodes[zoneIdx];
        const typeIdx = n[canonicalTypeField] || n[typeField];
        if (zone[typeIdx] === undefined) {
            zone[typeIdx] = [];
        }
        const zoneType = zone[typeIdx];
        zoneType.push(n);
    });

    //force-fill empty zones
    allOrderedZones.forEach(zone => {
        if (!zoneTypenodes[zone] && alwaysOnZones.indexOf(zone) > -1) {
            zoneTypenodes[zone] = { ip: [spacerNode] };
        }
    });

    const xys = {};
    const subaxes = {};
    let currentRadius = 0;
    let insideLatch = false;
    let outsideLatch = false;

    allOrderedZones.forEach((zone, zoneIdx) => {
        if (!zoneTypenodes[zone]) {
            return;
        }
        if (zoneIdx === 0) {
            insideLatch = true;
        }
        if (zoneIdx === 5) {
            outsideLatch = true;
        }
        if (zoneIdx > 0) {
            currentRadius += spacerSeparator;
            if (insideLatch) {
                subaxes[currentRadius] = {
                    r: currentRadius,
                    label: 'Internal Network',
                    internal: true
                };
                insideLatch = null;
            } else if (outsideLatch) {
                subaxes[currentRadius] = {
                    r: currentRadius,
                    label: 'External Communications',
                    external: true
                };
                outsideLatch = null;
            } else {
                subaxes[currentRadius] = { r: currentRadius, space: true };
            }
        }
        currentRadius += spacerSeparator - typeSeparator;
        const typeSortOrder =
            zoneIdx === 0 ? insideOrder : zoneIdx === 5 ? outsideOrder : mixedOrder;
        _.sortBy(Object.keys(zoneTypenodes[zone]), t => typeSortOrder.indexOf(t)).forEach(type => {
            currentRadius += typeSeparator;
            zoneTypenodes[zone][type].forEach((node, nodeIdx) => {
                const r = currentRadius;
                const ϕ = nodeIdx * Math.PI * 2 / zoneTypenodes[zone][type].length;
                if (node !== spacerNode) {
                    xys[node[idField]] = { x: r * Math.cos(ϕ), y: r * Math.sin(ϕ) };
                }
                subaxes[r] = { r };
            });
        });
    });

    decorateGraphLabelsWithXY(graph.data.labels, xys);

    graph.data.axes = Object.values(subaxes);
    return graph;
}
