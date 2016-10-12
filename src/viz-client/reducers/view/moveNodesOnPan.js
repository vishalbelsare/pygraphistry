export function moveNodesOnPan(pans) {
    return pans.repeat().mergeMap((pan) => pan
            .filter(({ movementX, movementY }) => !!(movementX || movementY))
            .map((point) => {

                const { xOrigin, yOrigin, pointIndexes,
                        movementXTotal, movementYTotal,
                        camera, renderState, renderingScheduler } = point;

                const { canvas } = renderState;
                const worldOrigin = camera.canvas2WorldCoords(xOrigin, yOrigin, canvas);
                const worldPosition = camera.canvas2WorldCoords(
                    xOrigin + movementXTotal, yOrigin + movementYTotal, canvas
                );

                point.worldOrigin = worldOrigin;
                point.worldPosition = worldPosition;

                renderingScheduler.renderMovePointsTemporaryPositions(
                    point.worldDiff = {
                        x: worldPosition.x - worldOrigin.x,
                        y: worldPosition.y - worldOrigin.y
                    },
                    // Pretend to be a VizSlice
                    { getPointIndexValues(){ return pointIndexes; } }
                );
                return point;
            })
            .takeLast(1)
    )
    .switchMap(({ falcor, worldDiff }) =>
        falcor.call('moveSelectedNodes', [worldDiff]))
    .ignoreElements()
}
