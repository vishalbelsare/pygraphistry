import { SET_LAYOUT_CONTROL_VALUE } from './actions';

export default function settingsEpic(action$, store) {
    return setLayoutControlValue(action$, store);
}

function setLayoutControlValue(action$, store) {
    return action$
        .ofType(SET_LAYOUT_CONTROL_VALUE)
        .switchMap(({ id, falcor }) => falcor.call(`select`, []))
        .ignoreElements();
}
