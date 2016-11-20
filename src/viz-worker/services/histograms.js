import { Observable } from 'rxjs';
import Binning from 'viz-worker/simulator/Binning';
import DataframeMask from 'viz-worker/simulator/DataframeMask';
import { histogramBinHighlightQuery } from 'viz-shared/models/expressions/histograms.js';
import { histogram as createHistogram } from 'viz-shared/models/expressions';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function addHistogram(loadViewsById) {
    return function addHistogram({ workbookIds, viewIds, name, dataType, componentType }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { histogramsById } = view;
            const histogram = createHistogram({ name, dataType, componentType });
            histogramsById[histogram.id] = histogram;
            return { workbook, view, histogram };
        });
    }
}

export function removeHistogram(loadViewsById) {
    return function removeHistogramById({ workbookIds, viewIds, histogramId }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { histogramsById } = view;
            if (histogramsById.hasOwnProperty(histogramId)) {
                delete histogramsById[histogramId];
            }
            return { workbook, view, histogramId };
        });
    }
}

const maxBinCount = 30;
const goalNumberOfBins = 30;

export function loadHistograms(loadViewsById) {
    return function loadHistogramsById({ workbookIds, viewIds, histogramIds, masked, refresh = true }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .mergeMap(
            ({ workbook, view }) => histogramIds,
            ({ workbook, view }, histogramId) => ({
                workbook, view, histogram: view.histogramsById[histogramId]
            })
        )
        .mergeMap(
            ({ workbook, view, histogram }) => computeHistogram({
                view, histogram, refresh
            }),
            ({ workbook, view }, histogram) => ({
                workbook, view, histogram: (
                    view.histogramsById[histogram.id] = histogram)
            })
        );
    }
}

export function loadSelectionHistograms(loadViewsById) {
    const loadHistogramsById = loadHistograms(loadViewsById);
    return function loadSelectionHistogramsById({ masked, workbookIds, viewIds, histogramIds, refresh = true }) {
        return loadHistogramsById({
            workbookIds, viewIds, histogramIds
        })
        .mergeMap(
            ({ workbook, view, histogram }) =>
                loadPointsMask({ view, masked, histogram }),
            ({ workbook, view, histogram }, pointsMask) => ({
                workbook, view, histogram, pointsMask
            })
        )
        .mergeMap(
            ({ workbook, view, histogram, pointsMask }) => computeHistogram({
                view, masked, histogram, pointsMask, refresh
            }),
            ({ workbook, view }, histogram) => ({
                workbook, view, histogram: (
                    view.selection.histogramsById[histogram.id] = histogram)
            })
        );
    }
}

export function computeMaskForHistogramBin({ view, histogram, bin }) {

    const { nBody } = view;
    const { dataframe } = nBody;

    const errors = [];
    const query = histogramBinHighlightQuery(histogram, bin);
    const masks = dataframe.getMasksForQuery(query, errors, false);

    if (errors.length) {
        console.error({msg: '====BAD computeMaskForHistogramBin', errors, stack: new Error().stack});
        console.error({msg: '-------', query: util.inspect(query, false, null)});
        return Observable.throw(errors[0]);
    }

    return Observable.of(masks.toJSON());
}

function loadPointsMask({ view, masked, histogram }) {

    if (masked === undefined) {
        return Observable.of(undefined);
    } else if (!masked) {
        return Observable.of([]);
    }

    const { nBody } = view;

    if (!nBody) {
        return Observable.of([]);
    }

    let { selection: { mask } = {} } = view;

    mask = mask && mask.value || mask;
    if (!mask || !mask.tl || !mask.br) {
        return Observable.of([]);
    }

    return Observable.defer(() =>
        nBody.simulator.selectNodesInRect({ ...mask })
    );
}

export function getHistogramForAttribute({ view, graphType, attribute, dataType = 'number' }) {
    const histogram = createHistogram({ name: attribute, dataType, componentType: graphType });
    return computeHistogram({ view, histogram, refresh: true })
}

