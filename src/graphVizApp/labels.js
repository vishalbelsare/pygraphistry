'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:labels');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');
var interaction     = require('./interaction.js');

var renderer        = require('../renderer');


// STATIC FINAL VARIABLES
var HIGHLIGHT_SIZE = 20;


// $DOM * RendererState  * [int] * [int] -> ()
// Immediately reposition each label based on camera and curPoints buffer
var renderLabelsRan = false;
function renderPointLabels($labelCont, renderState, labelIndices, clicked, appState) {

    debug('rendering labels');

    var curPoints = renderState.get('hostBuffers').curPoints;
    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }
    curPoints.take(1)
        .do(function (curPoints) {

            //first run: created the enlarged points for the sampler
            if (!renderLabelsRan) {
                renderLabelsRan = true;
                var allOn = renderer.localAttributeProxy(renderState)('allHighlighted');
                var amt = curPoints.buffer.byteLength / (4 * 2);
                for (var i = 0; i < amt; i++) {
                    allOn.write(i, HIGHLIGHT_SIZE);
                }
            }

            renderLabelsImmediate($labelCont, renderState, curPoints, labelIndices, clicked, appState);

        })
        .subscribe(_.identity, util.makeErrorHandler('renderLabels'));
}


//RenderState * [ float ] * [{dim: int, idx: int}] -> ()
function renderCursor (renderState, points, indices, sizes) {

    var idx = indices[indices.length - 1].idx;
    var dim = indices[indices.length - 1].dim;

    debug('Enlarging current mouseover point (last)', idx);

    if (idx === undefined || idx < 0 || dim === 2) {
        $('#highlighted-point-cont').css({display: 'none'});
        return;
    }

    $('#highlighted-point-cont').css({display: 'block'});

    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var pixelRatio = camera.pixelRatio;
    var mtx = camera.getMatrix();

    var pos = camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv, mtx);
    var scalingFactor = camera.semanticZoom(sizes.length);
    // Clamp like in pointculled shader
    var size = Math.max(5, Math.min(scalingFactor * sizes[idx], 50)) / pixelRatio;
    var offset = size / 2.0;

    $('#highlighted-point-cont')
    .attr('pointIdx', idx)
    .css({
        top: pos.y,
        left: pos.x
    });
    $('.highlighted-point').css({
        'left' : -offset,
        'top' : -offset,
        'width': size,
        'height': size,
        'border-radius': size / 2
    });

    /* Ideally, highlighted-point-center would be a child of highlighted-point-cont
     * instead of highlighted-point. I ran into tricky CSS absolute positioning
     * issues when I tried that. */
    var csize = parseInt($('.highlighted-point-center').css('width'), 10);
    $('.highlighted-point-center').css({
        'left' : offset - csize / 2.0,
        'top' : offset - csize / 2.0
    });
}


function newLabelPositions(renderState, labels, points) {

    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var mtx = camera.getMatrix();

    var newPos = new Float32Array(labels.length * 2);
    for (var i = 0; i < labels.length; i++) {
        var idx = labels[i].idx;
        var pos = camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv, mtx);
        newPos[2 * i] = pos.x;
        newPos[2 * i + 1] = pos.y;
    }

    return newPos;
}

function effectLabels(toClear, toShow, labels, newPos, labelIndices, clicked, poi) {

    //DOM effects: disable old, then move->enable new
    toClear.forEach(function (lbl) {
        lbl.elt.css('display','none');
    });

    labels.forEach(function (elt, i) {
        elt.elt.css('left', newPos[2 * i]).css('top', newPos[2 * i + 1]);
        elt.elt.removeClass('on');
        elt.elt.removeClass('clicked');
    });

    labelIndices.forEach(function (labelIdx) {
        if (labelIdx > -1) {
            poi.state.activeLabels[labelIdx].elt.toggleClass('on', true);
        }
    });

    clicked.forEach(function (labelIdx) {
        if (labelIdx > -1) {
            poi.state.activeLabels[labelIdx].elt.toggleClass('clicked', true);
        }
    });

    toShow.forEach(function (lbl) {
        lbl.elt.css('display', 'block');
    });

}

function renderLabelsImmediate ($labelCont, renderState, curPoints, labelIndices, clicked, appState) {
    var poi = appState.poi;
    var points = new Float32Array(curPoints.buffer);

    var t0 = Date.now();

    var hits = poi.getActiveApprox(renderState, 'pointHitmapDownsampled');
    labelIndices.forEach(function (labelIdx) {
        if (labelIdx > -1) {
            hits[labelIdx] = true;
        }
    });
    var t1 = Date.now();

    var toClear = poi.finishApprox(poi.state.activeLabels, poi.state.inactiveLabels, hits, renderState, points);

    //select label elts (and make active if needed)
    var toShow = [];
    var labels = _.keys(hits)
        .map(function (idxStr) {
            var idx = parseInt(idxStr);
            if (poi.state.activeLabels[idx]) {
                //label already on, resuse
                var alreadyActiveLabel = poi.state.activeLabels[idx];
                toShow.push(alreadyActiveLabel);
                return alreadyActiveLabel;
            } else if ((_.keys(poi.state.activeLabels).length > poi.MAX_LABELS) && (labelIndices.indexOf(idx) === -1)) {
                //no label but too many on screen, don't create new
                return null;
            } else if (!poi.state.inactiveLabels.length) {
                //no label and no preallocated elts, create new
                var freshLabel = poi.genLabel($labelCont, idx);
                freshLabel.elt.on('mouseover', function () {
                    appState.labelHover.onNext(this);
                });
                toShow.push(freshLabel);
                return freshLabel;
            } else {
                //no label and available inactive preallocated, reuse
                var lbl = poi.state.inactiveLabels.pop();
                lbl.idx = idx;
                lbl.setIdx(idx);
                toShow.push(lbl);
                return lbl;
            }
        })
        .filter(_.identity);

    poi.resetActiveLabels(_.object(labels.map(function (lbl) { return [lbl.idx, lbl]; })));

    var t2 = Date.now();

    var newPos = newLabelPositions(renderState, labels, points, toClear, toShow);

    var t3 = Date.now();

    effectLabels(toClear, toShow, labels, newPos, labelIndices, clicked, poi);

    debug('sampling timing', t1 - t0, t2 - t1, t3 - t2, Date.now() - t3,
        'labels:', labels.length, '/', _.keys(hits).length, poi.state.inactiveLabels.length);

}

