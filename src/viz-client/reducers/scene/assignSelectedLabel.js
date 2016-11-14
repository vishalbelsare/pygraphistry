import { LABEL_TOUCH_START } from 'viz-shared/actions/labels';
import { tapDelay, SceneGestures } from 'viz-client/reducers/support';
import { ref as $ref, atom as $atom, pathValue as $value } from '@graphistry/falcor-json-graph';

export function assignSelectedLabel(actions) {

    const selectLabelStarts = SceneGestures
        .startFromActions(actions
            .ofType(LABEL_TOUCH_START)
            .filter(({ simulating, isSelected, selectionType }) => (
                !simulating && !isSelected && !selectionType
            ))
        );

    const labelSelections = SceneGestures
        .tap(selectLabelStarts, { delay: tapDelay })
        .repeat()
        .mergeAll();

    return labelSelections.map(toValuesAndInvalidations);
}

function toValuesAndInvalidations({ falcor, labelIndex, componentType }) {
    return {
        falcor, values: [{
            json: {
                labels: {
                    selection: $ref(falcor.getPath()
                        .concat('labelsByType', componentType, labelIndex)
                    )
                }
            }
        }]
    };
}
