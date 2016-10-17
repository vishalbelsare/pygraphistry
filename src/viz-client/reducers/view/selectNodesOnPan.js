import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

export function selectNodesOnPan(pans) {
    return pans.mergeMap((pan) => pan
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
                values.push({ json: {
                    highlight: { edge: [], point: [] },
                    selection: { edge: [], point: indexes,
                                 type: undefined, rect: null,
                                 controls: { 0: { selected: false }  ,
                                             1: { selected: false } }}
                }});
                // if (indexes.length > 0) {
                //     falcor = falcor.withoutDataSource();
                // }
            }
            return { rect, falcor, indexes, values, invalidations };
        })
    );
}

