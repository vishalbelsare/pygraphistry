import { Observable } from 'rxjs/Observable';
import DataframeMask from 'viz-worker/simulator/DataframeMask';

export function computeSelectionMasks({ view, emptyIfAllSelected = false }) {

    const { nBody = {} } = view;
    const { dataframe = {}, simulator } = nBody;
    const { selection: { mask: rect } = {} } = view;
    const hasSelectionRect = rect && rect.tl && rect.br;

    if (emptyIfAllSelected && !hasSelectionRect) {
        return Observable.of(
            createTaggedSelectionMasks(dataframe, simulator, [])
        );
    } else if (dataframe.lastTaggedSelectionMasks) {
        return Observable.of(dataframe.lastTaggedSelectionMasks);
    } else {
        return Observable
            .defer(() => simulator.selectNodesInRect(rect || { all: true }))
            .map((pointsMask) =>
                dataframe.lastTaggedSelectionMasks =
                    createTaggedSelectionMasks(dataframe, simulator, pointsMask)
            );
    }
}

let selectionMasksTag = 0;
function createTaggedSelectionMasks(dataframe, simulator, pointsMask) {
    const mask = new DataframeMask(
        dataframe, pointsMask, pointsMask === undefined ?
            undefined : simulator.connectedEdges(pointsMask)
    );
    mask.tag = ++selectionMasksTag;
    return mask;
}

