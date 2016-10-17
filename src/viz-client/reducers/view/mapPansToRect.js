export function mapPansToRect(pans) {
    return pans.map((pan) => pan.map((point) => {

        const rect = point.rect || (point.rect = {});
        const { xOrigin, yOrigin, movementXTotal, movementYTotal } = point;

        rect.w = Math.abs(movementXTotal);
        rect.h = Math.abs(movementYTotal);
        rect.x = Math.min(xOrigin, xOrigin + movementXTotal);
        rect.y = Math.min(yOrigin, yOrigin + movementYTotal);

        return point;
    }));
}
