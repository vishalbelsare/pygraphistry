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
        addExpression(action$, store),
        removeExpression(action$, store),
        updateExpression(action$, store),
    ).ignoreElements();
}

function addExpression(action$) {
    return action$
        .ofType(ADD_EXPRESSION)
        .groupBy(({ id }) => id)
        .mergeMap((group) => group.exhaustMap(
            ({ name, dataType, componentType, falcor }) =>
                falcor.call('add', [componentType, name, dataType])
        ));
}

function removeExpression(action$) {
    return action$
        .ofType(REMOVE_EXPRESSION)
        .groupBy(({ id }) => id)
        .mergeMap((group) => group.exhaustMap(
            ({ id, falcor }) => falcor.call('remove', [id])
        ));
}

function updateExpression(action$) {
    return action$
        .ofType(UPDATE_EXPRESSION, SET_EXPRESSION_ENABLED)
        .groupBy(({ id }) => id)
        .mergeMap((group) => group
            .debounceTime(350)
            .switchMap(({ input, enabled, falcor }) => {

                const operations = [];

                (input !== undefined) &&
                    operations.push(falcor.set($value(`input`, input)));
                (enabled !== undefined) &&
                    operations.push(falcor.set($value(`enabled`, enabled)));

                operations.push(falcor.call('update', [{ input, enabled }]));

                return Observable
                    .merge(...operations)
                    .takeUntil(action$.ofType(CANCEL_UPDATE_EXPRESSION))
            })
        );
}
