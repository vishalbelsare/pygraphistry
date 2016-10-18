import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function toNodeSelection(pan) {
    return pan.map((point) => {
        const values = [], invalidations = [];
        const { mask, indexes, selectionType } = point;
        if (!indexes) {
            values.push($value(`selection.mask`, $atom(mask)));
        } else {
            invalidations.push(
                `highlight['edge', 'point']`,
                `selection['edge', 'point']`
            );
            values.push({ json: {
                highlight: { edge: [], point: [] },
                selection: { mask: $atom(mask),
                             type: selectionType,
                             edge: [], point: indexes,
                             controls: { 0: { selected: false }}}
            }});
            // if (indexes.length > 0) {
            //     falcor = falcor.withoutDataSource();
            // }
        }
        point.values = values;
        point.invalidations = invalidations;
        return point;
    });
}

