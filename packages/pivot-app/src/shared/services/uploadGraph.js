import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import { DataFrame } from 'dataframe-js';
import _ from 'underscore';
import zlib from 'zlib';
import request from 'request';
import VError from 'verror';
import { layouts } from './layouts.js';

import conf from '../../server/config.js';
import { graphUnion, sortNodesInplaceByPivotAndID, sortEdgesInplaceByPivotAndID} from './shape/graph.js';

import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


function upload(etlService, apiKey, data) {
    const gzipObservable = Observable.bindNodeCallback(zlib.gzip.bind(zlib));
    const upload0Wrapped = Observable.bindNodeCallback(upload0.bind(null));

    if (data.graph.length === 0) {
        return Observable.throw(new Error('No edges to upload!'));
    }

    log.trace(data, 'Content to be ETLed');
    const gzipped = gzipObservable(new Buffer(JSON.stringify(data), { level : 1}));
    return gzipped.switchMap(buffer =>
        upload0Wrapped(etlService, apiKey, buffer)
            .do((res) => log.debug({res}, 'ETL success'))
            .map(() => data.name)
            .catch((err) => Observable.throw(new VError(err, 'ETL upload error')))
    );
}

//jsonGraph * (err? -> ())? -> ()
function upload0(etlService, apiKey, data, _cb) {
    // When called with Observable.bindNodeCallback, cb will be defined and the following
    // default function will not be used.
    const cb = _cb || function (err, res) {
        if (err) {
            return new VError(err, 'ETL upload error');
        } else {
            return log.debug(res, 'ETL success');
        }
    };

    const headers = {'Content-Encoding': 'gzip', 'Content-Type': 'application/json'};
    return request.post({
        uri: etlService,
        qs: getQuery(apiKey),
        headers: headers,
        body: data,
        callback: function (err, res, body) {
            if (err) {
                return cb(err);
            }
            log.debug('Response status', res.statusCode, res.statusMessage);
            if (res.statusCode >= 400) {
                return cb(new Error(
                    `ETL service responded with ${res.statusCode} (${res.statusMessage})`
                ));
            }
            try {
                log.debug('Trying to parse response body', body)
                const json = JSON.parse(body);
                if (!json.success) {
                    log.debug({body: body}, 'Server Response');
                    return cb(new Error(`Server responded with success=false: ${json.msg}`));
                }
                return cb(undefined, json);
            } catch (e) {
                return cb(e);
            }
        }
    });
}


function getQuery(key) {
    return {
        'key': key,
        'agent': 'pivot-app',
        'agentversion': '0.0.1',
        'apiversion': 1
    };
}

export const bindings = {
    "sourceField": "source",
    "destinationField": "destination",
    "typeField": "type",
    "idField": "node",
    "idEdgeField": "edge"    
}

function synthesizeMissingNodes(edges, nodes) {
    
    const inNodes = {};
    nodes.forEach((node) => { inNodes[node[bindings.idField]] = true });

    const inEdges = {};
    edges.forEach((edge) => {
        inEdges[edge[bindings.sourceField]] = true;
        inEdges[edge[bindings.destinationField]] = true;
    });

    return Object.keys(inEdges)
        .filter((id) => !(id in inNodes))
        .map((id) => ({[bindings.idField]: id}));
}

export function createGraph(pivots) {
    const name = `PivotApp/${simpleflake().toJSON()}`;
    const type = "edgelist";

    const visiblePivots = pivots.filter((pivot) => pivot.results && pivot.enabled);

    log.trace({ visiblePivots }, "visiblePivots");

    const {nodes, edges} =
        pivots.reduce(
            ({nodes, edges}, {enabled, results: {graph = [], labels = []} = {} }, index) =>
                !enabled ? {nodes, edges}
                : graphUnion(                    
                    {nodes: labels.map((node) => ({'Pivot': index, ...node})),
                     edges: graph.map((edge) => ({'Pivot': index, ...edge})) },
                    {nodes, edges}, //don't clobber earlier Pivot #
                    bindings.idField,
                    bindings.idEdgeField),
            {nodes: [], edges: []});

    sortNodesInplaceByPivotAndID(nodes);
    sortEdgesInplaceByPivotAndID(edges);

    const missingNodes = synthesizeMissingNodes(edges, nodes, bindings);

    const uploadData = {
        graph: edges,
        labels: nodes.concat(missingNodes),
        name, type, bindings
    };

    return { pivots, data: uploadData };
}

