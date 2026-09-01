/**
 * Where a point that lives inside a triangle actually is.
 *
 * A traced path is sampled every forty kilometres and the mesh has points a
 * hundred and twenty-nine apart, so a path point is stored as a place inside a
 * triangle: three mesh vertices and the weights that mix them. That was done so
 * a fracture zone would sit where the walk went instead of on a staircase of
 * nearest vertices, and it is right -- for as long as the three corners go on
 * being a triangle.
 *
 * They do not have to. The mesh redraws itself as it runs; over one shipped run
 * 164,175 edges were flipped and twenty-five thousand points collapsed away.
 * Once the stored triple has been flipped or collapsed apart its three vertices
 * are three unrelated places, and the weighted blend of them is not where the
 * crust went. It is somewhere in the middle of nothing.
 *
 * Measured on the shipped run, the share of stored triangles still intact:
 *
 * |        | 13 Ma | 38 Ma | 60 Ma | 90 Ma | 120 Ma |
 * |--------|-------|-------|-------|-------|--------|
 * | track points | 99.0% | 86.4% | 73.2% | 66.5% | 56.8% |
 * | pair ends    | 98.1% | 85.0% | 75.4% | 61.0% | 45.0% |
 *
 * The pairs are the model's headline score and the only thing the solver is
 * told to close, so at 120 Ma more than half of both the pulling and the
 * scoring was being done through a lens that had come apart.
 *
 * The rule here is deliberately the crudest one that is always defined: if the
 * three corners are still close enough to be a triangle, mix them; if they are
 * not, use the heaviest corner alone. That trades precision for validity --
 * the answer is then good to the mesh spacing rather than to a few kilometres
 * -- but a bounded error beats an unbounded one, and it needs no topology,
 * so the viewer and the solver cannot disagree about where a point is.
 */

/**
 * How far apart two corners of a live triangle can be, in km, before the
 * triple is treated as broken.
 *
 * A triangle's edges are about 129 km of crust at subdivision 6 and stay that
 * length whatever the globe does, because crust is not destroyed. Twice that
 * leaves room for the stretching the solver does allow and still catches a
 * triple whose corners have been carried apart.
 */
export const ANCHOR_SPREAD_KM = 300

export interface Anchored {
  x: number
  y: number
  z: number
  /** False when the triple had come apart and one corner was used alone. */
  intact: boolean
}

/**
 * Mix the three corners, or fall back to the heaviest.
 *
 * `positions` holds three numbers per vertex, `kmPerUnit` says how many
 * kilometres one of those units is (1 where positions are already in km, the
 * Earth's radius where the shell is drawn on a unit sphere), and `resolve`
 * maps a stored vertex to whichever vertex now carries its crust -- the
 * solver's survivor chain, or the identity in the viewer, where a dead vertex
 * is already written at its survivor's place.
 */
export function anchorPoint(
  positions: ArrayLike<number>,
  verts: ArrayLike<number>,
  weights: ArrayLike<number>,
  i: number,
  kmPerUnit: number,
  resolve: (v: number) => number = (v) => v,
): Anchored {
  const a = resolve(verts[i * 3]) * 3
  const b = resolve(verts[i * 3 + 1]) * 3
  const c = resolve(verts[i * 3 + 2]) * 3
  const limit = ANCHOR_SPREAD_KM / kmPerUnit
  // Straight-line distances: over 300 km a chord and an arc differ by under a
  // tenth of a percent, which no threshold here is sensitive to.
  const apart = (p: number, q: number) => {
    const dx = positions[p] - positions[q]
    const dy = positions[p + 1] - positions[q + 1]
    const dz = positions[p + 2] - positions[q + 2]
    return dx * dx + dy * dy + dz * dz
  }
  const worst = Math.max(apart(a, b), apart(b, c), apart(c, a))
  if (worst <= limit * limit) {
    const wa = weights[i * 3], wb = weights[i * 3 + 1], wc = weights[i * 3 + 2]
    return {
      x: wa * positions[a] + wb * positions[b] + wc * positions[c],
      y: wa * positions[a + 1] + wb * positions[b + 1] + wc * positions[c + 1],
      z: wa * positions[a + 2] + wb * positions[b + 2] + wc * positions[c + 2],
      intact: true,
    }
  }
  let at = a
  let heaviest = weights[i * 3]
  if (weights[i * 3 + 1] > heaviest) { heaviest = weights[i * 3 + 1]; at = b }
  if (weights[i * 3 + 2] > heaviest) { at = c }
  return { x: positions[at], y: positions[at + 1], z: positions[at + 2], intact: false }
}
