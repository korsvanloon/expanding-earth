uniform sampler2D globeTexture;
uniform float age;
uniform vec2 origins[1];
uniform int origins_size;

varying vec2 vertexUV; // original position on the earth source maps
varying vec3 vertexNormal; // position on the globe

const float PI = 3.1415926535897932384626433832795;
const vec3 northPole = vec3(0.0, 0.0, 1.0);
const float radius = 1.0;

vec3 toSpherePoint(vec2 uv) {
  float theta = 2.0 * PI * uv.x;
  float phi = PI * uv.y;
  return vec3(
    -cos(theta) * sin(phi) * radius,
    -cos(phi) * radius,
    sin(theta) * sin(phi) * radius
  );
}

vec2 toUvPoint(vec3 p) {
  return vec2(
    0.5 + atan(p.x, p.z) / (2.0 * PI),
    0.5 + asin(p.y) / PI
    // 0.5 + atan(p.x, p.z) / (2.0 * PI),
    // 0.5 - asin(p.y) / PI
  );
}

float greatCircleAngle(vec3 n1, vec3 n2) {
  return acos(dot(n1, n2));
}

float nextAngle(float d) {
   return asin(d / (2.0 * radius));
}

float bearing(vec3 a, vec3 b) {
  vec3 c1 = cross(a, b);
  vec3 c2 = cross(a, northPole);

  return atan(
    length(cross(c1, c2)) * sign(dot(cross(c1, c2), a)),
    dot(c1, c2)
  );
}

vec3 destinationPoint(vec3 start_point, float bearing, float distance_) {
  vec3 de = cross(northPole, start_point);
  vec3 dn = cross(start_point, de);
  vec3 d = dn * cos(bearing) + de * sin(bearing);
  return start_point * cos(distance_) + d * sin(distance_);
}

void main() {
  // float intensity = 1.05 - dot(vertexNormal, vec3(0.0, 0.0, 0.1));
  // vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 1.5);

  // vec2 origin = origins[0];
  vec3 origin = toSpherePoint(origins[0]);
  float angle = 20000.0;
  // vec3 vertex = toSpherePoint(vertexUV);
  vec3 vertex = toSpherePoint(vertexUV);

  for(int i = 0; i < origins_size; i++) {
    vec3 p = toSpherePoint(origins[i]);
    float a = greatCircleAngle(p, vertex);
    if(a < angle) {
      angle = a;
      origin = p;
    }
  }

  float offset = 1.0 - age;
  // vec3 nextPoint = vertex;
  vec3 nextPoint = destinationPoint(vertex, -bearing(origin, vertex), nextAngle(offset));
  vec2 uv = toUvPoint(nextPoint);
  // vec2 uv = vertexUV + direction * offset;
  vec3 color = texture2D(globeTexture, uv).xyz;
  gl_FragColor = vec4(color, 1.0);
}

