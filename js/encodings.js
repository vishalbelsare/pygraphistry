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
                    if (summary.isQuantitative && !summary.isDiverging) {
                        encodingType = 'pointSize';
                    } else {
                        encodingType = 'pointColor';
                    }
                    break;
                case 'edge':
                    if (summary.isQuantitative && !summary.isDiverging) {
                        encodingType = 'edgeSize';
                    } else {
                        encodingType = 'edgeColor';
                    }
            }
        }
        var distinctValues = _.keys(summary.distinctValues).sort();
        switch (encodingType) {
            case 'pointSize':
                // Has to have a magnitude, not negative:
                if (summary.isOrdered && !summary.isDiverging) {
                    // Square root because point size/radius yields a point area:
                    scaling = d3Scale.sqrt()
                        .domain(defaultDomain)
                        .range(defaults.pointSize.range);
                }
                break;
            case 'pointOpacity':
                // Has to have a magnitude, not negative:
                if (summary.isOrdered && !summary.isDiverging) {
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
                        var domain = defaultDomain;
                        if (!summary.isNumeric) {
                            domain = _.range(distinctValues.length);
                        }
                        scaling = d3Scale.linear()
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
                if (summary.isQuantitative && !summary.isDiverging) {
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
                        var domain = defaultDomain;
                        if (!summary.isNumeric) {
                            domain = _.range(distinctValues.length);
                        }
                        scaling = d3Scale.linear()
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
                if (summary.isQuantitative && !summary.isDiverging) {
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
                    legend = new Array(_.size(binning.bins));
                    _.each(_.keys(binning.bins), function (key, index) {
                        legend[index] = (key === '_other') ? undefined : scaling(key);
                    });
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
