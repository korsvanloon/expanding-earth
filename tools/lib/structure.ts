/**
 * How busy the crust is around each point of the mesh.
 *
 * ECM1 answers what kind of crust a place is, once per square degree and out of
 * eleven names. That is the right question and much too coarse an answer: it
 * calls the whole Canadian Shield one thing, and it cannot see the suture
 * running through the middle of it. A gravity grid can. The vertical gravity
 * gradient responds to density contrasts a few kilometres down, so a fracture
 * zone, a failed rift, a buried suture and a mountain root all show up in it as
 * structure, at a tenth of a degree, over land and sea alike.
 *
 * Two numbers come back per vertex. The value is the field itself, which is
 * what you look at. The roughness is the size of its gradient nearby, which is
 * what you measure: flat means undisturbed crust, busy means crust that has
 * been worked. Deformation belongs in the second kind.
 */
import { GRID_GAP, type Grid } from './grid.js'
import { directionToPixel } from '../../shared/sphere.js'

export interface Structure {
  /** Mean field value in the neighbourhood, in the grid's own units. */
  value: Float32Array
  /** Mean gradient magnitude there, units per 100 km. */
  roughness: Float32Array
  /** How many vertices found no surveyed cell at all. */
  unsurveyed: number
}

/**
 * Sample a disc around every vertex.
 *
 * The disc is the mesh's own spacing wide, so neighbouring vertices see
 * overlapping but different crust and the field is smoothed to the resolution
 * the mesh can actually carry. Gradients are taken in kilometres rather than in
 * cells, because a cell of longitude is 11 km at the equator and 2 km at 80
 * degrees, and a measure that did not divide that out would call the Arctic the
 * most structured crust on the planet.
 */
export function sampleStructure(
  grid: Grid, dirs: Float32Array, vertexCount: number, radiusKm: number, r0: number,
): Structure {
  const value = new Float32Array(vertexCount)
  const roughness = new Float32Array(vertexCount)
  let unsurveyed = 0

  const cellHeightKm = (Math.PI * r0) / grid.height
  const rowReach = Math.max(1, Math.round(radiusKm / cellHeightKm))

  for (let v = 0; v < vertexCount; v++) {
    const x = dirs[v * 3], y = dirs[v * 3 + 1], z = dirs[v * 3 + 2]
    const [column, row] = directionToPixel(x, y, z, grid.width, grid.height)
    const lat = Math.PI * (0.5 - (row + 0.5) / grid.height)
    const cosLat = Math.max(1e-3, Math.cos(lat))
    const cellWidthKm = ((2 * Math.PI * r0) / grid.width) * cosLat
    const columnReach = Math.min(
      grid.width >> 1, Math.max(1, Math.round(radiusKm / cellWidthKm)),
    )

    let sum = 0
    let seen = 0
    let gradient = 0
    let gradients = 0
    for (let dr = -rowReach; dr <= rowReach; dr++) {
      const r = row + dr
      if (r < 1 || r >= grid.height - 1) continue
      // Cell width follows the row being read, not the vertex's own row: a disc
      // near the pole spans rows of very different widths.
      const rowLat = Math.PI * (0.5 - (r + 0.5) / grid.height)
      const widthKm = Math.max(
        0.01, ((2 * Math.PI * r0) / grid.width) * Math.max(1e-3, Math.cos(rowLat)),
      )
      for (let dc = -columnReach; dc <= columnReach; dc++) {
        const c = ((column + dc) % grid.width + grid.width) % grid.width
        const here = grid.samples[r * grid.width + c]
        if (here === GRID_GAP) continue
        sum += here * grid.scale + grid.offset
        seen++

        const east = grid.samples[r * grid.width + ((c + 1) % grid.width)]
        const west = grid.samples[r * grid.width + ((c - 1 + grid.width) % grid.width)]
        const south = grid.samples[(r + 1) * grid.width + c]
        const north = grid.samples[(r - 1) * grid.width + c]
        if (east === GRID_GAP || west === GRID_GAP
          || south === GRID_GAP || north === GRID_GAP) continue
        const dx = ((east - west) * grid.scale) / (2 * widthKm)
        const dy = ((north - south) * grid.scale) / (2 * cellHeightKm)
        gradient += Math.sqrt(dx * dx + dy * dy)
        gradients++
      }
    }
    if (!seen) {
      unsurveyed++
      value[v] = NaN
      roughness[v] = NaN
      continue
    }
    value[v] = sum / seen
    roughness[v] = gradients ? (100 * gradient) / gradients : 0
  }
  return { value, roughness, unsurveyed }
}

