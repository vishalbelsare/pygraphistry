'use strict';

const _             = require('underscore');
const d3Scale       = require('d3-scale');
const d3Interpolate = require('d3-interpolate');
const Color         = require('color');

const defaults = {
    color: {
        isQuantitative: {
            sequential: {
                range: ['white', 'blue']
            },
            diverging: {
                range: ['blue', 'white', 'red']
            }
        }
    },
    pointSize: {
        range: [0, 30] // Range of diameters supported, per VGraphLoader
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

function inferColorScalingSpecFor(summary, variation, defaultDomain, distinctValues, binning) {
    let scalingType, domain, range;
    const defaultSequentialRange = defaults.color.isQuantitative.sequential.range;
    if (summary.isCategorical) {
        if (variation === 'quantitative' && summary.isOrdered) {
            // User can request a quantitative interpretation of ordered categorical domains.
            if (summary.isNumeric) {
                scalingType = 'linear';
                domain = defaultDomain;
                range = defaultSequentialRange;
            } else if (binning.bins && _.size(binning.bins) > 0) {
                // A linear ordering has to trust bin order to make visual sense.
                if (binning.type === 'countBy') {
                    domain = _.sortBy(_.keys(binning.bins), function (key) {
                        return binning.bins[key];
                    });
                } else {
                    domain = distinctValues;
                }
            } else {
                domain = distinctValues;
            }
            if (range === undefined) {
                const interpolation = d3Interpolate.interpolate(defaultSequentialRange[0], defaultSequentialRange[1]),
                    numValues = domain.length;
                range = _.map(_.range(numValues), (idx) => Color(interpolation(idx / numValues)).hexString());
                scalingType = 'ordinal';
            }
        } else if (summary.countDistinct < 10) {
            scalingType = 'category10';
            domain = distinctValues;
        } else { //if (summary.countDistinct < 20) {
            scalingType = 'category20';
            domain = distinctValues;
        }
    } else if (summary.isOrdered) {
        if (summary.isDiverging) {
            scalingType = 'linear';
            domain = defaultDomain;
            range = defaults.color.isQuantitative.diverging.range;
        } else {
            scalingType = 'linear';
            domain = defaultDomain;
            range = defaultSequentialRange;
        }
    }
    return {
        scalingType: scalingType,
        domain: domain,
        range: range
    };
}


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

function scalingFromSpec (scalingSpec) {
    let scalingType = scalingSpec.scalingType,
        scaling;
    if (d3Scale[scalingType] !== undefined) {
        scaling = d3Scale[scalingType]();
    } else if (scalingType === 'identity') {
        scaling = _.identity;
    }
    if (scaling === undefined) {
        scaling = d3Scale.linear();
    }
    if (scalingSpec.domain !== undefined) {
        scaling.domain(scalingSpec.domain);
    }
    if (scalingSpec.range !== undefined) {
        scaling.range(scalingSpec.range);
    }
    if (scalingSpec.clamp !== undefined) {
        scaling.clamp(scalingSpec.clamp);
    }
    return scaling;
}

function inferEncodingSpec (encodingSpec, aggregations, attributeName, encodingType, variation, binning) {
    const summary = aggregations.getSummary();
    let scalingType, domain, range, clamp;
    const defaultDomain = [summary.minValue, summary.maxValue];
    const distinctValues = _.map(summary.distinctValues, function (x) { return x.distinctValue; });
    switch (encodingType) {
        case 'size':
        case 'pointSize':
            // Has to have a magnitude, not negative:
            if (summary.isPositive) {
                // Square root because point size/radius yields a point area:
                scalingType = 'sqrt';
                domain = defaultDomain;
                range = defaults.pointSize.range;
                clamp = true;
            }
            break;
        case 'edgeSize':
            // TODO ensure sizes are binned/scaled so that they may be visually distinguished.
            if (summary.isPositive) {
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
            if (summary.isPositive) {
                scalingType = 'linear';
                domain = defaultDomain;
                range = defaults.pointOpacity.range;
            }
            break;
        case 'color':
        case 'pointColor':
        case 'edgeColor':
            // Minimally support using columns with color in the name as their own palettes.
            // Assumes direct RGBA int32 values for now.
            if (attributeName.match(/color/i)) {
                scalingType = 'identity';
                domain = distinctValues;
                range = distinctValues;
            } else {
                return inferColorScalingSpecFor(summary, variation, defaultDomain, distinctValues, binning);
            }
            break;
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

/** A legend per the binning.
 * @returns <Array>
 */
function legendForBins (aggregations, scaling, binning) {
    let legend;
    const summary = aggregations.getSummary();
    if (scaling !== undefined && binning !== undefined) {
        // All this just handles many shapes of binning metadata, kind of messy.
        const minValue = summary.minValue,
            step = binning.binWidth || 0,
            binValues = binning.binValues;
        // NOTE: Use the scaling to get hex string / number, not machine integer, for D3 color/size.
        if (binning.bins && _.size(binning.bins) > 0) {
            if (binning.type === 'countBy') {
                if (_.isArray(binning.bins)) {
                    if (_.isArray(binning.binValues)) {
                        legend = _.map(binning.binValues, (binValue) => scaling(binValue.representative));
                    } else {
                        legend = _.map(binning.bins, (itemCount, index) => scaling(index));
                    }
                } else {
                    const sortedBinKeys = _.sortBy(_.keys(binning.bins), function (key) {
                        if (key === '_other') { return Infinity; } // always shows last
                        return -binning.bins[key];
                    });
                    legend = _.map(sortedBinKeys, function (key) {
                        return (key === '_other') ? undefined : scaling(key);
                    });
                }
            } else if (summary.isNumeric) {
                legend = _.map(binning.bins, function (itemCount, index) {
                    return scaling(minValue + step * index);
                });
            } else {
                legend = _.map(binning.bins, function (itemCount, index) {
                    const value = binValues !== undefined && binValues[index] ? binValues[index] : index;
                    return scaling(value);
                });
            }
        } else {
            legend = new Array(binning.numBins);
            for (let i = 0; i < binning.numBins; i++) {
                legend[i] = scaling(minValue + step * i);
            }
        }
    }
    return legend;
}

/** @typedef {Object} EncodingSpec
 *
 */

/**
 * @param {Dataframe} dataframe
 * @param {String} columnName
 * @param {String} type
 * @param {String} encodingType
 * @returns {EncodingSpec}
 */
function getEncodingSpecFor (dataframe, columnName, type, encodingType) {
    const column = dataframe.getColumn(columnName, type);
    if (column === undefined) { return undefined; }
    const encodingPreferences = column.encodingPreferences;
    if (encodingPreferences === undefined) { return undefined; }
    if (encodingType === undefined) {
        return undefined;
    } else if (encodingPreferences.hasOwnProperty(encodingType)) {
        return encodingPreferences[encodingType];
    } else {
        return undefined;
    }
}


/**
 * @param {Dataframe} dataframe
 * @param {String} columnName
 * @param {String} type
 * @param {String} encodingType
 * @param {EncodingSpec} encodingSpec
 */
function saveEncodingSpec (dataframe, columnName, type, encodingType, encodingSpec) {
    const column = dataframe.getColumn(columnName, type);
    if (column === undefined) { return; }
    if (column.encodingPreferences === undefined) { column.encodingPreferences = {}; }
    const encodingPreferences = column.encodingPreferences;
    encodingPreferences[encodingType] = encodingSpec;
}


function inferEncoding (dataframe, type, attributeName, encodingType, variation, binning) {
    const aggregations = dataframe.getColumnAggregations(attributeName, type, true);
    let encodingSpec = getEncodingSpecFor(dataframe, attributeName, type, encodingType);
    encodingSpec = inferEncodingSpec(encodingSpec, aggregations, attributeName, encodingType, variation, binning);
    const scaling = scalingFromSpec(encodingSpec);
    const legend = legendForBins(aggregations, scaling, binning);
    return {
        legend: legend,
        scaling: scaling
    };
}

module.exports = {
    inferEncodingType: inferEncodingType,
    inferEncoding: inferEncoding,
    scalingFromSpec: scalingFromSpec,
    inferEncodingSpec: inferEncodingSpec,
    getEncodingSpecFor: getEncodingSpecFor,
    saveEncodingSpec: saveEncodingSpec,
    legendForBins: legendForBins,
    bufferNameForEncodingType: function (encodingType) {
        return encodingType && (encodingType + 's');
    }
};
