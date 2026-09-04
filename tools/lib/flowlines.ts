/**
 * The stretch marks: which piece of crust was once against which.
 *
 * A fracture zone is not a texture on the sea floor, it is a path. Crust leaves
 * a ridge along it and keeps going, so two points on opposite flanks of the
 * same ridge, on the same path, carrying the same age, were the same point at
 * that age. The age grid therefore already knows thousands of pairs that have
 * to come together at a stated time -- and the model has been scored against
 * four hand-chosen continent pairs instead.
 *
 * Nothing here is puzzled together by hand. It is the same observation the
 * solver is already driven by, read for a different question, which is why it
 * is allowed to be a check at all.
 *
 * The walk starts on the ridge and goes outwards along both flanks at once,
 * rather than from a point inland towards the ridge. Both work, and the first
 * version did the latter: it failed on half its test points, always the same
 * way -- the ridge crest is two pixels wide, the walk crossed it and the
 * gradient turned it straight back, so the "conjugate" came home to the flank
 * it started on. Starting on the crest and leaving in two directions makes
 * being on opposite flanks true by construction instead of hoping for it.
 */
import { R0_KM } from '../../shared/model.js'
import { length3 } from '../../shared/sphere.js'
import { crestOffsetKm, lineamentAt, type Lineaments } from './structure.js'
import { flowAt, type FlowField } from './flowfield.js'

/** Present-day radius; the tracks are paths on today's Earth. */
const RADIUS_KM = R0_KM

export interface FlowPoint {
  /** Present-day unit direction of this piece of crust. */
  x: number
  y: number
  z: number
  /** Age of the crust here, Ma. */
  ageMa: number
  /** Distance from the ridge along the path, km. */
  fromRidgeKm: number
}

export interface FlowTrack {
  /** One flank reversed, then the ridge, then the other flank. */
  points: FlowPoint[]
  /** Where the ridge sits in `points`. */
  ridge: number
}

export interface FlowOptions {
  /** How far apart the ridge seeds are, km. */
  seedSpacingKm?: number
  /** How far each step walks, km. */
  stepKm?: number
  /** Crust younger than this counts as the ridge axis, Ma. */
  ridgeAgeMa?: number
  /**
   * How far a path may turn in one step, degrees.
   *
   * Six over forty kilometres. A real fracture zone bends slowly, and the age
   * grid is one Ma per grey level over cells a fifth of a degree wide, so a
   * looser limit lets a path follow the quantisation and zigzag -- which shows,
   * both on the globe and in the numbers: at twenty-five degrees a step, forty
   * pairs failed the geometry check because their own wiggle had made the paths
   * longer than the distance between their ends. At six, eight did.
   */
  maxTurnDeg?: number
  /** How far from the axis to look for the two flanks, km. */
  departureKm?: number
  /** How far a seed may walk downhill looking for the ridge axis, km. */
  axisReachKm?: number
  /** Radius of the box average the field is read through, in grid cells. */
  blurCells?: number
  /**
   * Which way the lineaments run, if the gravity grid has been read.
   *
   * See tools/lib/structure.ts. Where it is not given the walk is the age
   * gradient alone, which is what it was.
   */
  lineaments?: Lineaments
  /**
   * How far the lineament may pull the step away from the age gradient, once
   * there is a line worth following at all. Zero ignores it.
   */
  structureWeight?: number
  /**
   * Coherence at which the lineament starts being listened to, and the
   * coherence at which it is listened to in full.
   *
   * The weight ramps between the two rather than being proportional to
   * coherence, and that is a correction to how this first worked. Scaling the
   * pull by coherence sounds careful and is self-defeating: a path that drifts
   * off a fracture zone lands on featureless abyssal plain, where coherence is
   * low by definition, so exactly when the correction is most needed there is
   * almost none of it. Measured on the flank west of the Mid-Atlantic Ridge at
   * 24 degrees north, the gravity axis held at 87-97 degrees over the whole
   * stretch while the path wandered between 73 and 117 -- and the coherence
   * over the worst of that wandering was 0.24, which under a proportional rule
   * bought a tenth of the correction it needed.
   */
  structureFloor?: number
  structureFull?: number
  /**
   * How hard the path is steered back onto the line it is following, degrees
   * per step at full offset.
   *
   * Aligning the step's direction with the lineament is not enough and was
   * never going to be: it says which way to point, never whether you are on the
   * line. A path a hundred kilometres off a fracture zone runs exactly parallel
   * to it for ever, perfectly aligned and perfectly wrong. So the offset itself
   * is measured -- how far sideways the nearest trough or crest of the gravity
   * field sits -- and the heading is turned towards it in proportion, the way a
   * driver holds a lane rather than teleporting into it. Turning rather than
   * shifting the position on purpose: a shift can hop the path onto the next
   * fracture zone in one step, and a turn cannot, because the turn limit still
   * applies to the sum of everything asked of this step.
   */
  crestSteerDeg?: number
  /** How far sideways to look for that line, km. */
  crestReachKm?: number
  /**
   * A fitted direction field to walk instead of the local age gradient.
   *
   * The difference is where the direction comes from rather than how far it may
   * turn. A gradient is a reading of two grey levels a few tens of kilometres
   * apart and knows nothing outside that; the field was fitted to every
   * detected fracture zone at once and to the age grid everywhere else, so a
   * step taken along it is a step along what the whole ocean agrees the crust
   * did. The age grid still decides where a walk starts and where it stops.
   */
  field?: FlowField
  /**
   * How much of the offset to close per step, and the most it may close, km.
   *
   * Steering was tried first and cannot do this. A two-degree correction over a
   * forty-kilometre step buys 1.4 km sideways, so closing a thirty-kilometre
   * offset takes eight hundred kilometres of walking -- by which time the line
   * has moved. The path has to be shifted, not merely aimed.
   *
   * Bounded on purpose and twice over. A fraction rather than the whole offset
   * so it converges instead of oscillating, and a hard cap per step so that no
   * single step can carry the path onto the next fracture zone: the strong
   * ridges are 133 km apart and the cap is a few kilometres, so a hop takes
   * dozens of steps of consistent evidence and cannot happen on one bad read.
   */
  crestPull?: number
  crestMaxShiftKm?: number
  /**
   * A second, sharper lineament field, read only for where the lines are.
   *
   * Two scales because one cannot do both jobs, and the measurement says so
   * plainly. Smoothing the gravity field at a hundred kilometres is what makes
   * the *direction* usable -- it is what removes the abyssal-hill fabric that
   * runs square across the flow -- and the same smoothing flattens the strength
   * of the lines until there is no crest left to aim at: at that scale a point
   * picked at random already has 89% of the strongest line-strength within
   * sixty kilometres of it, so steering towards the best of them moves nothing.
   * Smoothed at twenty-five instead, that share falls to 71% and the strong
   * ridges come 133 km apart, which is fracture-zone spacing. So the bearing is
   * read from the blurred field and the lane from the sharp one.
   */
  crest?: Lineaments
  /**
   * How far the lineament may disagree with the age gradient before it is
   * thrown away entirely, degrees.
   *
   * The guard that makes this safe, and it is not optional. A gravity grid over
   * young sea floor is full of abyssal hills, which are long, strong, coherent
   * lineaments running *along* the isochrons -- square across the direction the
   * crust actually travelled. A tracer that followed the strongest line it
   * could see would leave the flank and walk the length of the ridge, which is
   * the exact failure the turn limit exists to prevent. So the age grid keeps
   * the casting vote on where the crust went, and the gravity grid is allowed
   * only to sharpen it.
   */
  structureMaxDeg?: number
  /** Give up on a flank after this far, km. */
  maxLengthKm?: number
  radiusKm?: number
}

