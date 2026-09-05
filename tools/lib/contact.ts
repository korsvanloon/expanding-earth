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
  /** Point-in-triangle tests done, so a slow run can say where it went. */
  tests: number
  /** Faces put into the grid, likewise. */
  bucketed: number
}

/**
 * Push apart every point of one island that has got inside another.
 *
 * The scratch holds the island faces bucketed by grid cell, plus the two things
 * that make this affordable: which cells hold more than one island, and the
 * list of island vertices. Rebuild it once per step -- the sweeps move points
 * by kilometres and a cell is two degrees, so lists built at the start of a
 * step are still right at the end of one.
 */
export interface ContactScratch {
  /** Faces of islands, listed per grid cell. */
  buckets: number[][]
  /**
   * Which island a cell holds faces of, and whether it holds more than one.
   *
   * The whole cost of this constraint is here. Without it every island vertex
   * walks the faces in its own cell on every sweep, which is eighty times a
   * step over seven thousand points, and almost all of that work is a continent
   * checking itself: one run took twenty-five minutes to reach 20 Ma. Two
   * islands can only interpenetrate where both are present, and that is a
   * handful of cells out of sixteen thousand, so a cell that holds one island
   * is skipped whole.
   */
  cellIsland: Int32Array
  mixed: Uint8Array
  /** The island vertices, listed once instead of scanned for every sweep. */
  members: Uint32Array
  /**
   * The turn each island's contacts have handed it, summed, as a rotation
   * vector about the centre of the Earth in radians.
   *
   * A rotation rather than a shove, for two reasons. On a sphere the rigid
   * motions *are* rotations about the centre: adding one vector to every point
   * of a continent walks its far edge off the shell. And a rotation vector
   * carries where the push landed -- the axis of a contact on a margin's north
   * end differs from one on its south end, so the two add to a turn instead of
   * cancelling. A contact against a rigid body is a torque as much as a shove,
   * and summing shoves alone throws the leverage away.
   */
  turn: Float64Array
  /**
   * Each island's inertia about the centre of the Earth, six numbers per
   * island: xx, yy, zz, xy, xz, yz of `sum(|p|^2 I - p p^T)`.
   *
   * This is what decides how a push becomes a turn, and it is not one number.
   * A continent is a patch on a shell: turning it about an axis through its
   * own middle -- a spin in place -- moves its points a few hundred kilometres
   * each, while turning it about an axis square to that carries them thousands.
   * The second is hundreds of times harder, so a shove off the centre of a
   * margin spins a continent long before it slides it. Dividing by the point
   * count instead, as if the two were equally hard, is what threw the leverage
   * away: it makes every island as reluctant to turn as it is to travel.
   */
  inertia: Float64Array
  /** Scratch for the turn each island works out this call. */
  spin: Float64Array
}

export function newContactScratch(cellCount: number): ContactScratch {
  return {
    buckets: Array.from({ length: cellCount }, () => []),
    cellIsland: new Int32Array(cellCount),
    mixed: new Uint8Array(cellCount),
    members: new Uint32Array(0),
    turn: new Float64Array(0),
    inertia: new Float64Array(0),
    spin: new Float64Array(0),
  }
}

