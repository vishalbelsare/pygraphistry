export function pointIndexesInRect(points, topLeft, bottomRight) {
    const indexes = [];
    const { y: top, x: left } = topLeft;
    const { y: bottom, x: right } = bottomRight;
    let index = -1, point = -2, total = points.length;
    while ((point += 2) < total) {
        const x = points[point], y = points[point + 1];
        if (x > left && x < right && y < top && y > bottom) {
            indexes[++index] = point * 0.5;
        }
    }
    return indexes;
}
