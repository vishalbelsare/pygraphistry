import util from 'util';
import sanitizeHTML from 'sanitize-html';
import { Observable } from 'rxjs/Observable';
import * as Scheduler from 'rxjs/scheduler/async'
import Binning from 'viz-app/worker/simulator/Binning';
import DataframeMask from 'viz-app/worker/simulator/DataframeMask';
import { computeSelectionMasks } from 'viz-app/worker/services/dataframe';
import { histogramBinHighlightQuery } from 'viz-app/models/expressions/histograms';
import { histogram as createHistogram } from 'viz-app/models/expressions/histograms';

export function addHistogram(loadViewsById) {
    return function addHistogram({ workbookIds, viewIds, histogram }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { histogramsById } = view;
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
        .concatMap(
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
    return function loadSelectionHistogramsById({ workbookIds, viewIds, histogramIds, refresh = true, masked = true }) {
        return loadHistogramsById({
            workbookIds, viewIds, histogramIds
        })
        .concatMap(
            ({ workbook, view, histogram }) => {

                const { nBody: { vgraphLoaded } = {},
                        selection: { histogramsById } = {} } = view;

                if (!refresh || !vgraphLoaded) {
                    if (!histogramsById || !(histogram = histogramsById[histogram.id])) {
                        return Observable.empty();
                    }
                    return Observable.of({ ...histogram });
                }

                return computeSelectionMasks({
                    view, emptyIfAllSelected: masked
                })
                .mergeMap((selectionMasks) => computeHistogram({
                    view, masked, refresh, selectionMasks, histogram,
                    selectionHistogram: histogramsById[histogram.id]
                }));
            },
            ({ workbook, view }, histogram) => ({
                workbook, view, histogram: (
                    view.selection.histogramsById[histogram.id] = histogram)
            })
        );
    }
}

export function computeMaskForHistogramBin({ view, histogram, bin, basedOnCurrentDataframe = true }) {

    const { nBody } = view;
    const { dataframe } = nBody;

    const errors = [];
    const query = histogramBinHighlightQuery(histogram, bin);
    const masks = dataframe.getMasksForQuery({
        ...query, basedOnCurrentDataframe
    }, errors, false);

    if (errors.length) {
        console.error({msg: '====BAD computeMaskForHistogramBin', errors, stack: new Error().stack});
        console.error({msg: '-------', query: util.inspect(query, false, null)});
        return Observable.throw(errors[0]);
    }

    const { edge, point } = masks.toJSON();

    return Observable.of({ edge, point });
}

export function getHistogramForAttribute({ view, graphType, attribute, dataType = 'number' }) {
    return computeHistogram({ view, refresh: true, histogram: createHistogram({
            dataType, name: attribute, componentType: graphType
        })
    });
}

function computeHistogram({ view, masked, histogram, refresh = true, selectionMasks, selectionHistogram }) {

    const { nBody: { dataframe, simulator, vgraphLoaded } = {} } = view;

    if (!dataframe || !simulator || !histogram) {
        return Observable.empty();
    } else if (!refresh || !vgraphLoaded) {
        return Observable.of(histogram);
    }

    let referenceHistogram = histogram;
    const { name, binType, componentType } = histogram;

    if (masked) {
        if (!histogram.bins) {
            referenceHistogram = undefined;
        } else if (!selectionMasks.isEmptyByType(componentType)) {
            referenceHistogram = selectionHistogram;
        } else {
            referenceHistogram = {
                ...histogram, bins: histogram.bins.map(({ values, exclude }) => ({
                    count: 0, values, exclude
                }))
            };
        }
    }

    if (referenceHistogram && referenceHistogram.bins) {
        if (!masked || !selectionMasks) {
            return Observable.of(referenceHistogram);
        } else if (selectionMasks.isEmptyByType(componentType) ||
                   selectionMasks.tag === referenceHistogram.tag) {
            return Observable.of(referenceHistogram);
        }
    }

    if (!selectionMasks) {
        selectionMasks = new DataframeMask(dataframe);
    } else {
        // Unbase mask from local filtered coordinate system to global coordinate system
        // TODO: We really shouldn't have to track this kind of nonsense.
        selectionMasks = new DataframeMask(dataframe, selectionMasks.point, selectionMasks.edge, dataframe.lastMasks);
    }

    const dataType = dataframe.getDataType(name, componentType);
    const aggregations = dataframe.getColumnAggregations(name, componentType, true);
    const countDistinct = aggregations.getAggregationByType('countDistinct');
    const isCountBy = countDistinct < maxBinCount;

    const binsForHistogram = Observable.defer(() => {

        const binningInstance = new Binning(dataframe);

        if (isCountBy || dataType === 'string') {
            return binningInstance.binningForColumnByDistinctValue(
                { attribute: name, type: componentType }, selectionMasks, dataType
            );
        } else {
            const binningHint = !(
                histogram.hasOwnProperty('numBins')  &&
                histogram.hasOwnProperty('binType')  &&
                histogram.hasOwnProperty('binWidth') &&
                histogram.hasOwnProperty('minValue') &&
                histogram.hasOwnProperty('maxValue')
            ) ? undefined : {
                numBins: histogram.numBins,
                binWidth: histogram.binWidth,
                minValue: histogram.minValue,
                maxValue: histogram.maxValue,
                isCountBy: histogram.binType === 'countBy'
            };
            return binningInstance.binningForColumn(
                { attribute: name, type: componentType },
                binningHint, goalNumberOfBins, selectionMasks, dataType
            );
        }
    });

    /* Normalizes the binResult into a Histogram model */
    /* See Leo's notes on the binResult below */

    return binsForHistogram
        .scan(normalizeBinResult, { masked, dataType, histogram, selectionMasks })
        .take(1)
        .catch((e) => !masked ? Observable.throw(e) : Observable.of(undefined))
        // Inject time between computeHistogram subscriptions
        // to allow them to flush results out to the router individually.
        .subscribeOn(Scheduler.async, 100);
}

function normalizeBinResult({ masked, dataType, histogram, selectionMasks }, binResult) {

    const { type: binType,
            numBins, binWidth, minValue, maxValue,
            bins, binValues, numValues: numElements, valueToBin = null } = binResult;

    let maxElements = 0,
        isMasked = masked && binType !== 'nodata',
        castKeyToNumber = dataType === 'number' || (
            typeof minValue === 'number' &&
            typeof maxValue === 'number');

    let binKeys, tag = isMasked && selectionMasks &&
                       selectionMasks.tag || undefined;

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
            values = [castKeyToNumber ? Number(key) : decodeAndSanitize(key)];
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
        isMasked, bins: binsNormalized,
        valueToBin, tag
    };
}

function decodeAndSanitize(input) {
    let decoded = input, value = input;
    try { decoded = decodeURIComponent(input); }
    catch (e) { decoded = input; }
    try { value = sanitizeHTML(decoded); }
    catch (e) { value = decoded; }
    return value;
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
