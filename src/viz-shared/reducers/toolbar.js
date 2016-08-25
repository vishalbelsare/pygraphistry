import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { Observable } from 'rxjs';
import { SELECT_TOOLBAR_ITEM } from 'viz-shared/actions/toolbar';

export default function toolbar(action$, store) {
    return selectToolbarItem(action$, store);
}

const reducers = {
    call: callReducer,
    reset: resetReducer,
    toggle: toggleReducer,
    multiply: multiplyReducer
};

function selectToolbarItem(action$, store) {
    return action$
        .ofType(SELECT_TOOLBAR_ITEM)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ controlType, ...props }) => reducers[controlType]({
                type: controlType, ...props
            }))
        )
        .ignoreElements();
}

function callReducer({ type, value, falcor }) {
    return falcor._clone({ _path: [] }).call(value);
}

function resetReducer({ type, value, state, falcor, stateKey }) {
    return falcor.set(
        $value(`state['${stateKey}']`, value)
    ).progressively();
}

function multiplyReducer({ type, value, state, falcor, stateKey }) {
    return falcor.set(
        $value(`state['${stateKey}']`, state * value)
    ).progressively();
}

function toggleReducer({ type, value, values, state, falcor, stateKey }) {

    let idx = -1, val;
    const n = values.length,
          s = JSON.stringify(state);

    while (++idx < n) {
        val = values[idx];
        val = val && val.$type ? val.value : val;
        if (JSON.stringify(val) !== s) {
            val = values[idx];
            break;
        }
    }

    return falcor.set(
        $value(`value`, val),
        $value(`state['${stateKey}']`, val)
    ).progressively();
}