function computeHistogram({ view, masked, histogram, pointsMask, refresh = true }) {

    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !histogram) {
        return Observable.of(histogram);
    } else if (!refresh) {
        return Observable.of(histogram);
    }

    const { name, componentType } = histogram;
    const binningHint = !(
        histogram.hasOwnProperty('numBins'))  || !(
        histogram.hasOwnProperty('binType'))  || !(
        histogram.hasOwnProperty('binWidth')) || !(
        histogram.hasOwnProperty('minValue')) || !(
        histogram.hasOwnProperty('maxValue')) ? undefined : {
            numBins: histogram.numBins,
            binWidth: histogram.binWidth,
            minValue: histogram.minValue,
            maxValue: histogram.maxValue,
            isCountBy: histogram.binType === 'countBy'
        };

    const binningInstance = new Binning(dataframe);

    const mask = new DataframeMask(
        dataframe, pointsMask, pointsMask === undefined ?
            undefined : simulator.connectedEdges(pointsMask)
    );

    // Unbase mask from local filtered coordinate system to global coordinate system
    // TODO: We really shouldn't have to track this kind of nonsense.
    const unbasedMask = new DataframeMask(dataframe, mask.point, mask.edge, dataframe.lastMasks);

    const dataType = dataframe.getDataType(name, componentType);
    const aggregations = dataframe.getColumnAggregations(name, componentType, true);
    const countDistinct = aggregations.getAggregationByType('countDistinct');
    const isCountBy = countDistinct < maxBinCount;

    const binsForHistogram = Observable.defer(() =>
        (isCountBy || dataType === 'string') ?
            binningInstance.binningForColumnByDistinctValue(
                { attribute: name, type: componentType }, unbasedMask, dataType
            ) :
            binningInstance.binningForColumn(
                { attribute: name, type: componentType },
                binningHint, goalNumberOfBins, unbasedMask, dataType
            )
    );

    /* Normalizes the binResult into a Histogram model */
    /* See Leo's notes on the binResult below */

    return binsForHistogram.map((binResult) => {

        const { type: binType,
                numBins, binWidth, minValue, maxValue,
                bins, binValues, numValues: numElements } = binResult;

        let maxElements = 0,
            castKeyToNumber = dataType === 'number',
            isMasked = masked && binType !== 'nodata';

        let binKeys;

        if (binType === 'countBy' && isMasked === true) {
            binKeys = histogram.bins.map(({ values }) => values[0]);
        } else {
            binKeys = binType === 'countBy' &&
                bins && Object.keys(bins) || Array
                    .from({ length: numBins }, (x, i) => i);
        }

        /* Normalizes the bins, binKeys, binValues, etc. */
        /* into simpler { count, values, exclude } sets. */
        /*                                               */
        /* count: int the number of elements in this bin */
        /* values: []<any> an Array of the display value */
        /*                              or range values. */
        /* exclude: bool flags whether we should exclude */
        /*               this bin's value when computing */
        /*                                 the bin mask. */

        const binsNormalized = binKeys.map((key, index) => {

            let value, values,
                count = 0, exclude = false;

            if (binType !== 'nodata' &&
                binType !== 'countBy' &&
                binType !== 'histogram') {
                throw new Error('Unrecognized bin result type');
            }

            count = (
                binType !== 'nodata' && bins &&
                typeof bins[key] === 'number') && bins[key] || 0;

            if (binType === 'nodata') {
                values = [];
            } else if (key === '_other' && (
                       binType === 'countBy') && (value = binValues) && (
                       exclude = (typeof value === 'object' && (
                                  typeof value._other === 'object')))) {
                values = [key];
                count = value._other.numValues;
            } else if (!(value = binValues && binValues[key]) && binType === 'countBy') {
                values = [castKeyToNumber ? Number(key) : key];
            } else if (value) {
                values = value.isSingular ?
                    [value.representative]:
                    [value.min, value.max];
            } else {
                values = [
                    minValue + (index * binWidth),
                    minValue + (index * binWidth) + binWidth
                ];
            }

            isMasked = isMasked && count > 0;
            maxElements = count > maxElements ? count : maxElements;

            return { count, values, exclude };
        });

        return {
            ...histogram,
            minValue, maxValue,
            numElements, maxElements,
            binType, binWidth, numBins,
            isMasked, bins: binsNormalized
        };
    });
}


/*
The histograms data structure is an adventure:

------
For type='histogram': //continuous values
------
_globals:
    {
        type: 'histogram'
        dataType: 'number'
        bins:
            [int, ...]
        binValues:
            //null when 0
            //buggy min/max so better to use minValue + binWidth * binIndex
            [ null U {min: float, max: float, representative: * , isSingular: bool}]
        numBins: int,
        numValues: int
        minValue: number //of range
        maxValue: number //of range
        binWidth: number
        type: 'point' or 'edge'
        attribute: 'string'
    }
_masked:
    {
        type: 'histogram'
        dataType: 'number'

        //as long as globals, null if no selection
        ? bins: [int, ... ]

        //as long as globals, , null if no selection
        binValues: [ null U {min: float, max: float, representative: *, isSingular: bool}]

        numBins: int,
        numValues: int
        maxValue: number
        type: 'point' or 'edge'
        attribute: 'string'
        binWidth: number
    }

------
For type='countBy': //categorical (string, small ints, ...)
------
_globals:  //no maxValue,
    {
        type: 'countBy'
        dataType: 'string' or 'number'
        bins: {<string>: int, ...}
        ?binValues: {
            '_other': {
                representative: '_other',
                numValues: int
            }
        }
        numBins: int
        numValues: int
        type: 'point' or 'edge'
        attribute: 'string'

    }
_masked:
    {
        type: 'point' or 'edge'
        attribute: 'string' or 'number'
        type: 'point' or 'edge' or 'nodata' (if no data)

        //null if 'nodata'
        ?bins: {<string>: int }

        //null if 'nodata' or type != 'string'
        ?binValues:  {
            '_other': {
                representative: '_other',
                numValues: int
            }
        }

    }
*/