/**
 * Fill in the vertices the survey never reached, from their neighbours.
 *
 * Altimetry stops at about 81 degrees, so the ice caps come back as NaN, and a
 * NaN in a field the solver reads is a hole that spreads. Flooding from the
 * edge inwards over the mesh's own adjacency gives those vertices the value of
 * the nearest crust that was measured, which is the honest answer -- it says
 * "as far as anyone knows, like its neighbour" -- and it says how many vertices
 * had to be guessed at so the number can be reported rather than hidden.
 */
export function fillGaps(field: Float32Array, indices: ArrayLike<number>): number {
  const missing: number[] = []
  for (let v = 0; v < field.length; v++) if (Number.isNaN(field[v])) missing.push(v)
  if (!missing.length) return 0
  const filled = missing.length

  const neighbours: Set<number>[] = Array.from({ length: field.length }, () => new Set())
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]
      const b = indices[i + ((k + 1) % 3)]
      neighbours[a].add(b)
      neighbours[b].add(a)
    }
  }

  let frontier = missing
  while (frontier.length) {
    const next: number[] = []
    const settled: Array<[number, number]> = []
    for (const v of frontier) {
      let sum = 0
      let seen = 0
      for (const w of neighbours[v]) {
        if (!Number.isNaN(field[w])) { sum += field[w]; seen++ }
      }
      if (seen) settled.push([v, sum / seen])
      else next.push(v)
    }
    // Nothing settled this round means the remainder has no measured
    // neighbour anywhere; leave them at zero rather than looping forever.
    if (!settled.length) {
      for (const v of next) field[v] = 0
      break
    }
    for (const [v, mean] of settled) field[v] = mean
    frontier = next
  }
  return filled
}

/**
 * The roughness of the whole grid, at the grid's own resolution.
 *
 * The per-vertex figures above are what a point of crust carries, and they are
 * carried at the mesh's resolution: a hundred and twelve kilometres between
 * points, against eleven to the grid cell. Measured against the raw field, the
 * mesh keeps a little over half its variation -- and subdividing once more, at
 * four times the cost of every run, takes that only to about two thirds. So
 * looking at this through the vertices is the wrong way round. A raster
 * painted on the crust rides along with it exactly as the surface maps do, and
 * loses nothing.
 *
 * Encoded as a byte per cell, on the same logarithmic scale the viewer's ramp
 * uses, because roughness runs from single figures over a platform to six
 * hundred along an arc and a linear scale renders every ocean and every shield
 * the same near-black. Zero is reserved for ground the survey never reached, so
 * the ice caps read as unknown rather than as undisturbed.
 */
export const FABRIC_UNSURVEYED = 0
const FABRIC_FLOOR = 4
const FABRIC_CEILING = 512

