/**
 * Does the crust cover the sphere it had to lie on?
 *
 * This is the number the whole model is judged by, and it is not answerable by
 * summing triangle areas: a sheet folded over itself in one place and short in
 * another adds up to exactly the right total while covering neither. So the sky
 * is counted directly -- a fixed set of directions, each asked whether any live
 * triangle lies that way.
 *
 * It used to ask the wrong directions. The probes were the vertices of a
 * subdivision-5 icosphere and the shell is a subdivision-6 one, which makes
 * every single probe a vertex of the mesh -- a point six triangles share. Two
 * of any vertex's three edge planes pass through it, so the inside test was
 * left deciding on one edge, and the answer was whatever the rounding of a
 * quantity that should have been exactly zero happened to be. The measure read
 * 0.00% uncovered at every frame of every run, which was taken for years as the
 * model closing perfectly, while it also read 1.84% covered twice at the
 * present day, where an untouched icosphere must be 0. Neither figure meant
 * anything.
 *
 * So the probes are now a Fibonacci spiral: quasi-uniform, deterministic, and
 * bearing no structural relation to a geodesic mesh, so no probe lands on a
 * vertex or an edge. That is what makes the inside test's zero case
 * unreachable rather than routine.
 *
 * This lives in its own file so it can be tested. An intact icosphere covers
 * every direction exactly once, which is a thing a coverage measure must report
 * and this one could not; it also has to see a single triangle taken out of
 * five thousand, and a triangle folded onto its neighbour. All three are pinned
 * in test/model.test.ts.
 *
 * Fixing it did not change the answer, which was worth knowing either way: the
 * bare figure is still 0.0000% at every frame, so the crust really does tile,
 * and the present-day overlap fell from 1.836% to exactly zero. The claim now
 * rests on a measurement instead of on a coincidence.
 *
 * There was a second fault underneath, found only once the probes were generic:
 * faces were bucketed for lookup by a bounding box taken from their corners,
 * and a great-circle edge bulges polewards of its endpoints, so probes properly
 * inside a triangle could fall in a cell that never listed it. That cost 13
 * probes in 20,000 on a shell with no holes in it at all -- a bias towards
 * reporting gaps that were not there.
 */

export const GRID_ROWS = 90
export const GRID_COLS = 180

/** What a mesh has to offer for its coverage to be measured. */
export interface Tiling {
  /** Three vertex indices per face. */
  faceVerts: ArrayLike<number>
  /** Whether each face is still part of the surface. */
  faceAlive: ArrayLike<number>
}

/**
 * `count` directions spread quasi-uniformly over the sphere.
 *
 * The golden-angle spiral: turn by the golden angle at each step while walking
 * evenly in height. It has no symmetry a geodesic mesh shares, which is the
 * whole point -- a probe set built the way the mesh is built samples the mesh's
 * corners rather than its interior.
 */
export function probeDirections(count: number): Float64Array {
  const out = new Float64Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    // Half-integer offsets on both counts. On height, to keep the first and last
    // points off the poles, where an equirectangular cell grid is most
    // distorted. On angle, because the spiral starts at theta = 0, which makes
    // the very first probe's z exactly zero -- and an icosahedron's vertices sit
    // in the coordinate planes, so that one direction lay exactly in the edge
    // planes of four triangles and all four claimed it. One probe in twenty
    // thousand, entirely from starting the spiral at a round number.
    const y = 1 - (2 * (i + 0.5)) / count
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * (i + 0.5)
    out[i * 3] = Math.cos(theta) * radius
    out[i * 3 + 1] = y
    out[i * 3 + 2] = Math.sin(theta) * radius
  }
  return out
}

/** Which cell of the lookup grid a direction falls in. */
/**
 * The grid cell a direction falls in. Exported so the island contact test can
 * look faces up in the same buckets `bucketFace` fills.
 */
export function cellOf(x: number, y: number, z: number): number {
  const length = Math.sqrt(x * x + y * y + z * z) || 1
  const lat = Math.asin(Math.min(1, Math.max(-1, y / length)))
  const lon = Math.atan2(z / length, x / length)
  const row = Math.min(GRID_ROWS - 1, Math.floor(((lat + Math.PI / 2) / Math.PI) * GRID_ROWS))
  const col = Math.min(GRID_COLS - 1, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * GRID_COLS))
  return row * GRID_COLS + col
}

