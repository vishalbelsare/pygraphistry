import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function camera(view) {
    return {
        camera: {
            zoom: 1,
            width: 1,
            height: 1,
            center: { x: 0, y: 0, z: 0 },
            controls: [
                {
                    selected: false,
                    id: 'zoom-in',
                    name: 'Zoom in'
                },
                {
                    selected: false,
                    id: 'zoom-out',
                    name: 'Zoom out'
                },
                {
                    selected: false,
                    id: 'center-camera',
                    name: 'Center view'
                }
            ]
        }
    };
}
