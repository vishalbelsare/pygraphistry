import { curPoints } from 'viz-client/legacy';

export function toPointSelection(pan) {
    return pan.withLatestFrom(curPoints, (point, { buffer }) => {
        const { mask = {} } = point;
        point.mask = null;
        point.rect = null;
        point.selectionType = null;
        point.indexes = pointIndexesInRect(
            new Float32Array(buffer), mask.tl, mask.br
        );
        return point;
    });
}

function pointIndexesInRect(points, topLeft, bottomRight) {
    const indexes = [];
    if (topLeft && bottomRight) {
        const { y: top = 0, x: left = 0 } = topLeft;
        const { y: bottom = 0, x: right = 0 } = bottomRight;
        let index = -1, point = -2, total = points.length;
        while ((point += 2) < total) {
            const x = points[point], y = points[point + 1];
            if (x > left && x < right && y < top && y > bottom) {
                indexes[++index] = point * 0.5;
            }
        }
    }
    return indexes;
}
