import { Observable } from 'rxjs';
import { pathValue as $value, ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';

import {
  SELECT_INSPECTOR_TAB,
  SELECT_INSPECTOR_ROW,
  SET_INSPECTOR_SORT_KEY,
  SET_INSPECTOR_SORT_ORDER,
  SET_INSPECTOR_SEARCH_TERM,
  SET_INSPECTOR_COLUMNS
} from 'viz-app/actions/inspector';

export function inspector(action$, store) {
  return Observable.merge(
    selectInspectorTab(action$, store),
    selectInspectorRow(action$, store),
    setInspectorColumns(action$, store),
    sortInspectorColumns(action$, store),
    setInspectorSearchTerm(action$, store)
  ).ignoreElements();
}

function selectInspectorTab(action$, store) {
  return action$
    .ofType(SELECT_INSPECTOR_TAB)
    .switchMap(({ falcor, openTab }) =>
      Observable.merge(
        falcor.set($value(`openTab`, openTab)),
        falcor.set($value(`currentQuery`, $ref(falcor._path.concat([`queries`, openTab]))))
      )
    );
}

function selectInspectorRow(action$, store) {
  return action$.ofType(SELECT_INSPECTOR_ROW).switchMap(({ falcor, componentType, index }) => {
    const inverseType = componentType === 'point' ? 'edge' : 'point';
    return falcor.set({
      json: {
        highlight: {
          darken: true,
          [inverseType]: $atom([]),
          [componentType]: $atom([index])
        },
        selection: {
          [inverseType]: $atom([]),
          [componentType]: $atom([index])
        },
        labels: {
          highlight: $atom(undefined),
          selection: $ref(falcor.getPath().concat('labelsByType', componentType, index))
        }
      }
    });
  });
}

function setInspectorColumns(action$, store) {
  return action$
    .ofType(SET_INSPECTOR_COLUMNS)
    .switchMap(({ falcor, columns }) => falcor.set($value('currentQuery.columns', $atom(columns))));
}

function sortInspectorColumns(action$, store) {
  return action$
    .ofType(SET_INSPECTOR_SORT_KEY)
    .scan(
      ([currKey, sortOrder], { sortKey, falcor }) => {
        sortOrder = sortKey !== currKey ? 'asc' : sortOrder === 'desc' ? 'asc' : 'desc';

        return [
          sortKey,
          sortOrder,
          falcor.set(
            $value('currentQuery.sortKey', sortKey),
            $value('currentQuery.sortOrder', sortOrder)
          )
        ];
      },
      ['_title', 'asc', []]
    )
    .switchMap(([sortKey, sortOrder, setValues]) => setValues);
}

function setInspectorSearchTerm(action$, store) {
  return action$
    .ofType(SET_INSPECTOR_SEARCH_TERM)
    .debounceTime(300)
    .switchMap(({ falcor, term }) => falcor.set($value('currentQuery.searchTerm', term || '')));
}
