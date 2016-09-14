import {
        ref as $ref,
            atom as $atom,
            pathValue as $value,
            pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { combineReducers } from 'redux'
import { Observable } from 'rxjs';
import { PLAY_INVESTIGATION, SEARCH_PIVOT, INSERT_PIVOT, SPLICE_PIVOT } from '../actions/investigation';
import { combineEpics } from 'redux-observable';

export const investigation = combineEpics(searchPivot, insertPivot, splicePivot, playInvestigation);

export function playInvestigation(action$, store) {
        return action$
            .ofType(PLAY_INVESTIGATION)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, length, target }) => {
                    return Observable
                        .range(0, length)
                        .concatMap((index) => falcor.call(`searchPivot`, [index]))
                        .concat(falcor.call(`play`))
                }
            ))
            .ignoreElements();
}

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

export function splicePivot(action$, store) {
        return action$
            .ofType(SPLICE_PIVOT)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ falcor, index }) => {
                    return falcor.call(`splicePivot`, [index])
                .progressively()
                }
            ))
            .ignoreElements();
}

export function insertPivot(action$, store) {
        return action$
            .ofType(INSERT_PIVOT)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, index, target }) => {
                    return falcor.call(`insertPivot`, [index])
                .progressively()
                }
            ))
            .ignoreElements();
}
