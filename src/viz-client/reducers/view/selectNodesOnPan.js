import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { selectAreaOnPan } from './selectAreaOnPan';

export function selectNodesOnPan(selectNodesPanGesture) {
    return selectAreaOnPan(
        selectNodesPanGesture.repeat()
    )
    .map(({ rect, falcor, indexes }) => {
        const values = [];
        const invalidations = [];
        if (!indexes) {
            values.push($value(`selection.rect`, $atom(rect)));
        } else {
            invalidations.push(
                `highlight['edge', 'point']`,
                `selection['edge', 'point']`
            );
            if (indexes.length === 0) {
                values.push(
                    $value(`selection.rect`, null),
                    $value(`selection['edge', 'point'].length`, 0),
                    $value(`highlight['edge', 'point'].length`, 0)
                );
            } else {
                values.push({ json: {
                    highlight: { edge: [], point: [] },
                    selection: { edge: [], point: indexes, rect: null }
                }});
            }
        }
        return { rect, falcor, indexes, values, invalidations };
    });
}

