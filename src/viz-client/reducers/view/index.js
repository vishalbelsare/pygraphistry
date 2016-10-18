import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Gestures } from 'rxjs-gestures';
import { Subject, Observable } from 'rxjs';

import { withSelectionRect } from './withSelectionRect';

import { moveSelectedNodesLocal } from './moveSelectedNodesLocal';
import { moveSelectedNodesRemote } from './moveSelectedNodesRemote';

import { toNodeSelection } from './toNodeSelection';
import { toPointSelection } from './toPointSelection';
import { toWindowSelection } from './toWindowSelection';

import { mergeActionsAndPoints } from './mergeActionsAndPoints';
import { moveCameraOnPanEvents } from './moveCameraOnPanEvents';
import { pickHighlightAndSelection } from './pickHighlightAndSelection';

import {
    TOUCH_END,
    MOUSE_MOVE,
    TOUCH_MOVE,
    TOUCH_START,
    TOUCH_CANCEL,
    SELECTED_POINT_TOUCH_START,
    SELECTION_RECT_TOUCH_START,
} from 'viz-shared/actions/view';

const labelSampleTexture = 'pointHitmapDownsampled';

export function view(action$, store) {

    action$ = action$.ofType(TOUCH_END,
                             MOUSE_MOVE,
                             TOUCH_MOVE,
                             TOUCH_START,
                             TOUCH_CANCEL,
                             SELECTED_POINT_TOUCH_START,
                             SELECTION_RECT_TOUCH_START);

    const pressDelay = 0;
    const tapTimeout = 350;
    const tapWithinRadius = { x: 10, y: 10 };

    const starts = action$.ofType(TOUCH_START);
    const touchMoves = action$.ofType(TOUCH_MOVE);
    const mouseMoves = action$.ofType(MOUSE_MOVE);
    const pointStarts = action$.ofType(SELECTED_POINT_TOUCH_START);
    const selectionMaskStarts = action$.ofType(SELECTION_RECT_TOUCH_START);

    const moveNodeStarts = mergeActionsAndPoints(pointStarts.filter(isSelectStart), 'start');
    const moveCameraStarts = mergeActionsAndPoints(starts.filter(isCameraPanStart), 'start');
    const selectNodeStarts = mergeActionsAndPoints(starts.filter(isSelectStart), 'start');
    const drawWindowNodeStarts = mergeActionsAndPoints(starts.filter(isDrawWindowStart), 'start');
    const selectionTapStarts = mergeActionsAndPoints(starts.filter(isTapSelectStart), 'start');
    const highlightMoveGesture = mergeActionsAndPoints(mouseMoves.filter(isHighlightMove), 'move');
    const moveOrCloseWindowStarts = mergeActionsAndPoints(selectionMaskStarts.filter(isMoveOrCloseWindowStart), 'start');

    const moveNodesPanGesture = Gestures.pan(moveNodeStarts, {
        delay: pressDelay, radius: tapWithinRadius
    })
    .repeat()
    .mergeMap((pan) => pan
        .stopPropagation()
        .map((point) => (point.type = 'pan') && point)
        .let(withSelectionRect)
        .let(moveSelectedNodesLocal)
        .takeLast(1)
        .let(moveSelectedNodesRemote)
    );

    const moveCameraPanGesture = Gestures.pan(moveCameraStarts, {
        delay: pressDelay, radius: tapWithinRadius
    })
    .map((pan) => pan.map((point) => (point.type = 'pan') && point))
    .repeat();

    const selectNodesPanGesture = Gestures.pan(selectNodeStarts, {
        delay: pressDelay, radius: tapWithinRadius
    })
    .repeat()
    .mergeMap((pan) => pan
        .stopPropagation()
        .map((point) => (point.type = 'pan') && point)
        .let(withSelectionRect)
        .multicast(() => new Subject(), (pan) => pan.merge(pan
            .takeLast(1)
            .let(toPointSelection)
        ))
        .let(toNodeSelection)
    );

    const closeWindowTapGesture = Gestures.tap(moveOrCloseWindowStarts, {
        timeout: tapTimeout, radius: tapWithinRadius
    })
    .repeat()
    .mergeMap((tap) => tap
        .stopPropagation()
        .map((point) => (point.type = 'tap') && point)
        .map((point) => (point.mask = null) || point)
        .let(toWindowSelection)
    );

    const moveWindowPanGesture = Gestures.pan(moveOrCloseWindowStarts, {
        delay: pressDelay, radius: tapWithinRadius
    })
    .repeat()
    .mergeMap((pan) => pan
        .stopPropagation(true)
        .map((point) => (point.type = 'pan') && point)
        .map((point) => {

            const { mask, camera,
                    movementXTotal = 0,
                    movementYTotal = 0 } = point;
            const { width, height,
                    simulationWidth = 1,
                    simulationHeight = 1 } = camera;
            point.mask = {
                tl: {
                    x: mask.tl.x + (movementXTotal * width / simulationWidth),
                    y: mask.tl.y - (movementYTotal * height / simulationHeight)
                },
                br: {
                    x: mask.br.x + (movementXTotal * width / simulationWidth),
                    y: mask.br.y - (movementYTotal * height / simulationHeight)
                }
            };
            return point;
        })
        .let(toWindowSelection)
    );

    const windowNodesPanGesture = Gestures.pan(drawWindowNodeStarts, {
        delay: pressDelay, radius: tapWithinRadius
    })
    .repeat()
    .mergeMap((pan) => pan
        .stopPropagation()
        .map((point) => (point.type = 'pan') && point)
        .let(withSelectionRect)
        .let(toWindowSelection)
    );

    const selectionTapGesture = Gestures.tap(selectionTapStarts, {
        timeout: tapTimeout, radius: tapWithinRadius
    })
    .map((tap) => tap.map((point) => (point.type = 'tap') && point))
    .repeat();

    return Observable.merge(
        moveNodesPanGesture,
        moveWindowPanGesture,
        selectNodesPanGesture,
        closeWindowTapGesture,
        windowNodesPanGesture,
        moveCameraOnPanEvents(starts, moveCameraPanGesture),
        pickHighlightAndSelection(highlightMoveGesture, selectionTapGesture)
    )
    .switchMap(({ falcor, values, invalidations }) => {
        if (invalidations && invalidations.length) {
            falcor.invalidate(...invalidations);
        }
        if (values && values.length) {
            return falcor.set(...values);
        }
        return Observable.empty();
    })
    .ignoreElements();
}

function isTapSelectStart({ simulating }) {
    return !simulating;
}

function isCameraPanStart({ selectionType, selectionMask }) {
    return !selectionType || (
        selectionType === 'window' && selectionMask);
}

function isSelectStart({ simulating, selectionType }) {
    return !simulating && selectionType === 'select';
}

function isDrawWindowStart({ simulating, selectionType, selectionMask }) {
    return !simulating && selectionType === 'window' && !selectionMask;
}

function isMoveOrCloseWindowStart({ simulating, selectionType, selectionMask }) {
    return !simulating && selectionType === 'window' && selectionMask;
}

function isHighlightMove({ event, simulating, selectionType }) {
    return !simulating && !selectionType && event.buttons === 0;
}
