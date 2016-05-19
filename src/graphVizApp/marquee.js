'use strict';

var debug = require('debug')('graphistry:StreamGL:marquee');
var $     = window.$;
var Rx    = require('rxjs/Rx.KitchenSink');
            require('../rx-jquery-stub');
var _     = require('underscore');
var renderer = require('../renderer.js');
var util     = require('./util.js');
var Stately  = require('stately.js');

//////////////////////////////////////////////////////////////////////////////
// Marquee State Machine Definition
//////////////////////////////////////////////////////////////////////////////

const marqueeStateMachineDesc = {
    OFF: {
        enable: /* => */ 'INIT'
    },

    INIT: {
        down: /* => */ 'DOWN_SELECT'
    },

    DOWN_SELECT: {
        up: /* => */ 'RESET_CLICK',
        move: /* => */ 'DRAWING'
    },

    RESET_CLICK: {
        reset: /* => */ 'INIT'
    },

    DRAWING: {
        move: /* => */ 'DRAWING',
        up: /* => */ 'DONE_DRAWING'
    },

    DONE_DRAWING: {
        reset: /* => */ 'INIT',
        waitForDrag: /* => */ 'MARQUEE_STATIONARY'
    },

    MARQUEE_STATIONARY: {
        downOffBox: /* => */ 'DOWN_SELECT',
        downOnBox: /* => */ 'DOWN_MARQUEE'
    },

    DOWN_MARQUEE: {
        up: /* => */ 'MARQUEE_STATIONARY',
        move: /* => */ 'DRAGGING_MARQUEE'
    },

    DRAGGING_MARQUEE: {
        move: /* => */ 'DRAGGING_MARQUEE',
        up: /* => */ 'DONE_DRAGGING'
    },

    DONE_DRAGGING: {
        waitForDrag: /* => */ 'MARQUEE_STATIONARY'
    }
};

// Add to each a transition for disable to reset to "OFF" state
_.each(marqueeStateMachineDesc, (obj) => {
    obj.disable = 'OFF';
});

//////////////////////////////////////////////////////////////////////////////
// Marquee State Machine Side Effects
//////////////////////////////////////////////////////////////////////////////

// TODO: Handle pageX + Offset
function moveElementToRect ($elt, rect) {
    // TODO: Use translate, not CSS left/top
    $elt.css({
        left: rect.tl.x,
        top: rect.tl.y,
        width: rect.br.x - rect.tl.x,
        height: rect.br.y - rect.tl.y
    });
}

function enableMarqueeVisuals ($elt, $cont) {
    $elt.removeClass('off').addClass('on');
    $cont.removeClass('off').addClass('on');
    $cont.addClass('noselect');
}

function resetMarqueeVisuals ($elt, $cont) {
    $elt.empty();
    $elt.css({width: 0, height: 0});
    $elt.removeClass('draggable').removeClass('dragging');
    $cont.removeClass('done');
}

function disableMarqueeVisuals ($elt, $cont) {
    $elt.removeClass('on').addClass('off');
    $cont.removeClass('on').addClass('off');
    $cont.removeClass('noselect');
}

function makeNewShiftedRect (rect, dx, dy) {
    const newRect = {
        tl: {
            x: rect.tl.x + dx,
            y: rect.tl.y + dy
        },
        br: {
            x: rect.br.x + dx,
            y: rect.br.y + dy
        }
    };
    return newRect;
}

function makeEmptyRect() {
    return {
        tl: {x: 0, y: 0},
        br: {x: 0, y: 0}
    };
}

