uniform sampler2D globeTexture;
uniform float age;

varying vec2 vertexUV; // original position on the earth source maps
varying vec2 vertexUVEnd; // end position on the earth source maps

vec2 lerp(vec2 start_value, vec2 end_value, float t) {
  return vec2(
    start_value.x + (end_value.x - start_value.x) * t,
    start_value.y + (end_value.y - start_value.y) * t
  );
}

void main() {
  vec2 uv = lerp(vertexUV, vertexUVEnd, age);
  // vec3 color = texture2D(globeTexture, vertexUV).xyz;
  vec3 color = texture2D(globeTexture, uv).xyz;
  gl_FragColor = vec4(color, 1.0);
}