export function fabricRaster(grid: Grid, r0: number): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height)
  const cellHeightKm = (Math.PI * r0) / grid.height
  const span = Math.log2(FABRIC_CEILING / (FABRIC_FLOOR * 2))
  for (let row = 1; row < grid.height - 1; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / grid.height)
    const widthKm = Math.max(
      0.01, ((2 * Math.PI * r0) / grid.width) * Math.max(1e-3, Math.cos(lat)),
    )
    for (let column = 0; column < grid.width; column++) {
      const east = grid.samples[row * grid.width + ((column + 1) % grid.width)]
      const west = grid.samples[row * grid.width + ((column - 1 + grid.width) % grid.width)]
      const south = grid.samples[(row + 1) * grid.width + column]
      const north = grid.samples[(row - 1) * grid.width + column]
      if (east === GRID_GAP || west === GRID_GAP
        || south === GRID_GAP || north === GRID_GAP) continue
      const dx = ((east - west) * grid.scale) / (2 * widthKm)
      const dy = ((north - south) * grid.scale) / (2 * cellHeightKm)
      const roughness = 100 * Math.sqrt(dx * dx + dy * dy)
      const t = Math.min(1, Math.max(0,
        Math.log2(Math.max(roughness, FABRIC_FLOOR) / (FABRIC_FLOOR * 2)) / span))
      out[row * grid.width + column] = 1 + Math.round(t * 254)
    }
  }
  return out
}


/**
 * Which way the lineaments run, from the same gravity grid.
 *
 * The roughness above says how worked a piece of crust is. This says along what
 * line, which is the part a tracer can use: a fracture zone is a trough running
 * away from the ridge, and its own direction is a better guide to where the
 * crust went than the age grid's gradient, which is quantised to a grey level
 * and flat over any stretch the survey dated the same.
 *
 * The instrument is a structure tensor. Take the field's gradient at each cell,
 * form the outer product of that gradient with itself, and average those
 * matrices over a window. Averaging the matrices rather than the gradients is
 * the whole trick: gradients on the two flanks of a trough point in opposite
 * directions and cancel, while their outer products are identical and add. What
 * comes back is an ellipse whose long axis is across the lineament and whose
 * short axis is along it, and the ratio of the two says how line-like the
 * neighbourhood is at all.
 *
 * The axis has no sign -- a line does not know which end is which -- so
 * whatever uses it has to choose the direction itself.
 */
export interface Lineaments {
  width: number
  height: number
  /** Along-lineament direction as an angle east of north, 0-255 over 180 deg. */
  axis: Uint8Array
  /**
   * How line-like the neighbourhood is, 0-255.
   *
   * (long - short) / (long + short) of the tensor's two eigenvalues. Zero where
   * the field varies the same in every direction and there is no line to
   * follow; near one over a clean trough.
   */
  coherence: Uint8Array
  /**
   * How much of a line there is here, as against which way it points.
   *
   * An axis cannot say whether you are on the line or a hundred kilometres
   * beside it, and that second question is the one that matters: a path
   * perfectly parallel to a fracture zone and a hundred kilometres off it is
   * perfectly aligned and perfectly wrong.
   *
   * The measure is the tensor's coherence times the size of the gradient it was
   * built from -- how line-like, times how much there is of it. Coherence alone
   * says a featureless plain with a faint trend is a clean line; gradient alone
   * says a seamount is. The product is close to what an eye picks out of the
   * fabric image, which is what a person tracing these by hand is following.
   *
   * The low-passed field itself was tried first and was useless for this: after
   * smoothing at a hundred kilometres, every point on Earth has a turning point
   * within ten of it, so "distance to the nearest crest" came back at 9 km
   * everywhere and moved not at all when the steering was turned on.
   */
  ridgeness: Float32Array
  known: Uint8Array
}

