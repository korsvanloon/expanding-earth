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
 * The age field as a function of direction, plus its tangential gradient.
 *
 * `age` is an equirectangular grid in Ma with NaN where the grid does not date
 * the crust. Anything touching a NaN returns null rather than a number made up
 * from its neighbours: a path that walks into undated crust has to stop, not
 * carry on over a guess.
 */
function ageField(age: Float64Array, width: number, height: number) {
  const at = (x: number, y: number, z: number) => {
    const l = length3(x, y, z) || 1
    const u = Math.atan2(-z / l, x / l) / (2 * Math.PI) + 0.5
    const v = Math.acos(Math.min(1, Math.max(-1, y / l))) / Math.PI
    const col = Math.min(width - 1, Math.max(0, Math.floor(u * width) % width))
    const row = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
    return age[row * width + col]
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
  age: Float64Array,
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
  const field = ageField(age, width, height)
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
      // Uphill, but not free to turn wherever the local gradient points. A
      // fracture zone is a path the crust actually took, so it bends slowly;
      // letting each step choose its own direction lets a path turn along an
      // isochron and walk the length of the ridge instead of away from it.
      const dot = Math.min(1, Math.max(-1, g.tx * tx + g.ty * ty + g.tz * tz))
      const turn = Math.acos(dot)
      if (turn > maxTurn) {
        const blend = maxTurn / turn
        const nx = tx + (g.tx - tx) * blend
        const ny = ty + (g.ty - ty) * blend
        const nz = tz + (g.tz - tz) * blend
        const l = length3(nx, ny, nz) || 1
        tx = nx / l; ty = ny / l; tz = nz / l
      } else {
        tx = g.tx; ty = g.ty; tz = g.tz
      }
      const [px, py, pz] = advance(x, y, z, tx, ty, tz, stepAngle)
      const a = field.at(px, py, pz)
      if (Number.isNaN(a)) break
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

export interface Conjugate {
  /** The two pieces of crust, as indices into whatever `snap` was given. */
  a: number
  b: number
  /** When they were the same point, Ma. */
  ageMa: number
  /** How far each has travelled from the ridge since, km. */
  fromRidgeAKm: number
  fromRidgeBKm: number
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
  snap: (x: number, y: number, z: number) => number,
  tolerance = 4,
): ConjugateResult {
  const pairs: Conjugate[] = []
  const rejected: Record<string, number> = {
    'no crust of that age on one flank': 0,
    'both halves are the same mesh point': 0,
    'not as far apart as the paths are long': 0,
  }
  for (const track of tracks) {
    const left = track.points.slice(0, track.ridge).reverse()
    const right = track.points.slice(track.ridge + 1)
    for (const age of ages) {
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
      if (a < 0 || b < 0 || a === b) {
        rejected['both halves are the same mesh point']++
        continue
      }
      pairs.push({
        a, b, ageMa: age, fromRidgeAKm: pa.fromRidgeKm, fromRidgeBKm: pb.fromRidgeKm,
      })
    }
  }
  return { pairs, rejected }
}

/**
 * Smooth the age field, leaving the undated crust undated.
 *
 * The grid is one Ma per grey level and the paths are read from its gradient,
 * so a single mis-shaded pixel is a step of a million years and turns a path a
 * few degrees. Averaging over the neighbours it has -- never over a nodata
 * sentinel, which would smear undated crust into dated -- costs nothing and
 * settles the walks down.
 */
export function smoothAges(age: Float64Array, width: number, height: number, passes: number) {
  let a = Float64Array.from(age)
  let b = new Float64Array(age.length)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (Number.isNaN(a[i])) { b[i] = NaN; continue }
        let sum = 0
        let seen = 0
        for (let dy = -1; dy <= 1; dy++) {
          const row = Math.min(height - 1, Math.max(0, y + dy))
          for (let dx = -1; dx <= 1; dx++) {
            const v = a[row * width + (((x + dx) % width) + width) % width]
            if (!Number.isNaN(v)) { sum += v; seen++ }
          }
        }
        b[i] = seen ? sum / seen : NaN
      }
    }
    const swap = a
    a = b
    b = swap
  }
  return a
}

/**
 * Nearest mesh vertex to a direction, without asking all forty thousand.
 *
 * Buckets by longitude and latitude and searches the cell plus its neighbours.
 * A lat/lon bucket is a poor shape near the poles -- cells there are slivers --
 * so the ring widens with latitude, which is the same correction the coverage
 * measure needed for the same reason.
 */
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
  pairA: Uint32Array,
  pairB: Uint32Array,
  pairAgeMa: Float32Array,
  timeMa: number,
  pos: Float64Array,
  radiusKm: number,
  contactKm: number,
  survivor: (v: number) => number,
): ConjugateFit {
  const gaps: number[] = []
  let merged = 0
  for (let i = 0; i < pairA.length; i++) {
    if (pairAgeMa[i] !== timeMa) continue
    const a = survivor(pairA[i])
    const b = survivor(pairB[i])
    if (a === b) {
      merged++
      gaps.push(0)
      continue
    }
    const ai = a * 3, bi = b * 3
    const la = length3(pos[ai], pos[ai + 1], pos[ai + 2]) || 1
    const lb = length3(pos[bi], pos[bi + 1], pos[bi + 2]) || 1
    const dot = Math.min(1, Math.max(-1,
      (pos[ai] * pos[bi] + pos[ai + 1] * pos[bi + 1] + pos[ai + 2] * pos[bi + 2]) / (la * lb)))
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