/** A tangent basis at a direction, for stepping and differentiating. */
function basis(x: number, y: number, z: number) {
  // Cross the point with whichever axis it is least parallel to, then again to
  // get the second tangent. Picking the axis matters only at the poles, where
  // crossing with north gives nothing at all.
  const ux = Math.abs(y) < 0.9 ? 0 : 1
  const uy = Math.abs(y) < 0.9 ? 1 : 0
  let ax = uy * z - 0 * y
  let ay = 0 * x - ux * z
  let az = ux * y - uy * x
  const al = length3(ax, ay, az) || 1
  ax /= al; ay /= al; az /= al
  const bx = y * az - z * ay
  const by = z * ax - x * az
  const bz = x * ay - y * ax
  return { ax, ay, az, bx, by, bz }
}

/** Move `angle` radians from a direction along a tangent direction. */
function advance(
  x: number, y: number, z: number, tx: number, ty: number, tz: number, angle: number,
) {
  const c = Math.cos(angle), s = Math.sin(angle)
  const nx = x * c + tx * s
  const ny = y * c + ty * s
  const nz = z * c + tz * s
  const l = length3(nx, ny, nz) || 1
  return [nx / l, ny / l, nz / l] as [number, number, number]
}

/**
 * The age field as a function of direction, blurred as it is read.
 *
 * `age` is an equirectangular grid in Ma with NaN where the grid does not date
 * the crust. Anything whose centre is undated returns NaN rather than a number
 * made up from its neighbours: a path that walks into undated crust has to
 * stop, not carry on over a guess.
 *
 * The blur is a box average over the surrounding cells, done here rather than
 * over the whole grid beforehand. On the 2048-wide grid the difference did not
 * matter; on the 8192-wide one it is the difference between a hundred thousand
 * reads and smoothing thirty-three million cells four times over. The grid is
 * about one Ma per level, so without some averaging the gradient reads the
 * terracing rather than the sea floor.
 */
function ageField(age: ArrayLike<number>, width: number, height: number, blurCells: number) {
  const at = (x: number, y: number, z: number) => {
    const l = length3(x, y, z) || 1
    const u = Math.atan2(-z / l, x / l) / (2 * Math.PI) + 0.5
    const v = Math.acos(Math.min(1, Math.max(-1, y / l))) / Math.PI
    const col = Math.min(width - 1, Math.max(0, Math.floor(u * width) % width))
    const row = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
    const centre = age[row * width + col]
    if (Number.isNaN(centre) || blurCells < 1) return centre
    let sum = 0
    let seen = 0
    for (let dr = -blurCells; dr <= blurCells; dr++) {
      const r = row + dr
      if (r < 0 || r >= height) continue
      for (let dc = -blurCells; dc <= blurCells; dc++) {
        const c = ((col + dc) % width + width) % width
        const a = age[r * width + c]
        if (!Number.isNaN(a)) { sum += a; seen++ }
      }
    }
    return seen ? sum / seen : centre
  }
  return { at }
}

export interface FlowResult {
  tracks: FlowTrack[]
  /**
   * How many ridge seeds there were and why the failures failed.
   *
   * Reported rather than swallowed. A tracer that quietly returns four tracks
   * where two hundred were expected looks exactly like a tracer that found
   * four, and the first version of this did precisely that.
   */
  seeds: number
  rejected: Record<string, number>
}

