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
            .withLatestFrom(curPoints, (point, { buffer }) => {
                const { rect, camera, falcor, renderState } = point;
                const { canvas } = renderState;
                const indexes = !rect || (
                    rect.w === 0 || rect.h === 0) ? [] :
                    pointIndexesInRect(
                        new Float32Array(buffer),
                        camera.canvas2WorldCoords(rect.x, rect.y, canvas),
                        camera.canvas2WorldCoords(rect.x + rect.w, rect.y + rect.h, canvas)
                    );
                point.indexes = indexes;
                return point;
            }))
        )
    );
}

function createSubject() {
    return new Subject();
}
