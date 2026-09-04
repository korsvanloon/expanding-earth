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
import { ENV } from './knobs.js'
export { conjugateFit, type ConjugateFit } from './conjugates.js'

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
  /**
   * A path with one flank only: the other has gone, under a continent or off
   * the edge of the survey, so nothing on it can be paired and scored. What
   * it still says is which way this crust travelled, and that is a force on
   * the reconstruction and never a check of it. See traceFlowLines.
   */
  oneSided?: boolean
}

export interface OneSidedOptions {
  /** How far a seed has to be from every two-sided path to be worth placing, km. */
  coverKm?: number
  /** How far apart the one-sided seeds are, km. */
  seedSpacingKm?: number
  /** The youngest crust a seed is placed on, Ma. */
  minAgeMa?: number
}

export interface FlowOptions {
  /** How far apart the ridge seeds are, km. */
  seedSpacingKm?: number
  /**
   * How far off the direction the field asks for a step may look for a way
   * round a sharp contrast, degrees. Zero takes the field's direction as it
   * comes.
   *
   * A reader named the error the short paths make: the line suddenly bends
   * towards a sharper contrast between young and old where it should have
   * carried straight on over the gentler gradient. So a step that would walk
   * into a contrast far sharper than the one the path has been climbing looks
   * within this cone for a direction that keeps to the path's own rate, and
   * takes the one that turns least.
   *
   * Preferring the shallowest climb outright was tried first and is worse, not
   * better. Every step then drifts a little towards the shallow side, the
   * drift differs from one path to the next, and the family of lines that
   * should never meet crosses itself all over the South Atlantic. What a
   * reader asked for is not a shallower line, it is the same line without the
   * bend, so this only ever acts where there is a bend to refuse.
   */
  jumpConeDeg?: number
  /**
   * How much steeper than the path's own climb counts as a sharp contrast.
   *
   * Measured against the path itself rather than against a figure in Ma per
   * hundred kilometres, because a fast ridge and a slow one climb at rates
   * that differ by more than this factor, and what the rule is about is the
   * step where a line's own gradient suddenly changes.
   */
  jumpFactor?: number
  /**
   * How far a path may carry straight on over crust the survey never dated,
   * km, before giving up.
   *
   * A reader asked for longer lines. The rule above corrects the direction of
   * a line and does not lengthen it, because what ends most flanks is not a
   * wrong turn: it is a hole. An aseismic ridge, a plateau of thickened crust,
   * a stretch the survey could not date -- the age comes back as nothing, and
   * the walk stopped there even though the same flow line carries on plainly
   * on the other side. This steps over such a hole in the direction the path
   * was already going and picks the line up again where the crust reappears,
   * provided it reappears no younger than the crust the path left. Nothing is
   * recorded inside the hole, so no pair is ever read off crust that was not
   * dated; only the distance travelled counts it.
   */
  bridgeKm?: number
  /**
   * Whether the fitted field may carry a path where the age's own gradient is
   * unreadable, and how sure it has to be to do it.
   *
   * See the walk: this is what makes the lines long, and it is also the change
   * that lets a path run on evidence that is diffused rather than read, so it
   * is a knob and gets measured.
   */
  carryOnField?: boolean
  /**
   * Also trace one-sided paths over the crust no two-sided path reaches.
   *
   * A reader named the places: the Pacific off California, whose ridge went
   * under North America; the Weddell Sea; the sea west of Australia and
   * Indonesia. The crust there travelled like any other and has no conjugate
   * left to pair with, so a path over it is seeded wherever the two-sided ones
   * left a gap, walked to its young end -- the margin, or the edge of the
   * dated crust -- and back out along the field. Its pairs join each point to
   * that young end, pull the reconstruction, and are never scored.
   */
  oneSided?: OneSidedOptions
  /** How sure the field must be to choose the direction out of the ridge. */
  departureConfidence?: number
  /**
   * The grooves themselves, as a direction field, for the ridge departure.
   *
   * Not the fitted field, which is what `field` is. The fit smooths over
   * hundreds of kilometres and washes out exactly the local evidence that
   * settles this: in the equatorial Atlantic the grooves read 84 degrees with
   * half of them within 11, and the fit over the same window reads 30 to 47.
   * Where a groove is near enough to have seen this crust, it is asked first.
   */
  ridgeAxis?: Lineaments
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
  /** The one-sided paths, when asked for, and why the failed seeds failed. */
  oneSided: FlowTrack[]
  oneSidedRejected: Record<string, number>
  /**
   * How many steps were turned aside from a sharp contrast, and how many
   * steps there were.
   *
   * Reported because the rule is meant to be rare: it is a refusal of one
   * particular error, and if it fired everywhere it would be steering the
   * paths rather than correcting them.
   */
  redirected: number
  steps: number
  /** Why the flanks stopped where they did. */
  ends: Record<string, number>
}

