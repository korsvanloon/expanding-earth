export const vertexShader = /* glsl */ `
in vec3 aDir;
in float aIsland;
in float aAge;
in float aStrain;
in float aRigidity;
in float aFabric;

out vec3 vDir;
out float vIsland;
out float vAge;
out float vStrain;
out float vRigidity;
out float vFabric;
out vec3 vNormal;

void main() {
  vDir = aDir;
  vIsland = aIsland;
  vAge = aAge;
  vStrain = aStrain;
  vRigidity = aRigidity;
  vFabric = aFabric;
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
uniform int uMode;        // 0 surface, 1 crustal age, 2 strain, 3 rigidity, 4 islands, 5 fabric
uniform float uGrid;
uniform vec3 uLight;
/** Below 1 the shell turns to glass, so the mesh and the far side show through. */
uniform float uOpacity;

in vec3 vDir;
in float vIsland;
in float vAge;
in float vStrain;
in float vRigidity;
in float vFabric;
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

/**
 * A repeating hue per island. There are more islands than hues and neighbours
 * differ, which is what matters for seeing where one ends.
 */
vec3 islandRamp(float id) {
  float h = fract(id * 0.2469);
  vec3 c = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return srgbToLinear(mix(vec3(0.55), c, 0.75));
}

/**
 * How worked the crust is, from the gravity gradient. One hue, dark where the
 * crust has been left alone and bright where it has been cut about, because
 * this is a magnitude and not two things either side of a middle.
 *
 * The scale is logarithmic on purpose. Roughness runs from about 7 Eotvos per
 * 100 km over a platform to over 600 along a continental arc, and on a linear
 * ramp the whole ocean floor and every shield come out the same near-black.
 */
vec3 fabricRamp(float roughness) {
  float t = clamp(log2(max(roughness, 4.0) / 8.0) / log2(512.0 / 8.0), 0.0, 1.0);
  vec3 quiet = vec3(0.09, 0.11, 0.16);
  vec3 middle = vec3(0.29, 0.42, 0.55);
  vec3 busy = vec3(0.97, 0.87, 0.62);
  return srgbToLinear(t < 0.55 ? mix(quiet, middle, t / 0.55) : mix(middle, busy, (t - 0.55) / 0.45));
}

/** Weak crust dark red through to rigid craton pale, so the necks stand out. */
vec3 rigidityRamp(float r) {
  vec3 weak = vec3(0.62, 0.16, 0.20);
  vec3 middle = vec3(0.86, 0.68, 0.35);
  vec3 rigid = vec3(0.93, 0.93, 0.90);
  return srgbToLinear(r < 0.5 ? mix(weak, middle, r * 2.0) : mix(middle, rigid, (r - 0.5) * 2.0));
}


void main() {
  bool continental = vAge > PERMANENT;

  vec3 base;

  // Nothing is shaded as not-yet-formed any more. The solver closes crust away
  // as it un-forms rather than crumpling it into a corner, so a triangle whose
  // sea floor had not erupted yet has already been collapsed to nothing and
  // takes up no pixels. Asking each vertex whether it exists was also the wrong
  // question once vertices can absorb one another: a point that swallows its
  // neighbour goes on carrying that neighbour's crust while remembering only
  // its own age, and the globe grew dark patches over ground that was there.
  if (uMode == 0) {
    base = surface(vDir);
  } else if (uMode == 3) {
    base = rigidityRamp(vRigidity);
  } else if (uMode == 5) {
    base = fabricRamp(vFabric);
  } else if (uMode == 4) {
    // Crust belonging to no island is the ground that is free to deform, and
    // it is shown as the surface it is rather than as a blank, so the islands
    // read as what they are: the parts held still.
    float relief = dot(surface(vDir), vec3(0.299, 0.587, 0.114));
    base = vIsland < 0.5
      ? srgbToLinear(vec3(0.22, 0.23, 0.26)) * (0.5 + relief)
      : islandRamp(vIsland);
  } else if (uMode == 1) {
    // Continental crust has no sea-floor age, so it gets a neutral tint --
    // shaded by the surface map's brightness so the landmasses stay legible
    // instead of merging into one blank field.
    float relief = dot(surface(vDir), vec3(0.299, 0.587, 0.114));
    // Coloured by the crust's age today, not by how long it had existed at
    // this moment. A band keeps its colour for the whole run, so winding the
    // clock back makes the red crust vanish first, then the orange, then the
    // yellow -- and you can watch the oceans close in the order the age grid
    // says they opened. Colouring by the age at the time repaints every band
    // on every step, which looks alive but says nothing you can check.
    base = continental
      ? srgbToLinear(vec3(0.60, 0.56, 0.49)) * (0.65 + 0.9 * relief)
      : ageRamp(vAge);
  } else {
    base = strainRamp(vStrain);
  }

  if (uGrid > 0.5) {
    vec2 uv = dirToUv(vDir) * vec2(360.0, 180.0);
    vec2 grid = abs(fract(uv / 15.0 - 0.5) - 0.5) / fwidth(uv / 15.0);
    float line = 1.0 - min(min(grid.x, grid.y), 1.0);
    base = mix(base, vec3(0.0), line * 0.35);
  }

  // Seen through the shell, the far side is drawn from behind and its outward
  // normal points away from us. Turning it round lights it as the surface it
  // is rather than leaving half the globe in shadow.
  vec3 normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  float lambert = max(dot(normal, normalize(uLight)), 0.0);
  vec3 lit = base * (0.30 + 0.85 * lambert);
  fragColor = vec4(linearToSrgb(min(lit, vec3(1.0))), uOpacity);
}
`
