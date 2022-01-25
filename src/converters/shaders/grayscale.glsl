precision highp float;

uniform sampler2D u_image;
varying vec2 tex_coords;

const vec3 g = vec3(0.299, 0.587, 0.114);

void main(void) {
    vec4 color = texture2D(u_image, tex_coords);
    float gray = dot(color.rgb, g);
    gl_FragColor = vec4(vec3(gray), 1.0);
}