export function lineaments(
  grid: Grid, r0: number, windowKm: number, smoothKm = 0,
): Lineaments {
  const { width, height } = grid
  const cellHeightKm = (Math.PI * r0) / height
  const size = width * height
  // The three independent entries of the tensor, before averaging.
  const xx = new Float32Array(size)
  const xy = new Float32Array(size)
  const yy = new Float32Array(size)

  /**
   * The field the gradient is taken of, low-passed if asked.
   *
   * This is not the same as averaging the tensor afterwards, and the difference
   * is the whole reason it is here. Sea floor is corrugated with abyssal hills,
   * a few tens of kilometres from crest to crest, and they run *along* the
   * isochrons -- square across the direction the crust travelled. They are also
   * the most coherent thing in the grid, so a wider window over the tensor does
   * not dilute them: every hill's gradient points the same way as the next
   * one's, and their outer products add rather than cancel. Widening the window
   * made the fabric louder, not quieter. Taking them out of the field before
   * differentiating it is the only thing that removes them.
   */
  const field = new Float32Array(size)
  const known = new Uint8Array(size)
  for (let i = 0; i < size; i++) {
    if (grid.samples[i] === GRID_GAP) continue
    field[i] = grid.samples[i] * grid.scale + grid.offset
    known[i] = 1
  }
  if (smoothKm > 0) {
    boxBlur(field, width, height, Math.max(1, Math.round(smoothKm / cellHeightKm)), r0)
  }

  for (let row = 1; row < height - 1; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / height)
    const widthKm = Math.max(
      0.01, ((2 * Math.PI * r0) / width) * Math.max(1e-3, Math.cos(lat)),
    )
    for (let column = 0; column < width; column++) {
      const e = row * width + ((column + 1) % width)
      const w = row * width + ((column - 1 + width) % width)
      const so = (row + 1) * width + column
      const no = (row - 1) * width + column
      if (!known[e] || !known[w] || !known[so] || !known[no]) continue
      const east = field[e], west = field[w], south = field[so], north = field[no]
      const gx = (east - west) / (2 * widthKm)
      const gy = (north - south) / (2 * cellHeightKm)
      const i = row * width + column
      xx[i] = gx * gx
      xy[i] = gx * gy
      yy[i] = gy * gy
    }
  }

  // Averaged with two one-dimensional passes rather than one square window: the
  // box average separates, and at nine cells a side the square costs eighty-one
  // reads a cell against eighteen.
  const rows = Math.max(1, Math.round(windowKm / cellHeightKm))
  for (const plane of [xx, xy, yy]) boxBlur(plane, width, height, rows, r0)

  const axis = new Uint8Array(size)
  const coherence = new Uint8Array(size)
  const ridgeness = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const a = xx[i]
    const b = xy[i]
    const c = yy[i]
    const half = (a - c) / 2
    const spread = Math.sqrt(half * half + b * b)
    const trace = a + c
    if (trace < 1e-12) continue
    // The trace is the mean squared gradient over the window, so its root is
    // the size of the gradient; times the anisotropy that is how strong a line
    // this is.
    ridgeness[i] = Math.sqrt(trace) * Math.min(1, (2 * spread) / trace)
    // The long axis of the ellipse is across the line and a quarter turn from
    // it is along the line, which is the direction worth having.
    //
    // Two conventions meet here and getting them the wrong way round is silent.
    // The eigenvector formula returns an angle measured from the *first* axis,
    // which is east, because the gradient's first component is the derivative
    // eastwards. What is stored is an angle measured from *north*, towards
    // east, which is how a bearing is written. Turning one into the other flips
    // the sign, and the quarter turn to get from across to along cancels the
    // quarter turn between the two conventions -- so the along-lineament
    // bearing is simply the negative of the eigenvector's angle. Read as-is it
    // came out square to the truth, which on real data is indistinguishable
    // from a gravity grid that has nothing to say.
    const along = -0.5 * Math.atan2(2 * b, a - c)
    // Folded into half a turn, because an axis and its opposite are one axis.
    const folded = ((along % Math.PI) + Math.PI) % Math.PI
    axis[i] = Math.min(255, Math.round((folded / Math.PI) * 256))
    coherence[i] = Math.round(255 * Math.min(1, (2 * spread) / trace))
  }
  return { width, height, axis, coherence, ridgeness, known }
}

/**
 * A separable box average over a raster that wraps in longitude.
 *
 * The column window widens towards the poles so that it covers the same ground
 * as the row window does, for the same reason the gradients are taken per
 * kilometre: a window measured in cells is a window that shrinks with the
 * cosine of the latitude.
 */
