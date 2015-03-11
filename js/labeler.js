'use strict';

var _ = require('underscore');

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


function defaultLabels (graph, labels) {

    var offset = graph.simulator.timeSubset.pointsRange.startIdx;
    var attribs = vgloader.getAttributeMap(graph.simulator.vgraph);

    var titleOverride = attribs.hasOwnProperty('pointTitle');
    var maybeTitleField = pickTitleField(attribs);

    return labels.map(
        function (rawIdx) {
            var idx = offset + rawIdx;

            var outDegree = graph.simulator.bufferHostCopies.forwardsEdges.degreesTyped[idx];
            var inDegree = graph.simulator.bufferHostCopies.backwardsEdges.degreesTyped[idx];
            var degree = outDegree + inDegree;

            var rows = _.sortBy(
                    _.flatten(
                        [
                            [
                                ['_degree', '<div style="text-align:center"><span style="float:left"><b>' + degree + '</b></span>&nbsp;(' + inDegree + ' in <span style="float:right">&nbsp;' + outDegree + ' out)</span></div>']
                                //, ['_index', idx]
                            ],
                            _.keys(attribs)
                                .filter(function (name) { return attribs[name].target === vgloader.types.VERTEX; })
                                .filter(function (name) {
                                    return ['pointColor', 'pointSize', 'pointTitle', 'pointLabel']
                                        .indexOf(name) === -1;
                                })
                                .filter(function (name) { return name !== maybeTitleField; })
                                .map(function (name) {
                                    return [name, attribs[name].values[idx]];
                                })
                        ],
                        true),
                    function (kvPair) { return kvPair[0]; });

            var title = maybeTitleField ? attribs[maybeTitleField].values[idx] : idx;

            return '<div class="graph-label-container graph-label-default">'
                + '<span class="graph-label-title"><i class="fa fa-lg fa-thumb-tack"></i> ' + title + '</span>'
                + '<div class="graph-label-contents"><table>'
                + _.map(rows, function (kvPair) {
                    return '<tr class="graph-label-pair"><td class="graph-label-key">' + kvPair[0] + '</td><td class="graph-label-value"><div class="graph-label-value-wrapper">' + kvPair[1] + '</div></td></tr>';
                }).join(' ')
                + '</table></div></div>';
        });
}

function presetLabels (graph, labels) {
    var offset = graph.simulator.timeSubset.pointsRange.startIdx;

    return labels.map(function (idx) {
        return '<div class="graph-label-container graph-label-preset"><span class="graph-label-title">'
            + graph.simulator.labels[offset + idx]
            + '</span></div>';
    });
}


module.exports = {
    labels:
        function (graph, labels) {

            if (!graph.simulator.labels.length) {
                return defaultLabels(graph, labels);
            }

            return presetLabels(graph, labels);
        }
};

