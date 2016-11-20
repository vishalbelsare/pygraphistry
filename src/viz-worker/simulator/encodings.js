//INTERNAL HELPERS; Raw access should be through EncodingManager


'use strict';

import { Observable } from 'rxjs';

const _             = require('underscore');
const d3Scale       = require('d3-scale');
const d3Interpolate = require('d3-interpolate');
const Color         = require('color');

import dataTypeUtil from './dataTypes.js';
import palettes from '../simulator/palettes';

const defaults = {
    color: {
        isQuantitative: {
            sequential: {
                range: ['blue', 'white']
            },
            diverging: {
                range: ['blue', 'white', 'red']
            }
        }
    },
    pointSize: {
        range: [3, 20] // Range of diameters supported, per VGraphLoader
    },
    pointOpacity: {
        range: [0, 1]
    },
    edgeSize: {
        range: [0, 10]
    },
    edgeOpacity: {
        range: [0, 1]
    }
};

/** @typedef {Object} EncodingSpec
 * @property {String} scalingType linear, log, etc. from d3.scale, and identity
 * @property {Array} domain [min, max] structure for d3.scale
 * @property {Array} range [min, max] structure for d3.scale
 * @property {Boolean?} clamp
 */


/**
 * @param {Dataframe} dataframe
 * @returns Object.<String, EncodingSpec>
 */
function inferLoadedEncodingsFor(dataframe) {
}


/**
 * @param {EncodingSpec} encodingSpec
 * @param {Aggregations} summary
 * @param {String} variation
 * @param {Array} defaultDomain
 * @param {Array} distinctValues
 * @param {BinningResult} binning
 * @returns {EncodingSpec}
 */
function inferColorScalingSpecFor ({variation, binning}) {
    if (variation === 'categorical') {
        return {
            scalingType: binning.bins.length <= 10 ? 'category10' : 'category20',
            domain: [0, (binning.bins.length||1) - 1],
        };
    } else if (variation === 'continuous') {
        return {
            scalingType: 'linear',
            domain: [0, (binning.bins.length||1) - 1],
            range: defaults.color.isQuantitative.sequential.range
        };
    } else {
        throw new Error('unexpected encoding variant: ' + variation);
    }
}


/**
 * @param {Dataframe} dataframe
 * @param {GraphComponentTypes} type
 * @param {String} attributeName
 * @returns {EncodingSpec}
 */
function inferEncodingType (dataframe, type, attributeName) {
    const aggregations = dataframe.getColumnAggregations(attributeName, type, true);
    const summary = aggregations.getSummary();
    let encodingType;
    switch (type) {
        case 'point':
            if (summary.isPositive) {
                encodingType = 'pointSize';
            } else {
                encodingType = 'pointColor';
            }
            break;
        case 'edge':
            if (summary.isPositive) {
                encodingType = 'edgeSize';
            } else {
                encodingType = 'edgeColor';
            }
    }
    return encodingType;
}

/**
 * @param {EncodingSpec} scalingSpec
 * @returns {d3.scale}
 */
function scalingFromSpec ({scalingType, domain, range, clamp}) {

    let scaling =
        d3Scale[scalingType] !== undefined ? d3Scale[scalingType]()
        : scalingType === 'identity' ? _.identity
        : d3Scale.linear();

    if (domain !== undefined) {
        scaling = scaling.domain(domain);
    }

    if (range !== undefined) {
        scaling = scaling.range(range);
    }

    if (clamp !== undefined) {
        scaling = scaling.clamp(clamp);
    }

    return scaling;
}

function domainIsPositive (aggregations) {
    return aggregations.getAggregationByType('isPositive');
}

/**
 * @param {EncodingSpec?} encodingSpec
 * @param {ColumnAggregation} aggregations
 * @param {String} attributeName
 * @param {String} encodingType
 * @param {String} variation
 * @param {Binning} binning
 * @returns {EncodingSpec}
 */
function inferEncodingSpec (encodingSpec, aggregations, attributeName, encodingType, variation, binning) {
    const summary = aggregations.getSummary();
    let scalingType, domain, range, clamp;
    const defaultDomain = [summary.minValue, summary.maxValue];
    const distinctValues = _.map(summary.distinctValues, (x) => x.distinctValue);
    switch (encodingType) {
        case 'size':
        case 'pointSize':
            // Square root because point size/radius yields a point area:
            scalingType = 'scaleSqrt';
            domain = [0, (binning.bins.length||1) - 1];
            range = defaults.pointSize.range;
            clamp = true;
            break;
        case 'edgeSize':
            // TODO ensure sizes are binned/scaled so that they may be visually distinguished.
            if (domainIsPositive(aggregations)) {
                scalingType = 'linear';
                domain = defaultDomain;
                range = defaults.edgeSize.range;
                clamp = true;
            }
            break;
        case 'opacity':
        case 'pointOpacity':
        case 'edgeOpacity':
            // Has to have a magnitude, not negative:
            if (domainIsPositive(aggregations)) {
                scalingType = 'linear';
                domain = defaultDomain;
                range = defaults.pointOpacity.range;
            }
            break;
        case 'color':
        case 'pointColor':
        case 'edgeColor':

            return inferColorScalingSpecFor({variation, binning});

        case 'title':
        case 'pointTitle':
        case 'edgeTitle':
            break;
        case 'label':
        case 'pointLabel':
        case 'edgeLabel':
            break;
        default:
            throw new Error('No encoding found for: ' + encodingType);
    }
    return _.defaults(encodingSpec || {}, {
        scalingType: scalingType,
        domain: domain,
        range: range,
        clamp: clamp
    });
}

