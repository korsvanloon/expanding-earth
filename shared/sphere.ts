/**
 * The one mapping between a direction on the sphere and a place on an
 * equirectangular map.
 *
 * The offline pipeline and the fragment shader both use it and must agree: the
 * pipeline decides which crust each triangle is made of, the shader decides
 * which pixel is painted on it, and if the two disagree the continents drift
 * off their own crust. `dirToUv` in src/scene/shaders.ts is the GLSL twin of
 * this function; change one and change the other.
 *
 * Handedness is the part that is easy to get wrong, because getting it wrong
 * still produces a perfectly consistent world -- just a mirror image of the
 * real one, which is only obvious once you notice Arabia sitting east of India.
 * Viewed from outside the sphere with north up, east has to run to the right,
 * and that fixes the sign: longitude is atan2(-z, x), not atan2(z, x).
 */
export function directionToUv(x: number, y: number, z: number): [u: number, v: number] {
  const u = Math.atan2(-z, x) / (2 * Math.PI) + 0.5
  const v = 1 - Math.acos(Math.min(1, Math.max(-1, y))) / Math.PI
  return [u, v]
}

/** Unit direction for a longitude and latitude in radians. Inverse of the above. */
export function lonLatToDirection(lon: number, lat: number): [number, number, number] {
  const c = Math.cos(lat)
  return [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
}

/**
 * Pixel of an equirectangular raster for a direction. Row 0 is the north pole,
 * which is the top row of the image and therefore v = 1.
 */
export function directionToPixel(
  x: number, y: number, z: number, width: number, height: number,
): [column: number, row: number] {
  const [u, v] = directionToUv(x, y, z)
  const column = ((Math.floor(u * width) % width) + width) % width
  const row = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)))
  return [column, row]
}
