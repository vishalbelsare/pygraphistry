import { rgb } from 'd3-color';

export function formatColor(value) {
    value = d3ColorFromRGBA(value);
    return value.toString();
}

function d3ColorFromRGBA(x) {
    const r = (x >> 16) & 255,
        g = (x >> 8) & 255,
        b = x & 255;
    return rgb(r, g, b);
}
