import { SceneGestures } from './support';
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
        );

    return drawnMaskSelections.map(toValuesAndInvalidations);
}

export function toValuesAndInvalidations({ rect, falcor }) {
    return {
        falcor,
        values: [
            $value(`selection.mask`, $atom(rect))
        ],
        invalidations: [`selection.histogramsById`]
    };
}
