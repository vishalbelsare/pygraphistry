import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { simpleflake } from 'simpleflakes';



function makeDefaultEncodings (
        view,
        { defaults = {}, point = {}, edge = {}, encodingsById = {} }) {

    const { defPoint = {}, defEdge = {} } = defaults;

    function makeAtom (obj, aspect) {

        return encoding({
            isDefault: true,    // not from server; deprecate handling when server is cleaner
            isBound: false,
            //attribute: `__${obj}${aspect}`,
            //variation: 'categorical',
            encodingType: `${obj}${aspect}`,
            graphType: obj,
            id: simpleflake(),
            legend: {
                length: 0
            }
        });
    }

    const defs = {
        point: {
            color: defPoint.color || makeAtom('point', 'Color'),
            size: defPoint.size || makeAtom('point', 'Size'),
        },
        edge: {
            color: defEdge.color || makeAtom('edge', 'Color'),
            size: defEdge.color || makeAtom('edge', 'Size')
        }
    };

    return {
        defaults: defs,
        encodingsById: {
            ...encodingsById,
            [defs.point.color.id]: defs.point.color,
            [defs.point.size.id]: defs.point.size,
            [defs.edge.color.id]: defs.edge.color,
            [defs.edge.size.id]: defs.edge.size
        },
        point: {
            //TODO load ref id from preexistingEncodings if available
            color: $ref(`${view}.encodingsById['${defs.point.color.id}']`),
            size: $ref(`${view}.encodingsById['${defs.point.size.id}']`)
        },
        edge: {
            //TODO load ref id from preexistingEncodings if available
            color: $ref(`${view}.encodingsById['${defs.edge.color.id}']`),
            size: $ref(`${view}.encodingsById['${defs.edge.size.id}']`)
        }
    };
}

export function encodings (view, preexistingEncodings = {}) {

    const cascaded = makeDefaultEncodings(view, preexistingEncodings);

    return {
        encodings: {
            id: 'encodings',
            name: 'Encodings',
            ...cascaded,
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
