import { Observable } from 'rxjs';

export function spliceRow({ app, id }) {

    const { rows, rowsById } = app;

    if (rows.length <= 0) {
        return Observable.empty();
    }

    const index = Math.max(0, Math.min(rows.length - 1, rows.findIndex(({ value: ref }) => (
        ref[ref.length - 1] === id
    ))));

    const rowRef = rows[index].value;
    const rowId = rowRef[rowRef.length - 1];
    const row = rowsById[rowId];

    rows.splice(index, 1);

    delete app.total;
    delete rowsById[rowId];

    return Observable.of({
        row, index
    });
}