export function traceFlowLines(
  age: ArrayLike<number>,
  width: number,
  height: number,
  options: FlowOptions = {},
): FlowResult {
  const seedSpacingKm = options.seedSpacingKm ?? 500
  const stepKm = options.stepKm ?? 40
  const ridgeAgeMa = options.ridgeAgeMa ?? 3
  const maxTurn = ((options.maxTurnDeg ?? 6) * Math.PI) / 180
  const maxLengthKm = options.maxLengthKm ?? 12000
  const departureKm = options.departureKm ?? 200
  const axisReachKm = options.axisReachKm ?? 1000
  const r = options.radiusKm ?? 6371
  const structure = options.lineaments
  const structureWeight = options.structureWeight ?? 0.6
  const structureFloor = options.structureFloor ?? 0.15
  const structureFull = options.structureFull ?? 0.35
  const crestSteer = ((options.crestSteerDeg ?? 0) * Math.PI) / 180
  const crestReachKm = options.crestReachKm ?? 60
  const crest = options.crest ?? options.lineaments
  const fitted = options.field
  const crestPull = options.crestPull ?? 0
  const crestMaxShiftKm = options.crestMaxShiftKm ?? 8
  const structureMaxCos = Math.cos(((options.structureMaxDeg ?? 40) * Math.PI) / 180)
  // Blur over roughly the distance a step covers, in whatever cells this grid
  // has. On a coarse grid that is none at all and the field is read raw.
  const blurCells = options.blurCells
    ?? Math.max(0, Math.round(stepKm / ((2 * Math.PI * r) / width) / 2))
  const field = ageField(age, width, height, blurCells)
  const stepAngle = stepKm / r
  // Differentiate over roughly one step -- finer than the grid is noise, coarser
  // and a path cuts the corner of every bend in the fracture zone -- but never
  // over less than a grid cell. A difference taken inside a single cell is
  // exactly zero, the gradient comes back null, and every flank dies on its
  // first step. On the 2048x1024 grid this never binds; on a coarse one it is
  // the difference between working and returning nothing at all.
  const probeAngle = Math.max(stepAngle, Math.PI / height)

  /** Tangential gradient of age, as a unit direction plus a rate in Ma/km. */
  const gradient = (x: number, y: number, z: number) => {
    const { ax, ay, az, bx, by, bz } = basis(x, y, z)
    const read = (tx: number, ty: number, tz: number, sign: number) => {
      const [px, py, pz] = advance(x, y, z, tx, ty, tz, sign * probeAngle)
      return field.at(px, py, pz)
    }
    const ap = read(ax, ay, az, 1), am = read(ax, ay, az, -1)
    const bp = read(bx, by, bz, 1), bm = read(bx, by, bz, -1)
    if ([ap, am, bp, bm].some((v) => Number.isNaN(v))) return null
    const ga = (ap - am) / (2 * probeAngle * r)
    const gb = (bp - bm) / (2 * probeAngle * r)
    const size = Math.hypot(ga, gb)
    if (size < 1e-9) return null
    return {
      tx: (ax * ga + bx * gb) / size,
      ty: (ay * ga + by * gb) / size,
      tz: (az * ga + bz * gb) / size,
      rate: size,
    }
  }

  // --- seeds along the ridge axis -----------------------------------------
  //
  // Every dated cell young enough to be the ridge, thinned so no two seeds sit
  // within seedSpacingKm of each other. Thinning by distance rather than by
  // taking every Nth cell keeps the ridges evenly covered whatever shape they
  // are: a slow ridge is a handful of cells wide and a fast one is dozens, and
  // sampling cells would follow the spreading rate rather than the geography.
  const seeds: [number, number, number][] = []
  const minCos = Math.cos(seedSpacingKm / r)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const a = age[row * width + col]
      if (Number.isNaN(a) || a > ridgeAgeMa) continue
      const u = (col + 0.5) / width
      const v = (row + 0.5) / height
      const lon = (u - 0.5) * 2 * Math.PI
      const lat = (0.5 - v) * Math.PI
      const c = Math.cos(lat)
      const p: [number, number, number] = [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
      let near = false
      for (const s of seeds) {
        if (s[0] * p[0] + s[1] * p[1] + s[2] * p[2] > minCos) { near = true; break }
      }
      if (!near) seeds.push(p)
    }
  }

  /** Walk one flank outwards from the ridge. */
  const flank = (
    seed: [number, number, number],
    tx0: number, ty0: number, tz0: number,
    startAge: number,
  ): FlowPoint[] => {
    let [x, y, z] = seed
    let tx = tx0, ty = ty0, tz = tz0
    let last = startAge
    let walked = 0
    const out: FlowPoint[] = []
    while (walked < maxLengthKm) {
      const g = gradient(x, y, z)
      if (!g) break
      // Where the gravity grid shows a clean line running the way the age grid
      // says the crust went, take the line: it is the same event recorded at a
      // tenth of a degree instead of at a grey level, and it does not go flat
      // over a stretch the survey dated all the same. Where the two disagree by
      // more than the guard, the line is not this crust's path -- an abyssal
      // hill fabric, a seamount chain, a ridge segment -- and it is dropped.
      let wx = g.tx, wy = g.ty, wz = g.tz
      if (fitted) {
        // The field is an axis; the end wanted is the one the walk is already
        // going, which at the first step is the direction it left the ridge on.
        const flow = flowAt(fitted, x, y, z, [tx, ty, tz])
        if (flow) { wx = flow.tx; wy = flow.ty; wz = flow.tz }
      }
      if (structure && structureWeight > 0) {
        const line = lineamentAt(structure, x, y, z)
        if (line) {
          // An axis has no direction of its own; take the end that agrees with
          // where the crust is already going.
          const sign = line.tx * tx + line.ty * ty + line.tz * tz < 0 ? -1 : 1
          const sx = line.tx * sign, sy = line.ty * sign, sz = line.tz * sign
          if (sx * g.tx + sy * g.ty + sz * g.tz >= structureMaxCos) {
            const ramp = Math.min(1, Math.max(0,
              (line.coherence - structureFloor) / Math.max(1e-6, structureFull - structureFloor)))
            const w = structureWeight * ramp
            const bx = g.tx + (sx - g.tx) * w
            const by = g.ty + (sy - g.ty) * w
            const bz = g.tz + (sz - g.tz) * w
            const bl = length3(bx, by, bz)
            if (bl > 1e-9) { wx = bx / bl; wy = by / bl; wz = bz / bl }
          }
        }
      }
      // And having pointed along the line, get back onto it. The offset is
      // signed across the path, so the correction has a side as well as a size,
      // and it is proportional rather than absolute: a path already on the line
      // is not steered at all, and one at the edge of the reach is steered the
      // full amount. Both the alignment above and this are folded into the same
      // requested direction, so the turn limit below bounds their sum -- which
      // is why neither of them can throw the path off a bend.
      if (crest && crestSteer > 0) {
        // Across the path, in the tangent plane: the heading crossed with the
        // outward normal, which at a point of the unit sphere is the point.
        let cx = wy * z - wz * y
        let cy = wz * x - wx * z
        let cz = wx * y - wy * x
        const cl = length3(cx, cy, cz)
        if (cl > 1e-9) {
          cx /= cl; cy /= cl; cz /= cl
          const offset = crestOffsetKm(crest, x, y, z, cx, cy, cz, crestReachKm, r)
          if (offset !== null) {
            const turn = crestSteer * Math.max(-1, Math.min(1, offset / crestReachKm))
            const cos = Math.cos(turn), sin = Math.sin(turn)
            const sx = wx * cos + cx * sin
            const sy = wy * cos + cy * sin
            const sz = wz * cos + cz * sin
            const sl = length3(sx, sy, sz)
            if (sl > 1e-9) { wx = sx / sl; wy = sy / sl; wz = sz / sl }
          }
        }
      }
      // Uphill, but not free to turn wherever the local gradient points. A
      // fracture zone is a path the crust actually took, so it bends slowly;
      // letting each step choose its own direction lets a path turn along an
      // isochron and walk the length of the ridge instead of away from it.
      const dot = Math.min(1, Math.max(-1, wx * tx + wy * ty + wz * tz))
      const turn = Math.acos(dot)
      if (turn > maxTurn) {
        const blend = maxTurn / turn
        const nx = tx + (wx - tx) * blend
        const ny = ty + (wy - ty) * blend
        const nz = tz + (wz - tz) * blend
        const l = length3(nx, ny, nz) || 1
        tx = nx / l; ty = ny / l; tz = nz / l
      } else {
        tx = wx; ty = wy; tz = wz
      }
      let [px, py, pz] = advance(x, y, z, tx, ty, tz, stepAngle)
      let a = field.at(px, py, pz)
      if (Number.isNaN(a)) break

      // Having stepped, slide sideways onto the line. Measured across the new
      // heading at the new place, so what is corrected is where the path has
      // just arrived rather than where it was.
      //
      // The shift is refused rather than clamped if it would break the rule
      // that the age keeps rising: sliding across a fracture zone lands on
      // crust of a different age entirely, and that is the one move this must
      // never make -- it is how a path stops being one piece of crust's history
      // and becomes two.
      if (crest && crestPull > 0) {
        let sx = ty * pz - tz * py
        let sy = tz * px - tx * pz
        let sz = tx * py - ty * px
        const sl = length3(sx, sy, sz)
        if (sl > 1e-9) {
          sx /= sl; sy /= sl; sz /= sl
          const offset = crestOffsetKm(crest, px, py, pz, sx, sy, sz, crestReachKm, r)
          if (offset !== null) {
            const move = Math.max(-crestMaxShiftKm, Math.min(crestMaxShiftKm, offset * crestPull))
            const [qx, qy, qz] = advance(px, py, pz, sx, sy, sz, move / r)
            const shifted = field.at(qx, qy, qz)
            if (!Number.isNaN(shifted) && shifted >= last - 1) {
              px = qx; py = qy; pz = qz
              a = shifted
            }
          }
        }
      }
      // The age has to keep rising. Where it does not, the path has left the
      // flank it started on -- crossed a transform, or run into a piece of
      // crust from another ridge entirely.
      if (a < last - 1) break
      x = px; y = py; z = pz
      walked += stepKm
      last = Math.max(last, a)
      out.push({ x, y, z, ageMa: a, fromRidgeKm: walked })
      // Keep the step direction tangent to the sphere at the new point.
      const drift = tx * x + ty * y + tz * z
      tx -= x * drift; ty -= y * drift; tz -= z * drift
      const l = length3(tx, ty, tz) || 1
      tx /= l; ty /= l; tz /= l
    }
    return out
  }

  /**
   * Walk a seed downhill onto the ridge axis itself.
   *
   * A cell young enough to be called ridge sits somewhere on the axial valley,
   * not on its floor, so the gradient there points uphill along whichever flank
   * that cell already belongs to. Leaving in the opposite direction then walks
   * *down* first, across the axis -- and the rule that ages must rise cuts the
   * flank off in its second step. Sixty of a hundred and twenty seeds died that
   * way. Finding the floor first makes the seed's age the minimum, so both
   * flanks rise from it and nothing has to be excused.
   */
  const toAxis = (seed: [number, number, number]) => {
    let [x, y, z] = seed
    let best = field.at(x, y, z)
    // Bounded by distance, not by a step count. A cap of ten steps left the
    // "axis" four hundred kilometres out on a flank, where the age is
    // one-sided -- and everything downstream then went wrong quietly: the far
    // flank had to walk back down to zero before it could climb, and the rule
    // that ages must rise killed it two steps in.
    for (let walked = 0; walked < axisReachKm; walked += stepKm) {
      const g = gradient(x, y, z)
      if (!g) break
      const [px, py, pz] = advance(x, y, z, -g.tx, -g.ty, -g.tz, stepAngle)
      const a = field.at(px, py, pz)
      if (Number.isNaN(a) || a >= best) break
      x = px; y = py; z = pz; best = a
    }
    return { point: [x, y, z] as [number, number, number], ageMa: best }
  }

  /**
   * The two ways out of the axis: uphill, and as near to the opposite as the
   * crust allows.
   *
   * A gradient is no use on the floor of a valley -- it is zero there, and what
   * is left of it is noise. Sampling a ring of directions instead asks the
   * question the fracture zone answers: which way does the crust get older.
   */
  const departures = (axis: [number, number, number]) => {
    const { ax, ay, az, bx, by, bz } = basis(axis[0], axis[1], axis[2])
    const ring = 16
    const look = departureKm / r
    let first: { tx: number; ty: number; tz: number; ageMa: number } | null = null
    let dated = 0
    for (let i = 0; i < ring; i++) {
      const angle = (2 * Math.PI * i) / ring
      const tx = ax * Math.cos(angle) + bx * Math.sin(angle)
      const ty = ay * Math.cos(angle) + by * Math.sin(angle)
      const tz = az * Math.cos(angle) + bz * Math.sin(angle)
      const [px, py, pz] = advance(axis[0], axis[1], axis[2], tx, ty, tz, look)
      const a = field.at(px, py, pz)
      if (Number.isNaN(a)) continue
      dated++
      if (!first || a > first.ageMa) first = { tx, ty, tz, ageMa: a }
    }
    if (!first || dated < 4) return null
    // The other flank is simply the other way. Taking instead the oldest
    // direction in the half-ring facing away looked more careful and was
    // wrong: near the axis the ages behind the steepest ascent are all low, so
    // the "opposite" flank came out perpendicular to the ridge -- along it --
    // and then curved round to follow the same gradient as the first. Both
    // halves of every pair ended up on the same side of the ocean, five
    // hundred kilometres apart after walking three thousand each.
    return {
      first,
      second: { tx: -first.tx, ty: -first.ty, tz: -first.tz, ageMa: first.ageMa },
    }
  }

  /** Did this flank get away from the axis, or wander in circles near it? */
  const straight = (axis: [number, number, number], path: FlowPoint[]) => {
    const end = path[path.length - 1]
    const dot = Math.min(1, Math.max(-1, axis[0] * end.x + axis[1] * end.y + axis[2] * end.z))
    return Math.acos(dot) * r >= 0.6 * end.fromRidgeKm
  }

  const tracks: FlowTrack[] = []
  const rejected: Record<string, number> = {
    'no gradient on the crest': 0,
    'no way out of the axis': 0,
    'a flank went nowhere': 0,
    'nothing older than 10 Ma': 0,
    'a flank doubled back': 0,
  }
  const axes: [number, number, number][] = []
  for (const raw of seeds) {
    const { point: seed, ageMa: axisAge } = toAxis(raw)
    // Several seeds can slide onto the same stretch of axis; one track each.
    let already = false
    for (const a of axes) {
      if (a[0] * seed[0] + a[1] * seed[1] + a[2] * seed[2] > Math.cos(200 / r)) {
        already = true
        break
      }
    }
    if (already) continue
    axes.push(seed)
    const ways = departures(seed)
    if (!ways) { rejected['no way out of the axis']++; continue }
    const a = flank(seed, ways.first.tx, ways.first.ty, ways.first.tz, axisAge)
    const b = flank(seed, ways.second.tx, ways.second.ty, ways.second.tz, axisAge)
    if (a.length < 3 || b.length < 3) { rejected['a flank went nowhere']++; continue }
    const oldest = Math.min(a[a.length - 1].ageMa, b[b.length - 1].ageMa)
    if (oldest < 10) { rejected['nothing older than 10 Ma']++; continue }
    // Neither flank may double back.
    //
    // The two leave the axis in opposite directions by construction, so what is
    // left to check is that they kept going. A path that curls round covers far
    // more ground than it gets away from the axis, so comparing the two catches
    // it whatever length it is -- which the test before this did not: it asked
    // whether the two end points were more than sixty degrees apart, and threw
    // away ninety-three tracks of a hundred and twenty for being short rather
    // than for being wrong. Two honest flanks of three thousand kilometres end
    // up fifty-six degrees apart, and fifty-six is less than sixty.
    if (!straight(seed, a) || !straight(seed, b)) {
      rejected['a flank doubled back']++
      continue
    }
    tracks.push({
      points: [
        ...[...a].reverse(),
        { x: seed[0], y: seed[1], z: seed[2], ageMa: axisAge, fromRidgeKm: 0 },
        ...b,
      ],
      ridge: a.length,
    })
  }
  return { tracks, seeds: seeds.length, rejected }
}

