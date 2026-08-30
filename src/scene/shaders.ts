export const vertexShader = /* glsl */ `
in vec3 aDir;
in float aAge;
in float aStrain;

out vec3 vDir;
out float vAge;
out float vStrain;
out vec3 vNormal;

void main() {
  vDir = aDir;
  vAge = aAge;
  vStrain = aStrain;
  // The mesh is always a sphere, so the outward normal is just the position.
  vNormal = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D uMap;
uniform float uTimeMa;
uniform float uMaxAgeMa;
uniform int uMode;        // 0 surface, 1 crustal age, 2 strain
uniform float uGrid;
uniform vec3 uLight;

in vec3 vDir;
in float vAge;
in float vStrain;
in vec3 vNormal;

out vec4 fragColor;

const float PI = 3.14159265;
const float PERMANENT = 1.0e8;

/**
 * Colour space, which three.js handles for its own materials but not for a
 * custom one on GLSL3 -- it skips declaring the output and with it the
 * conversion (see WebGLProgram, the glslVersion === GLSL3 branch).
 *
 * The texture is still decoded from sRGB to linear when it is sampled, so
 * without putting it back on the way out every colour is written far darker
 * than it should be. Lighting has to happen in linear, so colours written as
 * literals here are given in sRGB, the way one actually picks a colour, and
 * converted on the way in.
 */
vec3 srgbToLinear(vec3 c) {
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, vec3(lessThanEqual(c, vec3(0.04045))));
}

vec3 linearToSrgb(vec3 c) {
  return mix(1.055 * pow(c, vec3(0.41666)) - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}

/**
 * GLSL twin of directionToUv in shared/sphere.ts. The two must stay identical:
 * that function decides which crust a triangle is made of, this one decides
 * which pixel gets painted on it.
 *
 * The z is negated so that east runs to the right when the globe is seen from
 * outside with north up. Without it everything is still self-consistent, just
 * mirrored. v is inverted because three.js uploads images flipped, so v = 1 is
 * the top row of the texture, where the north pole belongs.
 */
vec2 dirToUv(vec3 d) {
  return vec2(atan(-d.z, d.x) / (2.0 * PI) + 0.5, 1.0 - acos(clamp(d.y, -1.0, 1.0)) / PI);
}

/**
 * Sample the surface map by the crust's own present-day direction, so the
 * texture rides along with the rock wherever the reconstruction puts it.
 *
 * Taking the direction vector rather than a stored UV means there is no seam to
 * patch: a triangle spanning the date line interpolates a 3D vector, which does
 * not wrap. What does wrap is the longitude computed from it, and the resulting
 * derivative spike would pick the coarsest mip and draw a bright line down the
 * Pacific. Sampling with explicit gradients, taken from whichever of two
 * half-turn-offset parameterisations is continuous here, removes it.
 */
vec3 surface(vec3 d) {
  vec2 uv = dirToUv(d);
  vec2 shifted = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec2 sx = dFdx(shifted), sy = dFdy(shifted);
  if (dot(dx, dx) + dot(dy, dy) > dot(sx, sx) + dot(sy, sy)) { dx = sx; dy = sy; }
  return textureGrad(uMap, uv, dx, dy).rgb;
}

/** Age of the sea floor, in the usual warm-is-young convention. */
vec3 ageRamp(float ageMa) {
  float t = clamp(ageMa / uMaxAgeMa, 0.0, 1.0);
  vec3 c = mix(vec3(0.85, 0.13, 0.11), vec3(0.95, 0.62, 0.16), smoothstep(0.0, 0.18, t));
  c = mix(c, vec3(0.92, 0.87, 0.30), smoothstep(0.14, 0.32, t));
  c = mix(c, vec3(0.34, 0.68, 0.36), smoothstep(0.28, 0.5, t));
  c = mix(c, vec3(0.18, 0.55, 0.75), smoothstep(0.45, 0.72, t));
  c = mix(c, vec3(0.36, 0.25, 0.62), smoothstep(0.68, 1.0, t));
  return srgbToLinear(c);
}

/** Diverging: blue where the model compresses crust, red where it stretches it. */
vec3 strainRamp(float strain) {
  float t = clamp(strain / 0.12, -1.0, 1.0);
  vec3 cold = vec3(0.16, 0.38, 0.72);
  vec3 warm = vec3(0.78, 0.21, 0.16);
  vec3 neutral = vec3(0.90, 0.89, 0.86);
  return srgbToLinear(t < 0.0 ? mix(neutral, cold, -t) : mix(neutral, warm, t));
}

void main() {
  float sinceBirth = vAge - uTimeMa;
  bool exists = sinceBirth >= 0.0;
  bool continental = vAge > PERMANENT;

  vec3 base;
  float glow = 0.0;

  if (!exists) {
    // Crust that has not formed yet. Played forwards this is the moment it
    // erupts at a ridge, so it starts incandescent and darkens as it cools.
    float heat = exp(sinceBirth * 0.4);
    base = srgbToLinear(mix(vec3(0.03, 0.03, 0.05), vec3(1.0, 0.42, 0.08), heat));
    glow = heat;
  } else if (uMode == 0) {
    base = surface(vDir);
  } else if (uMode == 1) {
    // Continental crust has no sea-floor age, so it gets a neutral tint --
    // shaded by the surface map's brightness so the landmasses stay legible
    // instead of merging into one blank field.
    float relief = dot(surface(vDir), vec3(0.299, 0.587, 0.114));
    base = continental
      ? srgbToLinear(vec3(0.60, 0.56, 0.49)) * (0.65 + 0.9 * relief)
      : ageRamp(sinceBirth);
  } else {
    base = strainRamp(vStrain);
  }

  if (uGrid > 0.5 && exists) {
    vec2 uv = dirToUv(vDir) * vec2(360.0, 180.0);
    vec2 grid = abs(fract(uv / 15.0 - 0.5) - 0.5) / fwidth(uv / 15.0);
    float line = 1.0 - min(min(grid.x, grid.y), 1.0);
    base = mix(base, vec3(0.0), line * 0.35);
  }

  float lambert = max(dot(normalize(vNormal), normalize(uLight)), 0.0);
  vec3 lit = base * (0.30 + 0.85 * lambert) + glow * srgbToLinear(vec3(0.9, 0.32, 0.06));
  fragColor = vec4(linearToSrgb(min(lit, vec3(1.0))), 1.0);
}
`
