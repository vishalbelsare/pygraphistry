import * as Pbf from 'pbf';
import { Observable } from 'rxjs';
import { VectorGraph } from './vgraph';
import {
    isColorColumn, colorVectorMapping,
    isDateTimeColumn, dateTimeVectorMapping
} from '../types';

const EDGE_PART_TAG = {};
const EDGE_ID = 'id', NODE_ID = 'id';
const EDGE_SRC = 'src', EDGE_DST = 'dst';
const { EDGE, VERTEX } = VectorGraph.AttributeTarget;
const attrNamesToDefaultTypes = {
    'BoolAttributeVector': 'bool',
    'FloatAttributeVector': 'float',
    'Int32AttributeVector': 'int32',
    'Int64AttributeVector': 'int64',
    'DoubleAttributeVector': 'double',
    'StringAttributeVector': 'string',
    'UInt32AttributeVector': 'uint32',
};

export function partition({ buffer, edges, nodes }: PartitionOptions) {
    const { [EDGE]: edgeVecs, [VERTEX]: nodeVecs } = readVGraph(buffer);
    const mappedEdgeVectors = assignColumnMappings(edgeVecs, edges.attributes);
    const mappedNodeVectors = assignColumnMappings(nodeVecs, nodes.attributes);
    return Observable.of<VectorMetadata[]>(
        mappedEdgeVectors, mappedNodeVectors,
        createColumnVectors(mappedNodeVectors, mappedEdgeVectors)
    );
}

function createColumnVectors(nodeVecs: VectorMetadata[], edgeVecs: VectorMetadata[]) {
    const columnNames = ['table_name', 'public_name', 'column_name', 'column_type'];
    const columnDescs = [
        { column_type: 'uint32', table_name: 'nodes', column_name: NODE_ID, public_name: 'node' },
        { column_type: 'uint32', table_name: 'edges', column_name: EDGE_ID, public_name: 'edge' },
        { column_type: 'uint32', table_name: 'edges', column_name: EDGE_SRC, public_name: 'source' },
        { column_type: 'uint32', table_name: 'edges', column_name: EDGE_DST, public_name: 'destination' },
        ...nodeVecs.reduce(createColumnDescriptions.bind(null, 'nodes'), []),
        ...edgeVecs.reduce(createColumnDescriptions.bind(null, 'edges'), [])
    ];
    return columnNames.reduce((vectors, name) => [
        ...vectors,
        { name, type: 'string', values: columnDescs.map((row) => row[name]) }
    ], []);
    function createColumnDescriptions(table_name: string, columnDescs: any[], { name, type, tag }) {
        if (tag !== EDGE_PART_TAG) {
            columnDescs.push({
                table_name,
                public_name: name,
                column_type: type,
                column_name: `column_${columnDescs.length}`
            });
        }
        return columnDescs;
    }
}

function assignColumnMappings(vecs: VectorMetadata[], attrs: AttributesMetadata) {

    const mappings = Object.keys(attrs).map(convertAttributeMetadata);

    return vecs.map((vector) => {
        return !vector.attributeVectorName ? vector : mapVectorTypes(
            vector, attrNamesToDefaultTypes[vector.attributeVectorName]);
    }) as VectorMetadata[];

    function mapVectorTypes(vector: VectorMetadata, defaultType: string) {
        let name = vector.name, mapping = mappings[name] || {};
        let format = mapping.format || '', type = mapping.type || defaultType || '';
        if (isColorColumn(name, type)) {
            mapping = colorVectorMapping({ ...vector, type, format } as any);
        } else if (isDateTimeColumn(name, type)) {
            mapping = dateTimeVectorMapping({ type, format });
        } else {
            mapping.type = type;
            mapping.format = format;
        }
        return { ...vector, ...mapping };
    }

    function convertAttributeMetadata(vectorName: string) {
        let type = undefined, format = undefined;
        let { ctype = '', userType } = attrs[vectorName];
        if (ctype === 'utf8') {
            type = 'string';
        } else if (userType === 'datetime' && ctype === 'datetime32[s]') {
            type = 'datetime';
            format = 'unix';
        }
        return { name: vectorName, type, format };
    }
}

function readVGraph(buffer: Buffer | Uint8Array) {
    let version, name, type, nodeCount, edgeCount;
    const attributeVectors = new Pbf(buffer).readFields((tag, vectors, pbf) => {
        let vecs;
             if (tag === 1) version = pbf.readVarint();
        else if (tag === 2) name = pbf.readString();
        else if (tag === 3) type = pbf.readVarint();
        else if (tag === 4) nodeCount = pbf.readVarint();
        else if (tag === 5) edgeCount = pbf.readVarint();
        else if (tag === 6) vecs = readEdges(pbf, edgeCount);
        else if (tag === 7) vecs = readVector(pbf, 'UInt32AttributeVector');
        else if (tag === 8) vecs = readVector(pbf, 'DoubleAttributeVector');
        else if (tag === 9) vecs = readVector(pbf, 'StringAttributeVector');
        else if (tag === 10) vecs = readVector(pbf, 'Int32AttributeVector');
        else if (tag === 11) vecs = readVector(pbf, 'Int64AttributeVector');
        else if (tag === 12) vecs = readVector(pbf, 'FloatAttributeVector');
        else if (tag === 13) vecs = readVector(pbf, 'BoolAttributeVector');
        vecs && vecs.forEach((vector) => {
            vectors[vector.target].push(vector);
        });
    }, { [EDGE]: [], [VERTEX]: [] });
}

function readVector(pbf: any, attributeVectorName: string) {
    const bytes = pbf.readBytes(), length = bytes.length;
    let tmpPbf = new Pbf(bytes), name: string, target: number;
    while (tmpPbf.pos < length) {
        let val = tmpPbf.readVarint();
        let tag = val >> 3;
             if (tag === 1) name = pbf.readString();
        else if (tag === 2) target = pbf.readVarint();
        else if (name !== undefined && target !== undefined) break;
        else tmpPbf.skip(val);
    }
    return [
        { name, target, attributeVectorName, bytes }
    ];
}

function readEdges(pbf: any, edgeCount: number) {
    let edgeIndex = 0, { length } = pbf;
    let srcs = new Uint32Array(edgeCount);
    let dsts = new Uint32Array(edgeCount);
    do {
        let len = pbf.pos + pbf.readVarint();
        do {
            let val = pbf.readVarint();
            switch (val >> 3) {
                case 1: srcs[edgeIndex] = pbf.readVarint(); break;
                case 2: dsts[edgeIndex] = pbf.readVarint(); break;
                default: pbf.skip(val);
            }
        } while (pbf.pos < len)
    } while (++edgeIndex < edgeCount && pbf.pos < length && (pbf.readVarint() >> 3) === 6)
    return [
        { name: EDGE_SRC, values: srcs, target: EDGE, type: 'uint32', tag: EDGE_PART_TAG },
        { name: EDGE_DST, values: dsts, target: EDGE, type: 'uint32', tag: EDGE_PART_TAG }
    ];
}

export interface PartitionOptions {
    edges: TableMetadata;
    nodes: TableMetadata;
    buffer: Buffer | Uint8Array;
}

export interface VectorMetadata {
    name: string;
    target: 0 | 1;
    values?: any[];
    bytes?: Uint8Array;
    attributeVectorName?: string;
}

export interface TableMetadata {
    name: string;
    count: number;
    attributes: AttributesMetadata;
    encodings: {
        [encodingName: string]: {
            attributes: string[]
        }
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
