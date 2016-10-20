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
            ({ falcor, index, enabled}) => {
                return falcor.set(
                    $pathValue(`['enabled']`, enabled)
                )
                    .progressively()
            }
        ))
        .ignoreElements();
}

function setPivotAttributes(action$, store) {
    return action$
        .ofType(SET_PIVOT_ATTRIBUTES)
        .mergeMap(({falcor, params}) =>
            Observable.from(
                _.map(params, (value, key) => {
                        console.log('setting',  $pathValue(key.split('.'), value))
                    return falcor.set(
                        $pathValue(key.split('.'), value)
                    )
                }
                )
            ).mergeAll()
        )
        .ignoreElements();
}
