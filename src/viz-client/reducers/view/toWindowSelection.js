import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function toWindowSelection(pan) {
    return pan.map((point) => {
        const { mask } = point;
        point.values = [$value(`selection.mask`, mask)];
        point.invalidations = [`selection['histogramsById']`];
        return point;
    });
}
