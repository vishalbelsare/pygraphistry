import { Observable } from 'rxjs';
import { VectorGraph } from '../vgraph';
import { isDateTimeColumn, dateTimeVectorMapping } from '../types';
import { isColorColumn, isColorPaletteColumn, colorVectorMapping } from '../types';

export interface PartitionOptions {
    vgraph: VectorGraph;
    edges: TableMetadata;
    nodes: TableMetadata;
}

export interface TableMetadata {
    name: string;
    count: number;
    attributes: AttributesMetadata;
    encodings: {
        [encodingName: string]: {
            attributes: string[];
        };
    };
}

export interface AttributesMetadata {
    [columnName: string]: AttributeMetadata;
}

export interface AttributeMetadata {
    ctype: string;
    userType?: string;
    aggregations: {
        min: any;
        max: any;
        valid: number;
        missing: number;
        distinct: number;
    };
}

export interface VGraphTable {
    name: string;
    length: number;
    edges?: VectorGraph.IEdge[];
    bool_vectors?: VectorGraph.IBoolAttributeVector[];
    float_vectors?: VectorGraph.IFloatAttributeVector[];
    int32_vectors?: VectorGraph.IInt32AttributeVector[];
    int64_vectors?: VectorGraph.IInt64AttributeVector[];
    double_vectors?: VectorGraph.IDoubleAttributeVector[];
    string_vectors?: VectorGraph.IStringAttributeVector[];
    uint32_vectors?: VectorGraph.IUInt32AttributeVector[];
}

const {
    AttributeTarget,
    UInt32AttributeVector,
    DoubleAttributeVector,
    StringAttributeVector,
    Int32AttributeVector,
    Int64AttributeVector,
    FloatAttributeVector,
    BoolAttributeVector
} = VectorGraph;

export function partition({ vgraph, edges, nodes }: PartitionOptions) {
    const typedVGraph = assignColumnMappings(vgraph, nodes.attributes, edges.attributes);
    return Observable.from([
        createColsTable(typedVGraph),
        createNodesTable(typedVGraph),
        createEdgesTable(typedVGraph)
    ]);
}

function assignColumnMappings(
    vgraph: VectorGraph,
    nodeAttrs: AttributesMetadata = {},
    edgeAttrs: AttributesMetadata = {}
) {
    const mappings =
        (vgraph.bindings || {}).mappings ||
        [].concat(
            Object.keys(edgeAttrs).map(convertAttributeMetadata(edgeAttrs, AttributeTarget.EDGE)),
            Object.keys(nodeAttrs).map(convertAttributeMetadata(nodeAttrs, AttributeTarget.VERTEX))
        );

    const getMapping = getVectorMapping(mappings);

    return {
        ...vgraph,
        bool_vectors: (vgraph.bool_vectors || []).map(withMapping(BoolAttributeVector, 'bool')),
        float_vectors: (vgraph.float_vectors || []).map(withMapping(FloatAttributeVector, 'float')),
        int32_vectors: (vgraph.int32_vectors || []).map(withMapping(Int32AttributeVector, 'int32')),
        int64_vectors: (vgraph.int64_vectors || []).map(withMapping(Int64AttributeVector, 'int64')),
        double_vectors: (vgraph.double_vectors || []).map(
            withMapping(DoubleAttributeVector, 'double')
        ),
        string_vectors: (vgraph.string_vectors || []).map(
            withMapping(StringAttributeVector, 'string')
        ),
        uint32_vectors: (vgraph.uint32_vectors || []).map(
            withMapping(UInt32AttributeVector, 'uint32')
        )
    };

    function withMapping(encoder, type) {
        return function(vector) {
            return (
                (doesVectorRequireConversion(vector) && getMapping(vector, type, encoder)) || {
                    type,
                    ...vector
                }
            );
        };
    }

    function doesVectorRequireConversion({ name = '', type = '' }) {
        return isColorColumn(name, type) || isDateTimeColumn(name, type);
    }

    function convertAttributeMetadata(mappings: any, target: number) {
        return function createMapping(name: string) {
            let type = undefined,
                format = undefined;
            let { ctype = '', userType } = mappings[name];
            if (ctype === 'utf8') {
                type = 'string';
            } else if (userType === 'datetime' && ctype === 'datetime32[s]') {
                type = 'datetime';
                format = 'unix';
            }
            return { name, type, format, target };
        };
    }

    function getVectorMapping(mappings: VectorGraph.IMapping[] = []) {
        return function getMapping(vector, type, encoder) {
            let vecMapping,
                { name, target } = vector;
            let mapping =
                mappings.find(mapping => mapping.name === name && mapping.target === target) ||
                ({} as any);
            let vecType = mapping.type || type || '',
                vecFormat = mapping.format || '';
            if (isColorColumn(name, vecType)) {
                vecMapping = colorVectorMapping({
                    vector,
                    encoder,
                    type: vecType,
                    format: vecFormat
                });
            } else if (isDateTimeColumn(name, vecType)) {
                vecMapping = dateTimeVectorMapping({
                    vector,
                    encoder,
                    type: vecType,
                    format: vecFormat
                });
            }
            return { ...vector, type: vecType, format: vecFormat, ...vecMapping };
        };
    }
}

