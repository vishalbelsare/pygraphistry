import { Observable } from 'rxjs';

export function splicePivot({ app, index, id, investigation }) {

    const { pivotsById } = app;

    const pivots = investigation.pivots;
    console.log('Pivots', pivots)
    const pivotRef = pivots[index].value;
    const pivotId = pivotRef[pivotRef.length - 1];
    const pivot = pivotsById[pivotId];

    pivots.splice(index, 1);

    delete pivotsById[pivotId];

    return Observable.of({
        pivot, index, investigation, app, id
    });
}
