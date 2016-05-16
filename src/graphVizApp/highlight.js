'use strict';

const _ = require('underscore');

const util = require('./util.js');


// Highlights mouseover and selected elements
// Mouseover elements will also have their neighborhoods highlighted.
// Selections take precedence over highlight.
// Assumes that selections/highlighted indices don't have duplicates in their lists
function setupHighlight (appState) {

    const latestHighlightedObject = appState.latestHighlightedObject;
    const activeSelection = appState.activeSelection;

    latestHighlightedObject.combineLatest(activeSelection,
        (highlighted, selected) => ({highlighted, selected})).do(({highlighted, selected}) => {
            const task = {
                trigger: 'mouseOverEdgeHighlight',
                data: {
                    highlight: {
                        nodeIndices: highlighted.getPointIndexValues(),
                        edgeIndices: highlighted.getEdgeIndexValues()
                    },
                    selected: {
                        nodeIndices: selected.getPointIndexValues(),
                        edgeIndices: selected.getEdgeIndexValues()
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
