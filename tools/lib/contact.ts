/**
 * Rigid crust may not be in two places, and two pieces of it may not be in one.
 *
 * An island of strong crust -- a shield, a platform, a stable basin -- is the
 * part of the model that is not allowed to deform. Everything else in the
 * solver is a spring with an opinion, and a spring can be argued with; an
 * island cannot, which is the whole reason it exists. So two islands occupying
 * the same ground is not a soft failure like a bit of stretching. It is two
 * continents in the same place.
 *
 * It happens. Measured on the run before this file existed, the share of the
 * sphere under two different islands at once was zero out to 90 Ma and then
 * 0.002% at 120, 0.019% at 160 and 0.044% at 200 -- Arabia riding onto Africa
 * first and furthest, West Australia onto East Antarctica largest at 26,800
 * km2. Small, and no size is acceptable. Nothing forbade it: `holdIslands`
 * keeps each island's own shape with no notion of another island being in the
 * way, and `CONTACT_KM` is a threshold the scorecard reads, not a constraint
 * the solver obeys.
 *
 * What this refuses is interpenetration, not proximity. Two continents in
 * contact have their margins within a triangle of each other and that is what
 * contact means -- pushing every neighbouring pair apart by a mesh spacing
 * would open the Atlantic back up to keep the cratons tidy. So the test is
 * whether a point of one island lies *inside* a triangle of another, and the
 * push is out by the shallowest way it got in.
 */

import { bucketFace, cellOf, inside, type Tiling } from './coverage.js'

export interface IslandContacts {
  /** How many points of one island were found inside a triangle of another. */
  found: number
  /** The deepest of them this call, km. */
  deepestKm: number
}

/**
 * Push apart every point of one island that has got inside another.
 *
 * `buckets` is filled here from the island faces alone, so it must not be the
 * array the coverage pass uses. Fill it once per step: the sweeps move points
 * by kilometres and the grid's cells are two degrees, so a bucket list built at
 * the start of a step is still right at the end of one.
 */
export function separateIslands(
  pos: Float64Array,
  mesh: Tiling,
  faceCount: number,
  vertexCount: number,
  /** Which island each vertex belongs to, 0 for none. */
  vertexIsland: ArrayLike<number>,
  /** Which island each face belongs to, 0 unless all three corners agree. */
  faceIsland: ArrayLike<number>,
  /** Whether each vertex is still part of the surface. */
  vertexAlive: ArrayLike<number>,
  radiusKm: number,
  stiffness: number,
  buckets: number[][],
  /** Refill the buckets; pass false to reuse the ones from earlier in the step. */
  rebuild = true,
): IslandContacts {
  if (stiffness <= 0) return { found: 0, deepestKm: 0 }
  if (rebuild) {
    for (const list of buckets) list.length = 0
    for (let f = 0; f < faceCount; f++) {
      if (!mesh.faceAlive[f] || !faceIsland[f]) continue
      bucketFace(pos, mesh, f, buckets)
    }
  }

  const unit = [0, 0, 0]
  let found = 0
  let deepest = 0
  for (let v = 0; v < vertexCount; v++) {
    const island = vertexIsland[v]
    if (!island || !vertexAlive[v]) continue
    const at = v * 3
    const l = Math.hypot(pos[at], pos[at + 1], pos[at + 2]) || 1
    const vx = pos[at] / l, vy = pos[at + 1] / l, vz = pos[at + 2] / l
    for (const f of buckets[cellOf(vx, vy, vz)]) {
      if (faceIsland[f] === island) continue
      const a = mesh.faceVerts[f * 3] * 3
      const b = mesh.faceVerts[f * 3 + 1] * 3
      const c = mesh.faceVerts[f * 3 + 2] * 3
      if (a === at || b === at || c === at) continue
      if (!inside(pos, a, b, c, vx, vy, vz, unit)) continue

      // How far in, and which way is out. Each edge of the triangle lies in a
      // plane through the centre; the angle from the point to that plane is how
      // far it would have to travel to leave across that edge, and the smallest
      // of the three is the shallowest way out. Going out the shallow way is
      // what a contact does -- the deep way would carry a craton clean across
      // its neighbour.
      let depth = Infinity
      let nx = 0, ny = 0, nz = 0
      for (const [i, j, k] of [[a, b, c], [b, c, a], [c, a, b]] as const) {
        let ex = pos[i + 1] * pos[j + 2] - pos[i + 2] * pos[j + 1]
        let ey = pos[i + 2] * pos[j] - pos[i] * pos[j + 2]
        let ez = pos[i] * pos[j + 1] - pos[i + 1] * pos[j]
        const el = Math.hypot(ex, ey, ez)
        if (el < 1e-12) continue
        ex /= el; ey /= el; ez /= el
        // Point the normal at the corner the edge does not touch, so that
        // being inside the triangle is being on its positive side.
        const kl = Math.hypot(pos[k], pos[k + 1], pos[k + 2]) || 1
        if ((ex * pos[k] + ey * pos[k + 1] + ez * pos[k + 2]) / kl < 0) {
          ex = -ex; ey = -ey; ez = -ez
        }
        const sine = Math.max(-1, Math.min(1, ex * vx + ey * vy + ez * vz))
        const km = Math.asin(sine) * radiusKm
        if (km < depth) { depth = km; nx = ex; ny = ey; nz = ez }
      }
      if (!(depth > 0) || !Number.isFinite(depth)) continue
      found++
      if (depth > deepest) deepest = depth

      // Out by a share of the depth, and the triangle steps back by the same
      // amount split between its corners, so the pair of islands is not
      // quietly walked across the globe by its own contacts.
      const move = stiffness * depth
      pos[at] -= nx * move
      pos[at + 1] -= ny * move
      pos[at + 2] -= nz * move
      const share = move / 3
      for (const corner of [a, b, c]) {
        pos[corner] += nx * share
        pos[corner + 1] += ny * share
        pos[corner + 2] += nz * share
      }
    }
  }
  return { found, deepestKm: deepest }
}
