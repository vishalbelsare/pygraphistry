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

function attribsToPairs (attribs, maybeTitleField, idx) {

    return _.keys(attribs)
        .filter(function (name) { return attribs[name].target === vgloader.types.VERTEX; })
        .filter(function (name) {
            return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel, degree']
                .indexOf(name) === -1;
        })
        .filter(function (name) { return name !== maybeTitleField; })
        .map(function (name) {
            var val = attribs[name].values[idx];
            return [name,
                name.indexOf('Date') > -1 && typeof(val) === "number" ?
                    dateFormat(val, "mm-dd-yyyy") : val];
        });
}


function infoFrame(graph, indices, attributeNames) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph, attributeNames);

    var titleOverride = attribs.hasOwnProperty('pointTitle');
    var maybeTitleField = pickTitleField(attribs);

    return indices.map(function (rawIdx) {
        var idx = Math.max(0, Math.min(offset + rawIdx, graph.simulator.numPoints));

        var outDegree = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped[idx];
        var inDegree = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped[idx];
        var degree = outDegree + inDegree;

        var columns = _.object(
                _.flatten(
                    [
                        [
                            ['degree', degree],
                            ['degree in', inDegree],
                            ['degree out', outDegree],
                            ['_title', maybeTitleField ? attribs[maybeTitleField].values[idx] : idx],
                        ],
                        attribsToPairs(attribs, maybeTitleField, idx)
                    ],
                    true)
                );

        return columns;
    });
}

function frameHeader(graph) {
    return _.sortBy(
        _.keys(infoFrame(graph, [0])[0]),
        _.identity
    );
}

function defaultLabels(graph, indices) {
    return infoFrame(graph, indices).map(function (columns) {
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


function getLabels(graph, indices) {
    if (graph.simulator.labels.length) {
        return presetLabels(graph, indices);
    } else {
        return defaultLabels(graph, indices);
    }
}

function aggregate(graph, indices, attributes, binning, mode) {

    function process(frame, attribute) {
        var values = _.map(frame, function (row) {
            return row[attribute];
        });

        var binningHint = binning ? binning[attribute] : undefined;
        var type = vgloader.getAttributeType(graph.simulator.vgraph, attribute);

        if (mode !== 'countBy' && type !== 'string') {
            return histogram(values, binningHint);
        } else {
            return countBy(values, binningHint);
        }
    }

    var frame = infoFrame(graph, indices, attributes);
    var columns = attributes ? attributes : frameHeader(graph);

    // Filter out private attributes that begin with underscore
    columns = columns.filter(function (val) {
        return val[0] !== '_';
    });

    return _.object(_.map(columns, function (attribute) {
        return [attribute, process(frame, attribute)];
    }));
}


function countBy(values, binning) {
    // TODO: Binning.
    if (values.length === 0) {
        return {type: 'nodata'};
    }

    var bins = _.countBy(values);
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


function histogram(values, binning) {
    // Binning has binWidth, minValue, maxValue, and numBins

    values = _.filter(values, function (x) { return !isNaN(x)});

    var numValues = values.length;
    if (numValues === 0) {
        return {type: 'nodata'};
    }

    var goalBins = numValues > 30 ? Math.ceil(Math.log(numValues) / Math.log(2)) + 1
                                 : Math.ceil(Math.sqrt(numValues));

    goalBins = Math.min(goalBins, 30); // Cap number of bins.
    goalBins = Math.max(goalBins, 8); // Cap min number of bins.

    var max = _.max(values);
    var min = _.min(values);
    var goalWidth = (max - min) / goalBins;

    // Because users like clean binning, we try to coerce binWidth
    // to its nearest nice value.
    //
    // We have different behavior based on the order of Max - Min.

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
    while (numBins < 4 || numBins > goalBins) {
        if (numBins < 4) {
            binWidth /= 2;
        } else {
            binWidth *= 2;
        }
        numBins = (max - min) / binWidth;
    }

    var bottomVal = round_down(min, binWidth);
    var topVal = round_up(max, binWidth);
    var numBins = Math.round((topVal - bottomVal) / binWidth);

    // Override if provided binning data.
    if (binning) {
        numBins = binning.numBins;
        binWidth = binning.binWidth;
        bottomVal = binning.minValue;
        min = binning.minValue;
        max = binning.maxValue;
    }

    // Guard against 0 width case
    if (max === min) {
        binWidth = 1;
        numBins = 1;
    }
    var bins = Array.apply(null, new Array(numBins)).map(function () { return []; });

    // console.log('Max: ', max, ', Min: ', min, ', Width: ', binWidth);
    // console.log('Bins: ', bins);

    _.each(values, function (val) {
        var binId = Math.min(Math.floor((val - bottomVal) / binWidth), numBins - 1);
        bins[binId].push(val)
    })

    return {
        type: 'histogram',
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        // maxValue: max,
        // minValue: min,
        maxValue: topVal,
        minValue: bottomVal,
        bins: bins.map(function (b) { return b.length; })
    };
}

module.exports = {
    getLabels: getLabels,
    infoFrame: infoFrame,
    aggregate: aggregate,
    frameHeader: frameHeader,
};

