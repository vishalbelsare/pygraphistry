import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Subject, Observable, Scheduler } from 'rxjs';
import { hitTestN } from 'viz-client/streamGL/picking';
import { isAnimating, hitmapUpdates } from 'viz-client/legacy';

const hitTestNTextures = ['hitmap'];

export function pickHighlightAndSelection(moves, taps) {

    taps = taps.repeat().mergeAll();

    const movePointsWithHitmapUpdate = Observable.combineLatest(
        moves, hitmapUpdates, (move) => move
    );

    const movePointsWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() ||
            movePointsWithHitmapUpdate
        );

    const tapPointsWhileNotAnimating = isAnimating
        .switchMap((animating = true) => animating &&
            Observable.empty() || taps
        )
        .startWith({ time: 0 });

    const pointsAndElements = movePointsWhileNotAnimating
        .auditTime(0, Scheduler.animationFrame)
        .map((point) => {
            point.element = hitTestN(
                point.renderState,
                hitTestNTextures,
                point.x, point.y, 10
            );
            return point;
        })
        .combineLatest(
            tapPointsWhileNotAnimating,
            (move, tap) => {
                if (move.time > tap.time) {
                    return move;
                }
                tap.element = move.element;
                return tap;
            }
        );

    const distinctPointsAndElements = pointsAndElements
        .distinctUntilChanged(filterDistinctPointsAndElements)
        .map((point) => {
            const { element, element: { dim }} = point;
            element.type = dim <=  0 ? 'none' :
                           dim === 1 ? 'point' : 'edge';
            return point;
        });

    return distinctPointsAndElements.map(({ type, falcor, element }) => ({
        falcor, ...(element.type !== 'none' ?
            selectionValuesAndInvalidations({ type, element }) :
            deselectionValuesAndInvalidations({ type, element }))
    }));
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
        elementA.idx === elementB.idx);
}

function selectionValuesAndInvalidations({ type: gesture,
                                           element: { idx, type } }) {
    const values = [
        $value(`highlight['${type}'][0]`, idx),
        $value(`highlight['${type}'].length`, 1),
        $value(`highlight['${
            type === 'point' ? 'edge' : 'point'
        }'].length`, 0),
    ];
    if (gesture === 'tap') {
        values.push(
            $value(`selection['rect']`, null),
            $value(`selection['${type}'][0]`, idx),
            $value(`selection['${type}'].length`, 1),
            $value(`selection['${
                type === 'point' ? 'edge' : 'point'
            }'].length`, 0)
        );
    }
    return { values };
}

function deselectionValuesAndInvalidations({ type: gesture,
                                             element: { idx, type } }) {
    const invalidations = [`highlight['edge', 'point']`];
    const values = [
        $value(`highlight.label`, null),
        $value(`highlight['edge', 'point'].length`, 0)
    ];
    if (gesture === 'tap') {
        invalidations.push(`selection['edge', 'point']`);
        values.push(
            $value(`selection['rect', 'label']`, null),
            $value(`selection['edge', 'point'].length`, 0)
        );
    }
    return { values, invalidations };
}
