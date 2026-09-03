/**
 * Which way the sea floor moved, read off the age grid, and how far a claimed
 * conjugate pair disagrees with it.
 *
 * Sea floor leaves its spreading axis along the spreading direction, and that
 * is the direction in which its age climbs fastest -- the two are the same
 * statement. So the line joining two points that were once one point must run
 * along the local age gradient at each of its ends.
 *
 * This is the test that catches the failure the age test cannot. Two points can
 * have the same age, both sit on sea floor, and still be the wrong partners: a
 * point matched to one five hundred kilometres along the ridge from its true
 * conjugate passes every check that only looks at age. What it fails is
 * direction, because its join runs across the spreading direction instead of
 * along it. Measured over the pairs as traced, 11.4% were more than forty-five
 * degrees out, and split by age -- 11%, 13%, 5%, 15% over 0-10, 10-30, 30-60 and
 * 60-200 Ma -- which is what says it is real. A gradient is ill-defined *at* an
 * axis, where the age turns round, so a ruler at fault would have put all of it
 * in the youngest band and it does not.
 *
 * Kept in one place because the filter that drops those pairs and the picture
 * that shows what is left have to be measuring the same thing, or the map is of
 * a different set than the model runs on.
 */

/** How far to step when reading the gradient. Three cells of a tenth of a degree. */
const STEP_KM = 30
const EARTH_KM = 6371

/**
 * The unit direction, tangent to the sphere, in which the age climbs fastest.
 *
 * `at` reads the grid at a unit direction and returns NaN where it does not
 * date the crust. Null when either the age or the gradient is unavailable --
 * over land, or on the exact floor of a valley where there is no slope to read.
 */
export function spreadingDirection(
  at: (x: number, y: number, z: number) => number,
  x: number, y: number, z: number,
): readonly [number, number, number] | null {
  const step = STEP_KM / EARTH_KM
  // Any pair of tangents will do; pick the first from whichever axis is
  // furthest from the radius here, so nothing degenerates at a pole.
  const up = Math.abs(y) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let ex = [up[1] * z - up[2] * y, up[2] * x - up[0] * z, up[0] * y - up[1] * x]
  let length = Math.hypot(ex[0], ex[1], ex[2]) || 1
  ex = [ex[0] / length, ex[1] / length, ex[2] / length]
  let ey = [
    y * ex[2] - z * ex[1],
    z * ex[0] - x * ex[2],
    x * ex[1] - y * ex[0],
  ]
  length = Math.hypot(ey[0], ey[1], ey[2]) || 1
  ey = [ey[0] / length, ey[1] / length, ey[2] / length]

  const read = (dx: number, dy: number) => {
    const px = x + ex[0] * dx + ey[0] * dy
    const py = y + ex[1] * dx + ey[1] * dy
    const pz = z + ex[2] * dx + ey[2] * dy
    const l = Math.hypot(px, py, pz) || 1
    return at(px / l, py / l, pz / l)
  }
  const gx = read(step, 0) - read(-step, 0)
  const gy = read(0, step) - read(0, -step)
  if (Number.isNaN(gx) || Number.isNaN(gy) || (!gx && !gy)) return null
  const vx = ex[0] * gx + ey[0] * gy
  const vy = ex[1] * gx + ey[1] * gy
  const vz = ex[2] * gx + ey[2] * gy
  const vl = Math.hypot(vx, vy, vz) || 1
  return [vx / vl, vy / vl, vz / vl] as const
}

/**
 * How far the join from `a` to `b` is off the spreading direction at `a`, in
 * degrees. Zero is a pair straddling its axis square on; ninety is one matched
 * sideways along the ridge. Null when the gradient cannot be read.
 *
 * The gradient climbs away from the axis and the join runs towards it, so a
 * perfect pair is antiparallel and the angle is taken off a hundred and eighty.
 */
export function obliquityDeg(
  at: (x: number, y: number, z: number) => number,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number | null {
  const direction = spreadingDirection(at, a[0], a[1], a[2])
  if (!direction) return null
  let cx = b[0] - a[0]
  let cy = b[1] - a[1]
  let cz = b[2] - a[2]
  const radial = cx * a[0] + cy * a[1] + cz * a[2]
  cx -= radial * a[0]
  cy -= radial * a[1]
  cz -= radial * a[2]
  const chord = Math.hypot(cx, cy, cz)
  if (!chord) return null
  const dot = (cx * direction[0] + cy * direction[1] + cz * direction[2]) / chord
  return 180 - (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}
