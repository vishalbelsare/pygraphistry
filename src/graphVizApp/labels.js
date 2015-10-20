'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:labels');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');

var util            = require('./util.js');
var interaction     = require('./interaction.js');
var picking         = require('../picking.js');
var canvas          = require('./canvas.js');

var EDGE_LABEL_OFFSET = 0;

// HACK because we can't know what the mouse position is without watching events
var mousePosition = {x: 0, y: 0};

document.addEventListener('mousemove', function(e) {
    mousePosition.x = e.clientX || e.pageX;
    mousePosition.y = e.clientY || e.pageY;
}, false);

function setupLabelsAndCursor(appState, urlParams, $eventTarget) {
    // Picks objects in priority based on order.
    var hitMapTextures = ['hitmap'];
    var latestHighlightedObject = setupLatestHighlightedObject(appState, $eventTarget, hitMapTextures);

    setupClickSelections(appState, $eventTarget);
    setupLabels(appState, urlParams, $eventTarget, latestHighlightedObject);
    setupCursor(appState.renderState, appState.renderingScheduler, appState.isAnimatingOrSimulating, latestHighlightedObject, appState.activeSelection);

    // TODO: Is this the actual behavior we want?
    deselectWhenSimulating(appState);
}

// AppState * $DOM * [textureNames]-> Observable [ {dim: 1, idx: int} ]
// Changes from point/edge mouseover
// Most recent interaction goes at the end
function setupLatestHighlightedObject (appState, $eventTarget, textures) {
    appState.latestHighlightedObject.onNext([]);

    interaction.setupMousemove($eventTarget).combineLatest(
            appState.hitmapUpdates,
            _.identity
        )
        .flatMapLatest(util.observableFilter([appState.marqueeOn, appState.brushOn],
                function (v) {
                    return (v !== 'selecting') && (v !== 'dragging');
                },
                util.AND
        ))
        .flatMapLatest(util.observableFilter(appState.isAnimatingOrSimulating, util.notIdentity))
        .map(function (pos) {
            var hits = [picking.hitTestN(appState.renderState, textures, pos.x, pos.y, 10)];
            // Make sure we only return valid hits.
            return hits.filter(function (hit) {
                return hit.idx > -1;
            });
        })
        // Only update when changes.
        .distinctUntilChanged(function (hits) {
            return hits.length ? hits[0].idx : -1;
        })
        .subscribe(appState.latestHighlightedObject, util.makeErrorHandler('getLatestHighlightedObject'));

    return appState.latestHighlightedObject;
}


