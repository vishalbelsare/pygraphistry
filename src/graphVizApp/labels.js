'use strict';

const debug   = require('debug')('graphistry:StreamGL:graphVizApp:labels');
const $       = window.$;
const Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
const _       = require('underscore');

const util            = require('./util.js');
const interaction     = require('./interaction.js');
const picking         = require('../picking.js');
const canvas          = require('./canvas.js');
const VizSlice        = require('./VizSlice.js');
const Command         = require('./command.js');


const EDGE_LABEL_OFFSET = 0;

// HACK because we can't know what the mouse position is without watching events
const mousePosition = {x: 0, y: 0};

/** @typedef {Object} LabelStruct
 * @property {Number} dim
 * @property {Number} idx
 */

document.addEventListener('mousemove', (e) => {
    mousePosition.x = e.clientX || e.pageX;
    mousePosition.y = e.clientY || e.pageY;
}, false);

function setupLabelsAndCursor (appState, socket, urlParams, $eventTarget) {
    // Picks objects in priority based on order.
    const hitMapTextures = ['hitmap'];
    const latestHighlightedObject = setupLatestHighlightedObject(appState, $eventTarget, hitMapTextures);

    setupClickSelections(appState, $eventTarget);
    setupLabels(appState, urlParams, $eventTarget, latestHighlightedObject);
    setupCursor(appState.renderState, appState.renderingScheduler, appState.isAnimatingOrSimulating,
            latestHighlightedObject, appState.activeSelection);
    setupClickDragInteractions(appState, socket, $eventTarget);

    // TODO: Is this the actual behavior we want?
    deselectWhenSimulating(appState);
}

// AppState * $DOM * [textureNames]-> Observable [ {dim: 1, idx: int} ]
// Changes from point/edge mouseover
// Most recent interaction goes at the end
function setupLatestHighlightedObject (appState, $eventTarget, textures) {
    appState.latestHighlightedObject.onNext(new VizSlice());

    interaction.setupMousemove($eventTarget).combineLatest(
            appState.hitmapUpdates,
            _.identity
        )
        .switchMap(util.observableFilter([appState.marqueeOn, appState.brushOn],
                (v) => (v !== 'selecting') && (v !== 'dragging'),
                util.AND
        ))
        .switchMap(util.observableFilter(appState.isAnimatingOrSimulating, util.notIdentity))
        .map((pos) => picking.hitTestN(appState.renderState, textures, pos.x, pos.y, 10))
        // Only update when changes.
        .distinctUntilKeyChanged('idx').map((hit) => {
            const elements = hit.idx === -1 ? [] : [hit];
            return new VizSlice(elements);
        })
        .subscribe(appState.latestHighlightedObject, util.makeErrorHandler('getLatestHighlightedObject'));

    return appState.latestHighlightedObject;
}