const orderedVGraphVectorGroups = [
    'bool_vectors',
    'int32_vectors',
    'string_vectors',
    'float_vectors',
    'int64_vectors',
    'double_vectors',
    'uint32_vectors'
];

function createNodesTable(typedVGraph: VectorGraph) {
    const nodesVec = vecForTarget(AttributeTarget.VERTEX);
    const nodes = assignTableInternalColumnNames({
        ...typedVGraph,
        name: 'nodes',
        length: typedVGraph.vertexCount,
        ...orderedVGraphVectorGroups.reduce(
            (xs, group) => ({
                ...xs,
                [group]: typedVGraph[group].filter(nodesVec)
            }),
            {}
        )
    });
    nodes.uint32_vectors.push({
        name: 'id',
        type: 'uint32',
        target: AttributeTarget.VERTEX,
        values: Array.from({ length: nodes.length }, (x, i) => i)
    });
    return nodes;
}

function createEdgesTable(typedVGraph: VectorGraph) {
    const edgesVec = vecForTarget(AttributeTarget.EDGE);
    const edges = assignTableInternalColumnNames({
        ...typedVGraph,
        name: 'edges',
        length: typedVGraph.edgeCount,
        ...orderedVGraphVectorGroups.reduce(
            (xs, group) => ({
                ...xs,
                [group]: typedVGraph[group].filter(edgesVec)
            }),
            {}
        )
    });
    edges.uint32_vectors = edges.uint32_vectors.concat(
        typedVGraph.edges.reduce(
            (vecs, { src, dst }, idx) =>
                (vecs[0].values.push(src) && false) || (vecs[1].values.push(dst) && false) || vecs,
            [
                { name: 'src', type: 'uint32', target: AttributeTarget.EDGE, values: [] },
                { name: 'dst', type: 'uint32', target: AttributeTarget.EDGE, values: [] }
            ]
        )
    );
    edges.uint32_vectors.push({
        name: 'id',
        type: 'uint32',
        target: AttributeTarget.EDGE,
        values: Array.from({ length: edges.length }, (x, i) => i)
    });
    return edges;
}

function createColsTable(typedVGraph: VectorGraph) {
    const { columns } = orderedVGraphVectorGroups
        .reduce((xs, group) => [...xs, ...typedVGraph[group]], [])
        .reduce(
            ({ targets, columns }, { name, type, target }) => {
                const targetInfo = targets[target];
                const table_name = targetInfo.name;
                const internal_name = `col_${targetInfo.columns++}`;
                columns.push({
                    column_name: name,
                    column_type: type,
                    table_name,
                    internal_name
                });
                return { targets, columns };
            },
            {
                columns: [
                    {
                        column_name: 'id',
                        column_type: 'uint32',
                        table_name: 'nodes',
                        internal_name: 'id'
                    },
                    {
                        column_name: 'id',
                        column_type: 'uint32',
                        table_name: 'edges',
                        internal_name: 'id'
                    },
                    {
                        column_name: 'src',
                        column_type: 'uint32',
                        table_name: 'edges',
                        internal_name: 'src'
                    },
                    {
                        column_name: 'dst',
                        column_type: 'uint32',
                        table_name: 'edges',
                        internal_name: 'dst'
                    }
                ],
                targets: {
                    [AttributeTarget.EDGE]: { name: 'edges', columns: 0 },
                    [AttributeTarget.VERTEX]: { name: 'nodes', columns: 0 }
                }
            }
        );

    return {
        ...typedVGraph,
        name: 'columns',
        length: columns.length,
        bool_vectors: [],
        float_vectors: [],
        int32_vectors: [],
        int64_vectors: [],
        double_vectors: [],
        uint32_vectors: [],
        string_vectors: ['table_name', 'column_name', 'column_type', 'internal_name'].map(name => ({
            name,
            type: 'string',
            values: columns.map(col => col[name])
        }))
    };
}

function vecForTarget(target: number) {
    return function(vector: { target: number }) {
        return vector.target === target;
    };
}

function assignTableInternalColumnNames(table) {
    orderedVGraphVectorGroups.reduce((column_index, group) => {
        return table[group].reduce((column_index, vector) => {
            vector.name = `col_${column_index}`;
            return column_index + 1;
        }, column_index);
    }, 0);
    return table;
}
