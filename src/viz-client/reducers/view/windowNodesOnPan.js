import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { selectNodesOnPan } from './selectNodesOnPan';

export function windowNodesOnPan(...args) {
    return selectNodesOnPan(...args).map(({ rect, values, indexes, ...rest }) => {
        if (indexes) {
            const [{ json }] = values;
            json.selection.type = 'window';
            json.selection.rect = $atom(rect);
        }
        return { rect, values, indexes, ...rest };
    });
}
