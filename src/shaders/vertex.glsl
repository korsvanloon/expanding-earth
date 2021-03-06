attribute vec2 endUv;

varying vec2 vertexUV;
varying vec2 vertexUVEnd;
// varying vec3 vertexPosition;
// varying vec3 vertexNormal;
uniform float age;

void main() {
  vertexUV = uv;
  vertexUVEnd = endUv;
  // vertexPosition = position;
  // vertexNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0) * age;
}