// AppState * $DOM * textureName -> Nothing
// Sets up clicking to set active selections in the appState.
// Will handle clicking on labels as well as the canvas.
function setupClickSelections (appState, $eventTarget) {
    var activeSelection = appState.activeSelection;

    $eventTarget.mousedownAsObservable()
        .flatMapLatest(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
        .flatMapLatest(function (down) {
            return $eventTarget.mouseupAsObservable().take(1).map(function (up) {
                var downUp = [down, up];
                downUp.ctrl = down.ctrlKey || down.metaKey;
                return downUp;
            });
        })
        .filter(function (downUp) {
            var dist = distance(downUp[0].clientX, downUp[0].clientY, downUp[1].clientX, downUp[1].clientY);
            return dist < 5;
        })
        .flatMapLatest(function (downUp) {
            var $target = $(downUp[1].target);
            var targetElementStream;
            // Clicked on existing POI label, return point corresponding to label
            if ($target.hasClass('graph-label') ||
                    $target.parents('.graph-label').length) {

                var elt = $target.hasClass('graph-label') ? downUp[1].target
                    : ($target.parents('.graph-label')[0]);
                var pt = _.values(appState.poi.state.activeLabels)
                    .filter(function (lbl) { return lbl.elt.get(0) === elt; })[0];
                targetElementStream = Rx.Observable.return([pt]);

            // Clicked on canvas, return latest highlighted object
            } else {
                targetElementStream = appState.latestHighlightedObject.take(1);
            }

            return targetElementStream.map(function (clickPoints) {
                return {
                    clickPoints: clickPoints,
                    ctrl: downUp.ctrl
                };
            });
        }).flatMapLatest(function (data) {
            return activeSelection.take(1).map(function (sel) {
                return {sel: sel, clickPoints: data.clickPoints, ctrl: data.ctrl};
            });
        }).do(function (data) {
            var clickPoints = data.clickPoints;
            var sel = data.sel;
            var ctrl = data.ctrl;

            // Tag source
            _.each(clickPoints, function (click) {
                _.extend(click, {source: 'canvas'});
            });

            if (!ctrl) {
                activeSelection.onNext(clickPoints);
            } else {
                var lengthBefore = sel.length;
                var clicked = clickPoints[0];

                // Remove clicked points if they exist.
                sel = _.map(sel, function (selectedElement) {
                    if (selectedElement.idx === clicked.idx && selectedElement.dim === clicked.dim) {
                        return null;
                    }
                    return selectedElement;
                });
                sel = sel.filter(_.identity);

                // Add clicked point if it didn't exist;
                if (lengthBefore === sel.length) {
                    sel.push(clicked);
                }
                activeSelection.onNext(sel);
            }

        }).subscribe(_.identity, util.makeErrorHandler('setupClickSelections'));
}

// move labels when new highlight or finish noisy rendering section
// (or hide if off)
// AppState * UrlParams * $DOM * Observable [ {dim: int, idx: int} ] * Observable DOM -> ()
function setupLabels (appState, urlParams, $eventTarget, latestHighlightedObject) {

    // TODO: Move this out of JS and into HTML.
    var $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);

    if (urlParams.labels === false) {
        $labelCont.addClass('off');
        return;
    }

    appState.cameraChanges.combineLatest(
        appState.vboUpdates,
        latestHighlightedObject,
        appState.activeSelection,
        function (camera, vboUpdates, highlighted, selection) {
            return {
                highlighted: highlighted,
                selection: selection
            };
        }
    ).do(function (toShow) {
        renderLabels(appState, $labelCont, toShow.highlighted, toShow.selection);
    })
    .subscribe(_.identity, util.makeErrorHandler('setuplabels'));
}



// AppState * $DOM * {dim:int, idx:int} * {dim:int, idx:int} -> ()
// Immediately reposition each label based on camera and curPoints buffer
function renderLabels(appState, $labelCont, highlighted, selected) {
    debug('rendering labels');

    // TODO: Simplify this so we don't have to have this separate call for getting
    // points.
    var curPoints = appState.renderState.get('hostBuffers').curPoints;
    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }

    curPoints.take(1)
        .do(function (curPoints) {
            renderLabelsImmediate(appState, $labelCont, curPoints, highlighted, selected);
        })
        .subscribe(_.identity, util.makeErrorHandler('renderLabels'));
}

function renderLabelsImmediate (appState, $labelCont, curPoints, highlighted, clicked) {

    var poi = appState.poi;
    var points = new Float32Array(curPoints.buffer);

    // Get hits from POI and add highlighted/selected
    var hits = poi.getActiveApprox(appState.renderState, 'pointHitmapDownsampled');
    _.each([highlighted, clicked], function (set) {
        _.each(set, function (labelObj) {
            hits[poi.cacheKey(labelObj.idx, labelObj.dim)] = labelObj;
        });
    });

    // Initial values for clearing/showing
    var toClear = poi.finishApprox(poi.state.activeLabels, poi.state.inactiveLabels,
                                   hits, appState.renderState, points);

    // select label elements (and make active if needed)
    var labelsToShow = _.values(hits)
        .map(function (hit) {
            var idx = parseInt(hit.idx);
            var dim = hit.dim;
            var key = poi.cacheKey(idx, dim);

            if (poi.state.activeLabels[key]) {
                // label already on, re-use
                return poi.state.activeLabels[key];
            } else if ((_.keys(poi.state.activeLabels).length > poi.MAX_LABELS) && (_.pluck(highlighted, 'idx').indexOf(idx) === -1)) {
                // no label but too many on screen, don't create new
                return null;
            } else if (!poi.state.inactiveLabels.length) {
                // no label and no pre-allocated elements, create new
                var freshLabel = poi.genLabel($labelCont, idx, hits[key]);
                freshLabel.elt.on('click', function () {
                    appState.labelHover.onNext(this);
                });
                extendEdgeLabelWithCoords(freshLabel, hit, appState);
                return freshLabel;
            } else {
                // no label and available inactive preallocated, reuse
                var lbl = poi.state.inactiveLabels.pop();
                lbl.idx = idx;
                lbl.dim = dim;
                lbl.setIdx({idx: idx, dim: lbl.dim});
                extendEdgeLabelWithCoords(lbl, hit, appState);
                return lbl;
            }
        })
        .filter(_.identity);

    poi.resetActiveLabels(_.object(labelsToShow.map(function (lbl) { return [poi.cacheKey(lbl.idx, lbl.dim), lbl]; })));

    var newPos = newLabelPositions(appState.renderState, labelsToShow, points);

    effectLabels(toClear, labelsToShow, newPos, highlighted, clicked, poi);
}

