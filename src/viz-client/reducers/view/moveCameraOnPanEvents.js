import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Subject } from 'rxjs';
import { cameraChanges } from 'viz-client/legacy';

export function moveCameraOnPanEvents(starts, pans) {
    return pans
        .repeat()
        .mergeMap((pan) => pan
            // .filter(({ movementX, movementY }) => !!(movementX || movementY))
            .multicast(createSubject, (pan) => pan.merge(
                pan.takeLast(1).do((point) => {
                    point.buttons = 0;
                })
            ))
            .takeUntil(starts))
        .map((point) => {

            const { movementX = 0, movementY = 0,
                    camera: { center: { x, y } },
                    camera: { center, width, height },
                    simulationWidth = 1, simulationHeight = 1 } = point;

            center.x = x - (movementX * width / simulationWidth);
            center.y = y - (movementY * height / simulationHeight);

            return point;
        })
        .do(({ camera } = {}) => {
            if (camera) {
                cameraChanges.next(camera);
            }
        })
        .filter(({ buttons }) => buttons === 0)
        .map(({ falcor, camera: { center: { x, y } }}) => ({
            falcor, values: [
                $value(`camera.center.x`, x),
                $value(`camera.center.y`, y)
            ]
        }));
}

function createSubject() {
    return new Subject();
}