export function isPrivateIP(ip) {
    // RFC 1918: 10/8, 172.16/12, 192.168/16
    // TODO: use ipaddr.js
    return String(ip).match(/^10[.][^.]+[.][^.]+[.][^.]+$|172[.](?:1[6-9]|2\d|3[01])[.][^.]+[.][^.]+$|192[.]168[.][^.]+[.][^.]+$/) !== null;
}

export function isIP(ip) {
    // TODO: use ipaddr.js
    return String(ip).match(/^\d+[.]\d+[.]\d+[.]\d+$/);
}

export function decorateInsideness(graph) {
    const ontologyType = "canonicalType"; // comes from colTypes[] in src/shared/services/templates/splunk/vendors/splunk
    // ontology type is one of %w[event file id ip mac url user]
    // 1. Decorate nodes with IP-address names as either inside or outside.
    const io = {};
    graph.data.labels.forEach(({node: id}) => {
        if(!io[id]) {
            io[id] = {};
        }
        if(id && isIP(id)) {
            io[id][isPrivateIP(id) ? 'i' : 'o'] = true
        }});
    // 2. All events that have attributes /^(dest|dst|src|source)/ that have an insideness
    //    have a corresponding insideness which propagates to their attributes.
    graph.data.labels.filter(({ [ontologyType]: canonicalType }) => canonicalType === 'event').forEach((e) => {
        const ks = Object.keys(e);
        const ks_srcs = ks.filter((k) => k.match(/^(?:src|source)/));
        const ks_dsts = ks.filter((k) => k.match(/^(?:dst|dest)/));
        const ks_srcios = ks_srcs.map((k) => Object.keys(io[e[k]] || {}));
        const ks_dstios = ks_dsts.map((k) => Object.keys(io[e[k]] || {}));
        const srcs = Array.prototype.concat(...ks_srcios);
        const dsts = Array.prototype.concat(...ks_dstios);
        const s_i = srcs.includes('i');
        const s_o = srcs.includes('o');
        const d_i = dsts.includes('i');
        const d_o = dsts.includes('o');
        if((s_i ^ s_o) && (d_i ^ d_o)) { // This only makes sense if the event has a src/dst from a known insideness
            if((s_i && d_i) || (s_o && d_o)) {
                // Everything is either inside or outside.
                const insideness = s_i ? "i" : "o";
                Object.keys(e).forEach((k) => { if(io[e[k]]) { io[e[k]][insideness] = true } });
            } else {
                // All the srcs go inside|outside, all the dsts go outside|inside, all the rest goes io|oi.
                const reassigned_src_i = s_i ? "i" : "o";
                const reassigned_src_keys = {};
                const reassigned_dst_i = d_i ? "i" : "o";
                const reassigned_dst_keys = {}
                const remaining_insideness = s_i ? "io" : "oi";
                ks_srcs.forEach(k => {
                    if(io[e[k]]) {
                        io[e[k]][reassigned_src_i] = true;
                        reassigned_src_keys[e[k]] = true;
                    }});
                ks_dsts.forEach(k => {
                    if(io[e[k]]) {
                        io[e[k]][reassigned_dst_i] = true;
                        reassigned_dst_keys[e[k]] = true;
                    }});
                Object.keys(e).forEach((k) => {
                    if(io[e[k]] && !reassigned_src_keys[e[k]] && !reassigned_dst_keys[e[k]]) {
                        io[e[k]][remaining_insideness] = true;
                    }});
            }
        } else {
            e.mixedInsideness = true; // Is this a warning? This graph is weird
        }});
    // 3. Decorate nodes in the graph accordingly.
    graph.data.labels.forEach((n) => {
        const nio = io[n.node];
        if((nio.i || nio.io) && (nio.o || nio.oi)) {
            n.canonicalInsideness = "mixed";
        } else if(nio.io) {
            n.canonicalInsideness = "inside->outside";
        } else if(nio.oi) {
            n.canonicalInsideness = "outside->inside";
        } else if(nio.o) {
            n.canonicalInsideness = "outside";
        } else if(nio.i) {
            n.canonicalInsideness = "inside";
        }});
    return graph;
}

