import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';
import { combineEpics } from 'redux-observable';
import { Observable } from 'rxjs';
import _ from 'underscore';
import {
    CHECK_STATUS,
} from '../actions/connectorScreen.js';


export const connectorScreen = combineEpics(
    checkStatus
);

function checkStatus(action$, store) {
        return action$
            .ofType(CHECK_STATUS)
            .groupBy(({ id }) => id)
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ falcor, id }) => falcor.call(
                    ['connectorsById', [id], 'checkStatus']
                )
                .progressively()
            ))
            .ignoreElements();
}

