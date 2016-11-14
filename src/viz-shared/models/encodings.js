import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';



function makeDefaultEncodings (
        view,
        { defaults = {}, point = {}, edge = {}, encodingsById = {} }) {
}

export function encodings (view, preexistingEncodings = {}) {
    return {
        encodings: {
            id: 'encodings',
            name: 'Encodings',
            options: {
                point: {
                    //color: array $atom([{variant, legend: [color]}])
                },
                edge: {
                    //color: array $atom([{variant, legend: [color]}])
                }
            }
        }
    };
}

export function encoding ({
        id = simpleflake.toJSON(),
        isDefault = false, isBound = true,
        graphType, attribute = '', variation, binning, timeBounds, encodingType, legend}) {
    return {
        id,
        isDefault,      // meaning not from server; deprecate handling when server is cleaner
        graphType,      // 'point' or 'edge'
        attribute,      // str col name (with or without graphType?)
        variation,      // 'quantitative' or 'categorical'
        binning,
        timeBounds,
        encodingType,
        legend
    };
}