/**
 * A point on the mesh, to the precision of a triangle rather than a vertex.
 *
 * Three vertices and the weights that mix them. Snapping each end of a pair to
 * the nearest vertex put the floor of the whole check at the mesh spacing --
 * 115 km, most of what the model was being blamed for at 20 Ma. A point inside
 * a triangle is where the crust actually is, and it survives the mesh changing
 * underneath it, because the three vertices are followed through collapses
 * rather than the triangle being looked up again.
 */
export interface MeshPoint {
  v: [number, number, number]
  w: [number, number, number]
}

export interface Conjugate {
  /** The two pieces of crust. */
  a: MeshPoint
  b: MeshPoint
  /** When they were the same point, Ma. */
  ageMa: number
  /** How far each has travelled from the ridge since, km. */
  fromRidgeAKm: number
  fromRidgeBKm: number
  /**
   * Which walk this came off.
   *
   * Carried so that a run can hold some of these back. Once the pairs are fed
   * to the solver as constraints they stop being a test of it, and splitting
   * them has to be done by track and not by pair: two pairs five million years
   * apart on the same walk are nearly the same claim, so a split that put one
   * in each half would be marking its own homework.
   */
  track: number
}

/**
 * Read conjugate pairs off the tracks at the ages asked for.
 *
 * The ages are the frame times, so that the pair whose answer is known can be
 * measured at the frame where the answer is zero: two points that were one
 * point at 60 Ma should be in the same place in the 60 Ma frame. Any other
 * frame needs a prediction of how far apart they should be by then, which is
 * a second model on top of the one being tested.
 *
 * `snap` maps a present-day direction to whatever index the caller wants --
 * a mesh vertex, in practice. A pair whose halves snap to the same index is
 * dropped: it says nothing that the mesh's own resolution did not already say.
 */