function boxBlur(
  plane: Float32Array, width: number, height: number, rows: number, r0: number,
) {
  const scratch = new Float32Array(width * height)
  const cellWidthKm = (2 * Math.PI * r0) / width
  const spanKm = rows * ((Math.PI * r0) / height)

  for (let row = 0; row < height; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / height)
    const columns = Math.min(
      width >> 1,
      Math.max(1, Math.round(spanKm / Math.max(0.01, cellWidthKm * Math.max(1e-3, Math.cos(lat))))),
    )
    let sum = 0
    for (let d = -columns; d <= columns; d++) sum += plane[row * width + ((d % width) + width) % width]
    const span = 2 * columns + 1
    for (let column = 0; column < width; column++) {
      scratch[row * width + column] = sum / span
      const out = ((column - columns) % width + width) % width
      const into = ((column + columns + 1) % width + width) % width
      sum += plane[row * width + into] - plane[row * width + out]
    }
  }
  for (let column = 0; column < width; column++) {
    for (let row = 0; row < height; row++) {
      let sum = 0
      let seen = 0
      for (let d = -rows; d <= rows; d++) {
        const r = row + d
        if (r < 0 || r >= height) continue
        sum += scratch[r * width + column]
        seen++
      }
      plane[row * width + column] = sum / seen
    }
  }
}

/**
 * Read the lineament axis at a direction on the sphere, as a tangent vector.
 *
 * The stored angle is measured east of north in the cell's own tangent plane,
 * so it is turned back into three dimensions using the same north and east that
 * `basis` in flowlines.ts uses. Returns null where there is no line to speak of.
 */
export function lineamentAt(
  field: Lineaments, x: number, y: number, z: number,
): { tx: number; ty: number; tz: number; coherence: number } | null {
  const l = Math.hypot(x, y, z) || 1
  const [column, row] = directionToPixel(x / l, y / l, z / l, field.width, field.height)
  const i = row * field.width + column
  const coherence = field.coherence[i] / 255
  if (coherence <= 0) return null
  const angle = (field.axis[i] / 256) * Math.PI

  // North and east at this point. Degenerate at the poles, where there is no
  // east; the caller gets nothing rather than a direction made up out of
  // rounding error.
  const ux = x / l, uy = y / l, uz = z / l
  let nx = -uy * ux, ny = 1 - uy * uy, nz = -uy * uz
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-6) return null
  nx /= nl; ny /= nl; nz /= nl
  const ex = ny * uz - nz * uy
  const ey = nz * ux - nx * uz
  const ez = nx * uy - ny * ux

  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { tx: nx * c + ex * s, ty: ny * c + ey * s, tz: nz * c + ez * s, coherence }
}


/**
 * How far sideways the nearest crest or trough of the field is, in kilometres.
 *
 * Signed along `n`, the direction across the path. Sampled at a fixed spacing
 * out to `reachKm` either way, looking for the nearest interior sample that is
 * larger or smaller than both its neighbours -- either will do, because a
 * fracture zone shows in the gravity gradient as a trough on one side of the
 * offset and a rise on the other and which one a given path is riding is not
 * something worth deciding in advance.
 *
 * The reach matters and is a judgement: fracture zones are a few tens of
 * kilometres wide and a few hundred apart, so a reach of sixty kilometres can
 * find the line a path has slipped off and cannot reach the next one over.
 *
 * Returns null where there is no turning point within reach, or where the
 * survey has a gap in the way -- both meaning there is nothing to steer towards.
 */
