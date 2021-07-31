uniform sampler2D globeTexture;
uniform float age;
uniform vec2 origins[15];

varying vec2 vertexUV; // original position on the earth source maps
varying vec3 vertexNormal; // position on the globe

void main() {
  float intensity = 1.05 - dot(vertexNormal, vec3(0.0, 0.0, 0.1));
  vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 1.5);

  vec2 origin = origins[0];
  float origin_distance = 2.0;

  for(int i = 0; i < origins.length(); i++) {
    if(distance(origins[i], vertexUV) < origin_distance) {
      origin_distance = distance(origins[i], vertexUV);
      origin = origins[i];
    }
  }

  vec2 direction = origin - vertexUV;
  float offset = (age - 0.5);

  // vec3 coordinate = 
  // uv to lat/lng
  // origin to lat/lng
  // direction = 
  // vec2 offset = vec2(1, 1) * age;


  vec2 uv = vertexUV + direction * offset;
  vec3 color = texture2D(globeTexture, uv).xyz;
  gl_FragColor = vec4(age * color, 1.0);
}

vec2 toLatLng(vec2 uv) {

}