precision mediump float;

#define W_VAL 1.0
#define Z_VAL 0.0

uniform mat4 mvp;
// uniform vec2 uResolution;

attribute vec2 curPos;
attribute vec2 aColorCoord;

varying vec2 vColorCoord;

void main(void) {
	vec4 colorLoc = (mvp * vec4(aColorCoord.x, -1.0 * aColorCoord.y, Z_VAL, W_VALUE));
	colorLoc.x = colorLoc.x / colorLoc.w;
	colorLoc.y = colorLoc.y / colorLoc.w;
	vColorCoord = colorLoc.xy;

    vec4 pos = vec4(curPos.x, -1.0 * curPos.y, Z_VAL, W_VAL);
    gl_Position = mvp * pos;
}
