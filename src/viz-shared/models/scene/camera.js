import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

export function camera(scene) {
    return {
        camera: {
            center: $atom({ x: 0.5, y: 0.5 }),
            width: 1, height: 1, zoom: 1,
            edges: { scaling: 1, opacity: 1 },
            points: { scaling: 1, opacity: 1 },
            controls: [{
                id: 'zoom-in',
                name: 'Zoom in',
                type: 'multiply',
                stateKey: 'zoom',
                state: $ref(`${scene}.camera`),
                value: $atom(1 / 1.25)
            }, {
                id: 'zoom-out',
                name: 'Zoom out',
                type: 'multiply',
                stateKey: 'zoom',
                state: $ref(`${scene}.camera`),
                value: $atom(1.25)
            }, {
                id: 'center-camera',
                name: 'Center view',
                type: 'reset',
                stateKey: 'center',
                state: $ref(`${scene}.camera`),
                value: $atom([$atom({ x: 0.5, y: 0.5 })])
            }],
            options: {
                id: 'appearance',
                name: 'Appearance',
                length: 4, ...[{
                    id: 'point-size',
                    type: 'discrete',
                    name: 'Point Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    stateKey: 'scaling',
                    state: $ref(`${scene}.camera.points`)
                }, {
                    id: 'edge-size',
                    type: 'discrete',
                    name: 'Edge Size',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'log'
                    },
                    stateKey: 'scaling',
                    state: $ref(`${scene}.camera.edges`)
                }, {
                    id: 'point-opacity',
                    type: 'discrete',
                    name: 'Point Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${scene}.camera.points`)
                }, {
                    id: 'edge-opacity',
                    type: 'discrete',
                    name: 'Edge Opacity',
                    props: {
                        min: 1, max: 100,
                        step: 1, scale: 'percent'
                    },
                    stateKey: 'opacity',
                    state: $ref(`${scene}.camera.edges`)
                }]
            }
        }
    };
}
