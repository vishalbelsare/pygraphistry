import { createSubject, SceneGestures } from './support';
import { SCENE_TOUCH_START } from 'viz-shared/actions/scene';
import { atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function drawSelectionMask(actions) {

    const drawMaskStarts = SceneGestures
        .startFromActions(actions
            .ofType(SCENE_TOUCH_START)
            .filter(({ event, simulating, selectionMask, selectionType }) => (
                !simulating && selectionType === 'window' && (
                !selectionMask || event.getModifierState('Shift'))
            ))
        );

    const drawnMaskSelections = SceneGestures
        .pan(drawMaskStarts)
        .repeat()
        .mergeMap((drag) => drag
            .stopPropagation(true)
            .dragRectInWorldCoords()
            .multicast(createSubject, (drag) => drag.merge(
                drag.takeLast(1).map((point) => {
                    point.refreshMask = true;
                    return point;
                })
            ))
        );

    return drawnMaskSelections.map(toValuesAndInvalidations);
}

export function toValuesAndInvalidations({ rect, falcor, refreshMask }) {
    return {
        falcor,
        values: [
            $value(`selection.mask`, $atom(rect))
        ],
        invalidations: refreshMask && [`selection.histogramsById`] || undefined
    };
}
