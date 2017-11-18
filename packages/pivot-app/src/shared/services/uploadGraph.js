import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import _ from 'underscore';
import zlib from 'zlib';
import request from 'request';
import VError from 'verror';
import * as querystring from 'querystring';
import { layouts, encodingsByLayoutId } from './layouts.js';
import { decorateInsideness, network } from './layouts/network';

import * as vgraph from './vgraph/vgraph';
import { VectorGraph } from './vgraph/proto';

const conf = global.__graphistry_convict_conf__;
import { graphUnion, bindings } from './shape/graph.js';
import { decorateGraphLabelsWithXY, generateEdgeOpacity } from './shape/normalizeGraph';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

function upload(etlService, apiKey, data, investigation) {
    if (data.graph.length === 0) {
        return Observable.throw(new Error('No edges to upload!'));
    }
    log.trace(data, 'Content to be ETLed');
    const { vg } = vgraph.fromEdgeList(
        data.graph,
        data.labels,
        data.bindings.sourceField,
        data.bindings.destinationField,
        data.bindings.idField,
        data.name
    );
    const vgBuffer = VectorGraph.encode(vg).finish();
    const metadata = {
        name: data.name,
        datasources: [{ type: 'vgraph', url: 'data0' }],
        edges: [
            {
                count: vg.edgeCount,
                complexEncodings: {
                    current: partitionEncodings(encodingsByLayoutId[investigation.layout], 'edge', [
                        'edgeColorEncoding'
                    ]),
                    default: partitionEncodings(encodingsByLayoutId[investigation.layout], 'edge', [
                        'edgeColorEncodingDefault'
                    ])
                }
            }
        ],
        nodes: [
            {
                count: vg.vertexCount,
                complexEncodings: {
                    current: partitionEncodings(
                        encodingsByLayoutId[investigation.layout],
                        'point',
                        ['pointIconEncoding', 'pointSizeEncoding', 'pointColorEncoding']
                    ),
                    default: partitionEncodings(
                        encodingsByLayoutId[investigation.layout],
                        'point',
                        [
                            'pointIconEncodingDefault',
                            'pointSizeEncodingDefault',
                            'pointColorEncodingDefault'
                        ]
                    )
                }
            }
        ]
    };
    return Observable.create(observer => {
        const form = request
            .post({
                uri: etlService,
                qs: getQuery(apiKey),
                callback(err, res, body) {
                    if (err) {
                        return observer.error(err);
                    }
                    log.debug('Response status', res.statusCode, res.statusMessage);
                    if (res.statusCode >= 400) {
                        return observer.error(
                            new Error(
                                `ETL service responded with ${res.statusCode} (${res.statusMessage})`
                            )
                        );
                    }
                    try {
                        log.debug('Trying to parse response body', body);
                        const json = JSON.parse(body);
                        if (!json.success) {
                            log.debug({ body: body }, 'Server Response');
                            return observer.error(
                                new Error(`Server responded with success=false: ${json.msg}`)
                            );
                        }
                        observer.next(json);
                        observer.complete();
                    } catch (e) {
                        return observer.error(e);
                    }
                }
            })
            .form();
        form.append('data0', vgBuffer, {
            filename: 'data0',
            contentType: 'application/octet-stream'
        });
        form.append('metadata', JSON.stringify(metadata), {
            filename: 'metadata',
            contentType: 'application/json'
        });
    })
        .do(res => log.debug({ res }, 'ETL success'))
        .map(({ dataset }) => dataset)
        .catch(err => Observable.throw(new VError(err, 'ETL upload error')));
}

function partitionEncodings(allEncodings, graphType, encodingTypes) {
    return encodingTypes.filter(encodingName => !!allEncodings[encodingName]).reduce(
        (encodings, encodingName) => ({
            ...encodings,
            [encodingName]: {
                ...allEncodings[encodingName],
                graphType,
                // 'edgeSize' -> 'size', 'pointColorDefault' -> 'color' etc.
                encodingType: encodingName
                    .slice(graphType.length, encodingName.indexOf('Encoding'))
                    .toLowerCase()
            }
        }),
        {}
    );
}

function getQuery(key) {
    return {
        key: key,
        agent: 'pivot-app',
        agentversion: '0.0.1',
        apiversion: 2
    };
}

function updatePivot(edges, nodeID, pivot = 0) {
    const current = edges[nodeID];
    if (current !== undefined) {
        return;
    }
    edges[nodeID] = pivot;
}

function synthesizeMissingNodes(edges, nodes) {
    const inNodes = {};
    nodes.forEach(node => {
        inNodes[node[bindings.idField]] = node;
    });

    const inEdges = {}; // {[src,dst] -> pivot:int}
    edges.forEach(edge => {
        updatePivot(inEdges, edge[bindings.sourceField], edge.Pivot);
        updatePivot(inEdges, edge[bindings.destinationField], edge.Pivot);
    });

    return Object.keys(inEdges)
        .filter(id => !(id in inNodes))
        .map(id => ({ [bindings.idField]: id, Pivot: inEdges[id] }));
}

