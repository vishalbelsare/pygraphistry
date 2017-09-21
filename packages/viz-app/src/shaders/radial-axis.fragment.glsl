precision highp float;

varying vec2 uv;
varying float radius;
varying float border;
varying vec4 innerColor;
varying vec4 outerColor;

void main(void) {
    float distance = sqrt(dot(uv, uv));
    float blend = 1.0 + pow(smoothstep(radius + border * 0.5, radius + border, distance), 0.25)
                      - pow(smoothstep(radius - border, radius - border * 0.5, distance), 0.25);
    gl_FragColor = mix(innerColor, outerColor, blend);
}
