import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';

export function insertPivot({ app, id, investigation }) {

    const { pivotsById } = app;
    const index = id === undefined ?
        investigation.length :
        investigation.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
        )) + 1;

    const pivot = createRow(app.cols);
    const pivotRefPath = `pivotsById['${pivot.id}']`;

    pivotsById[pivot.id] = pivot;
    investigation.splice(index, 0, $ref(pivotRefPath));

    return Observable.of({app, pivot, investigation, index });
}
