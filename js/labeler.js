'use strict';

var _ = require('underscore');
var sprintf = require('sprintf-js').sprintf;
var vgloader = require('./libs/VGraphLoader.js');


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


function infoFrame(graph, indices) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph);

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
                            ['degree', sprintf('%s (%s in, %s out)', degree, inDegree, outDegree)],
                            ['_title', maybeTitleField ? attribs[maybeTitleField].values[idx] : idx],
                        ],
                        _.keys(attribs)
                            .filter(function (name) { return attribs[name].target === vgloader.types.VERTEX; })
                            .filter(function (name) {
                                return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel, degree']
                                    .indexOf(name) === -1;
                            })
                            .filter(function (name) { return name !== maybeTitleField; })
                            .map(function (name) {
                                return [name, attribs[name].values[idx]];
                            })
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

function aggregate(graph, indices, attribute) {
    function process(frame, attribute) {
        var values = _.map(frame, function (row) {
            return row[attribute];
        });
        if (_.all(values, function (x) { return typeof x === 'number'; })) {
            return histogram(values);
        } else {
            return countBy(values);
        }
    }

    var frame = infoFrame(graph, indices);
    var columns = attribute ? [attribute] : frameHeader(graph);

    return _.object(_.map(columns, function (attribute) {
        return [attribute, process(frame, attribute)];
    }));
}


function countBy(values) {
    if (values.length === 0) {
        return {type: 'nodata'};
    }

    var bins = _.countBy(values);
    return {
        type: 'countBy',
        numBins: bins.length,
        bins: bins,
    };
}


function histogram(values) {
    values = _.filter(values, function (x) { return !isNaN(x)});

    var numValues = values.length;
    if (numValues === 0) {
        return {type: 'nodata'};
    }

    var numBins = numValues > 30 ? Math.ceil(Math.log(numValues) / Math.log(2)) + 1
                                 : Math.ceil(Math.sqrt(numValues));

    numBins = Math.min(numBins, 50); // Cap number of bins.

    var max = _.max(values);
    var min = _.min(values);
    var binWidth = Math.ceil((max - min) / numBins);

    // Guard against 0 width case
    if (max === min) {
        binWidth = 1;
        numBins = 1;
    }
    var bins = Array.apply(null, new Array(numBins)).map(function () { return []; });

    // console.log('Max: ', max, ', Min: ', min, ', Width: ', binWidth);
    // console.log('Bins: ', bins);

    _.each(values, function (val) {
        var binId = Math.min(Math.floor((val - min) / binWidth), numBins - 1);
        // console.log('Val: ', val, ', binId: ', binId);
        bins[binId].push(val)
    })

    return {
        type: 'histogram',
        numBins: numBins,
        binWidth: binWidth,
        numValues: numValues,
        maxValue: max,
        minValue: min,
        bins: bins.map(function (b) { return b.length; })
    };
}

module.exports = {
    getLabels: getLabels,
    infoFrame: infoFrame,
    aggregate: aggregate,
    frameHeader: frameHeader,
};

