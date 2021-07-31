varying vec3 vertexNormal;

void main() {
  float intensity = pow(0.6 - dot(vertexNormal, vec3(0.0, 0.0, 1.0)), 2.0);
  vec3 color = vec3(0.3, 0.6, 1.0);

  gl_FragColor = vec4(color, 1.0) * intensity;
}