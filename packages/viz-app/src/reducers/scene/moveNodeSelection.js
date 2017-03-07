import { SceneGestures } from '../support';
import { SELECTED_POINT_TOUCH_START } from 'viz-app/actions/scene';

export function moveNodeSelection(actions) {

    const moveNodeStarts = SceneGestures
        .startFromActions(actions
            .ofType(SELECTED_POINT_TOUCH_START)
            .filter(({ event, simulating, selectionType }) => (
                !simulating && selectionType === 'select' && !(
                event.getModifierState('Shift'))
            ))
        );

    const movedNodeSelections = SceneGestures
        .pan(moveNodeStarts)
        .repeat()
        .mergeMap((drag) => drag
            .stopPropagation()
            .mapToWorldCoords()
            .do(movePointsTemporaryPositions)
            .takeLast(1)
            .mergeMap(callMoveSelectedNodes)
        );

    return movedNodeSelections.ignoreElements();

}

function movePointsTemporaryPositions(point) {
    const { pointIndexes, renderingScheduler } = point;
    if (pointIndexes && pointIndexes.length) {
        renderingScheduler.renderMovePointsTemporaryPositions(
            {
                x: point.worldX - point.worldXOrigin,
                y: point.worldY - point.worldYOrigin,
            },
            // Pretend to be a `VizSlice`
            { getPointIndexValues() { return pointIndexes; } }
        );
    }
}

function callMoveSelectedNodes(point) {
    const { falcor } = point;
    return falcor.call(
        'moveSelectedNodes', [{
            x: point.worldX - point.worldXOrigin,
            y: point.worldY - point.worldYOrigin,
        }]
    );
}
