export function withSelectionRect(pan) {
    return pan.map((point) => {

        const { renderState: { camera, canvas } } = point;
        const { xOrigin, yOrigin, movementXTotal, movementYTotal } = point;

        const tl = {
            x: Math.min(xOrigin, xOrigin + movementXTotal),
            y: Math.min(yOrigin, yOrigin + movementYTotal),
        };
        const br = {
            x: Math.max(xOrigin, xOrigin + movementXTotal),
            y: Math.max(yOrigin, yOrigin + movementYTotal),
        };

        point.mask = {
            tl: camera.canvas2WorldCoords(tl.x, tl.y, canvas),
            br: camera.canvas2WorldCoords(br.x, br.y, canvas)
        };

        return point;
    });
}
