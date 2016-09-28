import {
    pathValue as $pathValue,
} from '@graphistry/falcor-json-graph';
import { combineReducers } from 'redux'
import {
    TOGGLE_PIVOT,
    SET_PIVOT_PARAMETERS
} from '../actions/pivotRow';
import { Observable } from 'rxjs';
import _ from 'underscore';
import { combineEpics } from 'redux-observable';

export const pivot = combineEpics(togglePivot, setPivotParameters);

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

function setPivotParameters(action$, store) {
    return action$
        .ofType(SET_PIVOT_PARAMETERS)
        .mergeMap(({falcor, params}) =>
            Observable.from(
                _.map(params, (value, key) =>
                    falcor.set(
                        $pathValue(['pivotParameters', key], value)
                    )
                )
            ).mergeAll()
        )
        .ignoreElements();
}