export interface ConjugateResult {
  pairs: Conjugate[]
  rejected: Record<string, number>
}

/**
 * Read conjugate pairs off the tracks at the ages asked for.
 *
 * The ages are the frame times, so the pair whose answer is known can be
 * measured at the frame where the answer is zero: two points that were one
 * point at 60 Ma should be in the same place in the 60 Ma frame. Any other
 * frame needs a prediction of how far apart they should be by then, which is a
 * second model stacked on the one being tested.
 *
 * `snap` maps a present-day direction to whatever index the caller wants -- a
 * mesh vertex, in practice. A pair whose halves snap to the same index is
 * dropped: it says nothing the mesh's own resolution did not already say.
 *
 * The filter is the geometry of a flow line rather than a tolerance.
 * Two points that left the same place along the same path in opposite
 * directions are, today, as far apart as the two paths are long. Where they are
 * not, something is wrong that no threshold in kilometres would have named:
 * both flanks left the same way, or one wandered, or the walk crossed a
 * transform onto crust from another ridge. It caught pairs like 29W 53N against
 * 29W 54N -- ninety-five kilometres apart after eight hundred and eighty
 * kilometres of walking, so plainly the same flank twice.
 */
export function conjugatePairs(
  tracks: FlowTrack[],
  ages: number[],
  snap: (x: number, y: number, z: number) => MeshPoint | null,
  tolerance = 4,
  /**
   * How far apart two pairs have to be, in km, measured end for end.
   *
   * Zero keeps every pair a path can offer, which is what this used to do and
   * which loads the answer onto whichever ocean happens to have both of its
   * flanks. Measured over the run before this option existed: 52% of pairs in
   * the Atlantic against 16% in the Pacific, while the *paths* were spread 80
   * to 54. The paths were never the problem. Pairs are taken at every frame
   * age both flanks survive, and in the Atlantic both flanks survive back to
   * 180 Ma, so one path there offers 36 while the same path in the Pacific --
   * whose western flank is gone -- offers a handful.
   *
   * Spacing them along their own path does not fix that: the Atlantic pairs
   * already sit about 315 km apart along theirs. What fixes it is spacing them
   * against *each other*, wherever they are, which is what a reader asked for
   * in as many words -- an even spread over the whole world, and never mind
   * that points end up far apart.
   */
  spacingKm = 0,
): ConjugateResult {
  const pairs: Conjugate[] = []
  const rejected: Record<string, number> = {
    'no crust of that age on one flank': 0,
    'both halves are the same mesh point': 0,
    'not as far apart as the paths are long': 0,
    'another pair already covers this crust': 0,
  }
  /**
   * Ends already spoken for, in buckets a spacing wide, so the test is local.
   *
   * Both ends of a pair are registered and both are tested: a pair is a claim
   * about two pieces of crust, and either being already covered makes it a
   * repetition of a claim rather than a new one.
   */
  const taken = new Map<string, [number, number, number][]>()
  const cell = (age: number, x: number, y: number, z: number) => {
    const size = Math.max(1e-6, spacingKm / RADIUS_KM)
    return `${age},${Math.round(x / size)},${Math.round(y / size)},${Math.round(z / size)}`
  }
  /**
   * Pairs compete only against others of their own age, and that took getting
   * wrong to see.
   *
   * Across every age at once, this left four pairs at 120 Ma out of fifteen
   * and thinned every band: a pair at 120 Ma and one at 20 Ma in the same
   * stretch of ocean were treated as one claim made twice. They are not. They
   * are different claims about different moments, and the deep ones are the
   * rarest and the most telling. What a reader called redundant -- many points
   * close together -- is redundant within an age and is time coverage between
   * ages, and the first version of this rule spent the second to buy the first.
   *
   * Ordering the ages oldest-first was the obvious repair and it is not the
   * repair: it moved 120 Ma from three pairs to four. The competition was
   * never between ages, so no ordering of them could fix it.
   */
  const clear = (age: number, p: FlowPoint) => {
    if (!spacingKm) return true
    const size = Math.max(1e-6, spacingKm / RADIUS_KM)
    const near = Math.cos(spacingKm / RADIUS_KM)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const there = taken.get(cell(age, p.x + dx * size, p.y + dy * size, p.z + dz * size))
          if (!there) continue
          for (const [x, y, z] of there) {
            if (p.x * x + p.y * y + p.z * z > near) return false
          }
        }
      }
    }
    return true
  }
  const claim = (age: number, p: FlowPoint) => {
    if (!spacingKm) return
    const key = cell(age, p.x, p.y, p.z)
    const there = taken.get(key)
    if (there) there.push([p.x, p.y, p.z])
    else taken.set(key, [[p.x, p.y, p.z]])
  }

  /**
   * Age by age across every path, oldest age first.
   *
   * The spacing rule is greedy, so the order it considers candidates in is the
   * order of preference. Path by path would hand one ocean everything it asked
   * for before the next was looked at, so it goes age by age. And oldest
   * first, which is the opposite of the obvious way round and was learnt from
   * getting it wrong: youngest first left three pairs at 120 Ma out of
   * fifteen, because on a slow path 100 and 120 Ma sit less than a spacing
   * apart and the young one had already claimed the crust. Old pairs are rare
   * and are the deep test; young ones are plentiful and can fill in around
   * them.
   */
  const flanks = tracks.map((track) => ({
    left: track.points.slice(0, track.ridge).reverse(),
    right: track.points.slice(track.ridge + 1),
  }))
  for (const age of [...ages].sort((p, q) => q - p)) {
    for (const [index] of tracks.entries()) {
      const { left, right } = flanks[index]
      const nearest = (side: FlowPoint[]) => {
        let best: FlowPoint | null = null
        for (const p of side) {
          if (!best || Math.abs(p.ageMa - age) < Math.abs(best.ageMa - age)) best = p
        }
        return best && Math.abs(best.ageMa - age) <= tolerance ? best : null
      }
      const pa = nearest(left)
      const pb = nearest(right)
      if (!pa || !pb) { rejected['no crust of that age on one flank']++; continue }
      const walked = pa.fromRidgeKm + pb.fromRidgeKm
      const apart = Math.acos(Math.min(1, Math.max(-1,
        pa.x * pb.x + pa.y * pb.y + pa.z * pb.z))) * RADIUS_KM
      // A great circle is never longer than a path along the surface, so the
      // upper bound is only slack for the step length; the lower bound is the
      // one doing the work.
      if (apart < 0.7 * walked || apart > 1.05 * walked) {
        rejected['not as far apart as the paths are long']++
        continue
      }
      const a = snap(pa.x, pa.y, pa.z)
      const b = snap(pb.x, pb.y, pb.z)
      if (!a || !b || a.v.every((v, i) => v === b.v[i])) {
        rejected['both halves are the same mesh point']++
        continue
      }
      if (!clear(age, pa) || !clear(age, pb)) {
        rejected['another pair already covers this crust']++
        continue
      }
      claim(age, pa)
      claim(age, pb)
      pairs.push({
        a, b, ageMa: age, fromRidgeAKm: pa.fromRidgeKm, fromRidgeBKm: pb.fromRidgeKm,
        track: index,
      })
    }
  }
  return { pairs, rejected }
}

