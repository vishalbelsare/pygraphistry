import { Observable } from 'rxjs';
import { pathValue as $value, ref as $ref } from '@graphistry/falcor-json-graph';

import { SELECT_INSPECTOR_TAB } from 'viz-shared/actions/inspector';



export function inspector(action$, store) {
    return Observable.merge(
        selectInspectorTab(action$, store)
    ).ignoreElements();
}

function selectInspectorTab(action$, store) {
    return action$
        .ofType(SELECT_INSPECTOR_TAB)
        .mergeMap(({falcor, openTab}) => (
            Observable.merge(
                falcor.set($value(`openTab`, openTab)),
                //falcor.set($value(
                //    `currentRows`,
                //    $ref(falcor._path.concat([`queries`, openTab, 'rows'])))),
                falcor.set($value(
                    `currentQuery`,
                    $ref(falcor._path.concat([`queries`, openTab])))))));
}
