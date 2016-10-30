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
        id: histogramId,
        type, /* edge | point */
        attribute

        /*
        min: number,
        max: number,
        length: number,
        width: number,
        dataType: string,

        0: {
            max: number,
            min: number,
            total: number,
            isSingular: bool,
            representative: number
        }*/
    };
}
