import { SELECT_LABEL } from 'viz-app/actions/labels';
import { tapDelay, SceneGestures } from '../support';
import { $ref, $atom, $value } from '@graphistry/falcor-json-graph';

export function assignSelectedLabel(actions) {
  const labelSelectionStarts = SceneGestures.startFromActions(
    actions
      .ofType(SELECT_LABEL)
      .filter(
        ({ simulating, isSelected, selectionType }) => isSelected || (!simulating && !selectionType)
      )
  );

  const labelSelectionTaps = SceneGestures.tap(labelSelectionStarts, { delay: tapDelay })
    .repeat()
    .mergeAll();

  return labelSelectionTaps.map(toValuesAndInvalidations);
}

function toValuesAndInvalidations({ falcor, isSelected, labelIndex, componentType }) {
  const inverseType = componentType === 'point' ? 'edge' : 'point';
  return {
    falcor,
    values: [
      {
        json: {
          highlight: {
            darken: false,
            [inverseType]: $atom([]),
            [componentType]: $atom(isSelected ? [] : [labelIndex])
          },
          selection: {
            [inverseType]: $atom([]),
            [componentType]: $atom(isSelected ? [] : [labelIndex])
          },
          labels: {
            highlight: $atom(undefined),
            selection: isSelected
              ? $atom(undefined)
              : $ref(falcor.getPath().concat('labelsByType', componentType, labelIndex))
          }
        }
      }
    ]
  };
}
