import { Observable } from 'rxjs';

export function splicePivot({ app, id }) {

    const { pivots, pivotsById } = app;

    if (pivots.length <= 0) {
        return Observable.empty();
    }

    const index = Math.max(0, Math.min(pivots.length - 1, pivots.findIndex(({ value: ref }) => (
        ref[ref.length - 1] === id
    ))));

    const pivotRef = pivots[index].value;
    const pivotId = pivotRef[pivotRef.length - 1];
    const pivot = pivotsById[pivotId];

    pivots.splice(index, 1);

    delete app.total;
    delete pivotsById[pivotId];

    return Observable.of({
        pivot, index
    });
}
