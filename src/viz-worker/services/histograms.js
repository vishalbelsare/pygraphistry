import { Observable } from 'rxjs';
import Binning from 'viz-worker/simulator/Binning';
import DataframeMask from 'viz-worker/simulator/DataframeMask';
import {
    histogram as createHistogram
} from 'viz-shared/models/expressions';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function addHistogram(loadViewsById) {
    return function addHistogram({ workbookIds, viewIds, type, attribute }) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({ workbook, view }) => {
            const { histogramsById } = view;
            const histogram = createHistogram(type, attribute);
            histogramsById[histogram.id] = histogram;
            return { workbook, view, histogram };
        });
    }
}

export function removeHistogram(loadViewsById) {
    return function removeHistogram({ workbookIds, viewIds, histogramId }) {
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
    return function loadHistogramsById({ workbookIds, viewIds, histogramIds, masked }) {
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
            ({ workbook, view, histogram }) => computeHistogram({ view, histogram }),
            ({ workbook, view }, histogram) => ({
                workbook, view, histogram: (
                    view.histogramsById[histogram.id] = histogram)
            })
        );
    }
}

export function loadSelectionHistograms(loadViewsById) {
    const loadHistogramsById = loadHistograms(loadViewsById);
    return function loadSelectionHistogramsById({ masked, workbookIds, viewIds, histogramIds }) {
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
            ({ workbook, view, histogram, pointsMask }) =>
                computeHistogram({ view, masked, histogram, pointsMask }),
            ({ workbook, view }, histogram) => ({
                workbook, view, histogram: (
                    view.selection.histogramsById[histogram.id] = histogram)
            })
        );
    }
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

function computeHistogram({ view, masked, histogram, pointsMask }) {

    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !histogram) {
        return Observable.of(histogram);
    } else if (!masked && !pointsMask && histogram.isGlobal === true) {
        return Observable.of(histogram);
    }

    const { type, attribute } = histogram;
    const binningHint = (
        histogram.hasOwnProperty('numBins') &&
        histogram.hasOwnProperty('binWidth') &&
        histogram.hasOwnProperty('minValue') &&
        histogram.hasOwnProperty('maxValue')
    ) ? histogram : undefined;

    const binningInstance = new Binning(dataframe);

    const mask = new DataframeMask(
        dataframe, pointsMask, pointsMask === undefined ?
            undefined : simulator.connectedEdges(pointsMask)
    );
    const dataType = dataframe.getDataType(attribute, type);
    const aggregations = dataframe.getColumnAggregations(attribute, type, true);
    const countDistinct = aggregations.getAggregationByType('countDistinct');
    const isCountBy = countDistinct < maxBinCount;

    const binsForHistogram = Observable.defer(() =>
        (isCountBy || dataType === 'string') ?
            binningInstance.binningForColumnByDistinctValue(
                histogram, mask, dataType) :
            binningInstance.binningForColumn(
                histogram, binningHint, goalNumberOfBins, mask, dataType)
    );

    return binsForHistogram.map((binResult) => {

        /*
        let { bins = [],
              numBins = 0, binWidth = 1,
              minValue = 0, maxValue = 0,
              numValues = 0, dataType = '',
              binValues
        } = binResult;

        if (!binValues) {
            binWidth = 1;
            minValue = Number.MAX_VALUE;
            maxValue = Number.MIN_VALUE;
            binValues = Array.from(
                { length: numBins },
                (val, idx) => {
                    minValue = Math.min(minValue, bins[idx]);
                    maxValue = Math.max(maxValue, bins[idx]);
                    return {
                        isSingular: true,
                        min: idx, max: idx,
                        representative: idx
                    };
                }
            );
        }

        binValues = Array.from(
            { length: numBins },
            (bin, idx) => {
                bin = binValues[idx] || {};
                return {
                    min: bin.min || 0,
                    max: bin.max || 0,
                    count: bins[idx] || 0,
                    isSingular: bin.isSingular || false,
                    representative: bin.representative || 0,
                };
            }
        );
        */

        return {
            // ...histogram,
            ...binResult,
            type, attribute,
            id: histogram.id,
            isGlobal: !masked,
            binType: binResult.type,
            // dataType, numValues,
            // min: minValue, max: maxValue,
            // width: binWidth, total: numValues,
            // numBins, binWidth, minValue, maxValue,
            // length: binValues.length, ...binValues
        };
    });
}

/*{
    type: string ('countBy' || 'histogram'),
    dataType: string,
    numBins: number,
    binWidth: number,
    maxValue: number,
    minValue: number,
    numValues: number,
    bins: Array<number>,
    binValues: [{
        min: number,
        max: number,
        isSingular: bool,
        representative: number
    } (,) ...],
}*/

