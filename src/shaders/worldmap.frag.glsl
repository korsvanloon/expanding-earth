#define PI 3.1415926535897932384626433832795

uniform sampler2D topographicTexture;
uniform sampler2D densityTexture;
uniform sampler2D areaTexture;
uniform vec3 centerLatLng;
uniform vec2 mouseLatLng;

varying vec2 vertexUV; // position on the plane
// vec2 latlng => λ:lng:x, φ:lat:y
// vec2 centerLatLng = vec2(0, 0.5 * PI);
float radius = 0.5;
vec2 circleCenter = vec2(0.5, 0.5);

bool withinCircle(vec2 uv) {
  float d = sqrt(pow(uv.x - circleCenter.x, 2.0) + pow(uv.y - circleCenter.y, 2.0));
  return d <= radius;
}

vec2 uvToPixel(vec2 uv) {
  return vec2(
    uv.x - 0.5,
    uv.y - 0.5
  );
}

vec2 pixelToOrthographicLatLng(vec2 pixel) {
  float ro = sqrt(pow(pixel.x, 2.0) + pow(pixel.y, 2.0));
  float c = asin(ro / radius);

  return vec2(
    centerLatLng.x +
    atan(
      (pixel.x * sin(c)),
      (
        ro * cos(c) * cos(centerLatLng.y) -
        pixel.y * sin(c) * sin(centerLatLng.y)
      )
    ),
    asin(
      cos(c) * sin(centerLatLng.y) +
      (pixel.y * sin(c) * cos(centerLatLng.y)) / ro
    )
  );
}

// vec2 latlng => λ:lng:x, φ:lat:y
vec2 latLngToUv(vec2 latLng) {
  return vec2(
    (latLng.x + PI) / (2.0 * PI),
    (latLng.y + PI * 0.5) / PI
  );
}

vec3 lerp(vec3 start_value, vec3 end_value, float t) {
  return vec3(
    start_value.x + (end_value.x - start_value.x) * t,
    start_value.y + (end_value.y - start_value.y) * t,
    start_value.z + (end_value.z - start_value.z) * t
  );
}

bool closeTo(vec3 a, vec3 b) {
  float tolerance = 0.0;
  return
    !(a.x == 0.0 && a.y == 0.0 && a.z == 0.0) &&
    !(b.x == 0.0 && b.y == 0.0 && b.z == 0.0) &&
    abs(a.x - b.x) + abs(a.y - b.y) + abs(a.y - b.y) <= tolerance;
}

vec2 roundTo1024(vec2 v) {
  return vec2(
    round(v.x * 2048.0) / 2048.0,
    round(v.y * 1024.0) / 1024.0
  );
}

void main() {

  if(!withinCircle(vertexUV)) {
    return;
  }

  vec2 uv = latLngToUv(pixelToOrthographicLatLng(uvToPixel(vertexUV)));
  vec2 mouseUV = latLngToUv(mouseLatLng);

  vec3 topographicColor = texture2D(topographicTexture, uv).xyz;
  vec3 densityColor = texture2D(densityTexture, uv).xyz;
  vec3 countriesColor = texture2D(areaTexture, uv).xyz;
  vec3 mouseCountriesColor = texture2D(areaTexture, mouseUV).xyz;
  vec3 color = topographicColor * 0.5;

  // Add yellow population density spots.
  if(densityColor.x > 0.0 || densityColor.y > 0.0) {
    color += densityColor * vec3(0.5, 0.5, 0.0);
  }
  // Highlight current country
  if(closeTo(countriesColor, mouseCountriesColor)) {
    color += topographicColor * 0.2;
    // color += vec3(0.2, 0.2, 0.2);
  }

  gl_FragColor = vec4(color, 1.0);
}

