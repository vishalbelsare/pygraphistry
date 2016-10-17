import { Subject } from 'rxjs';
import { curPoints } from 'viz-client/legacy';
import { pointIndexesInRect } from './pointIndexesInRect';

export function selectAreaOnPan(pans) {
    return pans.map((pan) => pan.multicast(createSubject, (pan) => pan.merge(pan
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
        }))));
}

function createSubject() {
    return new Subject();
}
