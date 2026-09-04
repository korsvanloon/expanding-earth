/**
 * A direction for the crust to have travelled, everywhere, not only where a
 * scarp was left behind.
 *
 * The detector finds about sixteen hundred fracture zones. That is a lot of
 * evidence and it is nowhere near a picture: a fracture zone is a flow line
 * that nature happened to draw, and it drew perhaps one in a dozen. The rest
 * flowed just the same and left nothing. So the sparse ones are treated as what
 * they are -- anchors -- and a field is fitted through them that says which way
 * the crust went at every point of the sphere, whether or not anything marked
 * it. Following that field gives the family of curves; the anchors pin it where
 * they exist and its own smoothness carries it across the gaps.
 *
 * Two things it inherits that a step-by-step tracer could not have. A single
 * bad reading is one constraint among hundreds of thousands and is outvoted
 * rather than followed off a cliff -- which is what went wrong every time the
 * paths were steered or pulled one step at a time. And the answer is smooth by
 * construction, so the lines come out as lines.
 */
import { GRID_GAP, type Grid } from './grid.js'
import { directionToPixel } from '../../shared/sphere.js'
import type { Lineaments } from './structure.js'

export interface FlowField {
  width: number
  height: number
  /**
   * The travelled direction at each cell, as a bearing east of north, doubled.
   *
   * Doubled because this is an axis and not an arrow. A fracture zone knows
   * which line the crust ran along and not which way along it, and the two
   * flanks of a ridge run in opposite directions along the same line -- so
   * averaging arrows would have them cancel to nothing exactly at the ridge,
   * which is the one place the answer is certain. At twice the angle, opposite
   * directions land on the same point and average to themselves. The sign is
   * put back at the end, from the age grid, by whatever reads the field.
   */
  cos2: Float32Array
  sin2: Float32Array
  /**
   * How much the field is worth believing here, 0 to 1.
   *
   * The length of the doubled-angle vector before it was normalised: one where
   * everything nearby agrees, near zero where the constraints pull different
   * ways and the answer is an average of disagreement rather than a direction.
   */
  confidence: Float32Array
}

export interface FlowOptions {
  width?: number
  height?: number
  /** How many relaxation sweeps. */
  passes?: number
  /** How strongly a detected fracture zone holds its cell, 0 to 1. */
  anchorWeight?: number
  /** How strongly the age gradient holds a cell that has no anchor. */
  isochronWeight?: number
}

/**
 * Fit the field to the anchors and to the age grid, and let it diffuse.
 *
 * A Jacobi relaxation: every cell is repeatedly set to a blend of what it is
 * told directly and what its four neighbours believe, then put back on the unit
 * circle. Where a cell is told nothing it is pure diffusion, which is what
 * carries the answer under a continent or across a stretch of sea floor that
 * left no marks.
 *
 * The anchors are what make this worth doing at all. Without them the field
 * relaxes to the age gradient, which is where the tracer started; with them it
 * is the age gradient corrected, everywhere, by every scarp within reach.
 */
