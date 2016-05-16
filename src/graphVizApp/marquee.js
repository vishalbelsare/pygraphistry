'use strict';

var debug = require('debug')('graphistry:StreamGL:marquee');
var $     = window.$;
var Rx    = require('rxjs/Rx.KitchenSink');
            require('../rx-jquery-stub');
var _     = require('underscore');
var renderer = require('../renderer.js');
var util     = require('./util.js');



//$DOM * evt -> {x: num, y: num}
function toPoint ($cont, evt) {
    const offset = $cont.offset();
    return {x: evt.pageX - offset.left, y: evt.pageY - offset.top};
}

//{x: num, y: num} * {x: num, y: num} -> {tl: {x: num, y:num}, br: {x: num, y:num}}
function toRect (pointA, pointB) {
    const left    = Math.min(pointA.x, pointB.x);
    const right   = Math.max(pointA.x, pointB.x);

    const top     = Math.min(pointA.y, pointB.y);
    const bottom  = Math.max(pointA.y, pointB.y);

    const pos = {
        tl: {x: left, y: top},
        br: {x: right, y: bottom}
    };
    return pos;
}

//$DOM * Observable bool -> ()
//Add/remove 'on'/'off' class
function maintainContainerStyle($cont, isOn) {
     isOn.subscribe(
        (isOnNow) => {
            debug('marquee toggle', isOnNow);
            if (isOnNow) {
                $cont.removeClass('off').addClass('on');
            } else {
                $cont.removeClass('on') .addClass('off');
            }
        },
        util.makeErrorHandler('$cont on/off'));
}


function effectCanvas(effect) {
    const $simulation = $('#simulation');
    if (effect === 'blur') {
        $simulation.css({
            'filter': 'grayscale(50%) blur(2px)',
            '-webkit-filter': 'grayscale(50%) blur(2px)'
        });
    } else if (effect === 'clear') {
        $simulation.css({
            'filter': '',
            '-webkit-filter': ''
        });
    } else {
        console.error('effectCanvas: unknown effect', effect);
    }
}

function eventPageCoordsInElement (evt, $elt) {
    const offset = $elt.offset();
    return evt.pageX > offset.left &&
        evt.pageX < offset.left + $elt.width() &&
        evt.pageY > offset.top &&
        evt.pageY < offset.top + $elt.height();
}

//$DOM * $DOM * Observable bool * bool * Function -> Observable_1 {top, left, width, height}
//track selections and affect $elt style/class
//
// doAfterSelection takes (appState, rect, $elt, width, height)
//
function marqueeSelections (appState, $cont, $elt, isOn, marqueeState, doAfterSelection) {
    const bounds = isOn.switchMap((isOnNow) => {
        if (!isOnNow) {
            debug('stop listening for marquee selections');
            $('#simulation').css({
                'filter': '',
                '-webkit-filter': ''
            });
            effectCanvas('clear');
            return Rx.Observable.empty();
        }
        debug('start listening for marquee selections');
        let firstRunSinceMousedown;
        return Rx.Observable.fromEvent($cont, 'mousedown')
            .merge(
            Rx.Observable.fromEvent($('#highlighted-point-cont'), 'mousedown')
                .filter((evt) => !eventPageCoordsInElement(evt, $elt)))
            .do((evt) => {
                debug('stopPropagation: marquee down');
                marqueeState.onNext('selecting');
                evt.stopPropagation();
                $('body').addClass('noselect');
                effectCanvas('clear');
                $elt.empty();
                $elt.css({width: 0, height: 0});
                $elt.removeClass('draggable').removeClass('dragging');
                $cont.removeClass('done');
            }).map(toPoint.bind('', $cont))
            .do(() => {
                debug('marquee instance started, listening');
                firstRunSinceMousedown = true;
            }).switchMap((startPoint) => {
                return Rx.Observable.fromEvent($(window.document), 'mousemove')
                    .do((evt) => {
                        debug('stopPropagation: marquee move');
                        evt.stopPropagation();
                    })
                    .inspectTime(1)
                    .map((moveEvt) => toRect(startPoint, toPoint($cont, moveEvt)))
                    .do((rect) => {
                        if (firstRunSinceMousedown) {
                            debug('show marquee instance on first bound calc');
                            $elt.removeClass('off').addClass('on');
                            firstRunSinceMousedown = false;
                        }
                        $elt.css({
                            left: rect.tl.x,
                            top: rect.tl.y,
                            width: rect.br.x - rect.tl.x,
                            height: rect.br.y - rect.tl.y
                        });
                    }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                        .do((evt) => {
                            debug('stopPropagation: marquee up');
                            evt.stopPropagation();
                            debug('drag marquee finished');
                        })
                ).takeLast(1)
                    .do((rect) => {
                        $('body').removeClass('noselect');
                        $elt.addClass('draggable').removeClass('on');
                        $cont.addClass('done');
                        marqueeState.onNext('done');

                        const width = rect.br.x - rect.tl.x;
                        const height = rect.br.y - rect.tl.y;
                        const bw = parseInt($elt.css('border-width'));

                        $elt.css({ // Take border sizes into account when aligning ghost image
                            left: rect.tl.x - bw,
                            top: rect.tl.y - bw,
                            width: width + 2 * bw,
                            height: height + 2 * bw
                        });

                        doAfterSelection(appState, rect, $elt, width, height);

                    });
            });
    });

    return bounds;
}