/**
 * The cell each probe falls in, worked out once.
 *
 * One owner for this: the caller used to compute it with the row and column
 * counts written out again by hand, so changing the grid in one place would
 * have quietly sent every probe to the wrong cell.
 */
export function probeCells(probes: Float64Array): Uint32Array {
  const cells = new Uint32Array(probes.length / 3)
  for (let p = 0; p < cells.length; p++) {
    cells[p] = cellOf(probes[p * 3], probes[p * 3 + 1], probes[p * 3 + 2])
  }
  return cells
}

/** Scratch lists of which faces reach which cell, reused between frames. */
export function cellBuckets(): number[][] {
  return Array.from({ length: GRID_ROWS * GRID_COLS }, () => [])
}

/**
 * Whether a direction falls inside a spherical triangle, either way up.
 *
 * A direction is inside when it is on the same side of all three edge planes.
 * `side === 0` means it lies exactly in an edge plane, where no answer is right
 * for both triangles sharing that edge; skipping the test there is only safe
 * because the probes are chosen so it cannot happen. It used to happen for
 * every probe -- see the note at the top of this file.
 */
export function inside(
  pos: Float64Array, a: number, b: number, c: number,
  dx: number, dy: number, dz: number, unit: number[],
  /** Receives a mark per edge the direction lay exactly in; cleared each call. */
  boundary: number[] = [],
): boolean {
  boundary.length = 0
  let sign = 0
  for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
    unit[0] = pos[i + 1] * pos[j + 2] - pos[i + 2] * pos[j + 1]
    unit[1] = pos[i + 2] * pos[j] - pos[i] * pos[j + 2]
    unit[2] = pos[i] * pos[j + 1] - pos[i + 1] * pos[j]
    const side = unit[0] * dx + unit[1] * dy + unit[2] * dz
    if (side === 0) {
      boundary.push(1)
      continue
    }
    const s = side > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (sign !== s) return false
  }
  return sign !== 0
}

/**
 * List a face in every grid cell it could possibly reach.
 *
 * A bounding box taken from the three corners is not enough, and getting this
 * wrong shows up as a gap rather than as an error: an edge of a spherical
 * triangle is a great-circle arc, which bulges polewards of the straight line
 * between its endpoints, so a probe genuinely inside the triangle can sit in a
 * cell the corners never touched. The face is then never tested against it and
 * the sky reads as bare. An intact icosphere lost 13 probes in 20,000 that way.
 *
 * So the face is bounded by a cap instead -- its centroid, and the angle to its
 * furthest corner -- and the cap is turned into a row range and, per row, the
 * column range that row's latitude actually needs. Near a pole that is the
 * whole row, which is the case a fixed margin in columns can never get right.
 */
