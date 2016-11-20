import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';
import { getDefaultQueryForDataType } from 'viz-shared/models/expressions';

export function histograms(view) {
    return {
        histogramsById: {},
        histograms: {
            length: 0,
            id: 'histograms',
            name: 'Histograms',
            templates: $ref(`${view}.columns`),
            controls: [{
                selected: false,
                id: 'toggle-histograms',
                name: 'Histograms',
            }],
            encodings: $ref(`${view}.encodings`),
        }
    };
}

/*
    id: string,
    name: string,
    yScale: string,
    binType: string,
    numBins: number,
    dataType: string,
    binWidth: number,
    isMasked: boolean,
    identifier: string,
    numElements: number,
    maxElements: number,
    componentType: string,
    bins: [{
        count: int,
        exclude: boolean,
        //   empty | value | range
        values: [] | [int] | [int, int]
    } (,) ...]
*/

export function histogram({ name = 'degree',
                            yScale = 'none',
                            dataType = 'number',
                            componentType = 'point' } = {},
                            histogramId = simpleflake().toJSON()) {
    return {
        id: histogramId,
        name, /* degree */
        yScale, /* none, log, log2 log10 */
        dataType, /* number */
        componentType, /* edge | point */
        identifier: `${componentType}:${name}`,
    };
}

export function histogramBinQuery(histogram, bin) {

    const { identifier, componentType, bins } = histogram;
    const queryProperties = { identifier };
    const { count, values, exclude } = bin;

    if (exclude) {
        queryProperties.queryType = 'isOneOf';
        queryProperties.values = [].concat(...bins.map(({ values }) => values));
    } else if (values.length === 1) {
        queryProperties.value = values[0];
        queryProperties.queryType = 'isEqualTo';
    } else if (values.length === 2) {
        queryProperties.stop = values[1];
        queryProperties.start = values[0];
        queryProperties.queryType = 'isBetween';
    }

    const query = getDefaultQueryForDataType(queryProperties);

    if (exclude) {
        query.ast = {
            type: 'NotExpression',
            operator: 'NOT',
            value: query.ast
        }
    }

    return {
        ...query,
        type: componentType,
        attribute: identifier
    };
}

export function histogramBinHighlightQuery(histogram, bin) {
    const { identifier } = histogram;
    if (!identifier) {
        console.error({msg: 'histogramBinHighlightQuery without identifier', histogram, bin, exn: new Error()});
        throw new Error('histogramBinHighlightQuery: Making histogram without identifier')
    }
    const query = histogramBinQuery(histogram, bin);
    query.ast = {
        type: 'BinaryPredicate',
        operator: 'AND',
        left: {
            type: 'UnaryExpression',
            operator: 'DEFINED',
            fixity: 'postfix',
            argument: { type: 'Identifier', name: identifier }
        },
        right: query.ast
    };
    return query;
}
