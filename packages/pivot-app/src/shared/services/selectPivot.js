import { Observable } from 'rxjs';
import { ref as $ref } from 'falcor-json-graph';
import { row as createRow } from '../models';

export function selectPivot({ app, id }) {

    console.log("In Select pivot");
    const { rows, rowsById } = app;
    const index = id === undefined ?
        rows.length :
        rows.findIndex(({ value: ref }) => (
            ref[ref.length - 1] === id
        )) + 1;
    app.urlIndex = index - 1;

    return Observable.of({ app, index });
}