export function bucketFace(
  pos: Float64Array, mesh: Tiling, f: number, buckets: number[][],
): void {
  let cx = 0, cy = 0, cz = 0
  for (let k = 0; k < 3; k++) {
    const v = mesh.faceVerts[f * 3 + k] * 3
    const length = Math.sqrt(pos[v] * pos[v] + pos[v + 1] * pos[v + 1] + pos[v + 2] * pos[v + 2]) || 1
    cx += pos[v] / length; cy += pos[v + 1] / length; cz += pos[v + 2] / length
  }
  const centre = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1
  cx /= centre; cy /= centre; cz /= centre

  let smallestDot = 1
  for (let k = 0; k < 3; k++) {
    const v = mesh.faceVerts[f * 3 + k] * 3
    const length = Math.sqrt(pos[v] * pos[v] + pos[v + 1] * pos[v + 1] + pos[v + 2] * pos[v + 2]) || 1
    const dot = (pos[v] * cx + pos[v + 1] * cy + pos[v + 2] * cz) / length
    if (dot < smallestDot) smallestDot = dot
  }
  // A cell of the grid is two degrees across, so one cell of slack covers both
  // the arc bulge beyond the corners and the rounding at a cell boundary.
  const cell = Math.PI / GRID_ROWS
  const radius = Math.min(Math.PI, Math.acos(Math.min(1, Math.max(-1, smallestDot))) + cell)

  const lat0 = Math.asin(Math.min(1, Math.max(-1, cy)))
  const lon0 = Math.atan2(cz, cx)
  const rowOf = (lat: number) =>
    Math.min(GRID_ROWS - 1, Math.max(0, Math.floor(((lat + Math.PI / 2) / Math.PI) * GRID_ROWS)))
  const rowLo = rowOf(lat0 - radius)
  const rowHi = rowOf(lat0 + radius)

  for (let row = rowLo; row <= rowHi; row++) {
    // The latitude of whichever edge of this row's band lies nearest the cap
    // centre, which is where the cap reaches furthest in longitude.
    const low = ((row / GRID_ROWS) * Math.PI) - Math.PI / 2
    const high = (((row + 1) / GRID_ROWS) * Math.PI) - Math.PI / 2
    const lat = Math.min(high, Math.max(low, lat0))
    const denominator = Math.cos(lat0) * Math.cos(lat)
    let halfWidth = Math.PI
    if (denominator > 1e-12) {
      const wanted = (Math.cos(radius) - Math.sin(lat0) * Math.sin(lat)) / denominator
      if (wanted > 1) continue
      if (wanted > -1) halfWidth = Math.acos(wanted)
    }
    if (halfWidth >= Math.PI - 1e-9) {
      for (let col = 0; col < GRID_COLS; col++) buckets[row * GRID_COLS + col].push(f)
      continue
    }
    const span = Math.ceil((halfWidth / (2 * Math.PI)) * GRID_COLS) + 1
    const centreCol = Math.floor(((lon0 + Math.PI) / (2 * Math.PI)) * GRID_COLS)
    if (2 * span + 1 >= GRID_COLS) {
      for (let col = 0; col < GRID_COLS; col++) buckets[row * GRID_COLS + col].push(f)
      continue
    }
    for (let d = -span; d <= span; d++) {
      const col = ((centreCol + d) % GRID_COLS + GRID_COLS) % GRID_COLS
      buckets[row * GRID_COLS + col].push(f)
    }
  }
}

export interface Coverage {
  /** Fraction of the sphere no live triangle covers. */
  gapFraction: number
  /** Fraction covered by more than one at once. */
  overlapFraction: number
  /**
   * Fraction covered by two *different* islands of strong crust at once.
   *
   * The sharp version of the line above, and the one that cannot be excused.
   * Ordinary crust overlapping itself while an ocean closes is the mesh being
   * clumsy; two rigid blocks in the same place is two continents in the same
   * place, and the model has no business allowing it at any size.
   */
  islandOverlapFraction: number
  /**
   * Probes that landed exactly in an edge plane, where the inside test has no
   * right answer and skips the edge.
   *
   * Should always be zero: the probes are chosen so it cannot happen. It is
   * counted rather than assumed because when it did happen it happened
   * silently, and a measurement that can quietly stop measuring is worse than
   * one that says so.
   */
  boundaryHits: number
}

