import {
        ref as $ref,
            atom as $atom,
            pathValue as $value,
            pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { combineReducers } from 'redux'
import { Observable } from 'rxjs';
import { SEARCH_PIVOT } from '../actions/investigation';

export default function investigation(action$, store) {
        return searchPivot(action$, store);
}

export function searchPivot(action$, store) {
        return action$
            .ofType(SEARCH_PIVOT)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, index, target }) => {
                    return falcor.call(`['searchPivot']`, [`${index}`])
                .progressively()
                }
            ))
            .ignoreElements();
}
