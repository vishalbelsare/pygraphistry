import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export function camera(scene) {
    return {
        camera: {
            zoom: true,
            center: true,
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
                    $value(`${scene}.camera.center`, $atom(true)),
                ], [
                    $value(`${scene}.camera.zoom`, $atom(true)),
                    $value(`${scene}.camera.center`, $atom(false)),
                    $value(`${scene}.camera.controls[2].value`, $atom(0))
                ]])
            }]
        }
    };
}
