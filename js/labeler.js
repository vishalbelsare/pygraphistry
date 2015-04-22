'use strict';

var _ = require('underscore');
var sprintf = require('sprintf-js').sprintf;
var vgloader = require('./libs/VGraphLoader.js');
var dateFormat = require('dateformat');


function pickTitleField (attribs) {
    var prioritized = ['pointTitle', 'node', 'label', 'ip'];
    for (var i = 0; i < prioritized.length; i++) {
        var field = prioritized[i];
        if (attribs.hasOwnProperty(field)) {
            return field;
        }
    }
    return undefined;
}


function infoFrame(graph, type, indices, attributeNames) {
    var target;
    if (type === 'point') {
        target = vgloader.types.VERTEX;
    } else if (type === 'edge') {
        target = vgloader.types.EDGE;
    } else {
        console.error('infoFrame received invalid type: ', type);
        return;
    }

    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph, attributeNames);

    var titleOverride = attribs.hasOwnProperty('pointTitle');
    var maybeTitleField = pickTitleField(attribs);

    var filteredKeys = _.keys(attribs)
        .filter(function (name) { return attribs[name].target === target; })
        .filter(function (name) {
            return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel, degree']
                .indexOf(name) === -1;
        })
        .filter(function (name) { return name !== maybeTitleField; })


    var outDegrees = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped;
    var inDegrees = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped;

    return indices.map(function (rawIdx) {

        // Uncomment this if we start getting invalid indices.
        // var idx = Math.max(0, Math.min(offset + rawIdx, graph.simulator.numPoints));
        var idx = rawIdx;

        var outDegree = outDegrees[idx];
        var inDegree = inDegrees[idx];
        var degree = outDegree + inDegree;

        var columns = {
            'degree': degree,
            'degree in': inDegree,
            'degree out': outDegree,
            '_title' : maybeTitleField ? attribs[maybeTitleField].values[idx] : idx
        };

        _.each(filteredKeys, function (key) {
            var val = attribs[key].values[idx];
            var formattedVal = key.indexOf('Date') > -1 && typeof(val) === "number" ?
                    dateFormat(val, 'mm-dd-yyyy') : val;
            columns[key] = formattedVal;
        });

        return columns;
    });
}

function frameHeader(graph) {
    return _.sortBy(
        _.keys(infoFrame(graph, 'point', [0])[0]),
        _.identity
    );
}

function defaultLabels(graph, indices, dim) {
    var type = (dim === 2) ? 'edge' : 'point';
    return infoFrame(graph, type, indices).map(function (columns) {
        return {
            title: columns._title,
            columns: _.sortBy(
                _.pairs(_.omit(columns, '_title')),
                function (kvPair) { return kvPair[0]; }
            ),
        };
    });
}

function presetLabels (graph, indices) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return indices.map(function (idx) {
        return { formatted: graph.simulator.labels[offset + idx] };
    });
}


function getLabels(graph, indices, dim) {
    if (dim === 2 && graph.simulator.labels.length) {
        return presetLabels(graph, indices);
    } else {
        return defaultLabels(graph, indices, dim);
    }
}

function aggregate(graph, indices, attributes, binning, mode) {

    function process(values, attribute, indices) {

        var goalNumberOfBins = binning ? binning._goalNumberOfBins : 0;
        var binningHint = binning ? binning[attribute] : undefined;
        var type = vgloader.getAttributeType(graph.simulator.vgraph, attribute);

        if (mode !== 'countBy' && type !== 'string') {
            return histogram(values, binningHint, goalNumberOfBins, indices);
        } else {
            return countBy(values, binningHint, indices);
        }
    }

    var attributeMap = vgloader.getAttributeMap(graph.simulator.vgraph, attributes);
    attributeMap['degree in'] = {values: graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped};
    attributeMap['degree out'] = {values: graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped};
    // TODO: Caches this value elsewhere.
    var degrees = _.map(attributeMap['degree out'].values, function (val, idx) {
        return val + attributeMap['degree in'].values[idx];
    });
    attributeMap['degree'] = {values: degrees};

    var columns = attributes ? attributes : frameHeader(graph);
    //var filteredAttributeMap = filterAttributeMap(graph, indices, columns, attributeMap);

    // Filter out private attributes that begin with underscore
    columns = columns.filter(function (val) {
        return val[0] !== '_';
    });

    return _.object(_.map(columns, function (attribute) {
        return [attribute, process(attributeMap[attribute].values, attribute, indices)];
    }));
}