// V0.
// For all nodes n, set a ternary to labels[n[bindings.idField]].typeField ~ /Internal/ | /External/.
// Internal is 1xx level, External is 5xx level, Neither is 3xx.
// For each ternary t, for each type, r = t.level + typeidx * 100 / |types|; for each node, ϕ = nodeidx * 360 / |nodes|.
export function insideOut(graph) {
    const zoneTypenodes = {};
    const idField = bindings.idField;
    const typeField = bindings.typeField;
    graph.data.labels.forEach((n) => {
        const zoneIdx = n.canonicalInsideness || "";
        if(zoneTypenodes[zoneIdx] === undefined) { zoneTypenodes[zoneIdx] = {}; }
        const zone = zoneTypenodes[zoneIdx];
        const typeIdx = n[typeField];
        if(zone[typeIdx] === undefined) { zone[typeIdx] = []; }
        const zoneType = zone[typeIdx];
        zoneType.push(n);
    });

    const xys = {};
    const subaxes = {};
    const allOrderedZones = ["inside", "inside->outside", "mixed", "", "outside->inside", "outside"];
    let currentRadius = 0;
    let insideLatch = false;
    let outsideLatch = false;
    const spacerSeparator = 400;
    const typeSeparator = 200;

    allOrderedZones.forEach((zone, zoneIdx) => {
        if(!zoneTypenodes[zone]) { return; }
        if(zoneIdx === 0) { insideLatch = true; }
        if(zoneIdx === 5) { outsideLatch = true; }
        if(zoneIdx > 0) {
            currentRadius += spacerSeparator;
            if(insideLatch) {
                subaxes[currentRadius] = {r: currentRadius, label: "Internal Network", internal: true};
                insideLatch = null;
            } else if(outsideLatch) {
                subaxes[currentRadius] = {r: currentRadius, label: "External Communications", external: true};
                outsideLatch = null;
            } else {
                subaxes[currentRadius] = {r: currentRadius, space: true};
            }
        }
        currentRadius += spacerSeparator - typeSeparator;
        Object.keys(zoneTypenodes[zone]).sort().forEach((type) => {
            currentRadius += typeSeparator;
            zoneTypenodes[zone][type].forEach((node, nodeIdx) => {
                const r = currentRadius;
                const ϕ = nodeIdx * Math.PI * 2 / zoneTypenodes[zone][type].length;
                xys[node[idField]] = {x: r * Math.cos(ϕ), y: r * Math.sin(ϕ)};
                subaxes[r] = {r};
                });
            });
        });

    decorateGraphLabelsWithXY(graph.data.labels, xys);

    graph.data.edgeOpacity = generateEdgeOpacity(graph.data.graph);
    graph.data.axes = Object.values(subaxes);
    return graph;
}


// {data: {bindings: {sourceField: s, destinationField: d, idField: i}, graph: [{Pivot: pivotId, s: n1, d: n2}], labels: [{i: nName, __x: x, y: y__}]}, pivots: ...}
// Take a graph, and add x/y coordinates to render it into a "stacked bushy graph".
// More formally: for all {Pivot: id, s: n1, d: n2} in graph, put n1 into the smallest row id*2, and n2 into the smallest row id*2+1. Then,
// in each row, order each node into columns based on degree and lexicographic order. Then,
// for each row indexed by r, for each column indexed by c, set the node's x to be rFudge * r, and set the node's y to be cFudge * (max(|c|) - |c| + c) (for centering)
// by default, create a graph that has aspect 1:√(max(|c|)), going from top to bottom.
export function stackedBushyGraph(graph, fudgeX = 250, fudgeY = -250 * Math.pow(_.max(_.values(_.countBy(_.pluck(graph.data.graph, 'Pivot'), _.identity))), 0.5), spacerY = fudgeY, minLineLength = 5, maxLineLength = 100, pivotWrappedLineHeight=0.25) {
    log.trace({stackedBushyGraphInputs: graph.data}, "This is what we're making into a stacked bushy graph");
    if(pivotWrappedLineHeight > 0.5) {
        log.warn("Line-wrapped nodes are over half the line height!");
    }

    const nodeRows = edgesToRows(graph.data.graph, graph.data.labels);
    const nodeDegrees = graphDegrees(graph.data.graph, nodeRows);
    const columnCounts = rowColumnCounts(nodeRows);
    const types = nodeTypes(graph.data.labels);
    const nodeColumns = rowsToColumns(nodeRows, columnCounts, nodeDegrees, minLineLength, maxLineLength, pivotWrappedLineHeight, types);
    const nodeXYs = mergeRowsColumnsToXY(nodeRows, nodeColumns, fudgeX, fudgeY, spacerY);
    const axes = generateAxes(nodeRows, fudgeY, spacerY);
    const edgeOpacity = generateEdgeOpacity(nodeDegrees);

    decorateGraphLabelsWithXY(graph.data.labels, nodeXYs);

    graph.data.axes = axes;
    graph.data.edgeOpacity = edgeOpacity;

    return graph;
}