export function crestOffsetKm(
  f: Lineaments,
  x: number, y: number, z: number,
  nx: number, ny: number, nz: number,
  reachKm: number, r0: number, samples = 13,
): number | null {
  const half = (samples - 1) / 2
  const spacing = reachKm / half
  const values = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    const angle = ((i - half) * spacing) / r0
    const c = Math.cos(angle), s = Math.sin(angle)
    const px = x * c + nx * s, py = y * c + ny * s, pz = z * c + nz * s
    const l = Math.hypot(px, py, pz) || 1
    const [column, row] = directionToPixel(px / l, py / l, pz / l, f.width, f.height)
    const at = row * f.width + column
    if (!f.known[at]) return null
    values[i] = f.ridgeness[at]
  }
  // The strongest line within reach, not the nearest turning point. Nearest was
  // the first attempt and it found noise: what is wanted is the fracture zone
  // this path belongs to, and if the path has slipped a long way off it, the
  // whole point is to be pulled the long way back.
  let best = -1
  let at = -1
  for (let i = 1; i < samples - 1; i++) {
    const a = values[i - 1], b = values[i], c = values[i + 1]
    if (!(b > a && b >= c)) continue
    if (b <= best) continue
    best = b
    at = i
  }
  if (at < 0) return null
  // A line has to stand out from the ground around it to be worth steering
  // towards. Half again as strong as the weakest sample in reach is a low bar
  // deliberately: the guard that matters is that there is a peak at all.
  let floor = Infinity
  for (const v of values) floor = Math.min(floor, v)
  if (!(best > 1.5 * Math.max(floor, 1e-9))) return null

  // Parabolic interpolation, so the answer is not quantised to the sample
  // spacing and the path does not hunt between two samples for ever.
  const a = values[at - 1], b = values[at], c = values[at + 1]
  const denominator = a - 2 * b + c
  const shift = Math.abs(denominator) > 1e-12 ? (0.5 * (a - c)) / denominator : 0
  return (at - half + Math.max(-0.5, Math.min(0.5, shift))) * spacing
}


/**
 * Fracture zones, told apart from everything else that makes a line.
 *
 * The crest follower failed not because it could not follow a line but because
 * it was given the wrong lines. At the scale where the gravity grid has crests
 * sharp enough to aim at, its strong ridges are fracture zones *and* abyssal
 * hills *and* seamount chains *and* ridge segments, and only the first of those
 * is a path the crust took. No amount of smoothing separates them, because the
 * smoothing that removes the hills removes the crest as well. Telling them
 * apart needs their shape, not their strength.
 *
 * Three properties do it, and each one removes a different impostor. It works:
 * it flags 4.3% of the surveyed globe, and where it fires the lines run a
 * median 13 degrees from the direction the crust travelled, against 28 to 34
 * for the ungated lineaments it was picked out of.
 *
 * What it is *for* is still open. Handing these lines to the crest follower --
 * pulling every traced path onto the nearest detected fracture zone -- makes
 * the reconstruction worse, not better, and the reason is not established. The
 * obvious explanation, that a fracture zone is an age discontinuity and so the
 * worst place to read a pair off, is wrong: the age step across a detected line
 * is a median 1.1 Ma over 80 km, the same as over sea floor the detector
 * rejected. So this is a measurement looking for its use. See MODEL.md.
 *
 * A fracture zone runs *across* the isochrons, because it is the trace of a
 * transform offset and so lies along the direction the crust travelled. Abyssal
 * hills are the opposite: they are frozen ridge topography and run *along* the
 * isochrons. That single test removes the loudest thing in the grid. The
 * isochron direction comes from the age grid smoothed hard enough to be a
 * regional spreading direction rather than a local reading -- which is also
 * what keeps this from being circular, since the age grid's fine detail is the
 * very thing the tracer is being corrected for.
 *
 * A fracture zone is *continuous* over hundreds of kilometres. Averaging along
 * the lineament's own direction, following it as it bends, rewards a feature
 * that keeps going and dilutes one that does not: a seamount is a point and a
 * chain of seamounts is a dotted line, and both fade against a scarp that runs
 * unbroken.
 *
 * And a fracture zone is *narrow*. Keeping only the cells that are a maximum
 * across their own line thins what is left to a curve one cell wide, which is
 * what a follower needs to aim at -- a broad smear has no crest.
 */
