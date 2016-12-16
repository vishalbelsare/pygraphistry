import {
    pathValue as $pathValue,
} from '@graphistry/falcor-json-graph';
import { combineReducers } from 'redux'
import {
    TOGGLE_PIVOT,
    SET_PIVOT_ATTRIBUTES
} from '../actions/pivotRow';
import { Observable } from 'rxjs';
import _ from 'underscore';
import { combineEpics } from 'redux-observable';

export const pivot = combineEpics(togglePivot, setPivotAttributes);

function togglePivot(action$, store) {
    return action$
        .ofType(TOGGLE_PIVOT)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor, enabled, investigationId }) => {
                const topLevelModel = falcor._root.topLevelModel;
                return Observable.from(
                    topLevelModel.set(
                        $pathValue(['investigationsById', investigationId, 'status'], { msgStyle: 'warning', ok: true })
                    )
                ).concat(
                    falcor.set(
                        $pathValue(`['enabled']`, enabled)
                    )
                );
            }
        ))
        .ignoreElements();
}

function setPivotAttributes(action$, store) {
    return action$
        .ofType(SET_PIVOT_ATTRIBUTES)
        .mergeMap(({falcor, params, investigationId}) => {
            const topLevelModel = falcor._root.topLevelModel;
            return Observable.from(
                topLevelModel.set(
                    $pathValue(['investigationsById', investigationId, 'status'], { msgStyle: 'warning', ok: true })
                )
            ).concat(
                Observable.from(
                    _.map(params, (value, key) =>
                            falcor.set(
                                $pathValue(key.split('.'), value)
                            )
                    )
                ).mergeAll()
            );
        }
        )
        .ignoreElements();
}
