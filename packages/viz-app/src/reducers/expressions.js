import {
  ref as $ref,
  atom as $atom,
  pathValue as $value,
  pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import {
  ADD_FILTER,
  ADD_EXCLUSION,
  ADD_EXPRESSION,
  REMOVE_EXPRESSION,
  UPDATE_EXPRESSION,
  SET_EXPRESSION_ENABLED,
  CANCEL_UPDATE_EXPRESSION
} from 'viz-app/actions/expressions';

export function expressions(action$, store) {
  return Observable.merge(
    addFilter(action$),
    addExclusion(action$),
    addExpression(action$, store),
    removeExpression(action$, store),
    updateExpression(action$, store)
  ).ignoreElements();
}

function addFilter(action$) {
  return action$
    .ofType(ADD_FILTER)
    .exhaustMap(({ name, value, dataType, componentType, falcor }) => {
      const viewModel = falcor._clone({
        _path: falcor.getPath().slice(0, -3)
      });
      return Observable.merge(
        falcor.call('filters.add', [componentType, name, dataType, value]),
        viewModel.set({
          json: {
            highlight: { darken: false },
            labels: { highlight: $atom(undefined) }
          }
        })
      );
    });
}

function addExclusion(action$) {
  return action$
    .ofType(ADD_EXCLUSION)
    .exhaustMap(({ name, value, dataType, componentType, falcor }) => {
      const viewModel = falcor._clone({
        _path: falcor.getPath().slice(0, -3)
      });
      return Observable.merge(
        falcor.call('exclusions.add', [componentType, name, dataType, value]),
        viewModel.set({
          json: {
            highlight: {
              darken: false,
              edge: $atom([]),
              point: $atom([])
            },
            selection: {
              edge: $atom([]),
              point: $atom([])
            },
            labels: {
              highlight: $atom(undefined),
              selection: $atom(undefined)
            }
          }
        })
      );
    });
}

function addExpression(action$) {
  return action$
    .ofType(ADD_EXPRESSION)
    .groupBy(({ id }) => id)
    .mergeMap(group =>
      group.exhaustMap(({ name, dataType, componentType, falcor }) =>
        falcor.call('add', [componentType, name, dataType])
      )
    );
}

function removeExpression(action$) {
  return action$
    .ofType(REMOVE_EXPRESSION)
    .groupBy(({ id }) => id)
    .mergeMap(group => group.exhaustMap(({ id, falcor }) => falcor.call('remove', [id])));
}

function updateExpression(action$) {
  return action$
    .ofType(UPDATE_EXPRESSION, SET_EXPRESSION_ENABLED)
    .groupBy(({ id }) => id)
    .mergeMap(group =>
      group.debounceTime(350).switchMap(({ input, enabled, falcor }) => {
        const operations = [];

        input !== undefined && operations.push(falcor.set($value(`input`, input)));
        enabled !== undefined && operations.push(falcor.set($value(`enabled`, enabled)));

        operations.push(falcor.call('update', [{ input, enabled }]));

        return Observable.merge(...operations).takeUntil(action$.ofType(CANCEL_UPDATE_EXPRESSION));
      })
    );
}