export function coverage(
  pos: Float64Array, mesh: Tiling, faceCount: number, probes: Float64Array,
  cells: Uint32Array, buckets: number[][],
  /**
   * Which island of strong crust each face belongs to, 0 for none.
   *
   * Optional, and the reason it is here is that `overlapFraction` cannot see
   * the failure that matters most. It counts sky covered by more than one
   * triangle whoever owns them, so a triangle overlapping its own neighbour
   * during a closure and a craton lying on top of another craton read the same
   * -- and the second is not a soft failure at all. An island is the part of
   * the model that is not allowed to deform; two of them in the same place is
   * two continents in the same place.
   */
  faceIsland?: Uint16Array,
  /**
   * Where the sky is bare, filled in if given: probe indices with no crust
   * over them at all.
   *
   * This exists so a hole can be *closed* and not only counted. A reader set
   * zero gaps as the requirement everything else yields to, and every attempt
   * to get there by pulling on the rim of the ridge failed for the same reason
   * -- zipping the edges of a patch is smoothing, and smoothing does not make a
   * patch go away. What can is knowing which directions are uncovered and
   * hauling the nearest crust over them. See `fillSky`.
   */
  bare?: number[],
  /**
   * Where the sky is covered twice, filled in if given: probe index, then the
   * two faces over it, three numbers per place.
   *
   * A reader put the priority plainly: mesh lying over mesh is worse than
   * crust being squeezed, because a squeeze can be smeared out into whatever
   * is stretched nearby and an overlap cannot be smeared into anything. So the
   * overlap has to be findable before it can be turned into the lesser
   * failure. See `unstack`.
   */
  doubledAt?: number[],
): Coverage {
  // Which triangles could possibly cover which part of the sky. A triangle is
  // about a degree across to start with and a few degrees once its neighbours
  // have closed away, so a two-degree grid keeps a handful in each cell.
  for (const list of buckets) list.length = 0
  for (let f = 0; f < faceCount; f++) {
    if (!mesh.faceAlive[f]) continue
    bucketFace(pos, mesh, f, buckets)
  }

  const probeCount = probes.length / 3
  let covered = 0
  let doubled = 0
  let islandDoubled = 0
  let boundaryHits = 0
  if (bare) bare.length = 0
  if (doubledAt) doubledAt.length = 0
  const covering: number[] = []
  const unit = [0, 0, 0]
  const boundary: number[] = []
  const islandsHere: number[] = []
  for (let p = 0; p < probeCount; p++) {
    const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
    let hits = 0
    let onAnEdge = false
    islandsHere.length = 0
    covering.length = 0
    for (const f of buckets[cells[p]]) {
      const a = mesh.faceVerts[f * 3] * 3
      const b = mesh.faceVerts[f * 3 + 1] * 3
      const c = mesh.faceVerts[f * 3 + 2] * 3
      if (inside(pos, a, b, c, dx, dy, dz, unit, boundary)) {
        hits++
        if (doubledAt && covering.length < 2) covering.push(f)
        const island = faceIsland?.[f] ?? 0
        if (island && !islandsHere.includes(island)) islandsHere.push(island)
      }
      if (boundary.length) onAnEdge = true
    }
    if (hits > 0) covered++
    else bare?.push(p)
    if (hits > 1) {
      doubled++
      if (doubledAt && covering.length === 2) doubledAt.push(p, covering[0], covering[1])
    }
    if (islandsHere.length > 1) islandDoubled++
    if (onAnEdge) boundaryHits++
  }
  return {
    gapFraction: 1 - covered / probeCount,
    overlapFraction: doubled / probeCount,
    islandOverlapFraction: islandDoubled / probeCount,
    boundaryHits,
  }
}

/**
 * Haul the nearest crust over the bare sky, until there is none.
 *
 * The requirement a reader set is zero gaps and zero overlap, everything else
 * yields to it, and three attempts to reach it by asking the ridge to shut all
 * failed the same way. The rim is a spring competing with the area constraint,
 * the edge springs, the sphere and the fold, and softening its opponents got
 * the bare sphere from 10.4% to 9.5%. Welding the rim as a projection got it to
 * 1.7% at 40 Ma and no further, because a curtain of un-erupted crust is a
 * *patch* and zipping a patch's edges is smoothing: its interior corners sit
 * symmetrically between their neighbours and do not move.
 *
 * So this stops working on the ridge and works on the hole. Every bare probe
 * direction is a place with no crust over it; the nearest live crust is hauled
 * towards it. That stretches the crust it hauls, which is exactly the trade the
 * reader asked for -- *that would cause enormous stretch and solving that
 * becomes our problem* -- and the area budget says the crust that exists has
 * the area to cover the sphere to within three parts in a thousand, so the
 * stretch it needs exists to be found.
 *
 * Simultaneous, like every other projection here: many bare directions can pick
 * the same corner, so the pulls are summed and averaged before anything moves.
 *
 * Nearest is over the vertices of *live* crust only. A corner of the curtain is
 * not crust that exists, and hauling it over the sky would be drawing a ridge
 * where the ridge is supposed to have gone.
 */
