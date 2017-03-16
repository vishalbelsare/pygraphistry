import { Observable } from 'rxjs';
import { moveCamera } from './moveCamera';
import * as Scheduler from 'rxjs/scheduler/async';
import { moveNodeSelection } from './moveNodeSelection';
import { moveSelectionMask } from './moveSelectionMask';
import { pickNodeSelection } from './pickNodeSelection';
import { drawNodeSelection } from './drawNodeSelection';
import { drawSelectionMask } from './drawSelectionMask';
import { hideSelectionMask } from './hideSelectionMask';
import { assignSelectedLabel } from './assignSelectedLabel';

export function scene(action$, store) {
    return Observable.merge(
        assignSelectedLabel(action$),
        drawNodeSelection(action$),
        drawSelectionMask(action$),
        moveNodeSelection(action$),
        moveSelectionMask(action$),
        pickNodeSelection(action$),
        hideSelectionMask(action$),
        moveCamera(action$),
    )
    .switchMap(commitReducerResults)
    .ignoreElements();

}

function commitReducerResults({ falcor, values, invalidations }) {
    let obs = Observable.of(0);
    if (falcor) {
        if (invalidations && invalidations.length) {
            obs = obs.combineLatest(Observable
                .defer(() => falcor.invalidate(...invalidations)));
        }
        if (values && values.length) {
            obs = obs.combineLatest(falcor.set(...values));
        }
    }
    return obs;
}