export function vertexSnapper(dirs: Float32Array, vertexCount: number) {
  // Cells sized so each holds a handful of vertices. A fixed grid works for the
  // mesh this ships with and returns -1 on a coarse one, where every cell in
  // the neighbourhood searched is empty -- so the grid follows the mesh, and
  // the search widens until it finds something whatever the grid.
  const rows = Math.min(180, Math.max(4, Math.round(Math.sqrt(vertexCount / 8))))
  const cols = rows * 2
  const cells: number[][] = Array.from({ length: rows * cols }, () => [])
  const cellOf = (x: number, y: number, z: number) => {
    const l = length3(x, y, z) || 1
    const row = Math.min(rows - 1, Math.floor(
      (Math.acos(Math.min(1, Math.max(-1, y / l))) / Math.PI) * rows,
    ))
    const lon = Math.atan2(-z / l, x / l) / (2 * Math.PI) + 0.5
    const col = ((Math.floor(lon * cols) % cols) + cols) % cols
    return { row, col }
  }
  for (let v = 0; v < vertexCount; v++) {
    const { row, col } = cellOf(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2])
    cells[row * cols + col].push(v)
  }
  return (x: number, y: number, z: number) => {
    const l = length3(x, y, z) || 1
    const ux = x / l, uy = y / l, uz = z / l
    const { row, col } = cellOf(ux, uy, uz)
    let best = -1
    let bestDot = -2
    // Widen until something is found, then once more: the nearest vertex can
    // sit in the next ring out even when this one is occupied. Rows near the
    // pole are slivers, so the column reach grows with latitude for the same
    // reason the coverage measure's buckets do.
    for (let ring = 1, spare = 1; ring <= rows && spare >= 0; ring++) {
      if (best >= 0) spare--
      const lat = Math.PI * (0.5 - (row + 0.5) / rows)
      const reach = Math.min(cols, Math.ceil(ring / Math.max(1e-6, Math.cos(lat))))
      for (let dr = -ring; dr <= ring; dr++) {
        const r = row + dr
        if (r < 0 || r >= rows) continue
        for (let dc = -reach; dc <= reach; dc++) {
          const c = ((col + dc) % cols + cols) % cols
          for (const candidate of cells[r * cols + c]) {
            const dot = ux * dirs[candidate * 3] + uy * dirs[candidate * 3 + 1]
              + uz * dirs[candidate * 3 + 2]
            if (dot > bestDot) { bestDot = dot; best = candidate }
          }
        }
      }
    }
    return best
  }
}

