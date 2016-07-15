import { Observable } from 'rxjs';

export function splicePivot({ app, index, id, investigation }) {

    const { pivotsById } = app;

    const pivotRef = investigation[index].value;
    const pivotId = pivotRef[pivotRef.length - 1];
    const pivot = pivotsById[pivotId];

    investigation.splice(index, 1);

    delete pivotsById[pivotId];

    return Observable.of({
        pivot, index, investigation, app, id
    });
}
