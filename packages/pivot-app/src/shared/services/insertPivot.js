import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { row as createRow } from '../models';

export function insertPivot({ app, index, id, investigation }) {

    const { pivotsById } = app;

    const pivot = createRow(app.cols);
    const pivotRefPath = `pivotsById['${pivot.id}']`;

    pivotsById[pivot.id] = pivot;
    investigation.splice(index + 1, 0, $ref(pivotRefPath));

    return Observable.of({app, pivot, investigation, index:index + 1 });
}