/**
 * The triangle a direction falls in, with the weights that place it inside.
 *
 * Built on the vertex snapper: the containing triangle is nearly always one of
 * those around the nearest vertex, so only a handful are tested. When none of
 * them contains the point -- which happens where the walk has left the mesh's
 * own idea of the surface -- the nearest vertex alone is returned rather than
 * a guess, and the weights say so.
 *
 * The weights are the planar barycentric coordinates of the direction on the
 * triangle's plane, which is exactly how a renderer places a point inside a
 * triangle, so the interpolated position is the one the crust is drawn at.
 */
export function faceSnapper(dirs: Float32Array, indices: ArrayLike<number>, vertexCount: number) {
  const nearest = vertexSnapper(dirs, vertexCount)
  const around: number[][] = Array.from({ length: vertexCount }, () => [])
  for (let f = 0; f < indices.length / 3; f++) {
    for (let k = 0; k < 3; k++) around[indices[f * 3 + k]].push(f)
  }
  return (x: number, y: number, z: number): MeshPoint | null => {
    const seed = nearest(x, y, z)
    if (seed < 0) return null
    const l = length3(x, y, z) || 1
    const px = x / l, py = y / l, pz = z / l
    for (const f of around[seed]) {
      const a = indices[f * 3], b = indices[f * 3 + 1], c = indices[f * 3 + 2]
      const w = barycentric(dirs, a, b, c, px, py, pz)
      if (w) return { v: [a, b, c], w }
    }
    return { v: [seed, seed, seed], w: [1, 0, 0] }
  }
}