export function createGraph(pivots) {
    const name = `PivotApp/${simpleflake().toJSON()}`;
    const type = 'edgelist';

    const visiblePivots = pivots.filter(pivot => pivot.results && pivot.enabled);

    log.trace({ visiblePivots }, 'visiblePivots');

    const { nodes, edges } = pivots.reduce(
        ({ nodes, edges }, { enabled, results: { graph = [], labels = [] } = {} }, index) =>
            !enabled
                ? { nodes, edges }
                : graphUnion(
                      { nodes, edges },
                      {
                          nodes: labels.map(node => ({ Pivot: index, ...node })),
                          edges: graph.map(edge => ({ Pivot: index, ...edge }))
                      },
                      bindings.idField,
                      bindings.idEdgeField
                  ),
        { nodes: [], edges: [] }
    );

    const missingNodes = synthesizeMissingNodes(edges, nodes, bindings);

    const uploadData = {
        graph: edges,
        labels: nodes.concat(missingNodes),
        name,
        type,
        bindings
    };

    return { pivots, data: uploadData };
}

// {data: {bindings: {sourceField: s, destinationField: d, idField: i}, graph: [{Pivot: pivotId, s: n1, d: n2}], labels: [{i: nName, __x: x, y: y__}]}, pivots: ...}
// Take a graph, and add x/y coordinates to render it into a "stacked bushy graph".
// More formally: for all {Pivot: id, s: n1, d: n2} in graph, put n1 into the smallest row id*2, and n2 into the smallest row id*2+1. Then,
// in each row, order each node into columns based on degree and lexicographic order. Then,
// for each row indexed by r, for each column indexed by c, set the node's x to be rFudge * r, and set the node's y to be cFudge * (max(|c|) - |c| + c) (for centering)
// by default, create a graph that has aspect 1:√(max(|c|)), going from top to bottom.
export function stackedBushyGraph(
    graph,
    fudgeX = 250,
    fudgeY = -250 *
        Math.pow(_.max(_.values(_.countBy(_.pluck(graph.data.graph, 'Pivot'), _.identity))), 0.5),
    spacerY = fudgeY,
    minLineLength = 5,
    maxLineLength = 100,
    pivotWrappedLineHeight = 0.25
) {
    log.trace(
        { stackedBushyGraphInputs: graph.data },
        "This is what we're making into a stacked bushy graph"
    );
    if (pivotWrappedLineHeight > 0.5) {
        log.warn('Line-wrapped nodes are over half the line height!');
    }

    const nodeRows = edgesToRows(graph.data.graph, graph.data.labels);
    const nodeDegrees = graphDegrees(graph.data.graph, nodeRows);
    const columnCounts = rowColumnCounts(nodeRows);
    const types = nodeTypes(graph.data.labels);
    const nodeColumns = rowsToColumns(
        nodeRows,
        columnCounts,
        nodeDegrees,
        minLineLength,
        maxLineLength,
        pivotWrappedLineHeight,
        types
    );
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
    const allEdgeRows = _.flatten(
        edges
            .filter(e => e.edgeType && e.edgeType.indexOf('EventID->') === 0)
            .map(e => [
                { node: e[bindings.sourceField], row: e.Pivot * 2 },
                { node: e[bindings.destinationField], row: e.Pivot * 2 + 1 }
            ]),
        'shallow'
    );
    const leastEdgeRows = _.mapObject(_.groupBy(allEdgeRows, bindings.idField), allRows =>
        _.min(_.pluck(allRows, 'row'))
    );

    const isolatedNodeRows = nodes
        .filter(n => !(n.node in leastEdgeRows))
        .map(({ [bindings.idField]: id, Pivot: row }) => [id, 2 * row]);
    isolatedNodeRows.forEach(function([id, row]) {
        leastEdgeRows[id] = row;
    });

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
    return labels.reduce((h, label) => {
        h[label[bindings.idField]] = label[bindings.typeField];
        return h;
    }, {});
}

// {nodeName: Int} -> {"Int": Int}
export function rowColumnCounts(rows) {
    return _.countBy(_.values(rows), _.identity);
}

// {a: b} -> {b: [a]} (whereas _.invert :: {a: b} -> {b: a})
export function nonuniqueInvert(h) {
    return _.mapObject(_.groupBy(_.pairs(h), ([, v]) => v), v => _.map(v, ([k]) => k));
}