function blurAndMakeGhost(appState, rect, $elt, width, height) {
    effectCanvas('blur');
    createGhostImg(appState.renderState, rect, $elt, width, height);
}

function toDelta(startPoint, endPoint) {
    return {x: endPoint.x - startPoint.x,
            y: endPoint.y - startPoint.y};
}


function clearMarquee($cont, $elt) {
    $elt.removeClass('dragging').addClass('off');
    $cont.removeClass('done beingdragged');
    $('body').removeClass('noselect');
    effectCanvas('clear');
}


function marqueeDrags (selections, $cont, $elt, marqueeState, takeLast, doAfterDrags) {
    const drags = selections.switchMap((selection) => {
        let firstRunSinceMousedown = true;
        let dragDelta = {x: 0, y: 0};
        return Rx.Observable.fromEvent($elt, 'mousedown')
            .merge(
                Rx.Observable.fromEvent($('#highlighted-point-cont'), 'mousedown')
                .filter((evt) => {
                    return eventPageCoordsInElement(evt, $elt);
                }))
            .do((evt) => {
                debug('stopPropagation: marquee down 2');
                marqueeState.onNext('dragging');
                evt.stopPropagation();
                $('body').addClass('noselect');
                $cont.addClass('beingdragged');
            })
            .map(toPoint.bind('', $cont))
            .switchMap((startPoint) => {
                debug('Start of drag: ', startPoint);
                const observable =  Rx.Observable.fromEvent($(window.document), 'mousemove')
                    .do((evt) => {
                        debug('stopPropagation: marquee move 2');
                        evt.stopPropagation();
                    })
                    .inspectTime(1)
                    .map((evt) => ({start: startPoint, end: toPoint($cont, evt)}))
                    .do((drag) => {
                        dragDelta = toDelta(drag.start, drag.end);

                        // Side effects
                        if (firstRunSinceMousedown) {
                            firstRunSinceMousedown = false;
                            $elt.removeClass('draggable').addClass('dragging');
                        }
                        $elt.css({
                            left: selection.tl.x + dragDelta.x,
                            top: selection.tl.y + dragDelta.y
                        });

                    }).map((diff) => {
                        // Convert back into TL/BR
                        const newTl = {x: selection.tl.x + dragDelta.x,
                                y: selection.tl.y + dragDelta.y};
                        const newBr = {x: selection.br.x + dragDelta.x,
                                y: selection.br.y + dragDelta.y};

                        return {diff: diff,
                                coords: {tl: newTl, br: newBr}
                        };
                    }).takeUntil(Rx.Observable.fromEvent($(window.document), 'mouseup')
                        .do(() => {
                            debug('End of drag');
                            doAfterDrags(marqueeState, selection, dragDelta, $cont, $elt);
                        })
                    );

                if (takeLast) {
                    return observable.takeLast(1);
                } else {
                    return observable;
                }

            });
    });
    return drags;
}

function doAfterDragsMarquee (marqueeState, selection, delta, $cont, $elt) {
    marqueeState.onNext('toggle');
    clearMarquee($cont, $elt);
}