export function flowField(
  /**
   * The anchor fields, blended where more than one speaks for a cell. Each
   * field's `ridgeness` is read as a share of the anchor weight, 0-1: a
   * detected groove or a line read off the age grid has the whole of it, a
   * cell the regional climb alone speaks for (see isochronFlow) less.
   */
  zones: Lineaments | Lineaments[],
  age: ArrayLike<number>, ageWidth: number, ageHeight: number,
  grid: Grid,
  r0: number,
  options: FlowOptions = {},
): FlowField {
  const sources = Array.isArray(zones) ? zones : [zones]
  const width = options.width ?? 720
  const height = options.height ?? 360
  const passes = options.passes ?? 400
  const anchorWeight = options.anchorWeight ?? 0.6
  const isochronWeight = options.isochronWeight ?? 0.05
  const size = width * height
  const cellHeightKm = (Math.PI * r0) / height

  // --- what each cell is told ---------------------------------------------
  const toldC = new Float32Array(size)
  const toldS = new Float32Array(size)
  const weight = new Float32Array(size)

  // The age grid, averaged onto this grid and smoothed, for the isochrons.
  const ages = new Float32Array(size)
  const dated = new Float32Array(size)
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

  for (let row = 1; row < height - 1; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / height)
    const widthKm = Math.max(
      0.01, ((2 * Math.PI * r0) / width) * Math.max(1e-3, Math.cos(lat)),
    )
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      if (!dated[at]) continue
      const e = row * width + ((column + 1) % width)
      const w = row * width + ((column - 1 + width) % width)
      const n = (row - 1) * width + column
      const s = (row + 1) * width + column
      if (!dated[e] || !dated[w] || !dated[n] || !dated[s]) continue
      const gx = (ages[e] - ages[w]) / (2 * widthKm)
      const gy = (ages[n] - ages[s]) / (2 * cellHeightKm)
      if (gx * gx + gy * gy < 1e-12) continue
      const bearing = Math.atan2(gx, gy)
      toldC[at] = Math.cos(2 * bearing) * isochronWeight
      toldS[at] = Math.sin(2 * bearing) * isochronWeight
      weight[at] = isochronWeight
    }
  }

  // The anchors, which overwrite whatever the age grid said there. Two
  // sources speaking for one cell are added as doubled-angle vectors, so
  // agreement keeps its length and disagreement shortens it into doubt.
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      const lon = ((column + 0.5) / width - 0.5) * 2 * Math.PI
      const lat = (0.5 - (row + 0.5) / height) * Math.PI
      const c = Math.cos(lat)
      const x = c * Math.cos(lon)
      const y = Math.sin(lat)
      const z = -c * Math.sin(lon)
      let sumC = 0, sumS = 0, sumW = 0
      for (const source of sources) {
        const [zc, zr] = directionToPixel(x, y, z, source.width, source.height)
        const cell = zr * source.width + zc
        const share = Math.min(1, source.ridgeness[cell])
        if (share <= 0) continue
        // The stored axis is already a bearing east of north.
        const bearing = (source.axis[cell] / 256) * Math.PI
        const w = anchorWeight * share
        sumC += Math.cos(2 * bearing) * w
        sumS += Math.sin(2 * bearing) * w
        sumW += w
      }
      if (sumW <= 0) continue
      toldC[at] = sumC
      toldS[at] = sumS
      weight[at] = Math.min(1, sumW)
    }
  }

  // Anywhere the survey has nothing at all -- above the altimetry, mostly --
  // there is no reason to prefer one direction, so the cell is left to its
  // neighbours entirely.
  for (let i = 0; i < size; i++) {
    if (grid.samples[Math.min(grid.samples.length - 1, i)] === GRID_GAP && weight[i] === 0) {
      weight[i] = 0
    }
  }

  // --- relaxation -----------------------------------------------------------
  let cos2 = new Float32Array(size)
  let sin2 = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    if (!weight[i]) continue
    cos2[i] = toldC[i] / weight[i]
    sin2[i] = toldS[i] / weight[i]
  }
  let nextC = new Float32Array(size)
  let nextS = new Float32Array(size)
  const confidence = new Float32Array(size)

  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const at = row * width + column
        const east = row * width + ((column + 1) % width)
        const west = row * width + ((column - 1 + width) % width)
        const north = row > 0 ? (row - 1) * width + column : at
        const south = row < height - 1 ? (row + 1) * width + column : at
        // The neighbours' opinion. Frames are ignored: east and north turn with
        // longitude, but between cells half a degree apart the turn is a
        // fraction of a degree everywhere but within a whisker of the poles,
        // and the poles are under ice the altimetry never saw anyway.
        let sc = cos2[east] + cos2[west] + cos2[north] + cos2[south]
        let ss = sin2[east] + sin2[west] + sin2[north] + sin2[south]
        sc /= 4
        ss /= 4
        const w = weight[at]
        let c = w * (toldC[at] / (w || 1)) + (1 - w) * sc
        let s = w * (toldS[at] / (w || 1)) + (1 - w) * ss
        const length = Math.hypot(c, s)
        confidence[at] = Math.min(1, length)
        if (length > 1e-9) { c /= length; s /= length }
        nextC[at] = c
        nextS[at] = s
      }
    }
    const swapC = cos2; cos2 = nextC; nextC = swapC
    const swapS = sin2; sin2 = nextS; nextS = swapS
  }

  return { width, height, cos2, sin2, confidence }
}

/**
 * The travelled direction at a point, as a tangent vector.
 *
 * The field stores an axis, so the caller says which end it wants by handing in
 * the direction it is already going -- or the age gradient, at the start of a
 * walk. `towards` need not be a unit vector and need not be tangent; only its
 * sign against the axis is read.
 */
export function flowAt(
  field: FlowField,
  x: number, y: number, z: number,
  towards: readonly [number, number, number],
): { tx: number; ty: number; tz: number; confidence: number } | null {
  const l = Math.hypot(x, y, z) || 1
  const ux = x / l, uy = y / l, uz = z / l
  const [column, row] = directionToPixel(ux, uy, uz, field.width, field.height)
  const at = row * field.width + column
  const bearing = 0.5 * Math.atan2(field.sin2[at], field.cos2[at])

  let nx = -uy * ux, ny = 1 - uy * uy, nz = -uy * uz
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-6) return null
  nx /= nl; ny /= nl; nz /= nl
  const ex = ny * uz - nz * uy
  const ey = nz * ux - nx * uz
  const ez = nx * uy - ny * ux

  const c = Math.cos(bearing)
  const s = Math.sin(bearing)
  let tx = nx * c + ex * s
  let ty = ny * c + ey * s
  let tz = nz * c + ez * s
  if (tx * towards[0] + ty * towards[1] + tz * towards[2] < 0) { tx = -tx; ty = -ty; tz = -tz }
  return { tx, ty, tz, confidence: field.confidence[at] }
}