function newLabelPositions(renderState, labels, points) {

    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var mtx = camera.getMatrix();

    var newPos = new Float32Array(labels.length * 2);
    for (var i = 0; i < labels.length; i++) {
        // TODO: Treat 2D labels more naturally.
        var dim = labels[i].dim;

        var pos;
        if (dim === 2) {
            pos = camera.canvasCoords(labels[i].x, labels[i].y, cnv, mtx);
        } else {
            var idx = labels[i].idx;
            pos = camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv, mtx);
        }
        newPos[2 * i] = pos.x;
        newPos[2 * i + 1] = pos.y;
    }

    return newPos;
}

// TODO: This gets called on every mousemove, even when highlighted doesn't change.
function effectLabels(toClear, labels, newPos, highlighted, clicked, poi) {

    // DOM effects: disable old, then move->enable new
    toClear.forEach(function (lbl) {
        lbl.elt.css('display', 'none');
    });

    labels.forEach(function (elt, i) {
        elt.elt.css('left', newPos[2 * i]).css('top', newPos[2 * i + 1]);
        elt.elt.removeClass('on');
        elt.elt.removeClass('clicked');
    });

    highlighted.forEach(function (label) {
        if (label.idx > -1) {
            var cacheKey = poi.cacheKey(label.idx, label.dim);
            poi.state.activeLabels[cacheKey].elt.toggleClass('on', true);
        }
    });

    clicked.forEach(function (clickObj) {
        if (clickObj.idx > -1) {
            var cacheKey = poi.cacheKey(clickObj.idx, clickObj.dim);
            poi.state.activeLabels[cacheKey].elt.toggleClass('on', true);
            poi.state.activeLabels[cacheKey].elt.toggleClass('clicked', true);
        }
    });

    labels.forEach(function (lbl) {
        lbl.elt.css('display', 'block');
    });

}

// Coords are in canvas space.
function extendEdgeLabelWithCoords (label, hit, appState) {
    if (hit.dim === 2) {
        if (hit.source && hit.source !== 'canvas') {
            _.extend(label, canvas.getEdgeLabelPos(appState, hit.idx));
        } else {
            _.extend(label, toWorldCoords(appState.renderState,
                    mousePosition.x + EDGE_LABEL_OFFSET,
                    mousePosition.y + EDGE_LABEL_OFFSET
                )
            );
        }
    }
}

function toWorldCoords(renderState, x, y) {
    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var mtx = camera.getMatrix();

    return camera.canvas2WorldCoords(x, y, cnv, mtx);
}

