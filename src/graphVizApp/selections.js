'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:selections');
var _       = require('underscore');

var util            = require('./util.js');

function init (appState) {
    debug('Initializing selections module');
    var renderingScheduler = appState.renderingScheduler;
    var activeSelection = appState.activeSelection;

    setupSelectionRender(activeSelection, renderingScheduler);
}

// TODO: Don't force the mouseover renderer to deal with active selections.
// Those should get their own shader and be dealt with separately from mouseovers,
// though possibly in the same pass.
function setupSelectionRender(activeSelection, renderingScheduler) {
    activeSelection.do(function () {
        renderingScheduler.renderScene('mouseOver', {
            trigger: 'mouseOverEdgeHighlight',
            data: {
                edgeIndices: [],
                nodeIndices: []
            }
        });
    }).subscribe(_.identity, util.makeErrorHandler('render activeSelections change'));
}

module.exports = {
    init: init
};
