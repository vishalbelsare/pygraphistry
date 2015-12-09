'use strict';

var d3       = require('d3');

var palettes = require('./palettes');

module.exports = {
    inferEncoding: function (dataframe, type, attributeName, encodingType) {
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
                            var baseColor = d3.rgb('blue');
                            scaling = d3.scale.linear()
                                .domain(defaultDomain)
                                .range([baseColor.darker(2), baseColor.brighter(2)]);
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
        if (scaling && encodingType.substr(encodingType.length - 5) === 'Color') {
            scaleAndEncode = function (x) { return palettes.hexToInt(scaling(x)); };
        }
        return {
            encodingType: encodingType,
            bufferName: encodingType + 's',
            scaling: scaleAndEncode
        };
    }
};
