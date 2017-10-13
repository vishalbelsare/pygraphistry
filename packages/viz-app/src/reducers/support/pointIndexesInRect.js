export function pointIndexesInRect(points, topLeft, bottomRight) {
    const pointIndexes = [];
    if (topLeft && bottomRight) {
        const { y: top = 0, x: left = 0 } = topLeft;
        const { y: bottom = 0, x: right = 0 } = bottomRight;
        let index = -1,
            point = -2,
            total = points.length;
        while ((point += 2) < total) {
            const x = points[point],
                y = points[point + 1];
            if (x > left && x < right && y < top && y > bottom) {
                pointIndexes[++index] = point * 0.5;
            }
        }
    }
    return pointIndexes;
}
