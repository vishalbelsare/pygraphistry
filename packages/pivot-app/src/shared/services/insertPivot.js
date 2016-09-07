import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';

export function insertPivot({ app, id }) {

    const { pivots, pivotsById } = app;
    const index = id === undefined ?
        pivots.length :
        pivots.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
        )) + 1;

    const pivot = createRow(app.cols);
    const pivotRefPath = `pivotsById['${pivot.id}']`;

    pivotsById[pivot.id] = pivot;
    pivots.splice(index, 0, $ref(pivotRefPath));

    return Observable.of({ pivot, index });
}
