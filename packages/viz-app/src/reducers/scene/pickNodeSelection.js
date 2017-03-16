import { hitTestN } from '../support/picking';
import { Subject, Observable, Scheduler } from 'rxjs';
import { $ref, $atom } from '@graphistry/falcor-json-graph';
import { isAnimating, hitmapUpdates } from 'viz-app/client/legacy';
import { tapDelay, SceneGestures, hitTestNTextures } from '../support';
import { SCENE_MOUSE_MOVE, SCENE_TOUCH_START } from 'viz-app/actions/scene';

export function pickNodeSelection(actions) {

    const selectionStarts = SceneGestures
        .startFromActions(actions
            .ofType(SCENE_TOUCH_START)
            .filter(({ simulating, selectionMask, selectionType }) => (
                !simulating && !selectionMask && !selectionType
            ))
        );

    const highlightMoves = SceneGestures
        .moveFromActions(actions
            .ofType(SCENE_MOUSE_MOVE)
            .filter(({ event, simulating, selectionType }) => (
                !simulating && !selectionType && event.buttons === 0
            ))
        );

    const selectionTaps = SceneGestures
        .tap(selectionStarts, { delay: tapDelay })
        .repeat()
        .mergeMap((tap) => tap
            .map((point) => (point.type = 'tap') && point)
        );

    const movesWithHitmapUpdate = highlightMoves
        .combineLatest(hitmapUpdates, (point) => point);

    const movesWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() || movesWithHitmapUpdate
        );

    const tapsWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() || selectionTaps
        )
        .startWith({ time: 0 });

    const pointsAndElements = movesWhileNotAnimating
        .auditTime(0, Scheduler.animationFrame)
        .map((point) => {
            point.element = hitTestN(
                point.renderState, hitTestNTextures,
                point.x, point.y, 10);
            return point;
        })
        .combineLatest(tapsWhileNotAnimating, (move, tap) => {
            if (move.time > tap.time) {
                return move;
            }
            tap.element = move.element;
            return tap;
        });

    const distinctPointsAndElements = pointsAndElements
        .distinctUntilChanged(filterDistinctPointsAndElements)
        .map((point) => {
            const { element, element: { dim }} = point;
            element.type = dim <=  0 ? 'none' :
                           dim === 1 ? 'point' : 'edge';
            return point;
        });

    return distinctPointsAndElements.map(toValuesAndInvalidations);
}

function filterDistinctPointsAndElements(pointA, pointB) {
    if (!pointA || !pointB) {
        return true;
    } else if (pointA.type !== pointB.type) {
        return false;
    }
    const { element: elementA } = pointA;
    const { element: elementB } = pointB;
    return (
        elementA && elementB &&
        elementA.dim === elementB.dim &&
        elementA.idx === elementB.idx );
}

function toValuesAndInvalidations({ type, falcor, element, highlightEnabled }) {
    return {
        falcor, ...(element.type !== 'none' ?
            selectionValuesAndInvalidations(
                type, element, falcor.getPath(), highlightEnabled
            ) :
            deselectionValuesAndInvalidations(type, element))
    };
}

function selectionValuesAndInvalidations(gesture, { idx, type }, path, highlightEnabled) {
    const inverseType = type === 'point' ? 'edge' : 'point';
    const value = {
        highlight: {
            darken: false,
            [type]: $atom([idx]),
            [inverseType]: $atom([])
        }
    };
    if (gesture === 'tap') {
        value.labels = {
            selection: $ref(path.concat('labelsByType', type, idx))
        };
        value.selection = {
            mask: null,
            [type]: $atom([idx]),
            [inverseType]: $atom([])
        };
    } else if (highlightEnabled) {
        value.labels = {
            highlight: $ref(path.concat('labelsByType', type, idx))
        };
    }
    return { values: [{ json: value }] };
}

function deselectionValuesAndInvalidations(gesture, { idx, type }) {
    const invalidations = [`highlight['edge', 'point']`];
    const value = {
        highlight: {
            darken: false,
            edge: $atom([]),
            point: $atom([]),
        }
    };
    if (gesture === 'tap') {
        invalidations.push(`selection['edge', 'point']`);
        value.labels = { selection: $atom(undefined) };
        value.selection = { edge: $atom([]), point: $atom([]), };
    } else {
        value.labels = { highlight: $atom(undefined) };
    }
    return { invalidations, values: [{ json: value }] };
}
