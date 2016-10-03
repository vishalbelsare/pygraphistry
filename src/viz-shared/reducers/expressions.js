import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import {
    ADD_EXPRESSION,
    REMOVE_EXPRESSION,
    UPDATE_EXPRESSION,
    SET_EXPRESSION_ENABLED,
    CANCEL_UPDATE_EXPRESSION,
} from 'viz-shared/actions/expressions';

export function expressions(action$, store) {
    return Observable.merge(
        addExpression(action$.ofType(ADD_EXPRESSION), store),
        updateExpression(action$, store),
        removeExpression(action$.ofType(REMOVE_EXPRESSION), store),
        setExpressionEnabled(action$.ofType(SET_EXPRESSION_ENABLED), store)
    ).ignoreElements();
}

function addExpression(action$) {
    return action$
        .groupBy(({ id }) => id)
        .mergeMap((group) => group.exhaustMap(
            ({ name, dataType, attribute, falcor }) =>
                falcor.call('add', [name, dataType, attribute])
        ));
}

function updateExpression(action$) {
    return action$
        .ofType(UPDATE_EXPRESSION)
        .groupBy(({ id }) => id)
        .mergeMap((group) => group
            .debounceTime(350)
            .switchMap(({ input, falcor }) => falcor.set({
                json: { input }
            })
            .takeUntil(action$
                .ofType(CANCEL_UPDATE_EXPRESSION)
                .filter(({ id }) => group.key === id))
        ));
}

function removeExpression(action$) {
    return action$
        .groupBy(({ id }) => id)
        .mergeMap((group) => group.exhaustMap(
            ({ id, falcor }) => falcor.call('remove', [id])
        ));
}

function setExpressionEnabled(action$) {
    return action$
        .groupBy(({ id }) => id)
        .mergeMap((group) => group.switchMap(
            ({ enabled, falcor }) => falcor.set({
                json: { enabled }
            })
        ));
}