function countBy(values, binning, indices) {
    // TODO: Binning.
    if (indices.length === 0) {
        return {type: 'nodata'};
    }

    var bins = _.countBy(indices, function (valIdx) {
        return values[valIdx];
    });
    var numValues = _.reduce(_.values(bins), function (memo, num) {
        return memo + num;
    }, 0);

    return {
        type: 'countBy',
        numValues: numValues,
        numBins: _.keys(bins).length,
        bins: bins,
    };
}

function round_down(num, multiple) {
    if (multiple == 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.floor(div);
}

function round_up(num, multiple) {
    if (multiple == 0) {
        return num;
    }

    var div = num / multiple;
    return multiple * Math.ceil(div);
}

function minMaxMasked(values, indices) {
    var min = Infinity;
    var max = -Infinity;

    _.each(indices, function (valueIdx) {
        var val = values[valueIdx];
        if (val < min) {
            min = val;
        }
        if (val > max) {
            max = val;
        }
    });
    return {max: max, min: min};
}

function histogram(values, binning, goalNumberOfBins, indices) {
    // Binning has binWidth, minValue, maxValue, and numBins

    // Disabled because filtering is expensive, and we now have type safety coming from
    // VGraph types.
    // values = _.filter(values, function (x) { return !isNaN(x)});

    var numValues = indices.length;
    if (numValues === 0) {
        return {type: 'nodata'};
    }

    var goalBins = numValues > 30 ? Math.ceil(Math.log(numValues) / Math.log(2)) + 1
                                 : Math.ceil(Math.sqrt(numValues));

    goalBins = Math.min(goalBins, 30); // Cap number of bins.
    goalBins = Math.max(goalBins, 8); // Cap min number of bins.


    // Override if provided binning data.
    if (binning) {
        var numBins = binning.numBins;
        var binWidth = binning.binWidth;
        var bottomVal = binning.minValue;
        var topval = binning.maxValue;
        var min = binning.minValue;
        var max = binning.maxValue;

    } else {

        var minMax = minMaxMasked(values, indices);
        var max = minMax.max;
        var min = minMax.min;

        if (goalNumberOfBins) {
            var numBins = goalNumberOfBins;
            var bottomVal = min;
            var topVal = max;
            var binWidth = (max - min) / numBins;

        // Try to find a good division.
        } else {
            var goalWidth = (max - min) / goalBins;

            var binWidth = 10;
            var numBins = (max - min) / binWidth;
            // Get to a rough approx
            while (numBins < 2 || numBins >= 100) {
                if (numBins < 2) {
                    binWidth *= 0.1;
                } else {
                    binWidth *= 10;
                }
                numBins = (max - min) / binWidth;
            }
            // Refine by doubling/halving
            var minBins = Math.max(4, Math.floor(goalBins / 2) - 1);
            while (numBins < minBins || numBins > goalBins) {
                if (numBins < minBins) {
                    binWidth /= 2;
                } else {
                    binWidth *= 2;
                }
                numBins = (max - min) / binWidth;
            }

            var bottomVal = round_down(min, binWidth);
            var topVal = round_up(max, binWidth);
            numBins = Math.round((topVal - bottomVal) / binWidth);
        }
    }

    // Guard against 0 width case
    if (max === min) {
        binWidth = 1;
        numBins = 1;
        topVal = min + 1;
        bottomVal = min;
    }

    var bins = Array.apply(null, new Array(numBins)).map(function () { return 0; });

    var binId;
    for (var i = 0; i < indices.length; i++) {
        // Here we use an optimized "Floor" because we know it's a smallish, positive number.
        binId = ((values[indices[i]] - bottomVal) / binWidth) | 0;
        bins[binId]++;
    }

    return {
        type: 'histogram',
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: topVal,
        minValue: bottomVal,
        bins: bins
    };
}

module.exports = {
    getLabels: getLabels,
    infoFrame: infoFrame,
    aggregate: aggregate,
    frameHeader: frameHeader,
};

