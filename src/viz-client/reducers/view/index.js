import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Gestures } from 'rxjs-gestures';
import { Subject, Observable } from 'rxjs';
import { moveNodesOnPan } from './moveNodesOnPan';
import { selectNodesOnPan } from './selectNodesOnPan';
import { windowNodesOnPan } from './windowNodesOnPan';
import { mergeActionsAndPoints } from './mergeActionsAndPoints';
import { moveCameraOnPanEvents } from './moveCameraOnPanEvents';
import { pickHighlightAndSelection } from './pickHighlightAndSelection';

import {
    TOUCH_END,
    MOUSE_MOVE,
    TOUCH_MOVE,
    TOUCH_START,
    TOUCH_CANCEL,
    POINT_SELECTED,
} from 'viz-shared/actions/view';

const labelSampleTexture = 'pointHitmapDownsampled';

export function view(action$, store) {

    action$ = action$.ofType(TOUCH_END,
                             MOUSE_MOVE,
                             TOUCH_MOVE,
                             TOUCH_START,
                             TOUCH_CANCEL,
                             POINT_SELECTED);

    const pressDelay = 0;
    const tapTimeout = 350;
    const tapWithinRadius = { x: 10, y: 10 };

    const starts = action$.ofType(TOUCH_START);
    const touchMoves = action$.ofType(TOUCH_MOVE);
    const mouseMoves = action$.ofType(MOUSE_MOVE);
    const pointStarts = action$.ofType(POINT_SELECTED);

    const moveNodeStarts = mergeActionsAndPoints(pointStarts.filter(isSelectStart), 'start');
    const moveCameraStarts = mergeActionsAndPoints(starts.filter(isCameraPanStart), 'start');
    const selectNodeStarts = mergeActionsAndPoints(starts.filter(isSelectStart), 'start');
    const windowNodeStarts = mergeActionsAndPoints(starts.filter(isWindowStart), 'start');
    const selectionTapStarts = mergeActionsAndPoints(starts.filter(isTapSelectStart), 'start');
    const highlightMoveGesture = mergeActionsAndPoints(mouseMoves.filter(isHighlightMove), 'move');

    const moveNodesPanGesture = Gestures.pan(moveNodeStarts, {
        delay: pressDelay,
        radius: tapWithinRadius
    })
    .map((pan) => pan
        .map((point) => (point.type = 'pan') && point)
        .stopPropagation());

    const moveCameraPanGesture = Gestures.pan(moveCameraStarts, {
        delay: pressDelay,
        radius: tapWithinRadius
    })
    .map((pan) => pan
        .map((point) => (point.type = 'pan') && point));

    const selectNodesPanGesture = Gestures.pan(selectNodeStarts, {
        delay: pressDelay,
        radius: tapWithinRadius
    })
    .map((pan) => pan
        .map((point) => (point.type = 'pan') && point));

    const windowNodesPanGesture = Gestures.pan(windowNodeStarts, {
        delay: pressDelay,
        radius: tapWithinRadius
    })
    .map((pan) => pan
        .map((point) => (point.type = 'pan') && point));

    const selectionTapGesture = Gestures.tap(selectionTapStarts, {
        timeout: tapTimeout,
        radius: tapWithinRadius
    })
    .map((tap) => tap
        .map((point) => (point.type = 'tap') && point));

    return Observable.merge(
        moveNodesOnPan(moveNodesPanGesture),
        selectNodesOnPan(selectNodesPanGesture),
        windowNodesOnPan(windowNodesPanGesture),
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

function isSelectStart({ simulating, selectionType }) {
    return !simulating && selectionType === 'select';
}

function isWindowStart({ simulating, selectionType }) {
    return !simulating && selectionType === 'window';
}

function isTapSelectStart({ simulating, selectionType }) {
    return !simulating && !selectionType;
}

function isCameraPanStart({ selectionType }) {
    return !selectionType;
}

function isHighlightMove({ event, simulating, selectionType }) {
    return !simulating && !selectionType && event.buttons === 0;
}
