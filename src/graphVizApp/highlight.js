'use strict';

const _ = require('underscore');

const util = require('./util.js');


/** Highlights mouseover and selected elements
 * Mouseover elements will also have their neighborhoods highlighted.
 * Selections take precedence over highlight.
 * Assumes that selections/highlighted indices don't have duplicates in their lists.
 * @param {ReplaySubject<VizSlice>} latestHighlightedObject
 * @param {ReplaySubject<VizSlice>} activeSelection
 * @param {canvas.RenderingScheduler} renderingScheduler
 * @constructor
 */
function Highlighter (latestHighlightedObject, activeSelection, renderingScheduler) {
    /** @type ReplaySubject<VizSlice> */
    this.latestHighlightedObject = latestHighlightedObject;
    /** @type ReplaySubject<VizSlice> */
    this.activeSelection = activeSelection;
    /** @type canvas.RenderingScheduler */
    this.renderingScheduler = renderingScheduler;
}


Highlighter.prototype.setupHighlight = function () {
    this.subscription = this.latestHighlightedObject.combineLatest(this.activeSelection,
        (highlighted, selected) => ({highlighted, selected})
    ).do(({highlighted, selected}) => {
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
        this.renderingScheduler.renderScene('mouseOver', task);
        // console.log('TASK: ', JSON.stringify(task, null, 4));
    }).subscribe(_.identity, util.makeErrorHandler('Setup highlight'));
};

Highlighter.prototype.dispose = function () {
    this.subscription.dispose();
};

module.exports = Highlighter;
