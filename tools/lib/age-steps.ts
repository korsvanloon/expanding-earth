/**
 * Where the sea floor's age *jumps*, and which lines those jumps draw.
 *
 * The age grid is smooth over most of an ocean: the crust gets steadily older
 * away from the ridge, a few million years per hundred kilometres. In strips,
 * though, the rate is different from the strip beside it -- one segment of
 * ridge spread faster than its neighbour, and the isochrons in the two strips
 * are offset. On the dividing line between two such strips the age jumps by the
 * whole offset over a few cells, and that line is a line the crust travelled
 * *along*: it is the trace of the transform that separated the two segments.
 *
 * A reader looked at the size of that jump drawn over the whole world and said
 * it plainly: many places have bands of gradients, and the dividing line
 * between the bands is a good indicator for a path. So this measures the jump,
 * finds the lines in it, and hands them to the flow field as anchors -- the
 * same seam the grooves in the gravity fabric come in by, and a second witness
 * to the same thing, from an independent survey.
 *
 * Two kinds of bright line live in this field and only one of them is a path.
 *
 *   - A dividing line between gradient bands, and any other offset of the
 *     isochrons, runs *with* the flow. That is the anchor.
 *   - A ridge crest, and the terrace edges between the age bands the grid was
 *     compiled from, run *across* the flow. Those say nothing a path wants:
 *     the age gradient already knows the crust crosses them.
 *
 * They are told apart by the direction the age climbs regionally: a jump line
 * within `maxOffDeg` of that climb is the first kind, a jump line square to it
 * is the second. The regional climb is a coarse reference and the jump line is
 * the sharp one -- the reference decides only which of the two the line is,
 * never which way the line runs.
 *
 * The climb is read a few hundred kilometres off the line, on each flank, and
 * never on the line. That is not a detail. A disc centred on an offset
 * averages both sides of it, so what it reports is the offset -- a climb
 * square to the line -- and a gate built on it refuses every fracture zone it
 * meets, which is the one thing it exists to admit. Off the line each flank's
 * own climb is clean, and across a transform the two flanks travelled the same
 * way, which is what makes it a transform.
 */
import { lineaments, type Lineaments } from './structure.js'
import { GRID_GAP, type Grid } from './grid.js'
import { overDisc, spreadingGradient } from './age-gradient.js'
import { axisDiff } from './bearing.js'
import type { Raster } from './raster.js'
import { directionToPixel, lonLatToDirection } from '../../shared/sphere.js'

const R_KM = 6371
const RAD = Math.PI / 180

export interface AgeSteps {
  width: number
  height: number
  /** Size of the age jump at each cell, Ma per 100 km; 0 where unreadable. */
  size: Float32Array
  /** A quantile of the readable cells, for choosing a threshold by measuring. */
  quantile(q: number): number
}

/**
 * The size of the age jump at every cell of the age grid, Ma per 100 km.
 *
 * A plain central difference, in the units the spreading gradient is quoted in
 * so the two can be compared by eye: a typical spreading gradient is 2 to 6 Ma
 * per 100 km, and anything far above that is a jump rather than a slope. Cells
 * whose neighbours are not all dated read zero -- the edge of the survey is not
 * a jump, and treating it as one draws a bright line round every coastline.
 */
export function ageSteps(ages: Raster): AgeSteps {
  const { width, height } = ages
  const size = new Float32Array(width * height)
  const cellKm = (Math.PI * R_KM) / 180
  const sample: number[] = []
  let n = 0
  for (let row = 1; row < height - 1; row++) {
    const lat = 90 - ((row + 0.5) / height) * 180
    const widthKm = Math.max(1, (360 / width) * cellKm * Math.cos(lat * RAD))
    const heightKm = (180 / height) * cellKm
    for (let column = 0; column < width; column++) {
      if (Number.isNaN(ages.at(column, row))) continue
      const east = ages.at(column + 1, row)
      const west = ages.at(column - 1, row)
      const south = ages.at(column, row + 1)
      const north = ages.at(column, row - 1)
      if (Number.isNaN(east) || Number.isNaN(west)
        || Number.isNaN(south) || Number.isNaN(north)) continue
      const dx = ((east - west) * 100) / (2 * widthKm)
      const dy = ((north - south) * 100) / (2 * heightKm)
      size[row * width + column] = Math.hypot(dx, dy)
      // Every seventh readable cell, which is a hundred thousand of them and
      // plenty for a quantile, and cheaper than sorting six million.
      if (n++ % 7 === 0) sample.push(size[row * width + column])
    }
  }
  sample.sort((a, b) => a - b)
  return {
    width,
    height,
    size,
    quantile: (q) => (sample.length ? sample[Math.floor(q * (sample.length - 1))] : 0),
  }
}

