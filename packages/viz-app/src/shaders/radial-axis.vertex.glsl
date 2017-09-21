precision highp float;

uniform mat4 mvp;
uniform float stroke;
uniform float maxScreenSize;
uniform float maxCanvasSize;
uniform float edgeZoomScalingFactor;

attribute vec2 aPos;
attribute vec2 aCenter;
attribute float aRadius;
attribute float aFlags;

varying vec2 uv;
varying float radius;
varying float border;
varying vec4 innerColor;
varying vec4 outerColor;

void main(void) {

    float r = mod(floor(aFlags / 4096.0), 16.0) / 16.0;
    float g = mod(floor(aFlags / 256.0 ), 16.0) / 16.0;
    float b = mod(floor(aFlags / 16.0  ), 16.0) / 16.0;
    float a = mod(      aFlags          , 16.0) / 16.0;
    float borderThinningFactor = 1.0 - mod(floor(aFlags / 65536.0), 2.0) * 0.5;

    radius = aRadius;
    innerColor = vec4(r, g, b, a);
    outerColor = vec4(0.0, 0.0, 0.0, 0.0); // transparent
    uv = (aPos.xy - aCenter) * vec2(1.0, -1.0);
    border = borderThinningFactor * clamp(stroke * edgeZoomScalingFactor * maxScreenSize / maxCanvasSize, 0.0, 10.0);
    gl_Position = mvp * vec4(aPos.xy, 0.1, 1.0);
}

