'use strict';

// Point-of-interest tracking and rendering
// Idea:
//      -- sample texture to get subset of onscreen labels
//      -- if label switched from on-to-off, check if sampling missed


var debug       = require('debug')('graphistry:StreamGL:labels');
var _           = require('underscore');

var picking     = require('./picking.js');

//0--1: the closer to 1, the more likely that unsampled points disappear
var APPROX = 0.3;
var MAX_LABELS = 20;

//renderState * String -> {<idx> -> True}
//dict of points that are on screen -- approx may skip some
function getActiveApprox(renderState, textureName) {

    var samples32 = new Uint32Array(renderState.get('pixelreads')[textureName].buffer);
    var hits = {};
    for (var i = 0; i < samples32.length; i++) {
        hits[picking.uint32ToIdx(samples32[i])] =  true;
    }

    //only use first MAX_LABEL (sort to make deterministic)
    var vals = _.keys(hits).map(function (v) { return parseInt(v); });
    vals.sort();
    vals = vals.slice(0, MAX_LABELS);
    var res = _.object(vals.map(function (idx) { return [idx, true]; }));

    //remove null
    if (res['-1']) {
        delete res['-1'];
    }

    return res;
}


//{<idx>: True} * [{elt: $DOM}] * {<idx>: True} * RenderState * [ Float ] -> ()
//  Effects: update inactiveLabels, activeLabels, hits
//return unused activeLabels to inactiveLabels incase need extra to reuse
//(otherwise mark as hit)
//Idea: need to make sure missing not due to overplotting
function finishApprox(activeLabels, inactiveLabels, hits, renderState, points) {

    var camera = renderState.get('camera');
    var cnv = renderState.get('gl').canvas;
    var mtx = camera.getMatrix();

    var toClear = [];

    _.values(activeLabels).forEach(function (lbl) {
        if (!hits[lbl.idx]) {

            var pos = camera.canvasCoords(points[2 * lbl.idx], -points[2 * lbl.idx + 1], 1, cnv, mtx);

            var isOffScreen = pos.x < 0 || pos.y < 0 || pos.x > cnv.clientWidth || pos.y > cnv.clientHeight;
            var isDecayed = (Math.random() > 1 - APPROX) || (_.keys(activeLabels).length > MAX_LABELS);

            if (isOffScreen || isDecayed) {
                //remove
                inactiveLabels.push(lbl);
                delete activeLabels[lbl.idx];
                toClear.push(lbl);
            } else {
                //overplotted, keep
                hits[lbl.idx] = true;
            }
        }
    });

    return toClear;
}






function init () {
    debug('initializing label engine');

    var instance = {

        state: {
            //{<int> -> {elt: $DOM, idx: int} }
            activeLabels: {},

            //[ {elt: $DOM, idx: int} ]
            inactiveLabels: []

        },

        MAX_LABELS: MAX_LABELS,

        // {<int> -> {elt: $DOM, idx: int} } -> ()
        resetActiveLabels: function (activeLabels) {
            instance.state.activeLabels = activeLabels;
        },

        getActiveApprox: getActiveApprox,
        finishApprox: finishApprox
    };

    return instance;

}


module.exports = init;