export function fillSky(
  pos: Float64Array,
  mesh: Tiling,
  faceVerts: Int32Array,
  faceCount: number,
  probes: Float64Array,
  bare: number[],
  strength: number,
  /** Accumulators over vertices, reused between calls. */
  target: Float64Array,
  weight: Float64Array,
  /** Which vertices are corners of live crust; rebuilt here each call. */
  live: Uint8Array,
  /** Live vertices per grid cell, reused between calls. */
  buckets: number[][],
  /**
   * Which crust is holding sky up, filled in if given.
   *
   * A vertex this pass hauls is, by construction, the nearest live crust to a
   * direction that had nothing over it -- so the triangles around it are the
   * only thing covering that sky. Anything that would shrink them undoes this
   * work, and the pressure exchange is exactly such a thing: a triangle
   * stretched thin over a hole is the most stretched thing in its
   * neighbourhood, so it is the first one the exchange wants to pull in. The
   * exchange reads this and leaves them alone.
   *
   * Cleared here, so it always describes the last hauling and not an older one.
   */
  coversSky?: Uint8Array,
): number {
  live.fill(0)
  for (let f = 0; f < faceCount; f++) {
    if (!mesh.faceAlive[f]) continue
    live[faceVerts[f * 3]] = 1
    live[faceVerts[f * 3 + 1]] = 1
    live[faceVerts[f * 3 + 2]] = 1
  }
  for (const list of buckets) list.length = 0
  const vertexCount = live.length
  for (let v = 0; v < vertexCount; v++) {
    if (!live[v]) continue
    const i = v * 3
    const l = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2) || 1
    buckets[cellOf(pos[i] / l, pos[i + 1] / l, pos[i + 2] / l)].push(v)
  }

  target.fill(0)
  weight.fill(0)
  coversSky?.fill(0)
  let hauled = 0
  for (const p of bare) {
    const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
    const cell = cellOf(dx, dy, dz)
    const row = Math.floor(cell / GRID_COLS)
    const col = cell % GRID_COLS
    // Out from the bare direction's own cell until something live turns up. A
    // cell is two degrees and the mesh is one, so the first ring usually has
    // it; the loop is there for the holes wider than that.
    let best = -2
    let at = -1
    for (let reach = 0; reach <= GRID_ROWS && at < 0; reach++) {
      for (let dr = -reach; dr <= reach; dr++) {
        const r = row + dr
        if (r < 0 || r >= GRID_ROWS) continue
        for (let dc = -reach; dc <= reach; dc++) {
          // Only the new ring, not the whole square again.
          if (reach > 0 && Math.abs(dr) !== reach && Math.abs(dc) !== reach) continue
          const c = ((col + dc) % GRID_COLS + GRID_COLS) % GRID_COLS
          for (const v of buckets[r * GRID_COLS + c]) {
            const i = v * 3
            const l = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2) || 1
            const dot = (pos[i] * dx + pos[i + 1] * dy + pos[i + 2] * dz) / l
            if (dot > best) { best = dot; at = v }
          }
        }
      }
    }
    if (at < 0) continue
    target[at * 3] += dx; target[at * 3 + 1] += dy; target[at * 3 + 2] += dz
    weight[at] += 1
    if (coversSky) coversSky[at] = 1
    hauled++
  }

  for (let v = 0; v < vertexCount; v++) {
    if (weight[v] === 0) continue
    const i = v * 3
    const tl = Math.sqrt(target[i] ** 2 + target[i + 1] ** 2 + target[i + 2] ** 2)
    if (tl < 1e-9) continue
    const l = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2) || 1
    const tx = target[i] / tl, ty = target[i + 1] / tl, tz = target[i + 2] / tl
    const ux = pos[i] / l, uy = pos[i + 1] / l, uz = pos[i + 2] / l
    let nx = ux + strength * (tx - ux)
    let ny = uy + strength * (ty - uy)
    let nz = uz + strength * (tz - uz)
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (nl < 1e-9) continue
    // Its own radius kept, as everywhere else: where on the sphere a corner
    // belongs and how deep it hangs are two different questions.
    pos[i] = (nx / nl) * l; pos[i + 1] = (ny / nl) * l; pos[i + 2] = (nz / nl) * l
  }
  return hauled
}

