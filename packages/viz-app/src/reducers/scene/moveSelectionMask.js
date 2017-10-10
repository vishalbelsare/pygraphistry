import { toValuesAndInvalidations } from './drawSelectionMask';
import { SELECTION_MASK_TOUCH_START } from 'viz-app/actions/scene';
import { createSubject, SceneGestures } from '../support';

export function moveSelectionMask(actions) {
  const moveMaskStarts = SceneGestures.startFromActions(
    actions
      .ofType(SELECTION_MASK_TOUCH_START)
      .filter(
        ({ event, simulating, selectionMask, selectionType }) =>
          !simulating &&
          selectionMask &&
          selectionType === 'window' &&
          !event.getModifierState('Shift')
      )
  );

  const movedMaskSelections = SceneGestures.pan(moveMaskStarts)
    .repeat()
    .mergeMap(drag =>
      drag
        .stopPropagation(true)
        .moveRectInWorldCoords()
        .multicast(createSubject, drag =>
          drag.merge(
            drag.takeLast(1).map(point => {
              point.refreshMask = true;
              return point;
            })
          )
        )
    );

  return movedMaskSelections.map(toValuesAndInvalidations);
}