export interface StepAnchorOptions {
  /** Cells of the anchor field; the flow field's own grid by default. */
  width?: number
  height?: number
  /** Window of the structure tensor over the jump field, km. */
  windowKm?: number
  /** Below this jump a cell is a slope and not a step, Ma per 100 km. */
  minStep?: number
  /** At this jump an admitted cell holds with its whole weight. */
  fullStep?: number
  /** How line-like the jump has to be, 0-255. */
  minCoherence?: number
  /** How far a jump line may run off the regional climb and still be a path. */
  maxOffDeg?: number
  /** Disc the regional climb is read over, km. */
  regionalKm?: number
  /** How far off the line each flank's climb is read, km. */
  flankKm?: number
  /** Below this the regional climb says nothing, Ma per 100 km. */
  minClimb?: number
  /**
   * The most say an admitted cell may have, 0 to 1.
   *
   * These lines light far more of the field than the grooves do, so how loudly
   * they speak against the other witness is a knob and not a given.
   */
  maxShare?: number
}

/** Why a cell says what it says, so a picture can show the reasoning. */
export const StepKind = {
  None: 0,
  /** A jump line running with the flow: a band boundary, and an anchor. */
  Along: 1,
  /** A jump line running across the flow: a ridge crest or a terrace edge. */
  Across: 2,
  /** A jump line where the regional climb is unreadable, so undecided. */
  Unread: 3,
} as const
export type StepKind = (typeof StepKind)[keyof typeof StepKind]

export interface StepAnchors extends Lineaments {
  ridgeness: Float32Array
  known: Uint8Array
  kind: Uint8Array
  /** The jump that was read at each cell, Ma per 100 km, for the picture. */
  step: Float32Array
  counts: Record<'along' | 'across' | 'unread', number>
}

/**
 * The jump lines that run with the flow, as anchors for the direction field.
 *
 * Coarser than the age grid on purpose. The lines are found at the grid's own
 * tenth of a degree, where a jump is two or three cells wide, and then each
 * output cell takes the strongest line inside it -- so a thin line survives
 * being put on a coarser grid, which averaging it would not. The output grid is
 * the flow field's, because that is what reads this, and an anchor finer than
 * the field it anchors is thrown away by the field.
 */
