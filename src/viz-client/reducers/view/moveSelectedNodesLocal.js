export function moveSelectedNodesLocal(pan) {
    return pan.do((point) => {
        const { pointIndexes = [], renderingScheduler } = point;
        if (pointIndexes && pointIndexes.length) {
            const { renderState: { camera, canvas } } = point;
            const { xOrigin, yOrigin, movementXTotal, movementYTotal } = point;
            const originTopLeft = camera.canvas2WorldCoords(xOrigin, yOrigin, canvas);
            const latestTopLeft = camera.canvas2WorldCoords(
                xOrigin + movementXTotal, yOrigin + movementYTotal, canvas
            );
            renderingScheduler.renderMovePointsTemporaryPositions(
                {
                    x: latestTopLeft.x - originTopLeft.x,
                    y: latestTopLeft.y - originTopLeft.y
                },
                // Pretend to be a VizSlice
                { getPointIndexValues() { return pointIndexes; } }
            );
        }
    });
}
