import { SceneGestures } from '../support';
import { $atom } from '@graphistry/falcor-json-graph';
import { LABEL_MOUSE_MOVE } from 'viz-app/actions/labels';

export function resetHighlightedLabel(actions) {
    const anyLabelMoves = SceneGestures.moveFromActions(
        actions
            .ofType(LABEL_MOUSE_MOVE)
            .filter(
                ({ event, isOpen, simulating, isSelected, selectionType }) =>
                    event.buttons === 0 && !simulating && (!isOpen || isSelected) && !selectionType
            )
    )
        .stopPropagation()
        .filter(({ hasHighlightedLabel }) => hasHighlightedLabel);

    return anyLabelMoves.map(toValuesAndInvalidations);
}

function toValuesAndInvalidations({ falcor }) {
    return {
        falcor,
        values: [
            {
                json: {
                    highlight: $atom(undefined)
                }
            }
        ]
    };
}
