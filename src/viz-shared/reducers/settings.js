import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable, Scheduler } from 'rxjs';
import { SET_CONTROL_VALUE } from 'viz-shared/actions/settings';

export default function settings(action$, store) {
    return setControlValue(action$, store);
}

function setControlValue(action$, store) {
    return action$
        .ofType(SET_CONTROL_VALUE)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById
            .auditTime(100, Scheduler.async)
            .switchMap(({ stateKey, falcor, state }) => falcor
                .set($value(`state['${stateKey}']`, state))
                .progressively()
            ))
        .ignoreElements();
}
