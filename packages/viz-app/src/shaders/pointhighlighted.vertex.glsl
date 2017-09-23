precision highp float;

#define W_VAL 1.0
#define Z_VAL 0.1

attribute vec2 curPos;
attribute float pointSize;
attribute vec4 pointColor;

varying vec4 vColor;
varying float strokeRatio;

uniform mat4 mvp;
uniform float stroke;
uniform float zoomScalingFactor;
uniform float maxPointSize;
uniform float minPointSize;
uniform float pointOpacity;

void main(void) {
    if (stroke > 0.0) {
        vColor = vec4(0.5 * pointColor.xyz, pointOpacity);
        gl_PointSize = clamp(zoomScalingFactor * pointSize, minPointSize, maxPointSize);
        strokeRatio = 1.0 - ((stroke + 1.0) / gl_PointSize);
    } else {
        vColor = vec4(0.4 * pointColor.xyz + 0.6 * vec3(1.0, 1.0, 1.0), pointOpacity);
        gl_PointSize = stroke + clamp(zoomScalingFactor * pointSize, minPointSize, maxPointSize);
        strokeRatio = (stroke / gl_PointSize);
    }
    gl_Position = mvp * vec4(curPos.xy, Z_VAL, W_VAL);
}
