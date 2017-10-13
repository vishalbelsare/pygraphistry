import { toValuesAndInvalidations } from './drawSelectionMask';
import { tapDelay, SceneGestures } from '../support';
import { SCENE_TOUCH_START, SELECTION_MASK_TOUCH_START } from 'viz-app/actions/scene';

export function hideSelectionMask(actions) {
    const maskStarts = SceneGestures.startFromActions(
        actions
            .ofType(SELECTION_MASK_TOUCH_START)
            .filter(
                ({ simulating, selectionMask, selectionType }) =>
                    !simulating && selectionMask && selectionType === 'window'
            )
    );

    const sceneStarts = SceneGestures.startFromActions(
        actions
            .ofType(SCENE_TOUCH_START)
            .filter(
                ({ selectionType, selectionMask }) =>
                    selectionMask && (!selectionType || selectionType === 'window')
            )
    );

    const hiddenMaskSelections = SceneGestures.tap(maskStarts.merge(sceneStarts), {
        delay: tapDelay
    })
        .repeat()
        .mergeMap(tap =>
            tap
                // .stopPropagation(true)
                .map(point => {
                    point.rect = null;
                    point.refreshMask = true;
                    return point;
                })
        );

    return hiddenMaskSelections.map(toValuesAndInvalidations);
}