function doAfterDragsBrush (doneDragging, marqueeState, selection, dragDelta) {
    marqueeState.onNext('done');

    selection.tl.x += dragDelta.x;
    selection.tl.y += dragDelta.y;
    selection.br.x += dragDelta.x;
    selection.br.y += dragDelta.y;

    const newTl = {x: selection.tl.x,
        y: selection.tl.y};
    const newBr = {x: selection.br.x,
        y: selection.br.y};

    doneDragging.onNext({tl: newTl, br: newBr});

}


function createElt () {

    return $('<div>')
        .addClass('selection')
        .addClass('off');

}

// Callback takes texture as arg.
function getTextureObservable (renderState, dims) {
    const result = new Rx.ReplaySubject(1);
    renderer.render(renderState, 'marqueeGetTexture', 'marquee', undefined, dims, (success) => {
        if (success) {
            const texture = renderState.get('pixelreads').pointTexture;
            if (!texture) {
                console.error('error reading texture');
            }
            result.onNext(texture);
        } else {
            result.onNext(undefined);
        }
    });
    return result;
}

/**
 * @param {Immutable.Map} renderState - RenderState
 * @param {{tl: {x: number, y: number}, br: {x: number, y: number}}} sel - Optional selection, whole image by default.
 * @param {string} mimeType - optional mime-type specifier. Raw image data by default.
 * @param {Boolean} flipY - whether to flip the image data vertically to escape WebGL orientation.
 * @returns {Rx.ReplaySubject} - contains string of the image data uri
 */
function getGhostImageObservable (renderState, sel, mimeType, flipY) {
    /** @type HTMLCanvasElement */
    const canvas = renderState.get('gl').canvas;
    const pixelRatio = renderState.get('camera').pixelRatio;

    if (flipY === undefined) {
        flipY = true;
    }

    // Default the selection to the entire canvas dimensions.
    if (sel === undefined) {
        sel = {tl: {x: 0, y: 0}, br: {x: canvas.width, y: canvas.height}};
    }

    // We flip Y to support WebGL e.g. the marquee tool for "move nodes" selection highlight.
    const dims = {
        x: Math.floor(sel.tl.x * pixelRatio),
        y: Math.floor(canvas.height - pixelRatio * (sel.tl.y + Math.abs(sel.tl.y - sel.br.y))),
        width: Math.floor(Math.max(1, pixelRatio * Math.abs(sel.tl.x - sel.br.x))),
        height: Math.floor(Math.max(1, pixelRatio * Math.abs(sel.tl.y - sel.br.y)))
    };

    return getTextureObservable(renderState, dims)
        .map((texture) => {
            /** @type HTMLCanvasElement */
            const imgCanvas = document.createElement('canvas');
            imgCanvas.width = dims.width;
            imgCanvas.height = dims.height;
            const ctx = imgCanvas.getContext('2d');

            const imgData = ctx.createImageData(dims.width, dims.height);
            if (texture) {
                imgData.data.set(texture);
            }
            if (flipY) {
                const h = imgData.height,
                    imgInner = imgData.data,
                    rowByteLength = imgData.width * 4,
                    rowSwapBuffer = new Uint8Array(rowByteLength);
                for (let y = 0; y < h / 2; y++) {
                    const rowOffset = y * rowByteLength,
                        flippedRowOffset = (h - y - 1) * rowByteLength,
                        row = new Uint8Array(imgInner.buffer, rowOffset, rowByteLength),
                        rowTarget = new Uint8Array(imgInner.buffer, flippedRowOffset, rowByteLength);
                    rowSwapBuffer.set(rowTarget);
                    rowTarget.set(row);
                    row.set(rowSwapBuffer);
                }
            }
            ctx.putImageData(imgData, 0, 0);
            return mimeType ? imgCanvas.toDataURL(mimeType) : imgCanvas.toDataURL();
        });
}


/**
 *
 * @param {Immutable.Map} renderState
 * @param {{tl: {x: number, y: number}, br: {x: number, y: number}}} sel - the selection area, defaults to the entire canvas, has top-left/bottom-right points.
 * @param $elt - where to put the resulting <img>
 * @param cssWidth - differs from selection because retina/DPP-related?
 * @param cssHeight - differs from selection because retina/DPP-related?
 */