export interface FractureOptions {
  /** How hard the age grid is smoothed to get a regional spreading direction, km. */
  isochronSmoothKm?: number
  /** How far to average along a lineament to test that it keeps going, km. */
  continuityKm?: number
  /** How far across a lineament its neighbours are checked, km. */
  narrownessKm?: number
  /**
   * How nearly a lineament must run along the travelled direction to count at
   * all, as the cosine of the angle between them. 0.87 is thirty degrees.
   */
  alignmentGate?: number
}

export function fractureZones(
  sharp: Lineaments,
  /**
   * The blurred field, used for every direction this takes.
   *
   * The sharp field is where the strength is, and its axis is too noisy to walk
   * along: following it to test that a feature keeps going averages together
   * cells that have nothing to do with each other, which destroys the very
   * continuity being tested. The blurred axis is stable to a few degrees over
   * hundreds of kilometres. Strength from one, bearing from the other, the same
   * split as everywhere else here.
   */
  guide: Lineaments,
  age: ArrayLike<number>, ageWidth: number, ageHeight: number,
  r0: number,
  options: FractureOptions = {},
): Lineaments {
  const isochronSmoothKm = options.isochronSmoothKm ?? 250
  const continuityKm = options.continuityKm ?? 200
  const narrownessKm = options.narrownessKm ?? 25
  const alignmentGate = options.alignmentGate ?? 0.87
  const { width, height } = sharp
  const size = width * height
  const cellHeightKm = (Math.PI * r0) / height

  // The age grid on the gravity grid's own cells, box-averaged on the way, so
  // that the gradient below is a regional spreading direction rather than a
  // reading of one grey level against the next.
  const ages = new Float32Array(size)
  const dated = new Uint8Array(size)
  const scaleX = ageWidth / width
  const scaleY = ageHeight / height
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let sum = 0
      let seen = 0
      for (let j = Math.floor(row * scaleY); j < Math.floor((row + 1) * scaleY); j++) {
        for (let i = Math.floor(column * scaleX); i < Math.floor((column + 1) * scaleX); i++) {
          const a = age[j * ageWidth + i]
          if (!Number.isNaN(a)) { sum += a; seen++ }
        }
      }
      if (seen) { ages[row * width + column] = sum / seen; dated[row * width + column] = 1 }
    }
  }
  // Averaged as a weighted mean over the cells that carry an age, not as a
  // plain mean over the array. Continental crust has no sea-floor age and sits
  // in the array as a zero, so a plain average drags every coastal reading
  // towards zero and manufactures an enormous age gradient pointing out to sea
  // along every margin -- which is a direction the isochrons emphatically do
  // not run in. Blur the ages and the weights and divide.
  const weight = Float32Array.from(dated)
  for (let i = 0; i < size; i++) ages[i] *= weight[i]
  const rows = Math.max(1, Math.round(isochronSmoothKm / cellHeightKm))
  boxBlur(ages, width, height, rows, r0)
  boxBlur(weight, width, height, rows, r0)
  for (let i = 0; i < size; i++) ages[i] = weight[i] > 1e-6 ? ages[i] / weight[i] : 0

  // How well each cell's lineament runs along the way the crust travelled,
  // as the squared cosine of the angle between two axes: one where they are
  // parallel, zero where they are square.
  const detected = new Float32Array(size)
  for (let row = 1; row < height - 1; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / height)
    const widthKm = Math.max(
      0.01, ((2 * Math.PI * r0) / width) * Math.max(1e-3, Math.cos(lat)),
    )
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      if (!sharp.known[at] || !dated[at]) continue
      const e = row * width + ((column + 1) % width)
      const w = row * width + ((column - 1 + width) % width)
      if (!dated[e] || !dated[w] || !dated[(row + 1) * width + column]
        || !dated[(row - 1) * width + column]) continue
      const gx = (ages[e] - ages[w]) / (2 * widthKm)
      const gy = (ages[(row - 1) * width + column] - ages[(row + 1) * width + column])
        / (2 * cellHeightKm)
      const size2 = gx * gx + gy * gy
      if (size2 < 1e-12) continue
      // The travelled direction as a bearing from north, to compare with the
      // stored axis, which is also a bearing from north.
      const travelled = Math.atan2(gx, gy)
      const axis = (guide.axis[at] / 256) * Math.PI
      // A gate, not a weight. Multiplying strength by alignment lets a loud
      // feature that is half-aligned outrank a quiet one that is perfectly
      // aligned, and that is exactly the ordering that went wrong: ranked by
      // the product, the strongest detections came out at 44 degrees to the
      // flow -- worse than picking at random -- because the loudest lines in a
      // gravity grid are seamount chains and plateau edges, not fracture zones.
      // Everything square to the travelled direction is thrown away outright,
      // and what survives is ranked on strength alone.
      const cos = Math.abs(Math.cos(axis - travelled))
      if (cos < alignmentGate) continue
      detected[at] = sharp.ridgeness[at]
    }
  }

  // Continuity: average along the lineament, following its own bend.
  const stepKm = Math.max(cellHeightKm, narrownessKm)
  const along = Math.max(1, Math.round(continuityKm / stepKm))
  const continuous = new Float32Array(size)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      if (detected[at] <= 0) continue
      let sum = detected[at]
      let seen = 1
      for (const sign of [1, -1]) {
        let [x, y, z] = cellDirection(column, row, width, height)
        for (let step = 0; step < along; step++) {
          const line = lineamentAt(guide, x, y, z)
          if (!line) break
          const [nx, ny, nz] = advanceAlong(x, y, z, line.tx * sign, line.ty * sign, line.tz * sign, stepKm / r0)
          x = nx; y = ny; z = nz
          const [c, r] = directionToPixel(x, y, z, width, height)
          sum += detected[r * width + c]
          seen++
        }
      }
      continuous[at] = sum / seen
    }
  }

  // Narrowness: keep only what is a maximum across its own line.
  const thin = new Float32Array(size)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      const here = continuous[at]
      if (here <= 0) continue
      const [x, y, z] = cellDirection(column, row, width, height)
      const line = lineamentAt(guide, x, y, z)
      if (!line) continue
      // Across the line: its axis crossed with the outward normal.
      let cx = line.ty * z - line.tz * y
      let cy = line.tz * x - line.tx * z
      let cz = line.tx * y - line.ty * x
      const cl = Math.hypot(cx, cy, cz)
      if (cl < 1e-9) continue
      cx /= cl; cy /= cl; cz /= cl
      let peak = true
      for (const sign of [1, -1]) {
        const [nx, ny, nz] = advanceAlong(x, y, z, cx * sign, cy * sign, cz * sign, narrownessKm / r0)
        const [c, r] = directionToPixel(nx, ny, nz, width, height)
        if (continuous[r * width + c] > here) { peak = false; break }
      }
      if (peak) thin[at] = here
    }
  }

  // The blurred axis travels with the result: anything following these lines
  // wants the bearing that can be trusted, not the one the strength came from.
  return {
    width, height, axis: guide.axis, coherence: guide.coherence,
    ridgeness: thin, known: sharp.known,
  }
}

/** The unit direction at the centre of a cell. */
function cellDirection(
  column: number, row: number, width: number, height: number,
): [number, number, number] {
  const lon = ((column + 0.5) / width - 0.5) * 2 * Math.PI
  const lat = (0.5 - (row + 0.5) / height) * Math.PI
  const c = Math.cos(lat)
  return [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
}

/** Move along a tangent direction by an angle, staying on the sphere. */
function advanceAlong(
  x: number, y: number, z: number, tx: number, ty: number, tz: number, angle: number,
): [number, number, number] {
  const c = Math.cos(angle), s = Math.sin(angle)
  const px = x * c + tx * s, py = y * c + ty * s, pz = z * c + tz * s
  const l = Math.hypot(px, py, pz) || 1
  return [px / l, py / l, pz / l]
}
