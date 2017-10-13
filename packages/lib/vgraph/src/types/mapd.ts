import { TDatumType, TEncodingType } from 'rxjs-mapd';

export const metaTypesToMapd = {
    bool: { type: TDatumType.BOOL, encoding: TEncodingType.NONE, compression: null },
    color: { type: TDatumType.INT, encoding: TEncodingType.NONE, compression: null },
    float: { type: TDatumType.FLOAT, encoding: TEncodingType.NONE, compression: null },
    int32: { type: TDatumType.INT, encoding: TEncodingType.NONE, compression: null },
    int64: { type: TDatumType.BIGINT, encoding: TEncodingType.NONE, compression: null },
    double: { type: TDatumType.DOUBLE, encoding: TEncodingType.NONE, compression: null },
    string: { type: TDatumType.STR, encoding: TEncodingType.DICT, compression: null },
    uint32: { type: TDatumType.INT, encoding: TEncodingType.NONE, compression: null },
    timestamp: { type: TDatumType.TIMESTAMP, encoding: TEncodingType.NONE, compression: null }
};
