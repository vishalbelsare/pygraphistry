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

export function histogramFilterQuery(histogram, binIndexes = []) {

    const { bins, binType,
            minValue, binWidth,
            identifier, componentType } = histogram;

    if (binType === 'nodata' || binIndexes.length <= 0) {
        return null;
    }
    // In the base case, return a query for a single bin index
    else if (binIndexes.length === 1) {
        return histogramBinQuery(histogram, bins[binIndexes[0]]);
    }
    // If there's more than one bin index and the histogram supports ranges
    // (binType === 'histogram'), return a query between the min and max bin values
    else if (binType === 'histogram') {
        const binA = bins[binIndexes[0]];
        const binB = bins[binIndexes[binIndexes.length - 1]];
        const betweenVals = [...binA.values, ...binB.values];
        return histogramBinQuery(histogram, {
            exclude: false, values: [
                betweenVals[0],
                betweenVals[betweenVals.length - 1]
            ]
        });
    }

    // The complex case is creating a query for 'countBy' bin values,
    // and possibly exclude the `_other` bin's value.

    const { exclude, values } = binIndexes.reduce(
        ({ exclude, values }, i, x, xs, bin = bins[i]) => ({
            exclude: exclude || bin.exclude,
            values: bin.exclude ? values :
                [...values, ...bin.values]
        }),
        { exclude: false, values: [] }
    );

    const query = getDefaultQueryForDataType({
        queryType: 'isOneOf', identifier, values
    });

    if (exclude) {
        // Regenerate the AST because it's mutated elsewhere >:(
        query.ast = {
            type: 'BinaryPredicate', operator: 'OR',
            left: { operator: 'NOT',
                    type: 'NotExpression',
                    value: getDefaultQueryForDataType({
                        queryType: 'isOneOf', identifier, values
                    }).ast },
            right: getDefaultQueryForDataType({
                queryType: 'isOneOf', identifier, values
            }).ast
        };
    }

    return {
        ...query,
        type: componentType,
        attribute: identifier,
    };
}

export function histogramBinQuery(histogram, bin) {

    const { values, exclude } = bin;
    const { identifier, componentType, bins } = histogram;
    const queryProperties = { identifier };

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
