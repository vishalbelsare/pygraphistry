import {
        ref as $ref,
            atom as $atom,
            pathValue as $value,
            pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { combineReducers } from 'redux'
import { Observable } from 'rxjs';
import { SEARCH_PIVOT, ADD_PIVOT } from '../actions/investigation';
import { combineEpics } from 'redux-observable';

export const investigation = combineEpics(searchPivot, addPivot)

export function searchPivot(action$, store) {
        return action$
            .ofType(SEARCH_PIVOT)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, index, target }) => {
                    return falcor.call(`searchPivot`, [index])
                .progressively()
                }
            ))
            .ignoreElements();
}

export function addPivot(action$, store) {
        return action$
            .ofType(ADD_PIVOT)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, index, target }) => {
                    return falcor.call(`insertPivot`, [index])
                .progressively()
                }
            ))
            .ignoreElements();
}