/** Weights placing a direction inside a spherical triangle, or null if outside. */
function barycentric(
  dirs: Float32Array, a: number, b: number, c: number, px: number, py: number, pz: number,
): [number, number, number] | null {
  // Each edge of a spherical triangle lies in a plane through the centre, and a
  // point is inside when it is on the same side of all three. Cheaper and more
  // robust than projecting first, and it is the same test the coverage measure
  // uses to decide whether a probe has landed on a triangle.
  const corner = [a, b, c]
  let sign = 0
  for (let e = 0; e < 3; e++) {
    const u = corner[e] * 3
    const v = corner[(e + 1) % 3] * 3
    const nx = dirs[u + 1] * dirs[v + 2] - dirs[u + 2] * dirs[v + 1]
    const ny = dirs[u + 2] * dirs[v] - dirs[u] * dirs[v + 2]
    const nz = dirs[u] * dirs[v + 1] - dirs[u + 1] * dirs[v]
    const side = nx * px + ny * py + nz * pz
    if (side === 0) continue
    if (sign === 0) sign = Math.sign(side)
    else if (Math.sign(side) !== sign) return null
  }
  // Inside: the weights are the areas of the three sub-triangles the point
  // makes with each edge, which on the plane through the corners is the usual
  // cross-product formula.
  const area = (i: number, j: number, qx: number, qy: number, qz: number) => {
    const u = corner[i] * 3, v = corner[j] * 3
    const ax = dirs[u] - qx, ay = dirs[u + 1] - qy, az = dirs[u + 2] - qz
    const bx = dirs[v] - qx, by = dirs[v + 1] - qy, bz = dirs[v + 2] - qz
    return length3(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
  }
  const wa = area(1, 2, px, py, pz)
  const wb = area(2, 0, px, py, pz)
  const wc = area(0, 1, px, py, pz)
  const total = wa + wb + wc
  if (!(total > 0)) return null
  return [wa / total, wb / total, wc / total]
}

export interface ConjugateFit {
  /** How many pairs were due to coincide at this time. */
  conjugateCount: number
  /** Median separation of those pairs, km. */
  conjugateMedianKm: number
  /** Share of them within `contactKm` of each other. */
  conjugateMatched: number
  /**
   * Share whose two halves the mesh has already merged into one point.
   *
   * Reported because it is the part of the score that cannot fail. A collapse
   * is the model closing the ocean and merging the two banks, which is the
   * right answer -- but it also makes the separation exactly zero by
   * construction, so a run that merged everything would look perfect. Read the
   * matched share against this one.
   */
  conjugateMerged: number
}

/**
 * How well the reconstruction brings each conjugate pair back together.
 *
 * At time `t` the pairs whose crust formed at `t` were, on the evidence of the
 * age grid, the same point. So their separation in the frame at `t` is a
 * residual with a known right answer of zero, and there are thousands of them
 * where the scorecard had four continent pairs.
 *
 * Pairs of other ages are not measured here. Saying anything about where a pair
 * should be at some other time takes a prediction of how fast it separated,
 * which is a second model stacked on the one being tested.
 */
export function conjugateFit(
  pairs: {
    aVerts: Uint32Array
    aWeights: Float32Array
    bVerts: Uint32Array
    bWeights: Float32Array
    ageMa: Float32Array
  },
  timeMa: number,
  pos: Float64Array,
  radiusKm: number,
  contactKm: number,
  survivor: (v: number) => number,
  /**
   * Which pairs count. Left out, all of them do.
   *
   * The solver hands in only the ones it was not told to close. A pair used as
   * a constraint scores whatever the constraint made it score, so counting it
   * would be reading back the instruction rather than testing the answer.
   */
  include?: (i: number) => boolean,
): ConjugateFit {
  const gaps: number[] = []
  let merged = 0
  /** Where a barycentric point has got to, as a unit direction. */
  const place = (verts: Uint32Array, weights: Float32Array, i: number) => {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 3; k++) {
      const v = survivor(verts[i * 3 + k]) * 3
      const w = weights[i * 3 + k]
      x += w * pos[v]; y += w * pos[v + 1]; z += w * pos[v + 2]
    }
    const l = length3(x, y, z) || 1
    return [x / l, y / l, z / l]
  }
  for (let i = 0; i < pairs.ageMa.length; i++) {
    if (pairs.ageMa[i] !== timeMa) continue
    if (include && !include(i)) continue
    // Merged means the mesh has closed every corner of both triangles onto one
    // point: the ocean shut and the two banks became the same crust. The right
    // answer, and an unfalsifiable zero, which is why it is counted apart.
    const first = survivor(pairs.aVerts[i * 3])
    let same = true
    for (let k = 0; k < 3 && same; k++) {
      same = survivor(pairs.aVerts[i * 3 + k]) === first
        && survivor(pairs.bVerts[i * 3 + k]) === first
    }
    if (same) {
      merged++
      gaps.push(0)
      continue
    }
    const a = place(pairs.aVerts, pairs.aWeights, i)
    const b = place(pairs.bVerts, pairs.bWeights, i)
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    gaps.push(Math.acos(dot) * radiusKm)
  }
  if (!gaps.length) {
    return {
      conjugateCount: 0, conjugateMedianKm: 0, conjugateMatched: 0, conjugateMerged: 0,
    }
  }
  gaps.sort((x, y) => x - y)
  return {
    conjugateCount: gaps.length,
    conjugateMedianKm: gaps[gaps.length >> 1],
    conjugateMatched: gaps.filter((g) => g <= contactKm).length / gaps.length,
    conjugateMerged: merged / gaps.length,
  }
}
