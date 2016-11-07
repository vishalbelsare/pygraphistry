import { Observable } from 'rxjs';
import { pathValue as $value, ref as $ref } from '@graphistry/falcor-json-graph';

import {
    SELECT_INSPECTOR_TAB,
    SET_INSPECTOR_PAGE,
    SET_INSPECTOR_SORT_KEY,
    SET_INSPECTOR_SORT_ORDER,
    SET_INSPECTOR_SEARCH_TERM
} from 'viz-shared/actions/inspector';



export function inspector(action$, store) {
    return Observable.merge(
        selectInspectorTab(action$, store),
        genericSetter(SET_INSPECTOR_PAGE, 'currentQuery.page', 'page')(action$, store),
        genericSetter(SET_INSPECTOR_SORT_KEY, 'currentQuery.sortKey', 'key')(action$, store),
        genericSetter(SET_INSPECTOR_SORT_ORDER, 'currentQuery.sortOrder', 'order')(action$, store),
        genericSetter(SET_INSPECTOR_SEARCH_TERM, 'currentQuery.searchTerm', 'term')(action$, store)
    ).ignoreElements();
}

function selectInspectorTab(action$, store) {
    return action$
        .ofType(SELECT_INSPECTOR_TAB)
        .mergeMap(({falcor, openTab}) => (
            Observable.merge(
                falcor.set($value(`openTab`, openTab)),
                falcor.set($value(
                    `currentQuery`,
                    $ref(falcor._path.concat([`queries`, openTab])))))));
}

function genericSetter(token, path, prop) {
    return function (action$, store) {
        return action$
            .ofType(token)
            .mergeMap(({falcor, ...rest}) => (
                falcor.set($value(path, rest[prop]))));
    };
}