const sideEffectFunctions = {
    OFF: (machine, evt) => {
        // Hide everything, change cursor back to normal
        resetMarqueeVisuals(machine.marqueeState.$elt, machine.marqueeState.$cont);
        disableMarqueeVisuals(machine.marqueeState.$elt, machine.marqueeState.$cont);
    },

    INIT: (machine, evt) => {
        // Set cursor to crosshair
        machine.marqueeState.lastRect = makeEmptyRect();
        enableMarqueeVisuals(machine.marqueeState.$elt, machine.marqueeState.$cont);
        resetMarqueeVisuals(machine.marqueeState.$elt, machine.marqueeState.$cont);
    },

    RESET_CLICK: (machine, evt) => {
        machine.marqueeState.lastRect = makeEmptyRect();
        machine.marqueeState.selectObservable.onNext(machine.marqueeState);
        machine.events.onNext({evt: {}, name: 'reset'});
    },

    DOWN_SELECT: (machine, evt) => {
        // Set Marquee State for down position
        machine.marqueeState.downPos = toPoint(machine.marqueeState.$cont, evt);
    },

    DRAWING: (machine, evt) => {
        // Update marquee state for last position
        // Draw rectangle to match
        machine.marqueeState.movePos = toPoint(machine.marqueeState.$cont, evt);

        const rect = toRect(machine.marqueeState.downPos, machine.marqueeState.movePos);
        machine.marqueeState.lastRect = rect;
        moveElementToRect(machine.marqueeState.$elt, rect);
    },

    DONE_DRAWING: (machine, evt) => {
        // Set Marquee State for up position
        machine.marqueeState.upPos = toPoint(machine.marqueeState.$cont, evt);

        // Run select handler
        machine.marqueeState.selectObservable.onNext(machine.marqueeState);

        // Either reset or drag
        if (machine.marqueeState.canDrag) {
            machine.events.onNext({evt: {}, name: 'waitForDrag'});
        } else {
            machine.events.onNext({evt: {}, name: 'reset'});
        }
    },

    MARQUEE_STATIONARY: (machine, evt) => {
        machine.marqueeState.stationaryRect = machine.marqueeState.lastRect;
    },

    DOWN_MARQUEE: (machine, evt) => {
        machine.marqueeState.dragDownPos = toPoint(machine.marqueeState.$cont, evt);
    },

    DRAGGING_MARQUEE: (machine, evt) => {
        machine.marqueeState.dragMovePos = toPoint(machine.marqueeState.$cont, evt);
        const dx = machine.marqueeState.dragMovePos.x - machine.marqueeState.dragDownPos.x;
        const dy = machine.marqueeState.dragMovePos.y - machine.marqueeState.dragDownPos.y;
        const newRect = makeNewShiftedRect(machine.marqueeState.stationaryRect, dx, dy);
        machine.marqueeState.lastRect = newRect;
        moveElementToRect(machine.marqueeState.$elt, newRect);
        machine.marqueeState.dragObservable.onNext(machine.marqueeState);
    },

    DONE_DRAGGING: (machine, evt) => {
        machine.marqueeState.selectObservable.onNext(machine.marqueeState);
        machine.events.onNext({evt: {}, name: 'waitForDrag'});
    }
};


//////////////////////////////////////////////////////////////////////////////
// UI Hookup
//////////////////////////////////////////////////////////////////////////////

function makeStateMachine (options={}) {
    const {selectObservable = new Rx.ReplaySubject(1), dragObservable = new Rx.ReplaySubject(1),
        canDrag = false, $elt, $cont
    } = options;

    const machine = new Stately(marqueeStateMachineDesc, 'OFF');

    // Attach options to the machine so we can access them later.
    // TODO FIXME: Is this the right model to use here?
    // Is there a way to make this more reasonable, instead of passing data
    // by attaching it to this?
    machine.marqueeState = {selectObservable, dragObservable, canDrag, $elt, $cont};

    return machine;
}

