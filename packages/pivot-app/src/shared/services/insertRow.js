import { Observable } from 'rxjs';
import { ref as $ref } from 'falcor-json-graph';
import { row as createRow } from '../models';

export function insertRow({ app, id }) {

    const { rows, rowsById } = app;
    const index = id === undefined ?
        rows.length :
        rows.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
        )) + 1;

    const row = createRow(app.cols);
    const rowRefPath = `rowsById['${row.id}']`;

    rowsById[row.id] = row;
    rows.splice(index, 0, $ref(rowRefPath));

    delete app.total;

    return Observable.of({ row, index });
}
