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
        encodingsById: {},
        encodings: {
            length: 0,
            id: 'encodings',
            name: 'Encodings'
        }
    };
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
