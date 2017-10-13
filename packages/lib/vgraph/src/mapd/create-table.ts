import { Observable } from 'rxjs';
import { Client } from 'rxjs-mapd';
import { VGraphTable } from '../csv';
import { metaTypesToMapd } from '../types';
import {
    TTypeInfo,
    TTableType,
    TColumnType,
    TCopyParams,
} from 'rxjs-mapd';

export interface CreateTableOptions {
    table: VGraphTable;
    client: typeof Client;
    csvFileName: string;
}

export function createTable({ client, table, csvFileName }: CreateTableOptions) {

    const tColumnTypes = [
        ...table.bool_vectors,
        ...table.float_vectors,
        ...table.int32_vectors,
        ...table.int64_vectors,
        ...table.double_vectors,
        ...table.string_vectors,
        ...table.uint32_vectors,
    ].map(vecToTColumnType);

    return client
            .mapd_createTable(table.name, tColumnTypes, TTableType.DELIMITED)
        .flatMapTo(client
            .mapd_importTable(table.name, csvFileName, new TCopyParams(<any> {
    /* string */ delimiter: ',',
    /* string */ null_str: '\0',
   /* boolean */ has_header: true,
   /* boolean */ quoted: true,
    /* string */ quote: '"',
    /* string */ // escape: '',
    /* string */ line_delim: '\n',
    /* string */ // array_delim: '',
    /* string */ // array_begin: '',
    /* string */ // array_end: '',
    /* number */ threads: 1,
/* TTableType */ table_type: TTableType.DELIMITED,
            }))
        );
}

function vecToTColumnType(vec) {
    const mapdType = metaTypesToMapd[vec.type];
    if (!mapdType) {
        throw new Error(`No mapdType found for [${vec.name}, ${vec.type}]`);
    }
    const { type, encoding, compression } = mapdType;
    return new TColumnType({
        src_name: null,
        col_name: vec.name,
        is_reserved_keyword: false,
        col_type: new TTypeInfo({
            type, encoding,
            nullable: true,
            is_array: false,
            scale: 0, precision: 0,
            comp_param: compression,
        }),
    });
}
