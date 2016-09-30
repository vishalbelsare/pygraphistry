import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import { SELECT_TOOLBAR_ITEM } from 'viz-shared/actions/toolbar';

export default function toolbar(action$, store) {
    return selectToolbarItem(action$, store);
}

const reducers = {
    call: callReducer,
    toggle: toggleReducer,
    multiply: multiplyReducer
};

function selectToolbarItem(action$, store) {
    return action$
        .ofType(SELECT_TOOLBAR_ITEM)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.exhaustMap(
            ({ controlType, ...props }) => reducers[controlType]({
                type: controlType, ...props
            }))
        )
        .ignoreElements();
}

function callReducer({ type, value, falcor }) {
    return falcor._clone({ _path: [] }).call(value);
}

// value: $atom(1 / 1.25),
// values: $atom($ref(`${view}.scene.camera.zoom`).value)

function multiplyReducer({ type, value, values, falcor }) {
    falcor = falcor._clone({ _path: [] });
    return Observable
        .from(falcor.getValue(values))
        .mergeMap((state) => falcor
            .set($value(values, Number(state) * value))
        );
}

// value: 0,
// values: $atom([[
//     $value(`${view}.scene.simulating`, $atom(false))
// ], [
//     $value(`${view}.scene.simulating`, $atom(true))
// ]])

function toggleReducer({ type, value, values, falcor }) {

    value  = (value + 1) % values.length;
    values = values[value];

    return Observable.merge(
        falcor.set($value(`value`, value)),
        falcor._clone({ _path: [] }).set(...values)
    );
}
