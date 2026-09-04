/**
 * Which way the crust travelled, read from the age grid's own structure.
 *
 * A reader's three rules for a good flow line, as one test:
 *
 *   1. Along it the age climbs, young to old, over a neat gradient.
 *   2. It never crosses a sharp age jump; it runs parallel to one.
 *   3. A groove in the gravity fabric is the same kind of sign as 2.
 *
 * The structure tensor on the age grid finds every linear thing in it, but a
 * linear thing there is one of two. A terrace edge between age bands runs along
 * the isochrons and so *square* to the flow. A fracture zone, where the
 * isochrons are offset, runs *with* the flow. The tensor cannot tell them
 * apart; the age along each candidate can.
 *
 * Telling them apart by which way the regional gradient climbs fails at the
 * big fracture zones: a 250 km disc across the Romanche offset reads the 30 Ma
 * jump itself and calls the climb north-south. So the two candidates -- the
 * tensor's axis, or square to it -- are judged on rules 1 and 2 together.
 * Sample the age at five points along each and prefer the one along which the
 * age climbs *steadily*. Across a fracture zone the age is flat, jumps, and is
 * flat again; across a terrace edge it climbs with a small step; along a
 * terrace edge it does not climb at all.
 *
 * Where the grid has no line to offer, the regional climb is the answer, and
 * is said with less weight: rule 1 alone, with nothing for rule 2 to hold on
 * to. Rule 3 is the grooves, which come in beside this as a second witness
 * where the field is fitted (see flowField).
 */
import { lineaments, type Lineaments } from './structure.js'
import { GRID_GAP, type Grid } from './grid.js'
import { overDisc, spreadingDirection } from './age-gradient.js'
import type { Raster } from './raster.js'
import { directionToPixel } from '../../shared/sphere.js'

export interface IsochronFlowOptions {
  /** Cells of the answer; the flow field's own grid by default. */
  width?: number
  height?: number
  /** Window of the structure tensor on the age grid, km. */
  windowKm?: number
  /** Below this coherence the grid has no line here and rule 1 alone decides. */
  minCoherence?: number
  /** Disc of the regional climb, km: wide enough to step over the jumps. */
  regionalKm?: number
  /** Disc of one sample of the neatness test, km: small enough not to smear a jump. */
  localKm?: number
  /** Distance between the five samples, km. */
  stepKm?: number
  /** Below this much age change across the five samples, nothing climbs, Ma. */
  minClimbMa?: number
  /** The weight, 0-1, of a cell that only the regional climb speaks for. */
  gradientShare?: number
}

/** Why a cell says what it says; kept so a picture can show the reasoning. */
export const FlowKind = {
  None: 0,
  /** Flow on a line of the age grid: a fracture zone (rule 2). */
  Along: 1,
  /** Flow square to a line of the age grid: a terrace edge (rule 1). */
  Across: 2,
  /** No line here; the regional climb alone (rule 1, weakly). */
  Gradient: 3,
} as const
export type FlowKind = (typeof FlowKind)[keyof typeof FlowKind]

export interface IsochronFlow extends Lineaments {
  ridgeness: Float32Array
  known: Uint8Array
  kind: Uint8Array
}

const R_KM = 6371

/** North and east at a point; `null` at a pole, where there is no east. */
function frame(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z) || 1
  const ux = x / l, uy = y / l, uz = z / l
  let nx = -uy * ux, ny = 1 - uy * uy, nz = -uy * uz
  const nl = Math.hypot(nx, ny, nz)
  if (nl < 1e-6) return null
  nx /= nl; ny /= nl; nz /= nl
  return {
    u: [ux, uy, uz] as const,
    n: [nx, ny, nz] as const,
    e: [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux] as const,
  }
}
type Frame = NonNullable<ReturnType<typeof frame>>

/**
 * How neatly the age climbs along a bearing from here.
 *
 * Five samples a step apart. The score is the mean step over the biggest
 * step: one for a steady climb, a quarter when one step is the whole change,
 * which is a jump. No climb, or a reversal on the way, scores nothing. `null`
 * when a sample falls where nothing was dated, so the candidate cannot be
 * judged at all -- which is different from judged and found wanting.
 */
