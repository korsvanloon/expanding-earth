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
  const unit = [0, 0, 0]
  const boundary: number[] = []
  const islandsHere: number[] = []
  for (let p = 0; p < probeCount; p++) {
    const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
    let hits = 0
    let onAnEdge = false
    islandsHere.length = 0
    for (const f of buckets[cells[p]]) {
      const a = mesh.faceVerts[f * 3] * 3
      const b = mesh.faceVerts[f * 3 + 1] * 3
      const c = mesh.faceVerts[f * 3 + 2] * 3
      if (inside(pos, a, b, c, dx, dy, dz, unit, boundary)) {
        hits++
        const island = faceIsland?.[f] ?? 0
        if (island && !islandsHere.includes(island)) islandsHere.push(island)
      }
      if (boundary.length) onAnEdge = true
    }
    if (hits > 0) covered++
    if (hits > 1) doubled++
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
