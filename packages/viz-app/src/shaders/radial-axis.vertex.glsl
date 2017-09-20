precision highp float;

uniform mat4 mvp;
uniform float stroke;
uniform float maxScreenSize;
uniform float maxCanvasSize;
uniform float edgeZoomScalingFactor;

attribute vec2 aPos;
attribute vec2 aCenter;
attribute float aRadius;

varying vec2 uv;
varying float radius;
varying float border;

void main(void) {
    radius = aRadius;
    uv = (aPos.xy - aCenter) * vec2(1.0, -1.0);
    border = clamp(stroke * edgeZoomScalingFactor * maxScreenSize / maxCanvasSize, 0.0, 10.0);
    gl_Position = mvp * vec4(aPos.xy, 0.1, 1.0);
}