/**
 * Turn crust lying over crust into crust that is merely squeezed.
 *
 * A reader set the order of badness and it is not the order the solver had.
 * *Compressed crust is less bad than mesh going over itself, because a
 * compression can be smeared out into the stretched parts and an overlap
 * cannot be smeared into anything.* Two pieces of crust in the same place is
 * two pieces of rock in the same place: it is not a soft failure, it is not
 * recoverable by any later pass, and nothing in the model was working against
 * it except the barrier that stops a triangle turning inside out.
 *
 * So wherever the sky is covered twice, the weaker of the two coverers is
 * pulled off it -- shrunk towards its own middle, which compresses it. It
 * trades a hard failure for a soft one at the exact place the hard one is.
 *
 * The weaker of the two by rigidity, because that is what the rigidity field
 * is for: a craton should not give way to sea floor, and where two cratons
 * overlap there is nothing to choose, so the pass leaves them and the overlap
 * stands as the honest reading it always was -- see `islandOverlapFraction`,
 * which counts exactly that case and is not touched here.
 *
 * Simultaneous, like every other projection: a face can cover several doubled
 * directions and share corners with its neighbours, so the pulls are summed
 * and averaged before anything moves.
 */
export function unstack(
  pos: Float64Array,
  faceVerts: Int32Array,
  rigidity: Float32Array,
  faceIsland: Uint16Array | undefined,
  /** probe, faceA, faceB, three at a time; from `coverage`. */
  doubledAt: number[],
  strength: number,
  /** Accumulators over vertices, reused between calls. */
  target: Float64Array,
  weight: Float64Array,
): number {
  target.fill(0)
  weight.fill(0)
  let pulled = 0
  for (let i = 0; i < doubledAt.length; i += 3) {
    const f = doubledAt[i + 1]
    const g = doubledAt[i + 2]
    // Two rigid islands in the same place is a suture, not a soft failure, and
    // squeezing one of them is not the answer. Left alone and counted.
    if (faceIsland && faceIsland[f] && faceIsland[g] && faceIsland[f] !== faceIsland[g]) continue
    const weak = rigidity[f] <= rigidity[g] ? f : g
    const a = faceVerts[weak * 3] * 3
    const b = faceVerts[weak * 3 + 1] * 3
    const c = faceVerts[weak * 3 + 2] * 3
    let mx = 0, my = 0, mz = 0
    for (const j of [a, b, c]) {
      const l = Math.sqrt(pos[j] ** 2 + pos[j + 1] ** 2 + pos[j + 2] ** 2) || 1
      mx += pos[j] / l; my += pos[j + 1] / l; mz += pos[j + 2] / l
    }
    const ml = Math.sqrt(mx * mx + my * my + mz * mz)
    if (ml < 1e-9) continue
    mx /= ml; my /= ml; mz /= ml
    for (const j of [a, b, c]) {
      target[j] += mx; target[j + 1] += my; target[j + 2] += mz
      weight[j / 3] += 1
    }
    pulled++
  }
  const vertexCount = weight.length
  for (let v = 0; v < vertexCount; v++) {
    if (weight[v] === 0) continue
    const i = v * 3
    const tl = Math.sqrt(target[i] ** 2 + target[i + 1] ** 2 + target[i + 2] ** 2)
    if (tl < 1e-9) continue
    const l = Math.sqrt(pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2) || 1
    const tx = target[i] / tl, ty = target[i + 1] / tl, tz = target[i + 2] / tl
    const ux = pos[i] / l, uy = pos[i + 1] / l, uz = pos[i + 2] / l
    let nx = ux + strength * (tx - ux)
    let ny = uy + strength * (ty - uy)
    let nz = uz + strength * (tz - uz)
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (nl < 1e-9) continue
    pos[i] = (nx / nl) * l; pos[i + 1] = (ny / nl) * l; pos[i + 2] = (nz / nl) * l
  }
  return pulled
}