function activateMarqueeStateMachine (machine) {

    const sim = $('#simulation');
    const $cont = machine.marqueeState.$cont;

    // Setup handlers from UI interactions to events.
    // These ultimately feed into a stream called events, which consist of strings

    const events = new Rx.ReplaySubject(1);
    machine.events = events; // TODO: Can we remove this attachment?

    const downEvents = Rx.Observable.fromEvent(document, 'mousedown')
        .merge(Rx.Observable.fromEvent($cont, 'mousedown'))
        .map(evt => ({evt, name: 'down'}));

    // We listen to document in case we mouse over open labels
    const moveEvents = Rx.Observable.fromEvent(document, 'mousemove')
        .merge(Rx.Observable.fromEvent($cont, 'mousemove'))
        .map(evt => ({evt, name: 'move'}));

    const downOnBoxEvents = Rx.Observable.fromEvent(document, 'mousedown')
        .filter((evt) => {
            if (!machine.marqueeState.lastRect) {
                return false;
            }
            const {tl, br} = machine.marqueeState.lastRect;
            const {pageX: x, pageY: y} = evt;
            return (x > tl.x && y > tl.y && x < br.x && y < br.y);
        })
        .map(evt => ({evt, name: 'downOnBox'}));

    const downOffBoxEvents = Rx.Observable.fromEvent(document, 'mousedown')
        .filter((evt) => {
            if (!machine.marqueeState.lastRect) {
                return false;
            }
            const {tl, br} = machine.marqueeState.lastRect;
            const {pageX: x, pageY: y} = evt;
            return !(x > tl.x && y > tl.y && x < br.x && y < br.y);
        })
        .map(evt => ({evt, name: 'downOffBox'}));

    // We make a handler here for mouseouts of JUST the document.
    // That is, a mouseout event from a child of the document won't trigger this,
    // only someone mouseing out of the window
    // Technique taken from http://stackoverflow.com/questions/923299/how-can-i-detect-when-the-mouse-leaves-the-window
    const mouseOutOfWindowStream = Rx.Observable.fromEvent(document, 'mouseout')
        .filter((e=window.event) => {
            const from = e.relatedTarget || e.toElement;
            return (!from || from.nodeName === 'HTML');
        });

    const upEvents = Rx.Observable.fromEvent(document, 'mouseup')
        .merge(mouseOutOfWindowStream)
        .map(evt => ({evt, name: 'up'}));

    Rx.Observable.merge(downEvents, moveEvents, upEvents, downOnBoxEvents, downOffBoxEvents)
        .subscribe(events, util.makeErrorHandler('handle events for marquee'));

    // Update State Machine
    events.map(({name, evt}) => {
        // Because there's no easy way to hook into stately to find out if
        // a state change happened on last event, we have a little shim here
        // to check.
        const stateChanged = _.contains(machine.getMachineEvents(), name);
        return { machine: machine[name](), evt, stateChanged };
    }).map(({machine, evt, stateChanged}) => {
        return { currentState: machine.getMachineState(), evt, machine, stateChanged }
    }).subscribe(({machine, currentState, evt, stateChanged}) => {
        // Only attempt side effects when transition occurs
        if (stateChanged && _.isFunction(sideEffectFunctions[currentState])) {
            sideEffectFunctions[currentState](machine, evt);
        }
    }, util.makeErrorHandler('Handling marquee state machine'));

    const enable = function () { events.onNext({evt: {}, name: 'enable'}) };
    const disable = function () { events.onNext({evt: {}, name: 'disable'}) };
    return {enable, disable};
}

function createSelectionMarquee ($cont) {
    const $elt = createElt();
    $cont.append($elt);

    const machineOptions = {
        selectObservable: new Rx.ReplaySubject(1),
        canDrag: false, $elt, $cont
    };

    const machine = makeStateMachine(machineOptions);
    const {enable, disable} = activateMarqueeStateMachine(machine);

    return {
        enable, disable, selections: machineOptions.selectObservable, $elt
    };
}

function createDraggableMarquee ($cont) {
    const $elt = createElt();
    $cont.append($elt);

    const machineOptions = {
        selectObservable: new Rx.ReplaySubject(1),
        dragObservable: new Rx.ReplaySubject(1),
        canDrag: true, $elt, $cont
    };

    const machine = makeStateMachine(machineOptions);
    const {enable, disable} = activateMarqueeStateMachine(machine);

    return {
        enable, disable, selections: machineOptions.selectObservable,
        drags: machineOptions.dragObservable, $elt
    };
}

