'use strict';

var _        = require('underscore');
var d3Scale  = require('d3-scale');

var palettes = require('./palettes');

var defaults = {
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
        range: [0, 30]
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

module.exports = {
    inferEncoding: function (dataframe, type, attributeName, encodingType, variation, binning) {
        var aggregations = dataframe.getColumnAggregations(attributeName, type, true);
        var summary = aggregations.getSummary();
        var scaling;
        var defaultDomain = [summary.minValue, summary.maxValue];
        if (!encodingType) {
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
        }
        var distinctValues = _.keys(summary.distinctValues).sort();
        var domain = defaultDomain;
        switch (encodingType) {
            case 'pointSize':
                // Has to have a magnitude, not negative:
                if (summary.isPositive) {
                    // Square root because point size/radius yields a point area:
                    scaling = d3Scale.sqrt()
                        .domain(defaultDomain)
                        .range(defaults.pointSize.range);
                }
                break;
            case 'pointOpacity':
                // Has to have a magnitude, not negative:
                if (summary.isPositive) {
                    scaling = d3Scale.linear()
                        .domain(defaultDomain)
                        .range(defaults.pointOpacity.range);
                }
                break;
            case 'pointColor':
                // Minimally support using columns with color in the name as their own palettes.
                // Assumes direct RGBA int32 values for now.
                if (attributeName.match(/color/i)) {
                    return {
                        encodingType: encodingType,
                        bufferName: encodingType + 's',
                        legend: distinctValues,
                        scaling: _.identity
                    };
                }
                if (summary.isCategorical) {
                    if (variation === 'quantitative' && summary.isOrdered) {
                        // User can request a quantitative interpretation of ordered categorical domains.
                        if (summary.isNumeric) {
                            domain = defaultDomain;
                        } else {
                            domain = distinctValues;
                        }
                        scaling = d3Scale.ordinal()
                            .domain(domain)
                            .range(defaults.color.isQuantitative.sequential.range);
                    } else if (summary.countDistinct <= 10) {
                        scaling = d3Scale.category10()
                            .domain(distinctValues);
                    } else { //if (summary.countDistinct < 20) {
                        scaling = d3Scale.category20()
                            .domain(distinctValues);
                    }
                }
                if (scaling === undefined) {
                    if (summary.isOrdered) {
                        if (summary.isDiverging) {
                            scaling = d3Scale.linear()
                                .domain(defaultDomain)
                                .range(defaults.color.isQuantitative.diverging.range);
                        } else {
                            scaling = d3Scale.linear()
                                .domain(defaultDomain)
                                .range(defaults.color.isQuantitative.sequential.range);
                        }
                    }
                }
                break;
            case 'pointTitle':
                break;
            case 'pointLabel':
                break;
            case 'edgeSize':
                // TODO ensure sizes are binned/scaled so that they may be visually distinguished.
                if (summary.isPositive) {
                    scaling = d3Scale.linear()
                        .domain(defaultDomain)
                        .range(defaults.edgeSize.range);
                }
                break;
            case 'edgeColor':
                // Minimally support using columns with color in the name as their own palettes.
                // Assumes direct RGBA int32 values for now.
                if (attributeName.match(/color/i)) {
                    return {
                        encodingType: encodingType,
                        bufferName: encodingType + 's',
                        legend: distinctValues,
                        scaling: _.identity
                    };
                }
                if (summary.isCategorical) {
                    if (variation === 'quantitative' && summary.isOrdered) {
                        // User can request a quantitative interpretation of ordered categorical domains.
                        if (summary.isNumeric) {
                            domain = defaultDomain;
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
                        scaling = d3Scale.ordinal()
                            .domain(domain)
                            .range(defaults.color.isQuantitative.sequential.range);
                    } else if (summary.countDistinct < 10) {
                        scaling = d3Scale.category10()
                            .domain(distinctValues);
                    } else { //if (summary.countDistinct < 20) {
                        scaling = d3Scale.category20()
                            .domain(distinctValues);
                    }
                }
                if (scaling === undefined) {
                    if (summary.isOrdered) {
                        if (summary.isDiverging) {
                            scaling = d3Scale.linear()
                                .domain(defaultDomain)
                                .range(defaults.color.isQuantitative.diverging.range);
                        } else {
                            scaling = d3Scale.linear()
                                .domain(defaultDomain)
                                .range(defaults.color.isQuantitative.sequential.range);
                        }
                    }
                }
                break;
            case 'edgeOpacity':
                // Has to have a magnitude, not negative:
                if (summary.isPositive) {
                    scaling = d3Scale.linear()
                        .domain(defaultDomain)
                        .range(defaults.edgeOpacity.range);
                }
                break;
            default:
                throw new Error('No encoding found for: ' + encodingType);
        }
        var scaleAndEncode = scaling;
        /** A legend per the binning. @type <Array> */
        var legend;
        if (scaling !== undefined && binning !== undefined) {
            if (encodingType.match(/Color$/)) {
                scaleAndEncode = function (x) { return palettes.hexToInt(scaling(x)); };
            }
            // All this just handles many shapes of binning metadata, kind of messy.
            var minValue = summary.minValue,
                step = binning.binWidth || 0,
                binValues = binning.binValues;
            // NOTE: Use the scaling to get hex string / number, not machine integer, for D3 color/size.
            if (binning.bins && _.size(binning.bins) > 0) {
                if (binning.type === 'countBy') {
                    if (_.isArray(binning.bins)) {
                        legend = _.map(binning.bins, function (itemCount, index) {
                            return scaling(index);
                        });
                    } else {
                        var sortedBinKeys = _.sortBy(_.keys(binning.bins), function (key) {
                            return binning.bins[key];
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
                        var value = binValues !== undefined && binValues[index] ? binValues[index] : index;
                        return scaling(value);
                    });
                }
            } else {
                legend = new Array(binning.numBins);
                for (var i = 0; i < binning.numBins; i++) {
                    legend[i] = scaling(minValue + step * i);
                }
            }
        }
        return {
            encodingType: encodingType,
            bufferName: encodingType && (encodingType + 's'),
            legend: legend,
            scaling: scaleAndEncode
        };
    }
};
