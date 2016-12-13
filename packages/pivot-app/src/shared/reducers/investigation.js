import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import _ from 'underscore';
import { combineReducers } from 'redux';
import { Observable } from 'rxjs';
import {
    SEARCH_PIVOT,
    INSERT_PIVOT,
    SPLICE_PIVOT,
    PLAY_INVESTIGATION,
    DISMISS_ALERT,
    TOGGLE_PIVOTS
} from '../actions/investigation';
import { combineEpics } from 'redux-observable';

export const investigation = combineEpics(
    searchPivot,
    insertPivot,
    splicePivot,
    playInvestigation,
    dismissAlert,
    togglePivots
);

function playInvestigation(action$, store) {
        return action$
            .ofType(PLAY_INVESTIGATION)
            .groupBy(({ investigationId }) => investigationId)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ investigationId, falcor, length }) => {
                    return Observable
                        .range(0, length)
                        .concatMap((index) => {
                            return Observable.from(falcor.set($value(['pivots', [index],'status'], { searching: true, ok: true })))
                                .concat(falcor.call(['pivots', [index], 'searchPivot'], [investigationId]));
                        }
                        )
                        .concat(falcor.call(`play`))
                }
            ))
            .ignoreElements();
}

function dismissAlert(action$, store) {
    return action$
        .ofType(DISMISS_ALERT)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor}) => {
                return falcor.set($value(`['status']`, {ok: true}))
                .progressively()
            }
        ))
        .ignoreElements();
}

function searchPivot(action$, store) {
        return action$
            .ofType(SEARCH_PIVOT)
            .groupBy(({ investigationId }) => investigationId)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ investigationId, falcor, index }) => {
                    return Observable.from(falcor.set($value(`pivots['${index}']['enabled']`, true)))
                        // TODO Use pivot id instead of index
                        .concat(falcor.set($value(['pivots', [index], 'status'], { searching: true, ok: true })))
                        .concat(falcor.set($value(['url'], '/html/splash.html')))
                        .concat(falcor.call(['pivots', index, 'searchPivot'], [investigationId]))
                        .concat(falcor.call(`play`));
                }
            ))
            .ignoreElements();
}

function splicePivot(action$, store) {
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

function insertPivot(action$, store) {
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

function togglePivots(action$, store) {
    return action$
        .ofType(TOGGLE_PIVOTS)
        .mergeMap(({falcor, indices, enabled}) =>
            falcor.set(
                $value(['pivots', indices, 'enabled'], enabled)
            )
            .progressively()
        )
        .ignoreElements();
}