export function separateIslands(
  pos: Float64Array,
  mesh: Tiling,
  faceCount: number,
  vertexCount: number,
  /** Which island each vertex belongs to, numbered from one, 0 for none. */
  vertexIsland: ArrayLike<number>,
  /** Which island each face belongs to, 0 unless all three corners agree. */
  faceIsland: ArrayLike<number>,
  /** Whether each vertex is still part of the surface. */
  vertexAlive: ArrayLike<number>,
  radiusKm: number,
  stiffness: number,
  scratch: ContactScratch,
  /** Refill the buckets; pass false to reuse the ones from earlier in the step. */
  rebuild = true,
  /**
   * Look without touching.
   *
   * How deep two islands are into each other is the number that says what kind
   * of failure this is, and the share of the sphere cannot say it. Arabia over
   * Africa is 12,455 km2 at 200 Ma, which sounds like two continents in the
   * same place; spread along 2,500 km of Red Sea it is a strip five kilometres
   * wide, and the deepest single point anywhere in a run is 41 km on a mesh
   * whose triangles are 129 km across. That is two rigid blocks meeting along
   * a suture the mesh is too coarse to draw, not a reconstruction putting a
   * continent in the wrong place -- and it is why pushing them apart wrecked
   * everything: a 5 km error being corrected by moving whole continents.
   */
  measureOnly = false,
): IslandContacts {
  if (stiffness <= 0 && !measureOnly) return { found: 0, deepestKm: 0, tests: 0, bucketed: 0 }
  let tests = 0
  let bucketed = 0
  const { buckets, cellIsland, mixed } = scratch
  if (rebuild) {
    for (const list of buckets) list.length = 0
    cellIsland.fill(0)
    mixed.fill(0)
    for (let f = 0; f < faceCount; f++) {
      if (!mesh.faceAlive[f] || !faceIsland[f]) continue
      bucketFace(pos, mesh, f, buckets)
      bucketed++
    }
    for (let cell = 0; cell < buckets.length; cell++) {
      for (const f of buckets[cell]) {
        const island = faceIsland[f]
        if (!cellIsland[cell]) cellIsland[cell] = island
        else if (cellIsland[cell] !== island) { mixed[cell] = 1; break }
      }
    }
    const members: number[] = []
    let most = 0
    for (let v = 0; v < vertexCount; v++) {
      if (!vertexIsland[v] || !vertexAlive[v]) continue
      members.push(v)
      if (vertexIsland[v] > most) most = vertexIsland[v]
    }
    scratch.members = Uint32Array.from(members)
    if (scratch.turn.length < (most + 1) * 3) {
      scratch.turn = new Float64Array((most + 1) * 3)
      scratch.inertia = new Float64Array((most + 1) * 6)
      scratch.spin = new Float64Array((most + 1) * 3)
    }
    scratch.inertia.fill(0)
    for (const v of scratch.members) {
      const island = vertexIsland[v]
      // Built once per step, with the rest of the scratch: a sweep moves a
      // point by a kilometre or two and this is a sum of squares of thousands.
      const at = v * 3
      const x = pos[at], y = pos[at + 1], z = pos[at + 2]
      const rr = x * x + y * y + z * z
      const i = island * 6
      scratch.inertia[i] += rr - x * x
      scratch.inertia[i + 1] += rr - y * y
      scratch.inertia[i + 2] += rr - z * z
      scratch.inertia[i + 3] -= x * y
      scratch.inertia[i + 4] -= x * z
      scratch.inertia[i + 5] -= y * z
    }
  }
  const { turn, inertia, spin } = scratch
  turn.fill(0)
  /** The deepest contact each island has this call, which caps its answer. */
  const worst = new Float64Array(turn.length / 3)

  const unit = [0, 0, 0]
  let found = 0
  let deepest = 0
  for (const v of scratch.members) {
    const island = vertexIsland[v]
    if (!island || !vertexAlive[v]) continue
    const at = v * 3
    const l = Math.hypot(pos[at], pos[at + 1], pos[at + 2]) || 1
    const vx = pos[at] / l, vy = pos[at + 1] / l, vz = pos[at + 2] / l
    const cell = cellOf(vx, vy, vz)
    // Nothing to be inside of, or nothing here but this point's own island.
    // Not `!mixed`: a point at the edge of its island can stand in a cell whose
    // faces all belong to the *other* one, and that is exactly the case this
    // exists to catch.
    if (!cellIsland[cell] || (!mixed[cell] && cellIsland[cell] === island)) continue
    for (const f of buckets[cell]) {
      const host = faceIsland[f]
      if (host === island) continue
      const a = mesh.faceVerts[f * 3] * 3
      const b = mesh.faceVerts[f * 3 + 1] * 3
      const c = mesh.faceVerts[f * 3 + 2] * 3
      if (a === at || b === at || c === at) continue
      tests++
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

      // Recorded against the two islands rather than applied to the two
      // points. A contact between rigid bodies moves the bodies; denting them
      // where they touch is what the first version did, and holdIslands spent
      // the rest of every sweep undoing the dent -- half a million contacts
      // over a run, the deepest never falling below 40 km, and the overlap it
      // was built to remove nine times worse at 160 Ma. That is two
      // constraints pulling against each other, not a solver converging.
      //
      // What the body is handed is the turn that would carry this point back
      // out across the edge: the rotation about `n x p` by the angle the depth
      // subtends. Its axis depends on where the point sits, which is how the
      // leverage survives -- two contacts on opposite ends of a margin hand
      // the island axes that add to a spin, where two shoves would cancel.
      // The impulse is `depth` kilometres along the way out, applied where the
      // point is, so the torque about the centre is `p x (-n) * depth`. Both
      // islands are handed the same torque with opposite signs, which is what
      // keeps the pair's angular momentum where it was.
      const tx = (ny * pos[at + 2] - nz * pos[at + 1]) * depth
      const ty = (nz * pos[at] - nx * pos[at + 2]) * depth
      const tz = (nx * pos[at + 1] - ny * pos[at]) * depth
      turn[island * 3] += tx
      turn[island * 3 + 1] += ty
      turn[island * 3 + 2] += tz
      turn[host * 3] -= tx
      turn[host * 3 + 1] -= ty
      turn[host * 3 + 2] -= tz
      if (depth > worst[island]) worst[island] = depth
      if (depth > worst[host]) worst[host] = depth
    }
  }

  // Each island turns once, by the torque its contacts handed it against its
  // own inertia -- so a small block gives way to a large one, a margin pressed
  // in at fifty points turns fifty times as hard as one, and the pair keeps
  // the angular momentum it had. Summed rather than averaged for the same
  // reason the shove it replaces was: fifty points really is fifty pushes.
  //
  // Applied as `w x p`, the small-angle form, which is exact enough here by
  // construction: the deepest contact in a run is a few tens of kilometres on
  // an Earth of thousands, spread over an island's whole inertia.
  if (found && !measureOnly) {
    for (let island = 1; island * 3 < turn.length; island++) {
      const t = island * 3
      if (!turn[t] && !turn[t + 1] && !turn[t + 2]) continue
      const w = solveSymmetric(inertia, island * 6, turn[t], turn[t + 1], turn[t + 2])
      if (!w) continue
      // A contact may not move a continent further than it was inside. The
      // cap almost never binds on the sliding part of the answer, where the
      // push is a sum of small depths against a whole island's inertia; it is
      // there for the spin, which is the part with a hundred times less
      // inertia under it and so the part that could run away.
      const travel = Math.hypot(w[0], w[1], w[2]) * radiusKm
      const room = travel > worst[island] ? worst[island] / travel : 1
      spin[t] = w[0] * stiffness * room
      spin[t + 1] = w[1] * stiffness * room
      spin[t + 2] = w[2] * stiffness * room
    }
    for (const v of scratch.members) {
      const island = vertexIsland[v]
      const t = island * 3
      const wx = spin[t], wy = spin[t + 1], wz = spin[t + 2]
      if (!wx && !wy && !wz) continue
      const at = v * 3
      const x = pos[at], y = pos[at + 1], z = pos[at + 2]
      pos[at] = x + wy * z - wz * y
      pos[at + 1] = y + wz * x - wx * z
      pos[at + 2] = z + wx * y - wy * x
    }
    spin.fill(0)
  }
  return { found, deepestKm: deepest, tests, bucketed }
}

