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
            .do((val) => console.log(val))
            .mergeMap((actionsById) => actionsById.switchMap(
                ({ falcor, id }) => falcor.set(
                    $value(`currentUser.connectors[${id}].status`, 'warning')
                )
                .progressively()
            ))
            .ignoreElements();
}

