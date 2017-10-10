import { Observable } from 'rxjs/Observable';
import DataframeMask from 'viz-app/worker/simulator/DataframeMask';

export function computeSelectionMasks({ view, emptyIfAllSelected = false }) {
  const { nBody: { dataframe, simulator, vgraphLoaded } } = view;

  if (!dataframe || !simulator || !vgraphLoaded) {
    return Observable.empty();
  }

  const { selection: { mask: rect } = {} } = view;
  const hasSelectionRect = rect && rect.tl && rect.br;

  if (emptyIfAllSelected && !hasSelectionRect) {
    return Observable.of(createTaggedSelectionMasks(dataframe, simulator, []));
  } else if (dataframe.lastTaggedSelectionMasks) {
    return Observable.of(dataframe.lastTaggedSelectionMasks);
  } else if (dataframe.pendingTaggedSelectionMasks) {
    return dataframe.pendingTaggedSelectionMasks;
  } else {
    return (dataframe.pendingTaggedSelectionMasks = Observable.defer(() =>
      simulator.selectNodesInRect(rect || { all: true })
    )
      .map(
        pointsMask =>
          (dataframe.lastTaggedSelectionMasks = createTaggedSelectionMasks(
            dataframe,
            simulator,
            pointsMask
          ))
      )
      .take(1)
      .finally(() => {
        dataframe.pendingTaggedSelectionMasks = null;
      })
      .share());
  }
}

let selectionMasksTag = 0;
function createTaggedSelectionMasks(dataframe, simulator, pointsMask) {
  const mask = new DataframeMask(
    dataframe,
    pointsMask,
    pointsMask === undefined ? undefined : simulator.connectedEdges(pointsMask)
  );
  mask.tag = ++selectionMasksTag;
  return mask;
}
