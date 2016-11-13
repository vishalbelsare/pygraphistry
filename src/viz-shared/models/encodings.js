import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';

// TODO PAUL: How is this used vs the singular encoding model?
// Is this necessary?
export function encodings (view) {
    return {
        encodings: {
            id: 'encodings',
            name: 'Encodings',

            //current
            points: {
                //'color', 'size' -> Encoding
            },
            edges: {
                //'color', 'size' -> Encoding
            }

            //in case we want a fancier encodings panel w/ presets
            encodingsById: {},
            length: 0,
        }
    }
}

// Variation can be 'quantitative' or 'categorical'
export function encoding ({graphType, attribute = '', id = '', variation, binning, timeBounds, encodingType, legend}) {
    return {
        id,
        graphType,
        attribute,
        variation,
        binning,
        timeBounds,
        encodingType,
        legend
    };
}