/**
 * The turn a torque makes of a body: `w = I^-1 t`, for the symmetric `I`.
 *
 * Six numbers packed from `at`, in the order the scratch stores them. Returns
 * null where the inertia is singular, which is an island of one or two points
 * -- it has no axis to be stiff about, and there is nothing sensible to do
 * with a torque on it.
 */
function solveSymmetric(
  m: Float64Array, at: number, tx: number, ty: number, tz: number,
): [number, number, number] | null {
  /**
   * A nudge on the diagonal, because an island of one or two points has an
   * axis it has no inertia about at all -- the line through its own points.
   *
   * Turning about that axis moves none of them, so what the answer says there
   * cannot matter; the nudge is only so that the arithmetic has something to
   * divide by. A ninth of a billionth of the island's own scale is far below
   * anything a real island's shape could mean.
   */
  const nudge = 1e-9 * (m[at] + m[at + 1] + m[at + 2]) / 3
  const a = m[at] + nudge, b = m[at + 1] + nudge, c = m[at + 2] + nudge
  const d = m[at + 3], e = m[at + 4], f = m[at + 5]
  // Adjugate of [[a,d,e],[d,b,f],[e,f,c]], which is symmetric too.
  const A = b * c - f * f
  const D = e * f - d * c
  const E = d * f - e * b
  const B = a * c - e * e
  const F = e * d - a * f
  const C = a * b - d * d
  const det = a * A + d * D + e * E
  if (!Number.isFinite(det) || det === 0) return null
  return [
    (A * tx + D * ty + E * tz) / det,
    (D * tx + B * ty + F * tz) / det,
    (E * tx + F * ty + C * tz) / det,
  ]
}
