export function moveSelectedNodesRemote(pan) {
    return pan.switchMap((point) => {
        const { falcor, renderState: { camera, canvas } } = point;
        const { xOrigin, yOrigin, movementXTotal, movementYTotal } = point;
        const originTopLeft = camera.canvas2WorldCoords(xOrigin, yOrigin, canvas);
        const latestTopLeft = camera.canvas2WorldCoords(
            xOrigin + movementXTotal, yOrigin + movementYTotal, canvas
        );
        return falcor.call(
            'moveSelectedNodes', [{
                x: latestTopLeft.x - originTopLeft.x,
                y: latestTopLeft.y - originTopLeft.y
            }]
        );
    });
}

