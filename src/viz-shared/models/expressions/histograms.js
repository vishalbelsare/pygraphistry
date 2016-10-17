import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';

export function histograms(view) {
    return {
        histogramsById: {},
        histograms: {
            length: 0,
            id: 'histograms',
            name: 'Histograms',
            templates: $ref(`${view}.expressionTemplates`),
            controls: [{
                selected: false,
                id: 'toggle-histograms',
                name: 'Histograms',
            }]
        }
    };
}

export function histogram(type, attribute = '', histogramId = simpleflake().toJSON()) {
    return {
        type, /* edge | point */
        attribute,
        id: histogramId,
    };
}
