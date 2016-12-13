import {
    pathValue as $pathValue,
} from '@graphistry/falcor-json-graph';
import { combineReducers } from 'redux'
import {
    SET_PIVOT_ATTRIBUTES
} from '../actions/pivotRow';
import { Observable } from 'rxjs';
import _ from 'underscore';
import { combineEpics } from 'redux-observable';

export const pivot = combineEpics(setPivotAttributes);

function setPivotAttributes(action$, store) {
    return action$
        .ofType(SET_PIVOT_ATTRIBUTES)
        .mergeMap(({falcor, params}) =>
            Observable.from(
                _.map(params, (value, key) =>
                    falcor.set(
                        $pathValue(key.split('.'), value)
                    )
                )
            ).mergeAll()
        )
        .ignoreElements();
}