// IO {nodeName: Int}, {"Int": Int}, {nodeName: Int}, Int, Int, Real -> {nodeName: Int}
export function rowsToColumns(
    nodeRows,
    columnCounts,
    nodeDegrees,
    minLineLength,
    maxLineLength,
    pivotWrappedLineHeight,
    types
) {
    const maxColumn = _.max(_.values(columnCounts));
    const orderedRows = _.mapObject(nonuniqueInvert(nodeRows), nodes =>
        nodes.sort((a, b) => nodeDegrees[b] - nodeDegrees[a] || (a > b ? 1 : -1))
    );
    const nodeColumns = {};
    _.each(orderedRows, (row, rowNumber) => {
        // For each row, see if `row` is longer than `maxLineLength`, and if splitting `row` by `types`[`node`] would not make every split row shorter than `minLineLength`.
        // If so, DESTRUCTIVELY UPDATE nodeRows to place nodes in `row` into rows from `rowNumber` to `rowNumber` + `pivotWrappedLineHeight` * splitId / |splits|.
        // After revising rows, place nodes in each (potentially new) row into columns.
        const tooLong = row.length > maxLineLength;
        const splits = _.sortBy(_.values(_.groupBy(row, n => types[n])), r => -r.length);
        const nowTooShort = splits.every(split => split.length < minLineLength);
        const useSplits = tooLong && !nowTooShort;
        const newRows = useSplits ? splits : [row];
        const linewrappedNewRows = _.flatten(
            newRows.map(r => {
                const bestLineLength = _.max(
                    _.range(maxLineLength / 2, maxLineLength * 2),
                    linelength => (1 + (r.length - 1) % linelength) / linelength
                );
                return _.values(_.groupBy(r, (n, i) => Math.trunc(i / bestLineLength)));
            }),
            'shallow'
        );
        linewrappedNewRows.forEach((newRow, i) => {
            const newRowNumber =
                Number(rowNumber) +
                i / (linewrappedNewRows.length - 0.999) * pivotWrappedLineHeight;
            newRow.forEach((node, idx) => {
                nodeRows[node] = newRowNumber;
                nodeColumns[node] = (maxColumn - 0.999) / (newRow.length - 0.999) * idx;
            });
        });
    });
    return nodeColumns;
}

// {nodeName: Int}, {nodeName: Int}, Int, Int -> {nodeName: {x: Int}, {y: Int}}
export function mergeRowsColumnsToXY(rows, columns, fudgeX, fudgeY, spacerY) {
    return _.mapObject(rows, (rowIdx, node) => ({
        x: fudgeX * columns[node],
        y:
            rowIdx > 0
                ? (fudgeY + spacerY) * (rowIdx - (rowIdx & 1)) + spacerY * (rowIdx & 1)
                : -2 * spacerY
    }));
}

export function generateAxes(rows, fudgeY, spacerY) {
    // v1: axes just for each major pivot.
    const pivotRows = Object.values(rows); // This includes, because of rowsToColumns()'s line-splitting, real numbers.
    const uniquePivotIntegers = _.uniq(pivotRows.map(r => (r / 2) | 0)).sort((a, b) => a - b);
    const axes = uniquePivotIntegers.map(i => ({
        label: `Pivot ${i + 1}`,
        y: i > 0 ? (fudgeY + spacerY) * i * 2 : -2 * spacerY
    }));

    return conf.get('features.axes') ? axes : [];
}

const shapers = {
    stackedBushyGraph: stackedBushyGraph,
    atlasbarnes: x => x,
    insideout: network,
    weirdRandomSquare: x => x
};

export function uploadGraph({
    loadInvestigationsById,
    loadPivotsById,
    loadUsersById,
    investigationIds
}) {
    return loadInvestigationsById({ investigationIds }).mergeMap(
        ({ app, investigation }) =>
            Observable.combineLatest(
                loadUsersById({ userIds: [app.currentUser.value[1]] }),
                loadPivotsById({ pivotIds: investigation.pivots.map(x => x.value[1]) })
                    .map(({ pivot }) => pivot)
                    .toArray()
                    .map(createGraph)
                    .map(decorateInsideness)
                    .map(g => shapers[investigation.layout](g)),
                ({ user }, { pivots, data }) => ({ user, pivots, data })
            )
                .switchMap(({ user, data, pivots }) => {
                    if (data.graph.length + data.labels.length > 0) {
                        return upload(
                            user.etlService,
                            user.apiKey,
                            data,
                            investigation
                        ).map(dataset => ({
                            user,
                            dataset,
                            data,
                            pivots
                        }));
                    } else {
                        log.debug('Graph is empty, skipping upload');
                        return Observable.of({ user, data, pivots });
                    }
                })
                .do(({ user, dataset, data }) => {
                    if (dataset) {
                        investigation.eventTable = {
                            hasResults: data.graph.length + data.labels.length > 0
                        };
                        investigation.controls = layouts.find(
                            e => e.id === investigation.layout
                        ).controls;
                        investigation.url = `${user.vizService}&dataset=${dataset}&controls=${investigation.controls}`;
                        investigation.datasetName = dataset;
                        investigation.datasetType = 'jsonMeta';
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
                            msgStyle: 'info'
                        };
                    }
                    log.debug('  URL: ' + investigation.url);
                }),
        ({ app, investigation }) => ({ app, investigation })
    );
}