// [{Pivot: Int, bindings.sourceField: nodeName, bindings.destinationField: nodeName}] -> {nodeName: Int}
export function edgesToRows(edges, nodes) {
    const allEdgeRows = 
        _.flatten(
            edges
                .filter((e) => e.edgeType && e.edgeType.indexOf('EventID->') === 0)
                .map((e) => [
                    {node: e[bindings.sourceField], row: e.Pivot * 2},
                    {node: e[bindings.destinationField], row: e.Pivot * 2 + 1} ]),
            "shallow");
    const leastEdgeRows = _.mapObject(_.groupBy(allEdgeRows, bindings.idField),
                                      (allRows) => _.min(_.pluck(allRows, 'row')));

    const isolatedNodeRows = nodes.filter((n) => (!(n.node in leastEdgeRows)))
        .map(({[bindings.idField]: id, 'Pivot': row}) => [id, 2 * row]);
    isolatedNodeRows.forEach(function([id, row]) { leastEdgeRows[id] = row });

    return leastEdgeRows;
}

// [{bindings.sourceField: nodeName, bindings.destinationField: nodeName}] -> {nodeName: Int}
export function graphDegrees(edges, rows) {
    const sources = _.pluck(edges, bindings.sourceField);
    const destinations = _.pluck(edges, bindings.destinationField);
    const initiallyZeroDegrees = _.mapObject(rows, () => 0);
    return _.extend(initiallyZeroDegrees, _.countBy(sources.concat(destinations), _.identity));
}

// labels -> {node: type}
export function nodeTypes(labels) {
    return labels.reduce((h, label) => { h[label[bindings.idField]] = label[bindings.typeField]; return h}, {});
}

// {nodeName: Int} -> {"Int": Int}
export function rowColumnCounts(rows) {
    return _.countBy(_.values(rows), _.identity);
}

// {a: b} -> {b: [a]} (whereas _.invert :: {a: b} -> {b: a})
export function nonuniqueInvert(h) {
    return _.mapObject(_.groupBy(_.pairs(h), ([,v]) => v), (v) => _.map(v, ([k,]) => k));
}

// IO {nodeName: Int}, {"Int": Int}, {nodeName: Int}, Int, Int, Real -> {nodeName: Int}
export function rowsToColumns(nodeRows, columnCounts, nodeDegrees, minLineLength, maxLineLength, pivotWrappedLineHeight, types) {
    const maxColumn = _.max(_.values(columnCounts));
    const orderedRows = _.mapObject(nonuniqueInvert(nodeRows),
                                    (nodes) => nodes.sort((a,b) => (nodeDegrees[b] - nodeDegrees[a]) || (a > b ? 1 : -1)));
    const nodeColumns = {};
    _.each(orderedRows, (row, rowNumber) => {
        // For each row, see if `row` is longer than `maxLineLength`, and if splitting `row` by `types`[`node`] would not make every split row shorter than `minLineLength`.
        // If so, DESTRUCTIVELY UPDATE nodeRows to place nodes in `row` into rows from `rowNumber` to `rowNumber` + `pivotWrappedLineHeight` * splitId / |splits|.
        // After revising rows, place nodes in each (potentially new) row into columns.
        const tooLong = row.length > maxLineLength;
        const splits = _.sortBy(_.values(_.groupBy(row, (n) => types[n])), (r) => -r.length);
        const nowTooShort = splits.every((split) => split.length < minLineLength);
        const useSplits = tooLong && !nowTooShort;
        const newRows = (useSplits ? splits : [row]);
        const linewrappedNewRows = _.flatten(newRows.map((r) => {
                    const bestLineLength = _.max(_.range(maxLineLength / 2 , maxLineLength * 2), (linelength) => (1 + ((r.length - 1) % linelength)) / linelength);
                    return _.values(_.groupBy(r, (n,i) => Math.trunc(i / bestLineLength)));
                }), "shallow");
        linewrappedNewRows.forEach((newRow, i) => {
            const newRowNumber = Number(rowNumber) + (i / (linewrappedNewRows.length - 0.999) * pivotWrappedLineHeight);
            newRow.forEach((node, idx) => {
                nodeRows[node] = newRowNumber;
                nodeColumns[node] = ((maxColumn - 0.999) / (newRow.length - 0.999)) * idx;
            });
        });
    });
    return nodeColumns;
}

// {nodeName: Int}, {nodeName: Int}, Int, Int -> {nodeName: {x: Int}, {y: Int}}
export function mergeRowsColumnsToXY(rows, columns, fudgeX, fudgeY, spacerY) {
    return _.mapObject(rows,
                       (rowIdx, node) =>
                       ({
                           x: fudgeX * columns[node],
                           y: (rowIdx > 0
                               ? (fudgeY + spacerY) * (rowIdx - (rowIdx & 1)) + spacerY * (rowIdx & 1)
                               : -2 * spacerY)
                       }));
}

