import { createSubject, SceneGestures } from './support';
import { toValuesAndInvalidations } from './drawSelectionMask';
import { SELECTION_MASK_TOUCH_START } from 'viz-shared/actions/scene';
import { atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function moveSelectionMask(actions) {

    const moveMaskStarts = SceneGestures
        .startFromActions(actions
            .ofType(SELECTION_MASK_TOUCH_START)
            .filter(({ simulating, selectionMask, selectionType }) => (
                !simulating && selectionMask && selectionType === 'window'
            ))
        );

    const movedMaskSelections = SceneGestures
        .pan(moveMaskStarts)
        .repeat()
        .mergeMap((drag) => drag
            .stopPropagation(true)
            .moveRectInWorldCoords()
            .multicast(createSubject, (drag) => drag.merge(
                drag.takeLast(1).map((point) => {
                    point.refreshMask = true;
                    return point;
                })
            ))
        );

    return movedMaskSelections.map(toValuesAndInvalidations);
}
