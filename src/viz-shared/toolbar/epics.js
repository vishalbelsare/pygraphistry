import { SELECT_TOOLBAR_ITEM } from './actions';

export default function toolbarEpic(action$, store) {
    return selectToolbarItem(action$, store);
}

function selectToolbarItem(action$, store) {
    return action$
        .ofType(SELECT_TOOLBAR_ITEM)
        .switchMap(({ falcor }) => falcor.call(`select`, []))
        .ignoreElements();
}