function createGhostImg (renderState, sel, $elt, cssWidth, cssHeight) {
    // TODO kill cssWidth & cssHeight, letting imgCanvas use sel parameter and pixel ratio?
    getGhostImageObservable(renderState, sel)
        .do((dataURL) => {
            const img = new Image();
            img.src = dataURL;

            $(img).css({
                'pointer-events': 'none',
                width: cssWidth,
                height: cssHeight
            });
            $elt.append(img);
        })
        .subscribe(_.identity, (e) => {
            console.error('Error extracting image data', e);
        });
}

function makeTransformer (cfg) {
    return (obj) => {
        return _.object(_.map(obj, (val, key) => {
            return [key, cfg.transform(val)];
        }));
    };
}

function setupContainer ($cont, toggle, cfg, isOn, $elt) {
    cfg = cfg || {};
    cfg.transform = cfg.transform || _.identity;

    // starts false
    toggle.merge(Rx.Observable.return(false)).subscribe(isOn, util.makeErrorHandler('on/off'));

    isOn.subscribe((flag) => {
        if (!flag) {
            clearMarquee($cont, $elt);
        }
    }, util.makeErrorHandler('blur canvas'));

    // Effect scene
    $cont.append($elt);
    maintainContainerStyle($cont, isOn);
}


function initBrush (appState, $cont, toggle, cfg) {
    debug('init brush');
    const $elt = createElt();
    const isOn = new Rx.ReplaySubject(1);
    setupContainer($cont, toggle, cfg, isOn, $elt);
    const transformAll = makeTransformer(cfg);


    const doneDraggingRaw = new Rx.ReplaySubject(1);
    const doneDragging = doneDraggingRaw.debounceTime(50).map(transformAll);

    const bounds = marqueeSelections(appState, $cont, $elt, isOn, appState.brushOn, _.identity);

    const drags = marqueeDrags(bounds, $cont, $elt, appState.brushOn, false, doAfterDragsBrush.bind(null, doneDraggingRaw))
            .map((data) => {
                return data.coords;
            }).map(transformAll);

    let selections = bounds.map(transformAll);

    const allSubject = new Rx.Subject();
    selections = selections.merge(allSubject);
    // Set up server state so initial selection is all.
    allSubject.onNext({all: true});
    toggle.filter((on) => {
        return !(on);
    }).do(() => {
        allSubject.onNext({all: true});
    }).subscribe(_.identity);

    return {
        selections: selections,
        bounds: bounds,
        drags: drags,
        doneDragging: doneDragging,
        $elt: $elt,
        isOn: toggle
    };

}


// AppState * $DOM * Observable bool * ?{?transform: [num, num] -> [num, num]}
//          -> {selections: Observable [ [num, num] ] }
function initMarquee (appState, $cont, toggle, cfg) {
    debug('init marquee');
    const $elt = createElt();
    const isOn = new Rx.ReplaySubject(1);
    setupContainer($cont, toggle, cfg, isOn, $elt);
    const transformAll = makeTransformer(cfg);


    const bounds = marqueeSelections(appState, $cont, $elt, isOn, appState.marqueeOn, blurAndMakeGhost);
    const boundsA = new Rx.ReplaySubject(1);
    bounds.subscribe(boundsA, util.makeErrorHandler('boundsA'));

    const rawDrags = marqueeDrags(boundsA, $cont, $elt, appState.marqueeOn, true, doAfterDragsMarquee);
    const dragsA = new Rx.ReplaySubject(1);
    rawDrags.subscribe(dragsA, util.makeErrorHandler('dragsA'));
    const drags = dragsA
        .map((data) => {
            console.log('Marquee got: ', data);
            return data.diff;
        })
        .map(transformAll);

    const selections = boundsA.map(transformAll);

    return {
        selections: selections,
        bounds: boundsA,
        drags: drags,
        $elt: $elt,
        isOn: toggle
    };

}


module.exports = {
    initMarquee: initMarquee,
    getGhostImageObservable: getGhostImageObservable, // TODO move this to renderer
    initBrush: initBrush
};