// [{idField: n}] -> () // [{idField: n, x: Int, y: Int}]
export function decorateGraphLabelsWithXY(labels, xy) {
    const i = bindings.idField;
    _.each(labels, function(label) {
            label.x = xy[label[i]].x;
            label.y = xy[label[i]].y;
        });
}

export function generateEdgeOpacity(nodeDegrees) {
    const edgeCount = Object.values(nodeDegrees).length;
    return 2.0 / Math.log10(100 + edgeCount);
}

export function generateAxes(rows, fudgeY, spacerY) {
    // v1: axes just for each major pivot.
    const pivotRows = Object.values(rows); // This includes, because of rowsToColumns()'s line-splitting, real numbers.
    const uniquePivotIntegers = _.uniq(pivotRows.map((r) => ((r / 2) | 0))).sort((a,b) => a-b);
    const axes = uniquePivotIntegers.map((i) => ({label: `Pivot ${i + 1}`, y: (i > 0 ? (fudgeY + spacerY) * i * 2 : -2 * spacerY)}));

    return conf.get("features.axes") ? axes : [];
}

const shapers = {stackedBushyGraph: stackedBushyGraph,
                 atlasbarnes: ((x) => x),
                 insideout: insideOut,
                 weirdRandomSquare: ((x) => x)};

function makeEventTable({pivots}) {
    function fieldSummary(mergedData, field) {

        const distinct = mergedData.distinct(field).toArray();

        const res = {
            numDistinct: distinct.length
        };

        if (res.numDistinct <= 12) {
            res.values = distinct;
        }

        return res;
    }

    const dataFrames = pivots
        .filter(pivot => (pivot.results && pivot.enabled))
        .filter(pivot => pivot.df)
        .map(pivot => pivot.df);

    const fields = _.uniq(
        _.flatten(
            dataFrames.map(df => df.listColumns())
        )
    );
    log.debug('Union of all pivot fields', fields);

    const zeroDf = new DataFrame([], fields);
    const mergedData = dataFrames.reduce((a, b) => {
        return a.union(new DataFrame(b, fields));
    }, zeroDf);

    const fieldSummaries = {};

    fields.forEach(field => {
        fieldSummaries[field] = fieldSummary(mergedData, field)
    });

    let table;
    try {
        table = mergedData.groupBy('EventID')
            .aggregate((group) => group.toCollection()[0])
            .toArray('aggregation');
    } catch (e) {
        if (e.name === 'NoSuchColumnError') {
            table = [];
        } else {
            throw e;
        }
    }
    return {
        fieldSummaries: fieldSummaries,
        table: table
    };
}

export function uploadGraph({loadInvestigationsById, loadPivotsById, loadUsersById,
                             investigationIds}) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(
            ({app, investigation}) =>
                Observable.combineLatest(
                    loadUsersById({userIds: [app.currentUser.value[1]]}),
                    loadPivotsById({pivotIds: investigation.pivots.map(x => x.value[1])})
                        .map(({ pivot }) => pivot)
                        .toArray()
                        .map(createGraph)
                        .map(decorateInsideness)
                        .map((g) => shapers[investigation.layout](g)),
                    ({user}, {pivots, data}) => ({user, pivots, data})
                )
                .switchMap(({user, data, pivots}) => {
                    if (data.graph.length > 0) {
                        return upload(user.etlService, user.apiKey, data)
                                    .map(dataset => ({user, dataset, data, pivots}));
                    } else {
                        log.debug('Graph is empty, skipping upload');
                        return Observable.of({user, data, pivots});
                    }
                })
                .do(({user, dataset, data, pivots}) => {
                    investigation.eventTable = makeEventTable({data, pivots});
                    if (dataset) {
                        investigation.controls = layouts.find((e) => (e.id === investigation.layout)).controls
                        investigation.url = `${user.vizService}&dataset=${dataset}&controls=${investigation.controls}`;
                        investigation.datasetName = dataset;
                        investigation.datasetType = 'vgraph';
                        investigation.axes = data.axes;
                        investigation.edgeOpacity = data.edgeOpacity;
                        investigation.status = {
                            ok: true,
                            etling: false,
                            msgStyle: 'default'
                        };
                    } else {
                        investigation.status = {
                            ok: false,
                            etling: false,
                            message: 'Attempting to upload empty graph!',
                            msgStyle: 'info',
                        }
                    }
                    log.debug('  URL: ' + investigation.url);
                }),
            ({app, investigation}) => ({app, investigation})
        )
}