/** A legend per the binning; assigns a range member per bin.
 * @returns <Array>
 */
function legendForBins ({encodingSpec, scaling, binning}) {
    const { scalingType } = encodingSpec;
    switch (scalingType) {
        case 'identity': throw new Error('Identity not supported by legendForBins');
        case 'linear':
        case 'category10':
        case 'category20':
        case 'scaleSqrt':
            return _.range(0, binning.numBins).map(scaling);
        default:
            throw new Error('Unhandled scalingType: ' + scalingType);
    }
}




/**
 * @param {Dataframe} dataframe
 * @param {GraphComponentTypes} type
 * @param {String} attributeName
 * @param {String} encodingType
 * @param {String} variation
 * @param {Binning} binning
 * @returns {{legend: Array, scaling: d3.scale}}
 */
function inferEncoding (encoding, dataframe, type, attributeName, encodingType, variation, binning) {
    const aggregations = dataframe.getColumnAggregations(attributeName, type, true);
    let encodingSpec = inferEncodingSpec(encoding, aggregations, attributeName, encodingType, variation, binning);
    const scaling = scalingFromSpec(encodingSpec);
    const legend = legendForBins({encodingSpec, scaling, binning});
    return {
        legend: legend,
        scaling: scaling
    };
}

function inferTimeBoundEncoding (dataframe, type, attributeName, encodingType, timeBounds) {
    const scalingFunc = function (timeValue) {
        const {
            encodingBoundsA,
            encodingBoundsB,
            encodingBoundsC
        } = timeBounds;

        // if in C
        if (timeValue >= encodingBoundsC.start && timeValue <= encodingBoundsC.stop) {
            return '#9816C1';
        }

        // if in B
        if (timeValue >= encodingBoundsB.start && timeValue <= encodingBoundsB.stop) {
            // return '#2E37FE';
            return '#1A16C1';
        }

        // if in A
        if (timeValue >= encodingBoundsA.start && timeValue <= encodingBoundsA.stop) {
            // return '#FF3030';
            return '#C11616';
        }

        // Otherwise return light grey
        return '#8E8E8E';
    };

    return {
        scaling: scalingFunc,
        legend: undefined
    };
}

///=======================




// {
//    view: {nbody: {dataframe, simulator}},
//    encoding
// }
// --> Observable encoding
function resetEncodingOnNBody ({ view, encoding }) {
    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !encoding) {
        return Observable.of(encoding);
    }

    let {id, encodingType, graphType: unnormalizedType, attribute: unnormalizedAttribute} = encoding;
    const ccManager = dataframe.computedColumnManager;

    let encodingMetadata = undefined;
    try {
        encodingMetadata = getEncodingMetadata(dataframe, encodingType, unnormalizedType, unnormalizedAttribute);
    } catch (e) {
        return Observable.throw(e);
    }

    let {bufferName} = encodingMetadata;

    if (ccManager.resetLocalBuffer(bufferName, dataframe)) {
        console.error('======= TODO FORCE VBO UPDATE');
        // TODO PAUL: Force VBO Update
        // this.tickGraph(cb);
    }

    return Observable.of({...encoding, bufferName, enabled: false});
}



