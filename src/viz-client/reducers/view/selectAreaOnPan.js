import { Subject } from 'rxjs';
import { curPoints } from 'viz-client/legacy';
import { pointIndexesInRect } from './pointIndexesInRect';

export function selectAreaOnPan(pans) {
    return pans.mergeMap((pan) => pan.map((point) => {

            const rect = point.rect || (point.rect = {});
            const { xOrigin, yOrigin, movementXTotal, movementYTotal } = point;

            rect.w = Math.abs(movementXTotal);
            rect.h = Math.abs(movementYTotal);
            rect.x = Math.min(xOrigin, xOrigin + movementXTotal);
            rect.y = Math.min(yOrigin, yOrigin + movementYTotal);

            return point;
        })
        .multicast(createSubject, (pan) => pan.merge(pan
            .takeLast(1)
            .withLatestFrom(curPoints, ({ rect, camera, renderState, ...point }, { buffer }) => ({
                rect, ...point, indexes: !rect ?
                    new Array(0) : pointIndexesInRect(
                        new Float32Array(buffer),
                        camera.canvas2WorldCoords(rect.y, rect.x, renderState.canvas),
                        camera.canvas2WorldCoords(rect.x + rect.w, rect.y + rect.h, renderState.canvas)
                    )
            })))
        )
    );
}

function createSubject() {
    return new Subject();
}