//move labels when new highlight or finish noisy rendering section
//$DOM * Observable RenderState * Observable [ {dim: int, idx: int} ] * Observable DOM -> ()
function setupLabels ($labelCont, latestState, latestHighlightedObject, appState) {
    latestState
        .flatMapLatest(function (currentState) {
            //wait until has samples
            return currentState.get('rendered')
                .flatMap(function () {
                    return latestHighlightedObject.map(function (latestHighlighted) {
                        return _.extend({highlighted: latestHighlighted}, {currentState: currentState});
                    });
                });
        })
        .flatMapLatest(function (data) {
            return appState.currentlyRendering.map(function (val) {
                return _.extend({rendering: val}, data);
            });
        })
        .filter(function (data) {
            return !data.rendering;
        })
        .do(function (data) {
            var indices = data.highlighted.map(function (o) {
                return !o.dim || o.dim === 1 ? o.idx : -1;
            });
            var clicked = data.highlighted
                .filter(function (o) { return o.click; })
                .map(function (o) { return o.idx; });

            renderPointLabels($labelCont, data.currentState, indices, clicked, appState);
        })
        .subscribe(_.identity, util.makeErrorHandler('setuplabels'));
}

//$DOM * RenderState * Observable DOM * textureName-> Observable [ {dim: 1, idx: int} ]
//Changes either from point mouseover or a label mouseover
//Clicking (coexists with hovering) will open at most 1 label
//Most recent interaction goes at the end
function getLatestHighlightedObject ($eventTarget, renderState, textures, appState) {

    var OFF = [{idx: -1, dim: 0}];

    var res = new Rx.ReplaySubject(1);
    res.onNext(OFF);

    interaction.setupMousemove($eventTarget, renderState, textures)
        // TODO: Make sure this also catches $('#marquee').hasClass('done') and 'beingdragged'
        // As a non-marquee-active state.
        .flatMapLatest(util.observableFilter(appState.marqueeActive, util.notIdentity))
        .map(function (v) { return {cmd: 'hover', pt: v}; })
        .merge($eventTarget.mousedownAsObservable()
            .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
            .map(function (evt) {
                var clickedLabel = $(evt.target).hasClass('graph-label') ||
                        $(evt.target).hasClass('highlighted-point') ||
                        $(evt.target).hasClass('highlighted-point-center');
                if (!clickedLabel) {
                    clickedLabel = $(evt.target).parents('.graph-label').length || false;
                }
                if (clickedLabel &&
                        //allow dragging by menu title (don't stop)
                        !$(evt.target).hasClass('graph-label') &&
                        !$(evt.target).hasClass('graph-label-container')) {
                    debug('stopPropagation: highlight down');
                    evt.stopPropagation();
                }
                return clickedLabel ?
                    {cmd: 'click', pt: {dim: 1, idx: parseInt($('#highlighted-point-cont').attr('pointidx'))}}
                    : {cmd: 'declick'};
            }))
        .merge(
            appState.labelHover
                .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
                .map(function (elt) {
                    return _.values(appState.poi.state.activeLabels)
                        .filter(function (lbl) { return lbl.elt.get(0) === elt; });
                })
                .filter(function (highlightedLabels) { return highlightedLabels.length; })
                // TODO: Tag this as a point properly
                .map(function (highlightedLabels) {
                    return {cmd: 'hover', pt: {dim: 1, idx: highlightedLabels[0].idx}};
                }))
        .scan([], function (acc, cmd) {
            switch (cmd.cmd) {
                case 'hover':
                    return acc
                        .filter(function (pt) { return !pt.hover; })
                        .concat(_.extend({hover: true}, cmd.pt));
                case 'click':
                    return acc
                        .filter(function (pt) { return !pt.click; })
                        .concat(_.extend({click: true}, cmd.pt));
                case 'declick':
                    return [];
            }
        })
        .map(function (arr) {
            return arr.filter(function (v) { return v.idx !== -1; });
        })
        .map(function (arr) {
            return arr.length ? arr : OFF;
        })
        .subscribe(res, util.makeErrorHandler('getLatestHighlightedObject'));

    return res.map(_.identity);
}


module.exports = {
    setupLabels: setupLabels,
    getLatestHighlightedObject: getLatestHighlightedObject,
    renderCursor: renderCursor
};
