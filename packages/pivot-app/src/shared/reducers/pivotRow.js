import {
    pathValue as $value,
} from '@graphistry/falcor-json-graph';
import { combineReducers } from 'redux'
import { SET_PIVOT_VALUE, TOGGLE_PIVOT } from '../actions/pivotRow';
import { Observable } from 'rxjs';
import { combineEpics } from 'redux-observable';



export const pivot = combineEpics(setPivotValue, togglePivot);

export function setPivotValue(action$, store) {
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

export function togglePivot(action$, store) {
    return action$
        .ofType(TOGGLE_PIVOT)
        .groupBy(({ id }) => id)
        .mergeMap((actionsById) => actionsById.switchMap(
            ({ falcor, index, enabled}) => {
                return falcor.set(
                    $value(`['enabled']`, enabled)
                )
                    .progressively()
            }
        ))
        .ignoreElements();
}
