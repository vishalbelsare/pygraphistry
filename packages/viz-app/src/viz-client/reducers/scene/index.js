import { Observable } from 'rxjs';
import { moveCamera } from './moveCamera';
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
    if (falcor) {
        if (invalidations && invalidations.length) {
            falcor.invalidate(...invalidations);
        }
        if (values && values.length) {
            return falcor.set(...values);
        }
    }
    return Observable.never();
}
