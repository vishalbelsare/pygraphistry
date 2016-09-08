import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { pivot as createPivot } from '../models';

export function insertPivot({ app, clickedIndex, investigation }) {

    const { pivotsById } = app;

    const pivot = createPivot(app.cols);
    const pivotRefPath = `pivotsById['${pivot.id}']`;

    pivotsById[pivot.id] = pivot;
    const nextIndex = clickedIndex + 1;
    investigation.splice(nextIndex, 0, $ref(pivotRefPath));

    return Observable.of({app, pivot, investigation, nextIndex });
}
