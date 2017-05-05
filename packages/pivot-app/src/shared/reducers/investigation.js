import {
    pathValue as $value,
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import {
    SAVE_LAYOUT,
    SEARCH_PIVOT,
    INSERT_PIVOT,
    SPLICE_PIVOT,
    GRAPH_INVESTIGATION,
    DISMISS_ALERT,
    TOGGLE_PIVOTS
} from '../actions/investigation';
import { combineEpics } from 'redux-observable';

export const investigation = combineEpics(
    saveLayout,
    searchPivot,
    insertPivot,
    splicePivot,
    graphInvestigation,
    dismissAlert,
    togglePivots
);

function saveLayout(action$) {
    return action$
        .ofType(SAVE_LAYOUT)
        .switchMap(({ layoutType, falcor }) => falcor.set(
            $value('layout', layoutType),
            $value(`status`, { msgStyle: 'warning', ok: true })
        ))
        .ignoreElements();
}

function graphInvestigation(action$) {
    return action$
        .ofType(GRAPH_INVESTIGATION)
        .groupBy(({ investigationId }) => investigationId)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ investigationId, falcor, length }) => {
                return Observable
                    .range(0, length)
                    .concatMap((index) => Observable.merge(
                        falcor.set($value(`pivots[${index}].status`, { searching: true, ok: true })),
                        falcor.call(`pivots[${index}].searchPivot`, [investigationId])
                    ))
                    .concat(Observable.merge(
                        falcor.call(`graph`),
                        falcor.set(
                            $value(['status'], { etling: true, ok: true }),
                            $value(['pivots', { length }, 'status'], { searching: false, ok: true })
                        )
                    ));
            }
        ))
        .ignoreElements();
}

function dismissAlert(action$) {
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

function searchPivot(action$) {
    return action$
        .ofType(SEARCH_PIVOT)
        .groupBy(({ investigationId }) => investigationId)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ investigationId, pivotId, falcor }) => {
                const { topLevelModel } = falcor._root;
                return topLevelModel.set(
                    $value(`pivotsById['${pivotId}'].enabled`, true),
                    $value(`pivotsById['${pivotId}'].status`, { searching: true, ok: true })
                )
                .concat(topLevelModel.call(`pivotsById['${pivotId}'].searchPivot`, [investigationId]))
                .concat(falcor.set(
                    $value(['url'], null),
                    $value(['status'], { etling: true, ok: true })
                ))
                .concat(falcor.call(`graph`));
            }
        ))
        .ignoreElements();
}

function splicePivot(action$) {
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

function insertPivot(action$) {
    return action$
        .ofType(INSERT_PIVOT)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor, index }) => {
                return falcor.call(`insertPivot`, [index])
            .progressively()
            }
        ))
        .ignoreElements();
}

function togglePivots(action$) {
    return action$
        .ofType(TOGGLE_PIVOTS)
        .mergeMap(({ falcor, indices, enabled }) => {
            return falcor.set(
                $value(`status`, { msgStyle: 'warning', ok: true }),
                $value(['pivots', indices, 'enabled'], enabled),
                $value(['pivots', indices, 'status'], { ok: true })
            );
        })
        .ignoreElements();
}
