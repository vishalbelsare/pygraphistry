import { flattenJson } from '../support/flattenJson.js';
import { VError } from 'verror';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

function checkAndFormatGraph(data) {
    const { nodes = [], edges = [] } = data;

    const validEdges = edges
        .filter(edge => 'source' in edge && 'destination' in edge)
        .map(flattenJson);

    if (!('edges' in data)) {
        throw new VError(
            {
                name: 'MissingEdges',
                cause: new Error('MissingEdges')
            },
            `Transformed result missing field "edges"`
        );
    }
    if (!(edges instanceof Array)) {
        throw new VError(
            {
                name: 'EdgesTypeError',
                cause: new Error('EdgesTypeError')
            },
            `Edges should be an array`
        );
    }
    if (edges.length && !validEdges.length) {
        throw new VError(
            {
                name: 'MissingEdgeIDs',
                cause: new Error('MissingEdgeIDs')
            },
            `Pivot returned ${edges.length} edges but all are missing fields "source" or "destination"`
        );
    }

    const validNodes = nodes.filter(node => 'node' in node).map(flattenJson);
    if (nodes && !(nodes instanceof Array)) {
        throw new VError(
            {
                name: 'NodesTypeError',
                cause: new Error('NodesTypeError')
            },
            `Nodes should be an array`
        );
    }
    if (nodes.length && !validNodes.length) {
        throw new VError(
            {
                name: 'MissingNodeIDs',
                cause: new Error('MissingNodeIDs')
            },
            `Pivot returned ${nodes.length} nodes but none have id field "node"`
        );
    }

    return {
        nodes: validNodes,
        edges: validEdges
    };
}

// ('table' | 'graph') * { id } * int * json
//  -> {mode, table: [ { EventID, ... } ] | graph: { nodes: [{node, ...}], edges: [{source, destination}]}}
// Turn json into a flat table or a graph, checked, post-connector / pre-shaper
//   If a table, add a unique event ID to rows to help hyper transform
export function outputToResult(mode = 'table', pivot, eventCounter, data) {
    try {
        switch (mode) {
            case 'table': {
                log.debug('searchAndShape response', data);
                const rows = data instanceof Array ? data.map(flattenJson) : [flattenJson(data)];
                if (rows.length) {
                    if (!('EventID' in rows[0])) {
                        for (let i = 0; i < rows.length; i++) {
                            rows[i].EventID = pivot.id + ':' + (eventCounter + i);
                        }
                    }
                }
                return {
                    mode,
                    table: rows
                };
            }
            case 'graph':
                return {
                    mode,
                    graph: checkAndFormatGraph(data)
                };
            default:
                throw new VError(
                    {
                        name: 'InvalidParameter',
                        cause: new Error('InvalidParameter'),
                        info: { mode }
                    },
                    `Output type should be "table" or "graph", received "${mode}"`
                );
        }
    } catch (e) {
        log.error('oops', e);
        throw e;
    }
}