//////////////////////////////////////////////////////////////////////////////
// Old Code
//////////////////////////////////////////////////////////////////////////////

//$DOM * evt -> {x: num, y: num}
function toPoint ($cont, evt) {
    var offset = $cont.offset();
    return {x: evt.pageX - offset.left, y: evt.pageY - offset.top};
}

//{x: num, y: num} * {x: num, y: num} -> {tl: {x: num, y:num}, br: {x: num, y:num}}
function toRect (pointA, pointB) {
    var left    = Math.min(pointA.x, pointB.x);
    var right   = Math.max(pointA.x, pointB.x);

    var top     = Math.min(pointA.y, pointB.y);
    var bottom  = Math.max(pointA.y, pointB.y);

    var pos = {
        tl: {x: left, y: top},
        br: {x: right, y: bottom}
    };
    return pos;
}


function createElt() {

    return $('<div>')
        .addClass('selection')
        .addClass('off');

}

// Callback takes texture as arg.
function getTextureObservable(renderState, dims) {
    var result = new Rx.ReplaySubject(1);
    renderer.render(renderState, 'marqueeGetTexture', 'marquee', undefined, dims, function (success) {
        if (success) {
            var texture = renderState.get('pixelreads').pointTexture;
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
function getGhostImageObservable(renderState, sel, mimeType, flipY) {
    /** @type HTMLCanvasElement */
    var canvas = renderState.get('gl').canvas;
    var pixelRatio = renderState.get('camera').pixelRatio;

    if (flipY === undefined) {
        flipY = true;
    }

    // Default the selection to the entire canvas dimensions.
    if (sel === undefined) {
        sel = {tl: {x: 0, y: 0}, br: {x: canvas.width, y: canvas.height}};
    }

    // We flip Y to support WebGL e.g. the marquee tool for "move nodes" selection highlight.
    var dims = {
        x: Math.floor(sel.tl.x * pixelRatio),
        y: Math.floor(canvas.height - pixelRatio * (sel.tl.y + Math.abs(sel.tl.y - sel.br.y))),
        width: Math.floor(Math.max(1, pixelRatio * Math.abs(sel.tl.x - sel.br.x))),
        height: Math.floor(Math.max(1, pixelRatio * Math.abs(sel.tl.y - sel.br.y)))
    };

    return getTextureObservable(renderState, dims)
        .map(function (texture) {
            /** @type HTMLCanvasElement */
            var imgCanvas = document.createElement('canvas');
            imgCanvas.width = dims.width;
            imgCanvas.height = dims.height;
            var ctx = imgCanvas.getContext('2d');

            var imgData = ctx.createImageData(dims.width, dims.height);
            if (texture) {
                imgData.data.set(texture);
            }
            if (flipY) {
                var h = imgData.height,
                    imgInner = imgData.data,
                    rowByteLength = imgData.width * 4,
                    rowSwapBuffer = new Uint8Array(rowByteLength);
                for (var y = 0; y < h / 2; y++) {
                    var rowOffset = y * rowByteLength,
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
function createGhostImg(renderState, sel, $elt, cssWidth, cssHeight) {
    // TODO kill cssWidth & cssHeight, letting imgCanvas use sel parameter and pixel ratio?
    getGhostImageObservable(renderState, sel)
        .do(function (dataURL) {
            var img = new Image();
            img.src = dataURL;

            $(img).css({
                'pointer-events': 'none',
                width: cssWidth,
                height: cssHeight
            });
            $elt.append(img);
        })
        .subscribe(_.identity, function (e) {
            console.error('Error extracting image data', e);
        });
}


module.exports = {
    getGhostImageObservable, // TODO move this to renderer
    createSelectionMarquee,
    createDraggableMarquee
};