// RenderState * Observable * Observable
function setupCursor(renderState, renderingScheduler, isAnimating, latestHighlightedObject, activeSelection) {
    var rxPoints = renderState.get('hostBuffers').curPoints;
    var rxSizes = renderState.get('hostBuffers').pointSizes;

    var $cont = $('#highlighted-point-cont');
    var $point = $('.highlighted-point');
    var $center = $('.highlighted-point-center');
    var animating = isAnimating.filter(function (v) { return v === true; });
    var notAnimating = isAnimating.filter(function (v) { return v === false; });

    animating.subscribe(function () {
        $cont.css({display: 'none'});
    }, util.makeErrorHandler('renderCursor isAnimating'));

    notAnimating.flatMapLatest(function () {
        return rxPoints.combineLatest(
            rxSizes,
            latestHighlightedObject,
            activeSelection,
            function (p, s, i, sel) {
                return {
                    points: new Float32Array(p.buffer),
                    sizes: new Uint8Array(s.buffer),
                    indices: i,
                    selection: sel
                };
            }
        ).takeUntil(animating);
    }).do(function (data) {
        var combinedIndices = data.indices.concat(data.selection);
        renderCursor(renderState, renderingScheduler, $cont, $point, $center, data.points, data.sizes, combinedIndices);
    }).subscribe(_.identity, util.makeErrorHandler('setupCursor'));
}

// RenderState * Dom * Dom * Dom * Float32Array * Uint8Array * [Object]
// TODO: Implement the highlighted point CSS as a generic generated (and maybe cached)
// DOM element, not a fixed one that we embed in our graph.html
function renderCursor(renderState, renderingScheduler, $cont, $point, $center, points, sizes, indices) {

    var validIndices = _.filter(indices, function (val) {
        return (val.idx !== undefined && val.idx >= 0);
    });
    var pointIndices = _.pluck(_.filter(validIndices, function (val) {
        return (val.dim === 1);
    }), 'idx');
    var edgeIndices = _.pluck(_.filter(validIndices, function (val) {
        return (val.dim === 2);
    }), 'idx');


    // Renderer Highlights
    if (validIndices.length > 0) {
        $cont.css({display: 'none'});
        renderingScheduler.renderScene('mouseOver', {
            trigger: 'mouseOverEdgeHighlight',
            data: {
                edgeIndices: edgeIndices,
                nodeIndices: pointIndices
            }
        });
        if (pointIndices.length === 0) {
            return;
        }
    } else {
    // if (idx === undefined || idx < 0) {
        $cont.css({display: 'none'});
        renderingScheduler.renderScene('mouseOver', {
            trigger: 'mouseOverEdgeHighlight',
            data: {
                edgeIndices: [],
                nodeIndices: []
            }
        });
        return;
    }

    // Handle CSS element on points.
    // Currently only shows for first. Will be fixed when the css cont is made generic.

    var idx = pointIndices[0];

    $cont.css({display: 'block'});

    var camera = renderState.get('camera');
    var cnv = renderState.get('canvas');
    var pixelRatio = camera.pixelRatio;
    var mtx = camera.getMatrix();

    var pos = camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv, mtx);
    var scalingFactor = camera.semanticZoom(sizes.length);
    // Clamp like in pointculled shader
    var size = Math.max(5, Math.min(scalingFactor * sizes[idx], 50)) / pixelRatio;
    var offset = size / 2.0;

    $cont.attr('pointIdx', idx).css({
        top: pos.y,
        left: pos.x
    });
    $point.css({
        left: -offset,
        top: -offset,
        width: size,
        height: size,
        'border-radius': size / 2
    });

    /* Ideally, highlighted-point-center would be a child of highlighted-point-cont
    * instead of highlighted-point. I ran into tricky CSS absolute positioning
    * issues when I tried that. */
    var csize = parseInt($center.css('width'), 10);
    $center.css({
        left: offset - csize / 2.0,
        top: offset - csize / 2.0
    });
}


function deselectWhenSimulating(appState) {
    appState.simulateOn.do(function (val) {
        if (val) {
            appState.activeSelection.onNext([]);
        }
    }).subscribe(_.identity, util.makeErrorHandler('setuplabels (hide when simulating)'));
}


function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}


module.exports = {
    setupLabels: setupLabels,
    setupCursor: setupCursor,
    setupClickSelections: setupClickSelections,
    setupLabelsAndCursor: setupLabelsAndCursor
};
