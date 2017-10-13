import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';

export function encodings(view, preexistingEncodings = {}) {
    return {
        encodings: {
            id: 'encodings',
            name: 'Encodings',
            point: {
                color: null, //variant
                axis: null
            },
            edge: {
                color: null //variant
            },
            options: {
                point: {
                    color: null //array $atom([{variant, label, legend: [color]}])
                },
                edge: {
                    color: null //array $atom([{variant, label, legend: [color]}])
                }
            }
        }
    };
}
