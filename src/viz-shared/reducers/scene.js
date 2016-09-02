import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import { LAYOUT_SCENE, LAYOUT_CAMERA } from 'viz-shared/actions/scene';

export default function scene(action$, store) {
    return Observable.merge(
        layoutScene(action$.ofType(LAYOUT_SCENE), store),
        layoutCamera(action$.ofType(LAYOUT_CAMERA), store)
    );
}

function layoutScene(action$) {
    return action$
        .auditTime(40)
        .exhaustMap(({ falcor, simulating }) =>
            falcor.call('layout', [simulating])
        )
        .ignoreElements()
}

function layoutCamera(action$) {
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
                    .set({json: { camera: dimensions }})
                    .progressively()
                );
        })
        .ignoreElements();
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