export function climbNeatness(
  at: (x: number, y: number, z: number) => number,
  f: Frame, bearing: number, stepKm: number, minClimbMa: number,
): number | null {
  const c = Math.cos(bearing), s = Math.sin(bearing)
  const t = [c * f.n[0] + s * f.e[0], c * f.n[1] + s * f.e[1], c * f.n[2] + s * f.e[2]]
  const ages: number[] = []
  for (let k = -2; k <= 2; k++) {
    const d = (k * stepKm) / R_KM
    const cd = Math.cos(d), sd = Math.sin(d)
    const a = at(cd * f.u[0] + sd * t[0], cd * f.u[1] + sd * t[1], cd * f.u[2] + sd * t[2])
    if (Number.isNaN(a)) return null
    ages.push(a)
  }
  const total = ages[4] - ages[0]
  if (Math.abs(total) < minClimbMa) return 0
  let biggest = 0
  for (let k = 1; k < 5; k++) {
    const step = (ages[k] - ages[k - 1]) * Math.sign(total)
    if (step < -0.2 * Math.abs(total)) return 0
    biggest = Math.max(biggest, step)
  }
  return Math.abs(total) / 4 / biggest
}

/**
 * The travelled direction over the whole age grid, as anchors for the flow
 * field: a bearing per cell with a weight in `ridgeness` (1 where a line of
 * the grid was read, `gradientShare` where only the climb was), and the
 * reason in `kind`.
 */
export function isochronFlow(ages: Raster, options: IsochronFlowOptions = {}): IsochronFlow {
  const width = options.width ?? 720
  const height = options.height ?? 360
  const windowKm = options.windowKm ?? 200
  const minCoherence = options.minCoherence ?? 60
  const regionalKm = options.regionalKm ?? 250
  const localKm = options.localKm ?? 30
  const stepKm = options.stepKm ?? 60
  const minClimbMa = options.minClimbMa ?? 1.5
  const gradientShare = options.gradientShare ?? 0.3

  // The age grid as the structure tensor reads it: hundredths of a million
  // years in a signed short, with a gap where nothing was dated.
  const W = ages.width, H = ages.height
  const SCALE = 0.02
  const samples = new Int16Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const a = ages.data[i]
    samples[i] = Number.isNaN(a) ? GRID_GAP : Math.round(a / SCALE)
  }
  const grid: Grid = { width: W, height: H, scale: SCALE, offset: 0, units: 'age (Ma)', samples }
  const lines = lineaments(grid, R_KM, windowKm, 0)

  const raw = (x: number, y: number, z: number) => {
    const [c, r] = directionToPixel(x, y, z, W, H)
    return ages.at(c, r)
  }
  const regional = overDisc(raw, regionalKm)
  const local = overDisc(raw, localKm)

  const size = width * height
  const axis = new Uint8Array(size)
  const coherence = new Uint8Array(size)
  const ridgeness = new Float32Array(size)
  const known = new Uint8Array(size)
  const kind = new Uint8Array(size)

  for (let row = 0; row < height; row++) {
    const lat = (0.5 - (row + 0.5) / height) * Math.PI
    for (let column = 0; column < width; column++) {
      const lon = ((column + 0.5) / width - 0.5) * 2 * Math.PI
      const cl = Math.cos(lat)
      const x = cl * Math.cos(lon), y = Math.sin(lat), z = -cl * Math.sin(lon)
      const f = frame(x, y, z)
      if (!f) continue
      const [ac, ar] = directionToPixel(x, y, z, W, H)
      const cell = ar * W + ac
      const at = row * width + column

      let bearing: number | null = null
      let why: FlowKind = FlowKind.None
      if (lines.known[cell] && lines.coherence[cell] >= minCoherence) {
        const line = (lines.axis[cell] / 256) * Math.PI
        const on = climbNeatness(local, f, line, stepKm, minClimbMa)
        const across = climbNeatness(local, f, line + Math.PI / 2, stepKm, minClimbMa)
        if (on !== null && across !== null && (on > 0 || across > 0)) {
          if (on > across) { bearing = line; why = FlowKind.Along }
          else { bearing = line + Math.PI / 2; why = FlowKind.Across }
        }
      }
      if (bearing === null) {
        const climb = spreadingDirection(regional, x, y, z)
        if (!climb) continue
        bearing = Math.atan2(
          climb[0] * f.e[0] + climb[1] * f.e[1] + climb[2] * f.e[2],
          climb[0] * f.n[0] + climb[1] * f.n[1] + climb[2] * f.n[2],
        )
        why = FlowKind.Gradient
      }
      const folded = ((bearing % Math.PI) + Math.PI) % Math.PI
      axis[at] = Math.min(255, Math.round((folded / Math.PI) * 256))
      const share = why === FlowKind.Gradient ? gradientShare : 1
      coherence[at] = Math.round(255 * share)
      ridgeness[at] = share
      known[at] = 1
      kind[at] = why
    }
  }
  return { width, height, axis, coherence, ridgeness, known, kind }
}