export function traceFlowLines(
  age: ArrayLike<number>,
  width: number,
  height: number,
  options: FlowOptions = {},
): FlowResult {
  const seedSpacingKm = options.seedSpacingKm ?? 500
  /**
   * How sure the fitted field has to be before it, rather than the age ring,
   * picks the line a path leaves the ridge on.
   */
  const departureConfidence = options.departureConfidence ?? 0.2
  const ridgeAxis = options.ridgeAxis
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
  const jumpCone = ((options.jumpConeDeg ?? 0) * Math.PI) / 180
  const jumpFactor = options.jumpFactor ?? 2.5
  const bridgeKm = options.bridgeKm ?? 0
  const carryOnField = options.carryOnField ?? true
  let redirected = 0
  let steps = 0
  /** Why each flank stopped, so what to relax next is a measurement. */
  const ends: Record<string, number> = {
    'the crust ahead was never dated': 0,
    'the age stopped rising': 0,
    'no gradient to read': 0,
    'as long as a path may be': 0,
    'bridged a hole and went on': 0,
  }
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

  /**
   * Step over undated crust in the direction the path was going.
   *
   * Straight, because a hole is exactly where there is nothing to steer by:
   * the age has no gradient in it and the fitted field there is whatever its
   * neighbours diffused into it. It resumes only where the crust on the far
   * side is no younger than the crust the path left, so a hole is never used
   * to hop onto a different piece of ocean -- which is the one thing the
   * rising-age rule is there to prevent.
   */
  const bridge = (
    x: number, y: number, z: number,
    tx: number, ty: number, tz: number,
    last: number,
  ) => {
    if (bridgeKm < stepKm) return null
    let walkedKm = 0
    let [ax, ay, az] = [x, y, z]
    while (walkedKm < bridgeKm) {
      const [px, py, pz] = advance(ax, ay, az, tx, ty, tz, stepAngle)
      // Keep the heading tangent as the point moves, or a long bridge slowly
      // leaves the sphere's surface and lands somewhere else entirely.
      const drift = tx * px + ty * py + tz * pz
      let hx = tx - px * drift, hy = ty - py * drift, hz = tz - pz * drift
      const hl = length3(hx, hy, hz) || 1
      hx /= hl; hy /= hl; hz /= hl
      tx = hx; ty = hy; tz = hz
      ax = px; ay = py; az = pz
      walkedKm += stepKm
      const a = field.at(ax, ay, az)
      if (Number.isNaN(a)) continue
      if (a < last - 1) return null
      return { point: [ax, ay, az] as [number, number, number], ageMa: a, walkedKm }
    }
    return null
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
    /**
     * How fast this path has been climbing, Ma per step, smoothed.
     *
     * The reference the rule above compares a step against. Smoothed rather
     * than taken from the last step alone, because the grid is quantised and
     * one step of a slow path can read zero; a quarter weight on each new step
     * follows a real change in rate over a few hundred kilometres and ignores
     * the quantisation.
     */
    let climbPerStep = 0
    const out: FlowPoint[] = []
    while (walked < maxLengthKm) {
      /**
       * The age's own gradient here, which may be unreadable.
       *
       * It is read over four points forty kilometres out, so one undated cell
       * anywhere in that cross makes it nothing -- and a reader asking why the
       * lines are short has the answer here: five hundred and twenty-eight of
       * seven hundred and eighty-five flanks used to end on this, against
       * thirty that ended on undated crust actually in their way. Near a
       * plateau, an aseismic ridge, a coastline, or any of the holes the survey
       * left, the cross catches a hole while the path itself has hundreds of
       * kilometres of perfectly good sea floor in front of it.
       *
       * So it is no longer what decides whether to carry on. The fitted field
       * covers the whole sphere and is the direction; the age ahead -- one
       * sample, not four -- is the check, and the rule that the age must keep
       * rising is what ends a flank. The gradient is still what steers where
       * there is no field, and is still needed by the crest correction.
       */
      const g = gradient(x, y, z)
      const lead = fitted ? flowAt(fitted, x, y, z, [tx, ty, tz]) : null
      if (!g && !(carryOnField && lead && lead.confidence >= departureConfidence)) {
        ends['no gradient to read']++
        break
      }
      // Where the gravity grid shows a clean line running the way the age grid
      // says the crust went, take the line: it is the same event recorded at a
      // tenth of a degree instead of at a grey level, and it does not go flat
      // over a stretch the survey dated all the same. Where the two disagree by
      // more than the guard, the line is not this crust's path -- an abyssal
      // hill fabric, a seamount chain, a ridge segment -- and it is dropped.
      let wx = g ? g.tx : tx, wy = g ? g.ty : ty, wz = g ? g.tz : tz
      // The field is an axis; the end wanted is the one the walk is already
      // going, which at the first step is the direction it left the ridge on.
      if (lead) { wx = lead.tx; wy = lead.ty; wz = lead.tz }
      if (structure && structureWeight > 0) {
        const line = lineamentAt(structure, x, y, z)
        if (line) {
          // An axis has no direction of its own; take the end that agrees with
          // where the crust is already going.
          const sign = line.tx * tx + line.ty * ty + line.tz * tz < 0 ? -1 : 1
          const sx = line.tx * sign, sy = line.ty * sign, sz = line.tz * sign
          // Blended from where the step already points, not from the age
          // gradient, and gated against the same.
          //
          // From the gradient it discarded the fitted field outright: the
          // field had just overridden the gradient two lines up, and then this
          // went back to the gradient and blended forty per cent of the way to
          // the lineament, so wherever a lineament had an opinion -- which
          // along a ridge is nearly everywhere -- the field was not in the
          // answer at all. Every improvement to the grooves, the anchors and
          // the direction out of the ridge landed on a step that then threw
          // the field away, which is why two successive maps came out
          // identical to the degree and a reader had to point it out.
          if (sx * wx + sy * wy + sz * wz >= structureMaxCos) {
            const ramp = Math.min(1, Math.max(0,
              (line.coherence - structureFloor) / Math.max(1e-6, structureFull - structureFloor)))
            const w = structureWeight * ramp
            const bx = wx + (sx - wx) * w
            const by = wy + (sy - wy) * w
            const bz = wz + (sz - wz) * w
            const bl = length3(bx, by, bz)
            if (bl > 1e-9) { wx = bx / bl; wy = by / bl; wz = bz / bl }
          }
        }
      }
      // Having been told which way, refuse to bend into a sharp contrast.
      //
      // The step ahead is probed, and if the age there climbs no faster than
      // this path has been climbing, nothing happens: the field's direction is
      // the answer and the line carries on. If it climbs far faster, the step
      // is about to cross something -- an offset, a front, the edge of another
      // piece of crust -- and a reader watching those bends called them the
      // error. Then a fan either side is probed and the direction that keeps
      // to the path's own rate while turning least is taken instead.
      if (jumpCone > 0 && climbPerStep > 0) {
        const here = field.at(x, y, z)
        const ahead = (dx: number, dy: number, dz: number) => {
          const [px, py, pz] = advance(x, y, z, dx, dy, dz, stepAngle)
          const a = field.at(px, py, pz)
          return Number.isNaN(a) ? null : a - here
        }
        const straightClimb = Number.isNaN(here) ? null : ahead(wx, wy, wz)
        if (straightClimb !== null && straightClimb > jumpFactor * climbPerStep) {
          let cx = wy * z - wz * y
          let cy = wz * x - wx * z
          let cz = wx * y - wy * x
          const cl = length3(cx, cy, cz)
          if (cl > 1e-9) {
            cx /= cl; cy /= cl; cz /= cl
            const fan = 6
            let best: { dx: number; dy: number; dz: number } | null = null
            // Outwards from the middle, so the first candidate that keeps to
            // the rate is also the one that turns least.
            for (let step = 1; step <= fan && !best; step++) {
              for (const side of [-1, 1]) {
                const angle = ((step * side) / fan) * jumpCone
                const cos = Math.cos(angle), sin = Math.sin(angle)
                const dx = wx * cos + cx * sin
                const dy = wy * cos + cy * sin
                const dz = wz * cos + cz * sin
                const climb = ahead(dx, dy, dz)
                if (climb === null || climb <= 0) continue
                if (climb > jumpFactor * climbPerStep) continue
                best = { dx, dy, dz }
                break
              }
            }
            // Nothing round it: the path carries on into the contrast as it
            // did before, and the rule that the age must keep rising decides
            // whether that is the end of it.
            if (best) {
              const bl = length3(best.dx, best.dy, best.dz) || 1
              wx = best.dx / bl; wy = best.dy / bl; wz = best.dz / bl
              redirected++
            }
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
      if (Number.isNaN(a)) {
        // A hole. Carry straight on and see whether the same line resumes.
        const jumped = bridge(x, y, z, tx, ty, tz, last)
        if (!jumped) { ends['the crust ahead was never dated']++; break }
        ends['bridged a hole and went on']++
        px = jumped.point[0]; py = jumped.point[1]; pz = jumped.point[2]
        a = jumped.ageMa
        walked += jumped.walkedKm
      }

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
      // crust from another ridge entirely. A hole in the survey is not that,
      // which is why it is bridged above rather than counted here.
      if (a < last - 1) { ends['the age stopped rising']++; break }
      x = px; y = py; z = pz
      walked += stepKm
      steps++
      const climbed = Math.max(0, a - last)
      climbPerStep = climbPerStep > 0 ? climbPerStep * 0.75 + climbed * 0.25 : climbed
      last = Math.max(last, a)
      out.push({ x, y, z, ageMa: a, fromRidgeKm: walked })
      // Keep the step direction tangent to the sphere at the new point.
      const drift = tx * x + ty * y + tz * z
      tx -= x * drift; ty -= y * drift; tz -= z * drift
      const l = length3(tx, ty, tz) || 1
      tx /= l; ty /= l; tz /= l
    }
    if (walked >= maxLengthKm) ends['as long as a path may be']++
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
    /**
     * The line to leave on, from the grooves if one is near, else from the fit.
     *
     * Neither is the age ring below, which is what this used to be and which
     * asks the age grid which way the crust gets older. On a ridge axis that is
     * the one question the age grid cannot answer: the age is at a *minimum*
     * there, so what is left of the gradient is noise, and over a staircase of
     * ridge segments offset by transforms the oldest direction on a ring is the
     * staircase's diagonal. Measured in the equatorial Atlantic, paths left on
     * bearings of 31, 31, 37, 4, 31, 29, 28, 9 and 31 degrees where the answer
     * is about 90, so paths leaving Brazil went north-east instead of east.
     *
     * A groove *is* the evidence; the fit is a smoothing of it over a region
     * far wider than the evidence reaches, and a reader watching two maps come
     * out identical is how that got found. Asking the grooves first is not a
     * refinement of the fit, it is preferring a reading to an average of
     * readings and absences.
     *
     * The ring still decides *which end* of the line is the older way, because
     * a line has no direction, and the age grid -- useless about the axis here
     * -- is perfectly good about which side is older a few hundred kilometres
     * out.
     */
    const leaveOn = (() => {
      if (ridgeAxis) {
        const near = lineamentAt(ridgeAxis, axis[0], axis[1], axis[2])
        if (near && near.coherence > 0) return { tx: near.tx, ty: near.ty, tz: near.tz }
      }
      if (!fitted) return null
      const line = flowAt(fitted, axis[0], axis[1], axis[2], [1, 0, 0])
      return line && line.confidence >= departureConfidence ? line : null
    })()
    /**
     * What each candidate says, when asked for.
     *
     * Four attempts at this one step moved the equatorial Atlantic's departure
     * bearing from 31 degrees to 36, on a target of 90, each attempt reasoned
     * from a plausible story about which input was at fault. None of them was
     * measured first. TRACE_DEPARTURE=1 prints every candidate at every seed
     * so the question is settled by reading rather than by another twelve
     * minutes and another story.
     */
    if (ENV.TRACE_DEPARTURE) {
      const lat = Math.asin(Math.max(-1, Math.min(1, axis[1]))) * (180 / Math.PI)
      const lon = Math.atan2(-axis[2], axis[0]) * (180 / Math.PI)
      const bearingOf = (t: { tx: number; ty: number; tz: number } | null) => {
        if (!t) return '  --'
        // North and east at the seed, then the angle between.
        const nl = Math.hypot(-axis[1] * axis[0], 1 - axis[1] * axis[1], -axis[1] * axis[2]) || 1
        const nx = (-axis[1] * axis[0]) / nl
        const ny = (1 - axis[1] * axis[1]) / nl
        const nz = (-axis[1] * axis[2]) / nl
        const ex = ny * axis[2] - nz * axis[1]
        const ey = nz * axis[0] - nx * axis[2]
        const ez = nx * axis[1] - ny * axis[0]
        const north = t.tx * nx + t.ty * ny + t.tz * nz
        const east = t.tx * ex + t.ty * ey + t.tz * ez
        return `${((((Math.atan2(east, north) * 180) / Math.PI) % 180 + 180) % 180).toFixed(0).padStart(4)}`
      }
      const ring = (() => {
        const { ax, ay, az, bx, by, bz } = basis(axis[0], axis[1], axis[2])
        let best: { tx: number; ty: number; tz: number; ageMa: number } | null = null
        for (let i = 0; i < 16; i++) {
          const angle = (2 * Math.PI * i) / 16
          const tx = ax * Math.cos(angle) + bx * Math.sin(angle)
          const ty = ay * Math.cos(angle) + by * Math.sin(angle)
          const tz = az * Math.cos(angle) + bz * Math.sin(angle)
          const [px, py, pz] = advance(axis[0], axis[1], axis[2], tx, ty, tz, departureKm / r)
          const a = field.at(px, py, pz)
          if (!Number.isNaN(a) && (!best || a > best.ageMa)) best = { tx, ty, tz, ageMa: a }
        }
        return best
      })()
      const fit = fitted ? flowAt(fitted, axis[0], axis[1], axis[2], [1, 0, 0]) : null
      const groove = ridgeAxis ? lineamentAt(ridgeAxis, axis[0], axis[1], axis[2]) : null
      console.log(
        `  [departure] ${lon.toFixed(1).padStart(7)},${lat.toFixed(1).padStart(6)}  `
          + `age ring ${bearingOf(ring)}   fitted field ${bearingOf(fit)}`
          + ` (confidence ${fit ? fit.confidence.toFixed(2) : '--'})   `
          + `groove ${bearingOf(groove)}   used ${bearingOf(leaveOn)}`,
      )
    }
    if (leaveOn) {
      const line = leaveOn
      {
        const look = departureKm / r
        const ageAlong = (sign: number) => {
          const [px, py, pz] = advance(
            axis[0], axis[1], axis[2], line.tx * sign, line.ty * sign, line.tz * sign, look,
          )
          return field.at(px, py, pz)
        }
        const plus = ageAlong(1)
        const minus = ageAlong(-1)
        if (!Number.isNaN(plus) || !Number.isNaN(minus)) {
          const sign = (Number.isNaN(minus) || (!Number.isNaN(plus) && plus >= minus)) ? 1 : -1
          const older = sign > 0 ? plus : minus
          return {
            first: { tx: line.tx * sign, ty: line.ty * sign, tz: line.tz * sign, ageMa: older },
            second: {
              tx: -line.tx * sign, ty: -line.ty * sign, tz: -line.tz * sign, ageMa: older,
            },
          }
        }
      }
    }
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

  // --- one-sided paths over the crust the two-sided ones never reach --------
  const oneSided: FlowTrack[] = []
  const oneSidedRejected: Record<string, number> = {
    'no way to the young end': 0,
    'reaches a ridge another path serves': 0,
    'a flank went nowhere': 0,
    'nothing 10 Ma older than its young end': 0,
    'a flank doubled back': 0,
  }
  if (options.oneSided) {
    const coverKm = options.oneSided.coverKm ?? 500
    const seedKm = options.oneSided.seedSpacingKm ?? 500
    const minAgeMa = options.oneSided.minAgeMa ?? 10

    // Every point of every two-sided path, in buckets a cover wide, so asking
    // whether a place is already served looks at its neighbourhood only.
    const size = coverKm / r
    const bucket = new Map<string, [number, number, number][]>()
    const keyOf = (x: number, y: number, z: number) =>
      `${Math.round(x / size)},${Math.round(y / size)},${Math.round(z / size)}`
    for (const track of tracks) {
      for (const p of track.points) {
        const key = keyOf(p.x, p.y, p.z)
        const there = bucket.get(key)
        if (there) there.push([p.x, p.y, p.z])
        else bucket.set(key, [[p.x, p.y, p.z]])
      }
    }
    const coverCos = Math.cos(coverKm / r)
    const served = (p: [number, number, number]) => {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const there = bucket.get(keyOf(p[0] + dx * size, p[1] + dy * size, p[2] + dz * size))
            if (!there) continue
            for (const [x, y, z] of there) if (x * p[0] + y * p[1] + z * p[2] > coverCos) return true
          }
        }
      }
      return false
    }

    // Seeds: dated crust old enough to have travelled, unserved, and no two
    // within a spacing of each other. Scanned at a quarter of the spacing so
    // the thinning, not the scan, decides where they land.
    const scan = Math.max(1, Math.round((seedKm / 4) / ((2 * Math.PI * r) / width)))
    const seedCos = Math.cos(seedKm / r)
    const oneSeeds: [number, number, number][] = []
    for (let row = 0; row < height; row += scan) {
      for (let col = 0; col < width; col += scan) {
        const a = age[row * width + col]
        if (Number.isNaN(a) || a < minAgeMa) continue
        const lon = ((col + 0.5) / width - 0.5) * 2 * Math.PI
        const lat = (0.5 - (row + 0.5) / height) * Math.PI
        const c = Math.cos(lat)
        const p: [number, number, number] = [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
        if (served(p)) continue
        let near = false
        for (const q of oneSeeds) {
          if (q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > seedCos) { near = true; break }
        }
        if (!near) oneSeeds.push(p)
      }
    }

    /**
     * Walk a seed down the ages to where its crust is youngest: the margin
     * the ridge went under, the edge of the dated crust, or a ridge.
     *
     * Along the field where there is one, taking the end of the axis the age
     * falls along; down the gradient where there is not. Stops where the age
     * stops falling or the crust stops being dated.
     */
    const toYoungEnd = (seed: [number, number, number]) => {
      let [x, y, z] = seed
      let last = field.at(x, y, z)
      let heading: [number, number, number] | null = null
      for (let walked = 0; walked < maxLengthKm; walked += stepKm) {
        const g = gradient(x, y, z)
        if (!g) break
        let dx = -g.tx, dy = -g.ty, dz = -g.tz
        if (fitted) {
          const flow = flowAt(fitted, x, y, z, heading ?? [dx, dy, dz])
          if (flow) { dx = flow.tx; dy = flow.ty; dz = flow.tz }
        }
        const [px, py, pz] = advance(x, y, z, dx, dy, dz, stepAngle)
        const a = field.at(px, py, pz)
        if (Number.isNaN(a) || a > last + 1) break
        x = px; y = py; z = pz
        last = Math.min(last, a)
        const drift = dx * x + dy * y + dz * z
        dx -= x * drift; dy -= y * drift; dz -= z * drift
        const l = length3(dx, dy, dz) || 1
        heading = [dx / l, dy / l, dz / l]
      }
      return { point: [x, y, z] as [number, number, number], ageMa: last, heading }
    }

    for (const raw of oneSeeds) {
      const young = toYoungEnd(raw)
      // Back out the way it came, or, for a seed already at its young end,
      // up the gradient.
      let out: [number, number, number] | null = young.heading
        ? [-young.heading[0], -young.heading[1], -young.heading[2]]
        : null
      if (!out) {
        const g = gradient(young.point[0], young.point[1], young.point[2])
        if (g) {
          out = [g.tx, g.ty, g.tz]
          if (fitted) {
            const flow = flowAt(fitted, young.point[0], young.point[1], young.point[2], out)
            if (flow) out = [flow.tx, flow.ty, flow.tz]
          }
        }
      }
      if (!out) { oneSidedRejected['no way to the young end']++; continue }
      // A young end on a ridge that a two-sided path already leaves from is
      // that path's crust, reached from the far side of a gap in its flank.
      if (young.ageMa <= ridgeAgeMa + 2) {
        let served = false
        for (const a of axes) {
          if (a[0] * young.point[0] + a[1] * young.point[1] + a[2] * young.point[2] > seedCos) {
            served = true
            break
          }
        }
        if (served) { oneSidedRejected['reaches a ridge another path serves']++; continue }
      }
      const walk = flank(young.point, out[0], out[1], out[2], young.ageMa)
      if (walk.length < 3) { oneSidedRejected['a flank went nowhere']++; continue }
      if (walk[walk.length - 1].ageMa < young.ageMa + 10) {
        oneSidedRejected['nothing 10 Ma older than its young end']++
        continue
      }
      if (!straight(young.point, walk)) { oneSidedRejected['a flank doubled back']++; continue }
      oneSided.push({
        points: [
          { x: young.point[0], y: young.point[1], z: young.point[2], ageMa: young.ageMa, fromRidgeKm: 0 },
          ...walk,
        ],
        ridge: 0,
        oneSided: true,
      })
    }
  }
  return {
    tracks, seeds: seeds.length, rejected, oneSided, oneSidedRejected, redirected, steps, ends,
  }
}

/**
 * The pairs a one-sided path offers: each point of an asked-for age joined to
 * the path's young end, where the crust between them has gone by that time.
 *
 * At its own age a point was at the ridge, and everything younger than it on
 * this path had not yet formed -- so it sat where the young end is, or where
 * what is left of the young end will be once the crust under it has been
 * taken away. That is the pull: the old crust closes on the margin along the
 * path. There is no partner on the other side to check it against, so every
 * one of these pulls and none of them scores; `pairPulls` in shared/tracks.ts
 * reads the kind.
 */
export function marginPairs(
  tracks: FlowTrack[],
  ages: number[],
  snap: (x: number, y: number, z: number) => MeshPoint | null,
  tolerance = 4,
  /** Where these tracks start in the numbering the pairs refer to. */
  trackOffset = 0,
): ConjugateResult {
  const pairs: Conjugate[] = []
  const rejected: Record<string, number> = {
    'no crust of that age on the flank': 0,
    'both halves are the same mesh point': 0,
  }
  for (const [index, track] of tracks.entries()) {
    const young = track.points[track.ridge]
    const flank = track.points.slice(track.ridge + 1)
    const a = snap(young.x, young.y, young.z)
    if (!a) continue
    for (const age of ages) {
      if (age < young.ageMa + tolerance) continue
      let best: FlowPoint | null = null
      for (const p of flank) {
        if (!best || Math.abs(p.ageMa - age) < Math.abs(best.ageMa - age)) best = p
      }
      if (!best || Math.abs(best.ageMa - age) > tolerance) {
        rejected['no crust of that age on the flank']++
        continue
      }
      const b = snap(best.x, best.y, best.z)
      if (!b || a.v.every((v, i) => v === b.v[i])) {
        rejected['both halves are the same mesh point']++
        continue
      }
      pairs.push({
        a, b, ageMa: age, fromRidgeAKm: 0, fromRidgeBKm: best.fromRidgeKm,
        track: trackOffset + index,
      })
    }
  }
  return { pairs, rejected }
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
  /**
   * The most pairs one path may contribute. Zero for no limit.
   *
   * This is the cross-age control, and it has to be a limit per path rather
   * than a spacing, because that is the shape of the imbalance. Pairs are
   * taken wherever both flanks of a path survive: an Atlantic path, whose two
   * flanks both reach back to 180 Ma, offers 36 of them, and the same path in
   * the Pacific offers seven. Spacing them against each other across ages
   * evens the oceans and destroys the deep coverage, because a 120 Ma pair
   * then loses to a 20 Ma one in the same water. Limiting the count per path
   * costs the ocean that has too many and nothing at all to the ocean that has
   * few, which is exactly where the correction belongs.
   *
   * The ages kept come from one ladder shared by every path, not from each
   * path's own range, and that distinction cost a run to find. Spread over its
   * own range, each path picks a different eight, so at any one frame age only
   * a fraction of the paths have anything to say -- the total was fine at
   * 1,025 pairs and the score at 120 Ma was three, because the score is read
   * frame by frame. On a shared ladder every path that can speak at an age
   * does, and each frame is populated.
   */
  perPath = 0,
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

  /**
   * Which ages each path is allowed to offer, before any of them compete.
   *
   * Worked out per path and in advance, because a limit applied as the ages go
   * by would be spent on whichever ages came first however they were ordered.
   */
  /**
   * The ladder: `perPath` ages spread over every age there is, once, for all.
   *
   * Wider apart at the old end, because that is where the crust travels
   * further per million years of the record and where the pairs are scarce
   * enough that two adjacent frames say almost the same thing.
   */
  const ladder = perPath
    ? new Set(
      Array.from({ length: perPath }, (_, k) => {
        const t = k / Math.max(1, perPath - 1)
        const want = Math.min(...ages) + (Math.max(...ages) - Math.min(...ages)) * (t ** 1.6)
        return ages.reduce((p, q) => (Math.abs(q - want) < Math.abs(p - want) ? q : p), ages[0])
      }),
    )
    : null
  const allowed = tracks.map(() => ladder)

  for (const age of [...ages].sort((p, q) => q - p)) {
    for (const [index] of tracks.entries()) {
      if (allowed[index] && !allowed[index]!.has(age)) continue
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

