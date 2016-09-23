import {
        ref as $ref,
            atom as $atom,
            pathValue as $value,
            pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import _ from 'underscore';
import { combineReducers } from 'redux';
import { Observable } from 'rxjs';
import { SEARCH_PIVOT, INSERT_PIVOT, SPLICE_PIVOT, PLAY_INVESTIGATION, DISMISS_ALERT } from '../actions/investigation';
import { combineEpics } from 'redux-observable';

export const investigation = combineEpics(searchPivot, insertPivot, splicePivot, playInvestigation, dismissAlert);

export function playInvestigation(action$, store) {
        return action$
            .ofType(PLAY_INVESTIGATION)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ stateKey, falcor, state, length, target }) => {
                    const indices = _.range(0, length)
                    return Observable.from(
                            falcor.call(['pivots', indices, 'searchPivot'])
                        ).concat(
                            falcor.call('play')
                        )
                }
            ))
            .ignoreElements();
}

export function dismissAlert(action$, store) {
    return action$
        .ofType(DISMISS_ALERT)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor}) => {
                return falcor.set($value(`['status']`, null))
                .progressively()
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
                    return Observable.from(falcor.set($value(`pivots['${index}']['enabled']`, true)))
                       .concat(falcor.call(['pivots', index, 'searchPivot'], [index]))
                       .concat(falcor.call(`play`))
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
