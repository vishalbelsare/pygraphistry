import {
        ref as $ref,
            atom as $atom,
            pathValue as $value,
            pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { Observable } from 'rxjs';
import { SET_PIVOT_VALUE } from '../actions/pivotRow';

export default function pivot(action$, store) {
        return setPivotValue(action$, store);
}
function setPivotValue(action$, store) {
        return action$
            .ofType(SET_PIVOT_VALUE)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, index, target, id }) => {
                    return falcor.set(
                    $value(`[${index}]['value']`, target)
                )
                .progressively()
                }
            ))
            .ignoreElements();
}
