import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Subject, Observable } from 'rxjs';
import { Gestures } from 'rxjs-gestures';
import { hitTestN } from '../streamGL/picking';
import { hitmapUpdates, isAnimating } from '../legacy';
import {
    TOUCH_END,
    MOUSE_MOVE,
    TOUCH_MOVE,
    TOUCH_START,
    TOUCH_CANCEL,
} from 'viz-shared/actions/view';

const hitTestNTextures = ['hitmap'];

export function view(action$, store) {
    return Observable.merge(
        highlightOnMouseMove(action$, store)
    )
    .ignoreElements();
}

function highlightOnMouseMove(action$, store) {

    const touchEnd = Gestures.end(action$
        .ofType(TOUCH_END)
        .filter(guardSelectionEvents)
        .pluck('event'));

    const touchStart = Gestures.start(action$
        .ofType(TOUCH_START)
        .filter(guardSelectionEvents)
        .pluck('event'));

    const touchCancel = Gestures.cancel(action$
        .ofType(TOUCH_CANCEL)
        .pluck('event'));

    const mouseMoves = action$
        .ofType(MOUSE_MOVE)
        .filter(guardHighlightEvents);

    const tapPoints = Gestures.tap(
        touchStart,
        450, { x: 10, y: 10 },
        touchEnd, touchCancel
    ).repeat().map((point) => {
        point.type = 'tap';
        return point;
    });

    const movePoints = mouseMoves.multicast(
        () => new Subject(),
        (actions) => Gestures
            .move(actions.pluck('event'))
            .preventDefault().normalize()
            .zip(actions, (point, action) => ({
                point, ...action
            }))
    );

    const movePointsWithHitmapUpdate = Observable.combineLatest(
        movePoints, hitmapUpdates, (move) => move
    );

    const movePointsWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() ||
            movePointsWithHitmapUpdate
        );

    const tapPointsWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() || tapPoints
        )
        .startWith({ time: 0 });

    const pointsAndElements = movePointsWhileNotAnimating
        .auditTime(1)
        .map((pointAndState) => {
            const { point, renderState } = pointAndState;
            pointAndState.element = hitTestN(
                renderState,
                hitTestNTextures,
                point.x, point.y, 10
            );
            return pointAndState;
        })
        .combineLatest(
            tapPointsWhileNotAnimating,
            ({ point: move, ...rest }, tap) => ({
                ...rest, point: move.time > tap.time ? move : tap
            })
        );

    const distinctPointsAndElements = pointsAndElements
        .distinctUntilChanged(filterDistinctPointsAndElements)
        .map((pointAndElement) => {
            const { element, element: { dim }} = pointAndElement;
            element.type = dim <=  0 ? 'none' :
                           dim === 1 ? 'point' : 'edge';
            return pointAndElement;
        });

    return distinctPointsAndElements.switchMap(
        ({ point, falcor, element: { idx, type } }) => {

            const values = type === 'none' ? [
                $value(`highlight.edge.length`, 0),
                $value(`highlight.point.length`, 0),
            ] : [
                $value(`highlight['${type}'].length`, 1),
                $value(`highlight['${type}'][0]`, Number(idx)),
                $value(`highlight['${
                    type === 'point' ? 'edge' : 'point'
                }'].length`, 0),
            ];

            if (point.type === 'tap') {
                values.push(
                    ...(type === 'none' ? [
                        $value(`selection.edge.length`, 0),
                        $value(`selection.point.length`, 0),
                    ] : [
                        $value(`selection['${type}'].length`, 1),
                        $value(`selection['${type}'][0]`, Number(idx)),
                        $value(`selection['${
                            type === 'point' ? 'edge' : 'point'
                        }'].length`, 0),
                    ])
                );
            }

            return falcor.set(...values);
        }
    );
}

function guardSelectionEvents({ simulating, selectionType }) {
    return !simulating && !selectionType;
}

function guardHighlightEvents({ event, simulating, selectionType }) {
    return !simulating && !selectionType && event.buttons === 0;
}

function filterDistinctPointsAndElements(eventA, eventB) {
    const { point: pointA, element: elementA } = eventA;
    const { point: pointB, element: elementB } = eventB;
    return (
        pointA && pointB &&
        elementA && elementB &&
        pointA.type === pointB.type &&
        elementA.dim === elementB.dim &&
        elementA.idx === elementB.idx);
}
