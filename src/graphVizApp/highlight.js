'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:highlight');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');


// Highlights mouseover and selected elements
// Mouseover elements will also have their neighborhoods highlighted.
// Selections take precedence over highlight.
// Assumes that selections/highlighted indices don't have duplicates in their lists
function setupHighlight(appState) {

    var latestHighlightedObject = appState.latestHighlightedObject;
    var activeSelection = appState.activeSelection;

    latestHighlightedObject.combineLatest(activeSelection,
        function (highlighted, selected) {
            return {
                highlighted: highlighted,
                selected: selected
            };
        }).do(function (data) {

            var getIndicesForDim = function (array, dim) {
                return _.chain(array)
                    .filter(function (el) {
                        return el.dim === dim;
                    }).pluck('idx').value();
            };

            var selectedNodeIndices = getIndicesForDim(data.selected, 1);
            var selectedEdgeIndices = getIndicesForDim(data.selected, 2);

            var highlightedNodeIndices = getIndicesForDim(data.highlighted, 1);
            var highlightedEdgeIndices = getIndicesForDim(data.highlighted, 2);

            var task = {
                trigger: 'mouseOverEdgeHighlight',
                data: {
                    highlight: {
                        nodeIndices: highlightedNodeIndices,
                        edgeIndices: highlightedEdgeIndices
                    },
                    selected: {
                        nodeIndices: selectedNodeIndices,
                        edgeIndices: selectedEdgeIndices
                    }
                }
            };

            appState.renderingScheduler.renderScene('mouseOver', task);

            // console.log('TASK: ', JSON.stringify(task, null, 4));
        }).subscribe(_.identity, util.makeErrorHandler('Setup highlight'));
}






module.exports = {
    setupHighlight: setupHighlight
};
