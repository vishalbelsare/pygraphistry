import { combineEpics } from 'redux-observable';
import { CHECK_STATUS } from '../actions/connectorScreen.js';

export const connectorScreen = combineEpics(checkStatus);

function checkStatus(action$) {
    return action$
        .ofType(CHECK_STATUS)
        .groupBy(({ id }) => id)
        .mergeMap(actionsById =>
            actionsById.switchMap(({ falcor }) => falcor.call('checkStatus').progressively())
        )
        .ignoreElements();
}
