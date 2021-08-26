struct Plate {
  vec3 color;
  vec3 origin;
  vec3 destination;
  float rotation;
};

uniform sampler2D globeTexture;
uniform sampler2D platesMap;
uniform float age;
uniform Plate plates[3];
uniform vec2 origins[13];
uniform int origins_size;

varying vec2 vertexUV; // original position on the earth source maps
varying vec3 vertexNormal; // static normalized position on the globe
varying vec3 vertexPosition; // static position on the globe

const float PI = 3.1415926535897932384626433832795;
const vec3 northPole = vec3(0.0, 1.0, 0.0);
const float radius = 1.0;

Plate findPlate(vec3 color) {
  for(int i = 0; i < plates.length(); i++) {
    if(plates[i].color == color) {
      return plates[i];
    }
  }
  return Plate(vec3(0,0,0), vec3(0,0,0), vec3(0,0,0), 0.0);
}

// vec3 toColorVec(int color) {
//   return vec3();
// }

// u,v from [0..1]
vec3 toSpherePoint(vec2 uv) {
  float theta = 2.0 * PI * (uv.x - 0.75);
  float phi = PI * ( uv.y);
  return vec3(
    cos(theta) * sin(phi) * radius, // [1,0] * [0,1]
    cos(phi) * radius, // [1,0]
    -sin(theta) * sin(phi) * radius // [0,-1] * [0,1]
  );
}

vec2 toUvPoint(vec3 p) {
  return vec2(
    0.5 + atan(p.x, p.z) / (2.0 * PI),
    0.5 - asin(p.y) / PI
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

  // vec3 origin_spheres[13];
  // for(int i = 0; i < origins_size; i++) {
  //   origin_spheres[i] = toSpherePoint(origins[i]);
  // }

  // vec3 origin = toSpherePoint(origins[0]);


  // for(int i = 0; i < origins_size; i++) {
  //   vec3 p = origin_spheres[i];
  //   float a = abs(greatCircleAngle(p, vertex));
  //   if(a < angle) {
  //     angle = a;
  //     origin = p;
  //   }
  // }

  vec3 vertex = toSpherePoint(vertexUV);
  vec3 plateColor = texture2D(platesMap, vertexUV).xyz;
  vec3 origin = northPole;
  // vec3 origin = findPlate(plateColor).origin;

  float angle = greatCircleAngle(vertex, origin);

  float offset = (1.0 - age);
  // vec3 nextPoint = vertex;
  float b = bearing(vertex, origin);
  float na = angle * (age * 0.5);
  vec3 nextPoint = destinationPoint(vertex, b, na);
  vec2 uv = toUvPoint(nextPoint);
  // vec3 color = texture2D(globeTexture, uv).xyz;
  vec3 color = texture2D(globeTexture, vertexUV).xyz;
  gl_FragColor = vec4(color, 1.0);
}