// -> Observable {
//      enabled: bool,
//      encodingType,
//      bufferName,
//      legend: encoding.legend
//  }
function applyEncodingOnNBody ({ view, encoding }) {
    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !encoding) {
        return Observable.throw(new Error('applyEncodingOnNBody missing params'));
    }

    let {id, encodingType, graphType: unnormalizedType, attribute: unnormalizedAttribute, variation, binning, timeBounds, reset} = encoding;
    const ccManager = dataframe.computedColumnManager;
    let encodingMetadata = undefined;
    try {
        encodingMetadata = getEncodingMetadata(dataframe, encodingType, unnormalizedType, unnormalizedAttribute);
    } catch (e) {
        return Observable.throw(e);
    }
    let {normalization, bufferName} = encodingMetadata;
    const {attribute: attributeName, type} = normalization;
    encodingType = encodingMetadata.encodingType || encodingType;
    let encodingWrapper;


    // TODO FIXME: Have a more robust encoding spec, instead of multiple paths through here
    if (timeBounds) {
        encodingWrapper = inferTimeBoundEncoding(
            dataframe, type, attributeName, encodingType, timeBounds);
    } else {
        encodingWrapper = inferEncoding(
            encoding, dataframe, type, attributeName, encodingType, variation, binning);
    }

    if (encodingWrapper === undefined || encodingWrapper.scaling === undefined) {
        return Observable.throw(
            new Error('No scaling inferred for: ' + encodingType + ' on ' + attributeName));
    }

    let wrappedScaling = encodingWrapper.scaling;
    if (encodingType.match(/Color$/)) {
        // Auto-detect when a buffer is filled with our ETL-defined color space and map that directly:
        // TODO don't have ETL magically encode the color space; it doesn't save space, time, code, or style.
        if (dataframe.doesColumnRepresentColorPaletteMap(type, attributeName)) {
            wrappedScaling = (x) => palettes.bindings[x];
            encodingWrapper.legend = _.map(encodingWrapper.legend,
                (sourceValue) => palettes.intToHex(palettes.bindings[sourceValue]));
        } else {
            wrappedScaling = (x) => palettes.hexToABGR(encodingWrapper.scaling(x));
        }
    }

    encoding.legend = encodingWrapper.legend;


    // Now that we have an encoding function, store it as a computed column;
    const oldDesc = ccManager.getComputedColumnSpec('localBuffer', bufferName);
    if (oldDesc === undefined) {
        return Observable.throw(
            new Error('Unable to derive from a base calculation when encoding'));
    }

    // If this is the first encoding for a buffer type, store the original
    // spec so we can recover it.
    if (!ccManager.overlayBufferSpecs[bufferName]) {
        ccManager.overlayBufferSpecs[bufferName] = oldDesc;
    }

    const desc = oldDesc.clone();
    desc.setDependencies([[attributeName, type]]);
    if (bufferName === 'edgeColors') {
        if (binning.binType === 'countBy') {
            desc.setComputeAllValues((values, outArr, numGraphElements) => {
                for (let i = 0; i < numGraphElements; i++) {
                    const val = values[i];
                    if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                        const bin = binning.valueToBin[val];
                        const scaledValue = wrappedScaling(bin !== undefined ? bin : binning.numBins);
                        outArr[i*2] = scaledValue;
                        outArr[i*2 + 1] = scaledValue;
                    }
                }
                return outArr;
            });
        } else {
             desc.setComputeAllValues((values, outArr, numGraphElements) => {
                for (let i = 0; i < numGraphElements; i++) {
                    const val = values[i];
                    if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                        const bin = Math.floor((val - binning.minValue) / binning.binWidth);
                        const scaledValue = wrappedScaling(bin);
                        outArr[i*2] = scaledValue;
                        outArr[i*2 + 1] = scaledValue;
                    }
                }
                return outArr;
            });
        }
    } else {
        if (binning.binType === 'countBy') {
            desc.setComputeAllValues((values, outArr, numGraphElements) => {
                for (let i = 0; i < numGraphElements; i++) {
                    const val = values[i];
                    if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                        const bin = binning.valueToBin[val];
                        outArr[i] = wrappedScaling(bin !== undefined ? bin : binning.numBins);
                    }
                }
                return outArr;
            });
        } else {
             desc.setComputeAllValues((values, outArr, numGraphElements) => {
                for (let i = 0; i < numGraphElements; i++) {
                    const val = values[i];
                    if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                        const bin = Math.floor((val - binning.minValue) / binning.binWidth);
                        outArr[i] = wrappedScaling(bin);
                    }
                }
                return outArr;
            });
        }
    }

    ccManager.addComputedColumn(dataframe, 'localBuffer', bufferName, desc);

    console.error('======= TODO SIGNAL UPDATE OF VBOS');
    // TODO PAUL: Signal update to VBOs
    return Observable.of({...encoding, bufferName, enabled: true});

}


function getEncodingMetadata (dataframe, encodingType, unnormalizedType, unnormalizedAttribute) {

    const normalization = dataframe.normalizeAttributeName(unnormalizedAttribute, unnormalizedType);

    if (normalization === undefined) {
        throw new Error('getEncodingMetadata normalization undefined');
    }

    const {attribute: attributeName, type} = normalization;

    if (encodingType) {
        if (encodingType === 'color' || encodingType === 'size' || encodingType === 'opacity') {
            encodingType = type + encodingType.charAt(0).toLocaleUpperCase() + encodingType.slice(1);
        }
        if (encodingType.indexOf(type) !== 0) {
            throw new Error('getEncodingMetadata encodingType unexpected: ' + encodingType + ', ' + type);
        }
    }

    let bufferName;

    if (!encodingType) {
        encodingType = inferEncodingType(dataframe, type, attributeName);
    }
    bufferName = bufferNameForEncodingType(encodingType);

    return {bufferName, encodingType, normalization};
}


function bufferNameForEncodingType (encodingType) {
    return encodingType && (encodingType + 's');
};



//========================

export {
    inferEncodingType,
    inferEncoding,
    scalingFromSpec,
    inferEncodingSpec,
    legendForBins,
    bufferNameForEncodingType,
    inferTimeBoundEncoding,

    resetEncodingOnNBody, applyEncodingOnNBody
};


