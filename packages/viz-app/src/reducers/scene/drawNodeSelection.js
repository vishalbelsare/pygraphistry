import { createSubject, SceneGestures } from '../support';
import { $atom, $value } from '@graphistry/falcor-json-graph';
import { SCENE_TOUCH_START } from 'viz-app/actions/scene';

export function drawNodeSelection(actions) {
    const drawMaskStarts = SceneGestures.startFromActions(
        actions
            .ofType(SCENE_TOUCH_START)
            .filter(({ simulating, selectionType }) => !simulating && selectionType === 'select')
    );

    const startsWithShiftKey = SceneGestures.startFromActions(
        actions
            .ofType(SCENE_TOUCH_START)
            .filter(
                ({ event, simulating, selectionType }) =>
                    !simulating &&
                    !selectionType &&
                    !event.getModifierState('Alt') &&
                    event.getModifierState('Shift')
            )
    );

    const drawnNodeSelections = SceneGestures.pan(drawMaskStarts.merge(startsWithShiftKey))
        .repeat()
        .mergeMap(drag =>
            drag
                .dragRectInWorldCoords()
                .multicast(createSubject, drag =>
                    drag.merge(new SceneGestures(drag.takeLast(1)).withPointIndexes())
                )
        );

    return drawnNodeSelections.map(toValuesAndInvalidations);
}

export function toValuesAndInvalidations({ rect, falcor, pointIndexes }) {
    let values;
    if (!pointIndexes) {
        values = [
            $value(`selection.type`, 'select'),
            $value(`selection.mask`, $atom(rect)),
            $value(`selection.cursor`, 'down')
        ];
    } else {
        values = [
            {
                json: {
                    highlight: {
                        edge: $atom([]),
                        point: $atom([])
                    },
                    selection: {
                        mask: null,
                        type: null,
                        cursor: 'auto',
                        edge: $atom([]),
                        point: $atom(pointIndexes),
                        controls: { 0: { selected: false } }
                    }
                }
            }
        ];
    }
    return { falcor, values };
}
