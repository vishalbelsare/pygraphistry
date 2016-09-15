import { Gestures } from 'rxjs-gestures';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import {
    CAMERA_MOVE,
    LAYOUT_SCENE,
    CENTER_CAMERA,
} from 'viz-shared/actions/scene';

export default function scene(action$, store) {
    return Observable.merge(
        moveCamera(action$.ofType(CAMERA_MOVE), store),
        layoutScene(action$.ofType(LAYOUT_SCENE), store),
        centerCamera(action$.ofType(CENTER_CAMERA), store)
    )
    .ignoreElements();
}

function moveCamera(action$) {
    return action$.mergeMap(({ event: startEvent, falcor }) => {
        return Observable
            .from(falcor.getValue(['camera', 'center']))
            .mergeMap(({ x, y }) => {
                return Gestures
                    .pan(Observable.of(startEvent))
                    .mergeMap((pan) => {
                        return pan
                            .decelerate()
                            .map(({ deltaXTotal, deltaYTotal }) => ({
                                x: x - deltaXTotal,
                                y: y - deltaYTotal
                            }));
                    });
            })
            .switchMap((center) => {
                return falcor.set({
                    json: { camera: { center: $atom(center) }}
                }).progressively()
            });
        });
}

function layoutScene(action$) {
    // return Observable.never();
    return action$
        .auditTime(40)
        .exhaustMap(({ falcor, simulating }) =>
            falcor.call('layout', [simulating])
        );
}

function centerCamera(action$) {
    return action$
        .auditTime(0)
        .exhaustMap(({ falcor, center, camera, points, cameraInstance }) => {

            if (!center) {
                return falcor
                    .set({ json: { camera: {
                        width: cameraInstance.width,
                        height: cameraInstance.height,
                        center: $atom(cameraInstance.center)
                    }}})
                    .progressively();
            }

            return points
                .take(1)
                .map(({ buffer }) => new Float32Array(buffer))
                .mergeMap((points) => {

                    // Don't attempt to center when nothing is on screen
                    if (points.length < 1) {
                        return Observable.of({
                            width: cameraInstance.width,
                            height: cameraInstance.height,
                            center: $atom(cameraInstance.center)
                        });
                    }

                    const { top, left, right, bottom } = getBoundingBox(points);

                    cameraInstance.centerOn(left, right, bottom * -1, top * -1);

                    return Observable.of({
                        width: cameraInstance.width,
                        height: cameraInstance.height,
                        center: $atom(cameraInstance.center)
                    });
                })
                .mergeMap((dimensions) => falcor
                    .set({ json: { camera: dimensions }})
                    .progressively()
                );
        });
}

function getBoundingBox(points) {

    const len = points.length;

    let index = -2,
        top = Number.MAX_VALUE, left = Number.MAX_VALUE,
        right = Number.MIN_VALUE, bottom = Number.MIN_VALUE;

    while ((index += 2) < len) {
        const x = points[index];
        const y = points[index + 1];
        top = y < top ? y : top;
        left = x < left ? x : left;
        right = x > right ? x : right;
        bottom = y > bottom ? y : bottom;
    }

    if (len === 1) {
        top -= 0.1;
        left -= 0.1;
        right += 0.1;
        bottom += 0.1;
    }

    return { top, left, right, bottom };
}