export function stepAnchors(ages: Raster, options: StepAnchorOptions = {}): StepAnchors {
  const width = options.width ?? 720
  const height = options.height ?? 360
  const windowKm = options.windowKm ?? 150
  const minCoherence = options.minCoherence ?? 60
  const maxOffDeg = options.maxOffDeg ?? 30
  const regionalKm = options.regionalKm ?? 200
  // Far enough off the line that a disc read there does not reach across it.
  const flankKm = options.flankKm ?? regionalKm * 1.5
  const minClimb = options.minClimb ?? 0.5
  const maxShare = options.maxShare ?? 1

  const steps = ageSteps(ages)
  // Thresholds by measurement rather than by taste: a jump worth calling one is
  // rare, and the field's own distribution says how rare. The ninetieth
  // centile is about three times a typical spreading gradient.
  const minStep = options.minStep ?? steps.quantile(0.9)
  const fullStep = options.fullStep ?? steps.quantile(0.99)

  // The jump field as the structure tensor reads it: hundredths of a Ma per
  // 100 km in a signed short, with a gap where the jump is unreadable, so the
  // tensor stops at the edge of the survey instead of drawing it.
  const W = steps.width, H = steps.height
  const samples = new Int16Array(W * H)
  for (let i = 0; i < W * H; i++) {
    samples[i] = steps.size[i] > 0
      ? Math.min(32000, Math.round(steps.size[i] / 0.01))
      : GRID_GAP
  }
  const grid: Grid = {
    width: W, height: H, scale: 0.01, offset: 0, units: 'age jump (Ma/100 km)', samples,
  }
  const lines = lineaments(grid, R_KM, windowKm, 0)

  // The reference: the way the age climbs over a disc wide enough to average
  // out the terracing. Read on the raw grid, since the point is to average.
  const regional = overDisc((x: number, y: number, z: number) => {
    const [column, row] = directionToPixel(x, y, z, W, H)
    return ages.at(column, row)
  }, regionalKm)

  /** North and east at a point; null at a pole, where there is no east. */
  const frame = (x: number, y: number, z: number) => {
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
  /** Move `km` along a bearing from a framed point. */
  const along = (f: Frame, bearing: number, km: number) => {
    const c = Math.cos(bearing * RAD), s = Math.sin(bearing * RAD)
    const t = [
      c * f.n[0] + s * f.e[0], c * f.n[1] + s * f.e[1], c * f.n[2] + s * f.e[2],
    ]
    const d = km / R_KM
    const cd = Math.cos(d), sd = Math.sin(d)
    return [
      cd * f.u[0] + sd * t[0], cd * f.u[1] + sd * t[1], cd * f.u[2] + sd * t[2],
    ] as [number, number, number]
  }
  /** The climb as a bearing east of north, at a point. */
  const climbBearingAt = (at: [number, number, number]) => {
    const f = frame(at[0], at[1], at[2])
    if (!f) return null
    const climb = spreadingGradient(regional, at[0], at[1], at[2])
    if (!climb || climb.climb * 100 < minClimb) return null
    const d = climb.direction
    return {
      bearing: Math.atan2(
        d[0] * f.e[0] + d[1] * f.e[1] + d[2] * f.e[2],
        d[0] * f.n[0] + d[1] * f.n[1] + d[2] * f.n[2],
      ) / RAD,
      climb: climb.climb * 100,
    }
  }

  const size = width * height
  const axis = new Uint8Array(size)
  const coherence = new Uint8Array(size)
  const ridgeness = new Float32Array(size)
  const known = new Uint8Array(size)
  const kind = new Uint8Array(size)
  const step = new Float32Array(size)
  const counts = { along: 0, across: 0, unread: 0 }

  const scaleX = W / width
  const scaleY = H / height
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      // The strongest line inside this cell, not the average of them.
      let best = -1
      let bestAt = -1
      for (let j = Math.floor(row * scaleY); j < Math.floor((row + 1) * scaleY); j++) {
        for (let i = Math.floor(column * scaleX); i < Math.floor((column + 1) * scaleX); i++) {
          const at = j * W + i
          if (steps.size[at] < minStep || lines.coherence[at] < minCoherence) continue
          if (steps.size[at] > best) { best = steps.size[at]; bestAt = at }
        }
      }
      if (bestAt < 0) continue
      const out = row * width + column
      step[out] = best

      const lat = 90 - ((Math.floor(bestAt / W) + 0.5) / H) * 180
      const lon = ((bestAt % W) + 0.5) / W * 360 - 180
      const [x, y, z] = lonLatToDirection(lon * RAD, lat * RAD)
      const here = frame(x, y, z)
      if (!here) continue
      const lineAxis = (lines.axis[bestAt] / 256) * 180
      // Each flank's own climb, read off the line along the line's normal.
      // Whichever is the steeper answers: a shallow climb is the worse
      // reference, and where a flank is a continental margin it has none.
      const sides = [
        climbBearingAt(along(here, lineAxis + 90, flankKm)),
        climbBearingAt(along(here, lineAxis - 90, flankKm)),
      ].filter((side): side is NonNullable<typeof side> => side !== null)
      if (!sides.length) {
        kind[out] = StepKind.Unread
        counts.unread++
        continue
      }
      const climbBearing = sides.reduce((p, q) => (q.climb > p.climb ? q : p)).bearing
      if (axisDiff(lineAxis, climbBearing) > maxOffDeg) {
        // A ridge crest or a terrace edge: the flow crosses it, and the age
        // gradient says so already. Nothing to anchor.
        kind[out] = StepKind.Across
        counts.across++
        continue
      }
      kind[out] = StepKind.Along
      counts.along++
      axis[out] = lines.axis[bestAt]
      // How hard it holds: a jump at the threshold is barely a jump, one at
      // the ninety-ninth centile is an offset there is no arguing with.
      const share = maxShare * Math.min(1, Math.max(0.2,
        (best - minStep) / Math.max(1e-6, fullStep - minStep)))
      ridgeness[out] = share
      coherence[out] = Math.round(255 * share)
      known[out] = 1
    }
  }
  return { width, height, axis, coherence, ridgeness, known, kind, step, counts }
}
