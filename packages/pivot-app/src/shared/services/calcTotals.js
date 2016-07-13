import { Observable } from 'rxjs';

export function calcTotals(input) {

    const { app, row } = input;

    if (row) {
        row.total = Array
            .from(row)
            .reduce((total, col) => total + col.value, 0);
    }

    if (app) {
        app.total = Array
            .from(app.rows)
            .map(({ value: ref }) => (
                app.rowsById[ref[ref.length - 1]]
            ))
            .reduce((total, row) => total + row.total, 0);
    }

    return Observable.of(input);
}