// Handles interactions caused by clicking on canvas and dragging.
function setupClickDragInteractions (appState, socket, $eventTarget) {

    const moveNodesByIdCommand = new Command('moving nodes', 'move_nodes_by_ids', socket);

    const worldCoordDiffFromMouseEvents = function (initialEvent, finalEvent, renderState) {
        const camera = renderState.get('camera');
        const cnv = renderState.get('canvas');

        const worldInit = camera.canvas2WorldCoords(initialEvent.pageX, initialEvent.pageY, cnv);
        const worldFinal = camera.canvas2WorldCoords(finalEvent.pageX, finalEvent.pageY, cnv);
        const diff = {
            x: worldFinal.x - worldInit.x,
            y: worldFinal.y - worldInit.y
        };
        return diff;
    };

    Rx.Observable.fromEvent($eventTarget, 'mousedown')
        .switchMap(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
        .switchMap((downEvt) => {
            return interaction.observableFilterForClickingSelectedPoints(downEvt, appState, true);
        }).switchMap((downEvt) => {
            return appState.activeSelection.map((sel) => {
                return {sel, downEvt};
            }).take(1);
        })
        .switchMap(({sel, downEvt}) => {

            // Create stream of events that signify an end to the drag

            // These events are bound to the document so that we don't miss either
            // due to interactions with other dom elements
            const mouseUpOnWindowStream = Rx.Observable.fromEvent(document, 'mouseup');

            // We make a handler here for mouse-outs of JUST the document.
            // That is, a mouseout event from a child of the document won't trigger this,
            // only someone mousing out of the window
            // Technique taken from http://stackoverflow.com/questions/923299/how-can-i-detect-when-the-mouse-leaves-the-window
            const mouseOutOfWindowStream = Rx.Observable.fromEvent(document, 'mouseout')
                .filter((e=window.event) => {
                    const from = e.relatedTarget || e.toElement;
                    return (!from || from.nodeName === 'HTML');
                });

            const stopDraggingStream = mouseOutOfWindowStream.merge(mouseUpOnWindowStream)
                .take(1); // We take 1 so we don't have to manually dispose of these


            // Subscribe to mouse moves until we get a signal to stop, then send payload to server
            return Rx.Observable.fromEvent($eventTarget, 'mousemove')
                .takeUntil(stopDraggingStream
                    .switchMap((upEvt) => {
                        const diff = worldCoordDiffFromMouseEvents(downEvt, upEvt, appState.renderingScheduler.renderState);
                        const ids = sel.getPointIndexValues();
                        const payload = {diff, ids};

                        return moveNodesByIdCommand.sendWithObservableResult(payload);
                    })
                )
                .do((moveEvt) => {
                    const diff = worldCoordDiffFromMouseEvents(downEvt, moveEvt, appState.renderingScheduler.renderState);
                    appState.renderingScheduler.renderMovePointsTemporaryPositions(diff, sel);

                });
        }).subscribe(_.identity, util.makeErrorHandler('click drag selection handler'));

}


// AppState * $DOM * textureName -> Nothing
// Sets up clicking to set active selections in the appState.
// Will handle clicking on labels as well as the canvas.
function setupClickSelections (appState, $eventTarget) {
    const activeSelection = appState.activeSelection;

    $eventTarget.mousedownAsObservable()
        .switchMap(util.observableFilter(appState.anyMarqueeOn, util.notIdentity))
        .switchMap((down) => $eventTarget.mouseupAsObservable().take(1).map((up) => {
            const downUp = [down, up];
            downUp.ctrl = down.ctrlKey || down.metaKey;
            return downUp;
        }))
        .filter((downUp) =>
            distance(downUp[0].clientX, downUp[0].clientY, downUp[1].clientX, downUp[1].clientY) < 5)
        .switchMap((downUp) => {
            const $target = $(downUp[1].target);
            let targetElementStream;
            // Clicked on existing POI label, return point corresponding to label
            if ($target.hasClass('graph-label') ||
                    $target.parents('.graph-label').length) {

                const elt = $target.hasClass('graph-label') ? downUp[1].target
                    : ($target.parents('.graph-label')[0]);
                const pt = _.values(appState.poi.state.activeLabels)
                    .filter((lbl) => lbl.elt.get(0) === elt)[0];
                targetElementStream = Rx.Observable.return(new VizSlice([pt]));

            // Clicked on canvas, return latest highlighted object
            } else {
                targetElementStream = appState.latestHighlightedObject.take(1);
            }

            return targetElementStream.map((slice) => ({
                clickSlice: slice,
                ctrl: downUp.ctrl
            }));
        }).switchMap((data) => activeSelection.take(1).map(
            (sel) => ({sel: sel, clickSlice: data.clickSlice, ctrl: data.ctrl})))
        .subscribe(appState.clickEvents, util.makeErrorHandler('build click events'));

    appState.clickEvents.do((data) => {
        const {clickSlice, sel, ctrl} = data;

        clickSlice.tagSourceAs('canvas');

        if (ctrl) {
            activeSelection.onNext(sel.removeOrAdd(clickSlice.getPrimaryManualElement()));
        } else {
            activeSelection.onNext(sel.newFrom(clickSlice.separateItems));
        }

    }).subscribe(_.identity, util.makeErrorHandler('setupClickSelections'));
}

// move labels when new highlight or finish noisy rendering section
// (or hide if off)
// AppState * UrlParams * $DOM * Observable [ {dim: int, idx: int} ] * Observable DOM -> ()
function setupLabels (appState, urlParams, $eventTarget, latestHighlightedObject) {

    // TODO: Move this out of JS and into HTML.
    const $labelCont = $('<div>').addClass('graph-label-container');
    $eventTarget.append($labelCont);

    if (urlParams.labels === false) {
        $labelCont.addClass('off');
        return;
    }

    appState.labelsAreEnabled.do((v) => {
        $('html').toggleClass('labelsDisabled', !v);
    }).subscribe(_.identity, util.makeErrorHandler('poi -> html status'));

    appState.cameraChanges.combineLatest(
        appState.vboUpdates,
        appState.isAnimating,
        latestHighlightedObject,
        appState.activeSelection,
        appState.labelsAreEnabled,
        appState.poiIsEnabled,
        (camera, vboUpdates, isAnimating, highlighted, selection, labelsAreEnabled, poiIsEnabled) => ({
            highlighted: highlighted,
            selection: selection,
            labelsAreEnabled: labelsAreEnabled,
            poiIsEnabled: poiIsEnabled,
            doneAnimating: !isAnimating
        })
    ).do((toShow) => {
        renderLabels(appState, $labelCont, toShow.highlighted, toShow.selection, toShow.doneAnimating,
            toShow.labelsAreEnabled, toShow.poiIsEnabled);
    })
    .subscribe(_.identity, util.makeErrorHandler('setuplabels'));
}



// AppState * $DOM * {dim:int, idx:int} * {dim:int, idx:int} -> ()
// Immediately reposition each label based on camera and curPoints buffer
function renderLabels(appState, $labelCont, highlighted, selected, doneAnimating, labelsAreEnabled, poiIsEnabled) {
    debug('rendering labels');

    // TODO: Simplify this so we don't have to have this separate call for getting
    // points.
    const curPoints = appState.renderState.get('hostBuffers').curPoints;
    if (!curPoints) {
        console.warn('renderLabels called before curPoints available');
        return;
    }

    curPoints.take(1)
        .do((curPointsNow) => {
            renderLabelsImmediate(appState, $labelCont, curPointsNow, highlighted, selected, doneAnimating,
                labelsAreEnabled, poiIsEnabled);
        })
        .subscribe(_.identity, util.makeErrorHandler('renderLabels'));
}


/**
 * @param poi
 * @param hits
 * @param idx
 * @param dim
 * @returns {LabelStruct?}
 */
function popUnused (poi, hits, idx, dim) {

    if (_.isEmpty(poi.state.inactiveLabels)) { return; }

    // reuse if already in there
    // TODO make O(1) via reverse index
    for (let i = 0; i < poi.state.inactiveLabels.length; i++) {
        const elt = poi.state.inactiveLabels[i];
        if (elt.idx === idx && elt.dim === dim) {
            poi.state.inactiveLabels.splice(i, 1);
            return elt;
        }
    }

    const topInactiveLabel = poi.state.inactiveLabels.pop();
    if (!hits[poi.cacheKey(topInactiveLabel.idx, topInactiveLabel.dim)]) {
        // reuse unclaimable
        return topInactiveLabel;
    } else {
        // leave for later claimant
        poi.state.inactiveLabels.unshift(topInactiveLabel);
        return;
    }
}


function renderLabelsImmediate (appState, $labelCont, curPoints, highlighted, selected, doneAnimating, labelsAreEnabled, poiIsEnabled) {

    // Trying to handle set highlight/selection, but badly:
    const elementsToExpand = selected.size() > 1 ? [] : selected.getVizSliceElements();
    const elementsToHighlight = highlighted.size() > 1 ? [] : highlighted.getVizSliceElements();

    const {poi} = appState;
    const points = new Float32Array(curPoints.buffer);

    // Get hits from POI if it's enabled, and add highlighted/selected after
    let hits = {};
    if (poiIsEnabled) {
        hits = poi.getActiveApprox(appState.renderState, 'pointHitmapDownsampled', doneAnimating);
    }

    _.each([elementsToHighlight, elementsToExpand], (set) => {
        _.each(set, (labelObj) => {
            hits[poi.cacheKey(labelObj.idx, labelObj.dim)] = labelObj;
        });
    });

    // Initial values for clearing/showing
    let toClear;
    if (poiIsEnabled) {
        toClear = poi.finishApprox(poi.state.activeLabels, poi.state.inactiveLabels,
                            hits, appState.renderState, points);
    } else {
        toClear = poi.finishAll(poi.state.activeLabels, poi.state.inactiveLabels, hits);
    }

    // select label elements (and make active if needed)
    const labelsToShow = _.values(hits)
        .map((hit) => {
            const idx = parseInt(hit.idx);
            const dim = hit.dim;
            const key = poi.cacheKey(idx, dim);

            if (poi.state.activeLabels[key]) {
                // label already on, re-use
                return poi.state.activeLabels[key];
            } else if (_.keys(poi.state.activeLabels).length > poi.MAX_LABELS &&
                _.pluck(elementsToHighlight, 'idx').indexOf(idx) === -1) {
                // no label but too many on screen, don't create new
                return null;
            } else {
                const labelToReuse = popUnused(poi, hits, idx, dim);
                if (labelToReuse) {
                    labelToReuse.idx = idx;
                    labelToReuse.dim = dim;
                    labelToReuse.setIdx({idx: idx, dim: labelToReuse.dim});
                    extendEdgeLabelWithCoords(labelToReuse, hit, appState);
                    return labelToReuse;
                } else {
                    // no label and no pre-allocated elements, create new
                    const freshLabel = poi.genLabel($labelCont, idx, hits[key]);
                    freshLabel.elt.on('click', function () {
                        appState.labelHover.onNext(this);
                    });
                    extendEdgeLabelWithCoords(freshLabel, hit, appState);
                    return freshLabel;
                }
            }
        })
        .filter(_.identity);

    poi.resetActiveLabels(_.object(labelsToShow.map((lbl) => [poi.cacheKey(lbl.idx, lbl.dim), lbl])));

    const newPos = newLabelPositions(appState.renderState, labelsToShow, points);

    effectLabels(toClear, labelsToShow, newPos, elementsToHighlight, elementsToExpand, poi);
}

function newLabelPositions(renderState, labels, points) {

    const camera = renderState.get('camera');
    const cnv = renderState.get('canvas');
    const mtx = camera.getMatrix();

    const newPos = new Float32Array(labels.length * 2);
    for (let i = 0; i < labels.length; i++) {
        // TODO: Treat 2D labels more naturally.
        const dim = labels[i].dim;

        let pos;
        if (dim === 2) {
            pos = camera.canvasCoords(labels[i].x, labels[i].y, cnv, mtx);
        } else {
            const idx = labels[i].idx;
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
    toClear.forEach((lbl) => {
        const rawElt = lbl.elt[0];
        rawElt.style.display = 'none';
    });
    // In case a label made a tooltip
    if (toClear.length) {
        $('body > .label-tooltip').remove();
    }

    // For each label move it
    for (let i = 0; i < labels.length; i++) {
        const elt = labels[i];
        // This is a very frequently occurring loop, so we avoid using
        // jQuery css methods here, which can be expensive.
        //
        // jQuery class methods aren't too slow, so we'll keep using for convenience.
        const rawElt = elt.elt[0];
        rawElt.style.left = String(newPos[2*i]) + 'px';
        rawElt.style.top = String(newPos[2*i + 1]) + 'px';

        elt.elt.removeClass('on');
        elt.elt.removeClass('clicked');

        rawElt.style.display = 'block';
    }

    highlighted.forEach((label) => {
        if (label.idx > -1) {
            const cacheKey = poi.cacheKey(label.idx, label.dim),
                cacheValue = poi.state.activeLabels[cacheKey];
            if (cacheValue === undefined) {
                console.warn('Label cache missing expected key: ' + cacheKey);
            } else {
                cacheValue.elt.toggleClass('on', true);
            }
        }
    });

    clicked.forEach((clickObj) => {
        if (clickObj.idx > -1) {
            const cacheKey = poi.cacheKey(clickObj.idx, clickObj.dim),
                cacheValue = poi.state.activeLabels[cacheKey];
            if (cacheValue === undefined) {
                console.warn('Label cache missing expected key: ' + cacheKey);
            } else {
                poi.state.activeLabels[cacheKey].elt.toggleClass('on', true);
                poi.state.activeLabels[cacheKey].elt.toggleClass('clicked', true);
            }
        }
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
    const camera = renderState.get('camera');
    const cnv = renderState.get('canvas');
    const mtx = camera.getMatrix();

    return camera.canvas2WorldCoords(x, y, cnv, mtx);
}

// RenderState * Observable * Observable
function setupCursor(renderState, renderingScheduler, isAnimating, latestHighlightedObject, activeSelection) {
    const rxPoints = renderState.get('hostBuffers').curPoints;
    const rxSizes = renderState.get('hostBuffers').pointSizes;

    const $cont = $('#highlighted-point-cont');
    const $point = $('.highlighted-point');
    const $center = $('.highlighted-point-center');
    const animating = isAnimating.filter((v) => v === true);
    const notAnimating = isAnimating.filter((v) => v === false);

    animating.subscribe(() => {
        $cont.css({display: 'none'});
    }, util.makeErrorHandler('renderCursor isAnimating'));

    notAnimating.switchMap(() => rxPoints.combineLatest(
            rxSizes,
            latestHighlightedObject,
            activeSelection,
            (p, s, highlights, activeSelection) => {
                return {
                    points: new Float32Array(p.buffer),
                    sizes: new Uint8Array(s.buffer),
                    indices: highlights.getVizSliceElements(),
                    activeSelection
                };
            }
        ).takeUntil(animating)
    ).do(({points, sizes, indices, activeSelection}) => {
        renderCursor(renderState, renderingScheduler, $cont, $point, $center, points, sizes, indices, activeSelection);
    }).subscribe(_.identity, util.makeErrorHandler('setupCursor'));
}

// RenderState * Dom * Dom * Dom * Float32Array * Uint8Array * [Object]
// TODO: Implement the highlighted point CSS as a generic generated (and maybe cached)
// DOM element, not a fixed one that we embed in our graph.html
function renderCursor(renderState, renderingScheduler, $cont, $point, $center, points, sizes, indices, activeSelection) {

    // Don't render cursor unless latest highlighted is a single node
    if (indices.length !== 1 || indices[0].dim !== 1) {
        $cont.css({display: 'none'});
        return;
    }

    const idx = indices[0].idx;

    $cont.css({display: 'block'});

    const camera = renderState.get('camera');
    const cnv = renderState.get('canvas');
    const pixelRatio = camera.pixelRatio;
    const mtx = camera.getMatrix();

    const pos = camera.canvasCoords(points[2 * idx], points[2 * idx + 1], cnv, mtx);
    const scalingFactor = camera.semanticZoom(sizes.length);
    // Clamp like in pointculled shader
    const size = Math.max(5, Math.min(scalingFactor * sizes[idx], 50)) / pixelRatio;
    const offset = size / 2.0;

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
    const csize = parseInt($center.css('width'), 10);
    $center.css({
        left: offset - csize / 2.0,
        top: offset - csize / 2.0
    });

    // Check if the highlighted element is an actively selected one.
    // If it is, add CSS to the cursor circle element to make it look draggable, or reset
    const isDraggable = activeSelection.containsIndexByDim(idx, 1);
    $cont.toggleClass('draggable', isDraggable);

}


function deselectWhenSimulating(appState) {
    appState.simulateOn.do((val) => {
        if (val) {
            appState.activeSelection.onNext(new VizSlice());
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
