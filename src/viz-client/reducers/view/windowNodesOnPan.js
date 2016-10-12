import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { selectNodesOnPan } from './selectNodesOnPan';

export function windowNodesOnPan(...args) {
    return selectNodesOnPan(...args),map(({ rect, values, indexes, ...rest }) => ({
        ...rest,
        values: !indexes || !indexes.length ?
            values:
            values.slice(0, -1).concat({ json: {
                highlight: { edge: [], point: [] },
                selection: { edge: [], point: indexes, rect: $atom(rect) }
            }})
    }))
}
