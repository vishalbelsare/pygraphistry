import { Observable } from 'rxjs';
import { pathValue as $value } from '@graphistry/falcor-json-graph';

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
            falcor.set($value(`openTab`, openTab))
        );
}
