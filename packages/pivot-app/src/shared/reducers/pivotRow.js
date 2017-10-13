import { pathValue as $pathValue } from '@graphistry/falcor-json-graph';
import { SET_PIVOT_ATTRIBUTES } from '../actions/pivotRow';
import { Observable } from 'rxjs';
import _ from 'underscore';
import { combineEpics } from 'redux-observable';
import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

export const pivot = combineEpics(setPivotAttributes);

function setPivotAttributes(action$) {
    return action$
        .ofType(SET_PIVOT_ATTRIBUTES)
        .mergeMap(({ falcor, params }) => {
            const topLevelModel = falcor._root.topLevelModel;

            return Observable.from(
                topLevelModel.set(
                    $pathValue(['currentUser', 'activeInvestigation', 'status'], {
                        msgStyle: 'warning',
                        ok: true
                    })
                )
            ).concat(
                Observable.from(
                    _.map(params, (value, key) => falcor.set($pathValue(key.split('.'), value)))
                ).mergeAll()
            );
        })
        .ignoreElements();
}
