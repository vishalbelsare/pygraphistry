import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function camera(scene) {
    return {
        camera: {
            zoom: 1,
            center: { x:0, y:0, z:0},
            controls: [{
                id: 'zoom-in',
                name: 'Zoom in',
                type: 'multiply',
                value: $atom(1 / 1.25),
                values: $atom($ref(`${scene}.camera.zoom`).value)
            }, {
                id: 'zoom-out',
                name: 'Zoom out',
                type: 'multiply',
                value: $atom(1.25),
                values: $atom($ref(`${scene}.camera.zoom`).value)
            }, {
                id: 'center-camera',
                name: 'Center view',
                type: 'toggle',
                value: 0,
                values: $atom([[
                    $value(`${scene}.camera.zoom`, $atom(1)),
                    $value(`${scene}.camera.center['x', 'y', 'z']`, $atom(0)),
                ], [
                    $value(`${scene}.camera.zoom`, $atom(1)),
                    $value(`${scene}.camera.center['x', 'y', 'z']`, $atom(0)),
                    $value(`${scene}.camera.controls[2].value`, $atom(0))
                ]])
            }]
        }
    };
}
