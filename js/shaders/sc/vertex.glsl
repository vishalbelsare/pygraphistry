#ifdef GL_ES
precision mediump float;
#endif

attribute vec3 a_position;
attribute vec4 a_color;

uniform mat4 u_mvp_matrix;

varying vec4 v_color;

void main() {
    vec4 pos = vec4(a_position.x, -1.0 * a_position.y, -1.0 * a_position.z, 20.0);
    gl_Position = u_mvp_matrix * pos;
    v_color = a_color;
}