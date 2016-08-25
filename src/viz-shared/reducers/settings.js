import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { Observable } from 'rxjs';
import { SET_CONTROL_VALUE } from 'viz-shared/actions/settings';

export default function settings(action$, store) {
    return setControlValue(action$, store);
}

function setControlValue(action$, store) {
    return action$
        .ofType(SET_CONTROL_VALUE)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ stateKey, falcor, state }) => falcor.set(
                $value(`state['${stateKey}']`, state)
            ).progressively()
        ))
        .ignoreElements();
}
