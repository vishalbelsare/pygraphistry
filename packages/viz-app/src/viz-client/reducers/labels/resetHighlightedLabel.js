import { SceneGestures } from 'viz-client/reducers/support';
import { LABEL_MOUSE_MOVE } from 'viz-shared/actions/labels';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function resetHighlightedLabel(actions) {

    const anyLabelMoves = SceneGestures
        .moveFromActions(actions
            .ofType(LABEL_MOUSE_MOVE)
            .filter(({ event, isOpen, simulating, isSelected, selectionType }) => (
                event.buttons === 0 && !simulating && (!isOpen || isSelected) && !selectionType
            ))
        )
        .stopPropagation()
        .filter(({ hasHighlightedLabel }) => hasHighlightedLabel);

    return anyLabelMoves.map(toValuesAndInvalidations);
}

function toValuesAndInvalidations({ falcor }) {
    return {
        falcor, values: [{
            json: {
                highlight: $atom(undefined)
            }
        }]
    };
}
