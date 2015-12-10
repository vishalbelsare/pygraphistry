'use strict';

var _        = require('underscore');
var d3       = require('d3');

var palettes = require('./palettes');

module.exports = {
    inferEncoding: function (dataframe, type, attributeName, encodingType, binning) {
        var summary = dataframe.summarizeColumnValues(type, attributeName);
        var scaling;
        var defaultDomain = [summary.minValue, summary.maxValue];
        if (!encodingType) {
            switch (type) {
                case 'point':
                    if (summary.quantitative) {
                        if (summary.diverging) {
                            encodingType = 'pointColor';
                        } else {
                            encodingType = 'pointSize';
                        }
                    }
                    break;
                case 'edge':
                    encodingType = 'edgeColor';
                    break;
            }
        }
        switch (encodingType) {
            case 'pointSize':
                if (summary.quantitative && !summary.diverging) {
                    scaling = d3.scale.sqrt()
                        .domain(defaultDomain)
                        .range([0, 30]); // TODO: Should be clamped to max point size in pixels.
                }
                break;
            case 'pointOpacity':
                if (summary.quantitative && !summary.diverging) {
                    scaling = d3.scale.linear()
                        .domain(defaultDomain)
                        .range([0, 1]); // TODO: Should be clamped to max point size in pixels.
                }
                break;
            case 'pointColor':
                if (summary.categorical) {
                    if (summary.numDistinctValues < 10) {
                        scaling = d3.scale.category10()
                            .domain(summary.values);
                    } else if (summary.numDistinctValues < 20) {
                        scaling = d3.scale.category20()
                            .domain(summary.values);
                    }
                }
                if (scaling === undefined) {
                    if (summary.quantitative) {
                        if (summary.diverging) {
                            scaling = d3.scale.linear()
                                .domain(defaultDomain)
                                .range(['blue', 'white', 'red']);
                        } else {
                            scaling = d3.scale.linear()
                                .domain(defaultDomain)
                                .range(['blue', 'white']);
                        }
                    }
                }
                break;
            case 'pointTitle':
                break;
            case 'pointLabel':
                break;
            case 'edgeOpacity':
                if (summary.quantitative && !summary.diverging) {
                    scaling = d3.scale.linear()
                        .domain(defaultDomain)
                        .range([0, 1]); // TODO: Should be clamped to max point size in pixels.
                }
                break;
            default:
                throw new Error('No encoding found for: ' + encodingType);
        }
        var scaleAndEncode = scaling;
        var palette;
        if (scaling && encodingType.substr(encodingType.length - 5) === 'Color') {
            scaleAndEncode = function (x) { return palettes.hexToInt(scaling(x)); };
            if (binning !== undefined && scaling !== undefined) {
                var minValue = summary.minValue,
                    step = binning.binWidth;
                palette = _.map(binning.bins, function (itemCount, index) {
                    // Use the scaling to get hex string, not machine integer, for D3/color.
                    return scaling(minValue + step * index);
                });
            }
        }
        return {
            encodingType: encodingType,
            bufferName: encodingType + 's',
            palette: palette,
            scaling: scaleAndEncode
        };
    }
};
