/**
 * The concept globes (shared/concepts.ts), cut, measured and drawn.
 *
 *     pnpm exec tsx tools/build-data.ts      # once, for the radius curve
 *     pnpm exec tsx tools/build-concepts.ts  # writes .stage/concepts/
 *
 * Writes the piece raster the viewer reads, a JSON of every piece and moment,
 * one preview sheet per moment, and -- when the page template is there -- the
 * page itself with everything inlined, so it can be opened or published as one
 * file. Prints, per moment, how much of the smaller sphere the pieces cover once,
 * twice, or not at all, against how much the age grid says should still be
 * ocean: with every piece keeping its area those two can only differ by the
 * overlap, so the overlap is the number that says whether a layout fits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { CONCEPT_JOINS, CONCEPT_MOMENTS, CONCEPT_PIECES, type Placement } from '../shared/concepts.js'
import { R0_KM } from '../shared/model.js'
import { loadAgeGrid } from './lib/agegrid.js'
import { areaQuantile, downsample, downsampleField, loadRaster, type Raster } from './lib/raster.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, '.stage/concepts')
const TEXTURES = resolve(ROOT, 'public/textures')

/** The grid the model classifies its crust on (CONFIG in build-data.ts). */
const W = 2048
const H = 1024
const CONTINENTAL_FRACTION = 0.41
const LAND_FRACTION = 0.292

type V3 = [number, number, number]

const DEG = Math.PI / 180

function direction(lonDeg: number, latDeg: number): V3 {
  const lon = lonDeg * DEG
  const lat = latDeg * DEG
  const c = Math.cos(lat)
  return [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
}

function lonLat(d: V3): [number, number] {
  return [Math.atan2(-d[2], d[0]) / DEG, Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG]
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
]
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** East, north and up at a point. At a pole, east is taken along longitude zero. */
function frame(up: V3): { east: V3; north: V3; up: V3 } {
  let east = cross([0, 1, 0], up)
  if (Math.hypot(...east) < 1e-9) east = [0, 0, -1]
  east = unit(east)
  return { east, north: cross(up, east), up }
}

/** Point at a distance (radians) and bearing (clockwise from north) from a frame's centre. */
function from(f: ReturnType<typeof frame>, distance: number, bearing: number): V3 {
  const s = Math.sin(distance)
  const n = Math.cos(bearing) * s
  const e = Math.sin(bearing) * s
  const u = Math.cos(distance)
  return [
    f.up[0] * u + f.north[0] * n + f.east[0] * e,
    f.up[1] * u + f.north[1] * n + f.east[1] * e,
    f.up[2] * u + f.north[2] * n + f.east[2] * e,
  ]
}

function insideOutline(lon: number, lat: number, outline: [number, number][]): boolean {
  for (const shift of [0, 360, -360]) {
    const x = lon + shift
    let inside = false
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [xi, yi] = outline[i]
      const [xj, yj] = outline[j]
      if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
    if (inside) return true
  }
  return false
}

const cellLon = (x: number) => ((x + 0.5) / W) * 360 - 180
const cellLat = (y: number) => 90 - ((y + 0.5) / H) * 180

async function main() {
  mkdirSync(OUT, { recursive: true })

  const age = downsampleField(await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc')), W, H)
  const height = downsample(loadRaster(resolve(TEXTURES, 'height-map.jpg')), W, H, -1)
  const shelfBreak = areaQuantile(height, CONTINENTAL_FRACTION)
  const seaLevel = areaQuantile(height, LAND_FRACTION)

  // The model's own split: undated and above the shelf break is permanent crust.
  const continental = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    continental[i] = Number.isNaN(age.data[i]) && height.data[i] >= shelfBreak ? 1 : 0
  }

  // Which piece each continental cell belongs to: the first outline that holds it.
  const piece = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!continental[i]) continue
      for (let p = 0; p < CONCEPT_PIECES.length; p++) {
        if (insideOutline(cellLon(x), cellLat(y), CONCEPT_PIECES[p].outline)) {
          piece[i] = p + 1
          break
        }
      }
    }
  }

  const rowWeight = (y: number) => age.rowWeight(y)
  let sphere = 0
  for (let y = 0; y < H; y++) sphere += rowWeight(y) * W

  // What no outline claimed, as connected patches, so it can be named or let go.
  reportLeftovers(continental, piece, rowWeight, sphere)

  // Each piece's area and centre, and how far out its furthest cell lies.
  const pieces = CONCEPT_PIECES.map((p, index) => {
    let area = 0
    const sum: V3 = [0, 0, 0]
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (piece[y * W + x] !== index + 1) continue
        const w = rowWeight(y)
        const d = direction(cellLon(x), cellLat(y))
        area += w
        sum[0] += d[0] * w
        sum[1] += d[1] * w
        sum[2] += d[2] * w
      }
    }
    const centre = unit(sum)
    let reach = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (piece[y * W + x] !== index + 1) continue
        reach = Math.max(reach, Math.acos(Math.min(1, dot(centre, direction(cellLon(x), cellLat(y))))))
      }
    }
    const [lon, lat] = lonLat(centre)
    return { id: p.id, name: p.name, lon, lat, share: area / sphere, reach: reach + 0.01 }
  })

  // The budget is all of the continental crust, cut or not; what no piece holds
  // is left out of the picture and reads as a little more ocean than there is.
  let continentShare = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (continental[y * W + x]) continentShare += rowWeight(y) / sphere
  }
  const heldShare = pieces.reduce((s, p) => s + p.share, 0)
  console.log(
    `[concepts] ${pieces.length} pieces holding ${(100 * heldShare).toFixed(1)}% of today's sphere, ` +
      `of ${(100 * continentShare).toFixed(1)}% continental`,
  )
  for (const p of pieces) {
    console.log(
      `  ${p.id.padEnd(15)} ${(p.share * 100).toFixed(2).padStart(5)}%  centre ${p.lat.toFixed(1)}, ` +
        `${p.lon.toFixed(1)}  reach ${(p.reach / DEG).toFixed(0)} deg`,
    )
  }

  // Sea floor still there at each moment, by the model's nearest-age rule.
  const oceanAge = nearestAgeOcean(age, height, shelfBreak)
  const radius = radiusCurve()
  const moments = CONCEPT_MOMENTS.map((m) => {
    let ocean = 0
    for (let y = 0; y < H; y++) {
      const w = rowWeight(y)
      for (let x = 0; x < W; x++) {
        const a = oceanAge[y * W + x]
        if (a >= 0 && a > m.ma) ocean += w
      }
    }
    const oceanShare = ocean / sphere
    const radiusKm = radius(m.ma)
    const sphereShare = (radiusKm / R0_KM) ** 2
    // What the margins gave back by now: the continental area the radius
    // leaves room for, against the continental area today.
    const shrink = m.ma === 0 ? 1 : Math.min(1, (sphereShare - oceanShare) / continentShare)
    return {
      ma: m.ma,
      note: m.note,
      radiusKm,
      shrink,
      /** Planar-radius factor of the area-keeping map: R0/R times the linear shrink. */
      k: (R0_KM / radiusKm) * Math.sqrt(shrink),
      oceanLeft: oceanShare / sphereShare,
      place: Object.fromEntries(
        pieces.map((p) => [p.id, m.place[p.id] ?? { lat: p.lat, lon: p.lon, spin: 0 }]),
      ) as Record<string, Placement>,
    }
  })

  // Where each join's two points land on the continental crust.
  const joins = snapJoins(piece)
  // Each moment starts from the one before it, so the layout grows out of
  // today's rather than being found afresh each time.
  let previous: Record<string, Placement> | null = null
  for (const m of moments) {
    if (previous) m.place = Object.fromEntries(pieces.map((p) => [p.id, { ...previous![p.id] }]))
    if (m.ma > 0) settle(m, pieces, piece, joins, oceanAge)
    previous = m.place
  }

  const marble = loadMarble()
  const land = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) land[i] = height.data[i] >= seaLevel ? 1 : 0

  for (const m of moments) {
    drawSheet(m, pieces, piece, land, marble)
    const stats = measure(m, pieces, piece)
    Object.assign(m, { stats })
    console.log(
      `[concepts] ${String(m.ma).padStart(3)} Ma  R ${m.radiusKm.toFixed(0)} km  shrink ${(100 * (1 - m.shrink)).toFixed(1)}%  ` +
        `ocean should be ${(100 * m.oceanLeft).toFixed(1)}%  is ${(100 * stats.gap).toFixed(1)}%  ` +
        `overlap ${(100 * stats.overlap).toFixed(1)}%`,
    )
  }

  writeFileSync(
    resolve(OUT, 'concepts.json'),
    JSON.stringify({
      r0Km: R0_KM, width: W, height: H, pieces, moments,
      joins: joins.map((j) => ({ a: j.a, b: j.b, why: j.why, pieceA: pieces[j.pieceA].id, pieceB: pieces[j.pieceB].id, gapKm: j.gapKm })),
    }, null, 1),
  )
  const png = new PNG({ width: W, height: H })
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = piece[i]
    png.data[i * 4 + 1] = land[i] ? 255 : 0
    png.data[i * 4 + 2] = 0
    png.data[i * 4 + 3] = 255
  }
  writeFileSync(resolve(OUT, 'pieces.png'), PNG.sync.write(png))
  writeFileSync(
    resolve(OUT, 'marble.jpg'),
    jpeg.encode({ width: W, height: H, data: Buffer.from(marble) }, 82).data,
  )
  const template = resolve(ROOT, 'tools/concepts-page.html')
  if (existsSync(template)) {
    const dataUri = (file: string, type: string) =>
      `data:${type};base64,${readFileSync(resolve(OUT, file)).toString('base64')}`
    const page = readFileSync(template, 'utf8')
      .replace('/*CONCEPTS*/null', readFileSync(resolve(OUT, 'concepts.json'), 'utf8'))
      .replace('__PIECES__', dataUri('pieces.png', 'image/png'))
      .replace('__MARBLE__', dataUri('marble.jpg', 'image/jpeg'))
    writeFileSync(resolve(OUT, 'index.html'), page)
  }
  console.log(`[concepts] wrote ${OUT}`)
}

function reportLeftovers(
  continental: Uint8Array, piece: Uint8Array, rowWeight: (y: number) => number, sphere: number,
) {
  const seen = new Uint8Array(W * H)
  const patches: { share: number; lon: number; lat: number }[] = []
  for (let start = 0; start < W * H; start++) {
    if (!continental[start] || piece[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let share = 0
    let lon = 0
    let lat = 0
    let n = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % W
      const y = (i / W) | 0
      share += rowWeight(y) / sphere
      lon += cellLon(x)
      lat += cellLat(y)
      n++
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy
        if (ny < 0 || ny >= H) continue
        const j = ny * W + ((x + dx + W) % W)
        if (continental[j] && !piece[j] && !seen[j]) {
          seen[j] = 1
          stack.push(j)
        }
      }
    }
    patches.push({ share, lon: lon / n, lat: lat / n })
  }
  patches.sort((a, b) => b.share - a.share)
  const total = patches.reduce((s, p) => s + p.share, 0)
  console.log(
    `[concepts] ${patches.length} patches of continental crust in no piece, ` +
      `${(100 * total).toFixed(2)}% of the sphere; the largest:`,
  )
  for (const p of patches.slice(0, 12)) {
    console.log(`  ${(100 * p.share).toFixed(3)}%  near ${p.lat.toFixed(1)}, ${p.lon.toFixed(1)}`)
  }
}

/**
 * The age of every oceanic cell, -1 on continental crust, by the rule the model
 * ships: undated deep water takes the age of the nearest dated sea floor
 * (`classify` and `fillFromNearestDated` in tools/build-data.ts).
 */
function nearestAgeOcean(age: Raster, height: Raster, shelfBreak: number): Float32Array {
  const out = new Float32Array(W * H).fill(-1)
  const holes: number[] = []
  for (let i = 0; i < W * H; i++) {
    const a = age.data[i]
    if (!Number.isNaN(a)) out[i] = a
    else if (height.data[i] < shelfBreak) {
      out[i] = -2
      holes.push(i)
    }
  }
  const queue: number[] = []
  const around = (i: number) => {
    const x = i % W
    const y = (i / W) | 0
    const n: number[] = [y * W + ((x + 1) % W), y * W + ((x + W - 1) % W)]
    if (y > 0) n.push(i - W)
    if (y < H - 1) n.push(i + W)
    return n
  }
  for (const i of holes) if (around(i).some((j) => out[j] >= 0)) queue.push(i)
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    if (out[i] !== -2) continue
    let sum = 0
    let count = 0
    for (const j of around(i)) {
      if (out[j] >= 0) {
        sum += out[j]
        count++
      } else if (out[j] === -2) queue.push(j)
    }
    out[i] = count ? sum / count : 0
  }
  for (const i of holes) if (out[i] === -2) out[i] = 0
  return out
}

/** The shipped radius curve, from whichever build of the data is on disk. */
function radiusCurve(): (ma: number) => number {
  const file = [resolve(ROOT, 'public/data/meta.json'), resolve(ROOT, '.stage/meta.partial.json')]
    .find((f) => existsSync(f))
  if (!file) throw new Error('no meta.json: run `pnpm exec tsx tools/build-data.ts` first')
  const meta = JSON.parse(readFileSync(file, 'utf8')) as {
    radiusStepMa: number
    solvedModel: string
    crustModels: { id: string; radiusKm: number[] }[]
  }
  const curve = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  return (ma) => curve[Math.min(curve.length - 1, Math.round(ma / meta.radiusStepMa))]
}

function loadMarble(): Uint8Array {
  const src = jpeg.decode(readFileSync(resolve(TEXTURES, 'blue-marble-map.jpg')), {
    useTArray: true,
    maxMemoryUsageInMB: 1024,
  })
  const out = new Uint8Array(W * H * 4)
  const sx = src.width / W
  const sy = src.height / H
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = [0, 0, 0]
      let n = 0
      for (let j = Math.floor(y * sy); j < Math.floor((y + 1) * sy); j++) {
        for (let i = Math.floor(x * sx); i < Math.floor((x + 1) * sx); i++) {
          const k = (j * src.width + i) * 4
          r[0] += src.data[k]
          r[1] += src.data[k + 1]
          r[2] += src.data[k + 2]
          n++
        }
      }
      const o = (y * W + x) * 4
      out[o] = r[0] / n
      out[o + 1] = r[1] / n
      out[o + 2] = r[2] / n
      out[o + 3] = 255
    }
  }
  return out
}

interface PieceInfo { id: string; lon: number; lat: number; reach: number }
interface MomentInfo { ma: number; k: number; place: Record<string, Placement> }

/**
 * Everything needed to ask "which piece is here" on the smaller sphere: for
 * each piece, its frame today and its frame where it has been put, the spin
 * folded in, and how far out on the new sphere it can reach.
 */
function placed(m: MomentInfo, pieces: PieceInfo[]) {
  return pieces.map((p) => {
    const at = m.place[p.id]
    const home = frame(direction(p.lon, p.lat))
    const there = frame(direction(at.lon, at.lat))
    const spin = (at.spin ?? 0) * DEG
    const reach = 2 * Math.asin(Math.min(1, m.k * Math.sin(p.reach / 2)))
    return { home, there, spin, cosReach: Math.cos(reach) }
  })
}

/** The cell of today's map that a point on the smaller sphere shows, for one piece. */
function lookBack(d: V3, q: ReturnType<typeof placed>[number], k: number): V3 {
  const u = dot(d, q.there.up)
  const n = dot(d, q.there.north)
  const e = dot(d, q.there.east)
  const distance = Math.acos(Math.max(-1, Math.min(1, u)))
  const bearing = Math.atan2(e, n) - q.spin
  const back = 2 * Math.asin(Math.min(1, Math.sin(distance / 2) / k))
  return from(q.home, back, bearing)
}

/** Pieces held where they are, whatever pulls on them. Africa is the frame. */
const PINNED = new Set(['africa'])

interface Join {
  a: [number, number]
  b: [number, number]
  why: string
  pieceA: number
  pieceB: number
  pointA: V3
  pointB: V3
  /** Sea floor older than each moment along the way, km, by moment. */
  gapKm: Record<number, number>
  weight: number
}

function snapJoins(piece: Uint8Array): Join[] {
  const snap = ([lon, lat]: [number, number], not = -1): [number, V3] => {
    const x0 = Math.floor(((lon + 180) / 360) * W)
    const y0 = Math.floor(((90 - lat) / 180) * H)
    const target = direction(lon, lat)
    let best = -2
    let found: [number, V3] = [-1, target]
    for (let dy = -30; dy <= 30; dy++) {
      const y = y0 + dy
      if (y < 0 || y >= H) continue
      for (let dx = -60; dx <= 60; dx++) {
        const x = (((x0 + dx) % W) + W) % W
        const id = piece[y * W + x]
        if (!id || id - 1 === not) continue
        const d = direction(cellLon(x), cellLat(y))
        const c = dot(d, target)
        if (c > best) {
          best = c
          found = [id - 1, d]
        }
      }
    }
    return found
  }
  const skip = process.env.SKIP_JOINS ? new RegExp(process.env.SKIP_JOINS) : null
  return CONCEPT_JOINS.filter((j) => !skip?.test(j.why)).map((j) => {
    const [pieceA, pointA] = snap(j.a)
    // The far side is whatever piece is nearest that is not the near side's.
    const [pieceB, pointB] = snap(j.b, pieceA)
    if (pieceA < 0 || pieceB < 0 || pieceA === pieceB) {
      throw new Error(`join ${JSON.stringify(j)} does not join two pieces (${pieceA}, ${pieceB})`)
    }
    // Crust that is continuous today is held hardest; a coast laid against a
    // coast across an ocean less so, and least the ones across the Pacific,
    // where today's great circle is the poorest guide to what lay between.
    const pacific = j.why.includes('Pacific') || j.why.includes('Scalera') || j.why.includes('California')
    const weight = j.why === 'joined by continental crust today' || j.why.includes('attached') ? 4 : pacific ? 0.5 : 1
    return { ...j, pieceA, pieceB, pointA, pointB, gapKm: {}, weight }
  })
}

/** Km of sea floor older than `ma` on today's great circle between two points. */
function oldFloorBetween(a: V3, b: V3, ma: number, oceanAge: Float32Array): number {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
  const steps = Math.max(1, Math.ceil((angle * R0_KM) / 10))
  const axis = unit(cross(a, b))
  const side = cross(axis, a)
  let km = 0
  for (let s = 0; s < steps; s++) {
    const t = ((s + 0.5) / steps) * angle
    const d: V3 = [
      a[0] * Math.cos(t) + side[0] * Math.sin(t),
      a[1] * Math.cos(t) + side[1] * Math.sin(t),
      a[2] * Math.cos(t) + side[2] * Math.sin(t),
    ]
    const [lon, lat] = lonLat(d)
    const cx = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W))
    const cy = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H))
    const age = oceanAge[cy * W + cx]
    if (age >= 0 && age > ma) km += (angle * R0_KM) / steps
  }
  return km
}

/** Where a point of today's crust lands, carried by its piece. */
function forward(p: V3, home: ReturnType<typeof frame>, there: ReturnType<typeof frame>, spin: number, k: number): V3 {
  const distance = Math.acos(Math.max(-1, Math.min(1, dot(p, home.up))))
  const bearing = Math.atan2(dot(p, home.east), dot(p, home.north))
  return from(there, 2 * Math.asin(Math.min(1, k * Math.sin(distance / 2))), bearing + spin)
}

const tangentAt = (at: V3, v: V3): V3 => {
  const n = dot(v, at)
  return [v[0] - at[0] * n, v[1] - at[1] * n, v[2] - at[2] * n]
}

/**
 * Let the pieces find their places: every join pulls its two margins to the
 * width of old sea floor between them, and pieces lying on top of each other
 * are pushed apart along the line between their centres. Position-based, a
 * little at a time, everything moved at once from the same picture.
 */
function settle(
  m: MomentInfo & { radiusKm: number }, pieces: PieceInfo[], piece: Uint8Array, joins: Join[],
  oceanAge: Float32Array,
) {
  for (const j of joins) j.gapKm[m.ma] = oldFloorBetween(j.pointA, j.pointB, m.ma, oceanAge)
  const homes = pieces.map((p) => frame(direction(p.lon, p.lat)))
  const centre = pieces.map((p) => direction(m.place[p.id].lon, m.place[p.id].lat))
  const spin = pieces.map((p) => (m.place[p.id].spin ?? 0) * DEG)
  const N = 30000
  const samples: V3[] = []
  for (let s = 0; s < N; s++) {
    const y = 1 - (2 * (s + 0.5)) / N
    const r = Math.sqrt(1 - y * y)
    const a = s * Math.PI * (3 - Math.sqrt(5))
    samples.push([r * Math.cos(a), y, r * Math.sin(a)])
  }
  const ROUNDS = 400
  for (let round = 0; round < ROUNDS; round++) {
    const move: V3[] = pieces.map(() => [0, 0, 0])
    const turn = pieces.map(() => 0)
    const pulls = pieces.map(() => 0)
    const theres = centre.map((c) => frame(c))
    // The joins.
    for (const j of joins) {
      const a = forward(j.pointA, homes[j.pieceA], theres[j.pieceA], spin[j.pieceA], m.k)
      const b = forward(j.pointB, homes[j.pieceB], theres[j.pieceB], spin[j.pieceB], m.k)
      const d = Math.acos(Math.max(-1, Math.min(1, dot(a, b))))
      const want = j.gapKm[m.ma] / m.radiusKm
      const error = d - want
      if (d < 1e-9) continue
      for (const [p, at, toward] of [[j.pieceA, a, b], [j.pieceB, b, a]] as [number, V3, V3][]) {
        const dir = unit(tangentAt(at, [toward[0] - at[0], toward[1] - at[1], toward[2] - at[2]]))
        const step: V3 = [dir[0] * error * 0.5, dir[1] * error * 0.5, dir[2] * error * 0.5]
        const c = centre[p]
        const lever = tangentAt(c, [at[0] - c[0], at[1] - c[1], at[2] - c[2]])
        const reach2 = dot(lever, lever) + 1e-4
        const w = j.weight
        turn[p] += (-dot(cross(lever, step), c) / reach2) * w
        const t = tangentAt(c, step)
        move[p][0] += t[0] * w
        move[p][1] += t[1] * w
        move[p][2] += t[2] * w
        pulls[p] += w
      }
    }
    for (let p = 0; p < pieces.length; p++) {
      if (!pulls[p]) continue
      move[p] = [move[p][0] / pulls[p], move[p][1] / pulls[p], move[p][2] / pulls[p]]
      turn[p] /= pulls[p]
    }
    // The overlaps, pair by pair.
    const q = placed({ ...m, place: Object.fromEntries(pieces.map((pc, i) => {
      const [lon, lat] = lonLat(centre[i])
      return [pc.id, { lat, lon, spin: spin[i] / DEG }]
    })) }, pieces)
    // Each pair's overlap as one patch: its centre, its area, and how long it
    // runs along the border, which together give how deep it is.
    const patches = new Map<number, { p: number; r: number; xs: V3[] }>()
    for (const x of samples) {
      const hits = piecesAt(x, q, m.k, piece)
      if (hits.length < 2) continue
      for (let i = 0; i < hits.length; i++) {
        for (let i2 = i + 1; i2 < hits.length; i2++) {
          const key = hits[i] * 64 + hits[i2]
          let e = patches.get(key)
          if (!e) patches.set(key, (e = { p: hits[i], r: hits[i2], xs: [] }))
          e.xs.push(x)
        }
      }
    }
    const spacing = Math.sqrt((4 * Math.PI) / N)
    for (const { p, r, xs } of patches.values()) {
      const g = unit(xs.reduce<V3>((s2, x) => [s2[0] + x[0], s2[1] + x[1], s2[2] + x[2]], [0, 0, 0]))
      const v = unit(tangentAt(g, [centre[r][0] - centre[p][0], centre[r][1] - centre[p][1], centre[r][2] - centre[p][2]]))
      const w = cross(g, v)
      let lo = Infinity
      let hi = -Infinity
      for (const x of xs) {
        const t = dot(x, w)
        lo = Math.min(lo, t)
        hi = Math.max(hi, t)
      }
      const depth = Math.min(0.03, (xs.length * spacing * spacing) / (hi - lo + spacing))
      const share = PINNED.has(pieces[p].id) ? 0 : PINNED.has(pieces[r].id) ? 1 : 0.5
      for (const [piece2, sign, part] of [[p, -1, share], [r, 1, 1 - share]] as [number, number, number][]) {
        if (!part) continue
        const step: V3 = [v[0] * sign * depth * part, v[1] * sign * depth * part, v[2] * sign * depth * part]
        const c = centre[piece2]
        const lever = tangentAt(c, [g[0] - c[0], g[1] - c[1], g[2] - c[2]])
        turn[piece2] += -dot(cross(lever, step), c) / (dot(lever, lever) + 1e-2)
        const t = tangentAt(c, step)
        move[piece2][0] += t[0]
        move[piece2][1] += t[1]
        move[piece2][2] += t[2]
      }
    }
    const relax = 0.5
    for (let p = 0; p < pieces.length; p++) {
      if (PINNED.has(pieces[p].id)) continue
      centre[p] = unit([
        centre[p][0] + move[p][0] * relax,
        centre[p][1] + move[p][1] * relax,
        centre[p][2] + move[p][2] * relax,
      ])
      spin[p] += Math.max(-0.05, Math.min(0.05, turn[p] * relax))
    }
    if (round === ROUNDS - 1 || round % 100 === 0) {
      let residual = 0
      for (const j of joins) {
        const a = forward(j.pointA, homes[j.pieceA], frame(centre[j.pieceA]), spin[j.pieceA], m.k)
        const b = forward(j.pointB, homes[j.pieceB], frame(centre[j.pieceB]), spin[j.pieceB], m.k)
        residual += Math.abs(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * m.radiusKm - j.gapKm[m.ma])
      }
      console.log(`    settle ${m.ma} Ma round ${round}: joins off by ${(residual / joins.length).toFixed(0)} km on average, ${patches.size} overlapping pairs`)
    }
  }
  const off = joins.map((j) => {
    const a = forward(j.pointA, homes[j.pieceA], frame(centre[j.pieceA]), spin[j.pieceA], m.k)
    const b = forward(j.pointB, homes[j.pieceB], frame(centre[j.pieceB]), spin[j.pieceB], m.k)
    return { j, km: Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * m.radiusKm - j.gapKm[m.ma] }
  }).sort((x, y) => Math.abs(y.km) - Math.abs(x.km))
  Object.assign(m, { joinOff: Object.fromEntries(off.map(({ j, km }) => [joins.indexOf(j), Math.round(km)])) })
  for (const { j, km } of off.slice(0, 8)) {
    console.log(`      ${pieces[j.pieceA].id}-${pieces[j.pieceB].id} off by ${km.toFixed(0)} km (${j.why.slice(0, 40)})`)
  }
  pieces.forEach((p, i) => {
    const [lon, lat] = lonLat(centre[i])
    m.place[p.id] = { lat, lon, spin: ((spin[i] / DEG + 540) % 360) - 180 }
  })
}

const PALETTE: V3[] = [
  [214, 160, 92], [196, 110, 84], [222, 196, 120], [175, 140, 190], [120, 170, 160],
  [230, 140, 120], [150, 190, 110], [110, 150, 200], [200, 170, 210], [160, 200, 220],
  [170, 160, 150], [140, 130, 190], [210, 130, 160], [190, 150, 100], [130, 180, 130],
  [120, 160, 180], [200, 190, 160], [180, 120, 130], [150, 170, 120], [210, 180, 110],
  [160, 160, 200],
]

/** Six views of one moment, side by side: Africa, Asia, Pacific, Americas, south, north. */
function drawSheet(
  m: MomentInfo, pieces: PieceInfo[], piece: Uint8Array, land: Uint8Array, marble: Uint8Array,
) {
  const views: [number, number][] = [[20, 0], [100, 15], [180, 0], [-80, 0], [0, -90], [0, 90]]
  const S = 300
  const png = new PNG({ width: S * views.length, height: S })
  const q = placed(m, pieces)
  const ups = q.map((x) => x.there.up)
  views.forEach(([lon, lat], v) => {
    const f = frame(direction(lon, lat))
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const o = (j * png.width + v * S + i) * 4
        const x = (2 * (i + 0.5)) / S - 1
        const y = 1 - (2 * (j + 0.5)) / S
        const rr = x * x + y * y
        if (rr > 1) {
          png.data.set([250, 250, 248, 255], o)
          continue
        }
        const z = Math.sqrt(1 - rr)
        const d: V3 = [
          f.east[0] * x + f.north[0] * y + f.up[0] * z,
          f.east[1] * x + f.north[1] * y + f.up[1] * z,
          f.east[2] * x + f.north[2] * y + f.up[2] * z,
        ]
        let hits = 0
        let colour: V3 = [20, 34, 60]
        for (let p = 0; p < q.length; p++) {
          if (dot(d, ups[p]) < q[p].cosReach) continue
          const back = lookBack(d, q[p], m.k)
          const [blon, blat] = lonLat(back)
          const cx = Math.min(W - 1, Math.floor(((blon + 180) / 360) * W))
          const cy = Math.min(H - 1, Math.floor(((90 - blat) / 180) * H))
          const c = cy * W + cx
          if (piece[c] !== p + 1) continue
          hits++
          colour = land[c]
            ? [marble[c * 4], marble[c * 4 + 1], marble[c * 4 + 2]]
            : PALETTE[p % PALETTE.length]
        }
        if (hits > 1) colour = [230, 30, 40]
        const grid = Math.abs(((lonLat(d)[0] + 360) % 30) - 15) > 14.6 || Math.abs((lonLat(d)[1] + 90) % 30 - 15) > 14.6
        const shade = 0.55 + 0.45 * z
        const g = grid ? 0.7 : 1
        png.data.set([colour[0] * shade * g, colour[1] * shade * g, colour[2] * shade * g, 255], o)
      }
    }
  })
  writeFileSync(resolve(OUT, `sheet-${m.ma}.png`), PNG.sync.write(png))
}

/** Which pieces cover a point of the smaller sphere. */
function piecesAt(d: V3, q: ReturnType<typeof placed>, k: number, piece: Uint8Array): number[] {
  const out: number[] = []
  for (let p = 0; p < q.length; p++) {
    if (dot(d, q[p].there.up) < q[p].cosReach) continue
    const [blon, blat] = lonLat(lookBack(d, q[p], k))
    const cx = Math.min(W - 1, Math.floor(((blon + 180) / 360) * W))
    const cy = Math.min(H - 1, Math.floor(((90 - blat) / 180) * H))
    if (piece[cy * W + cx] === p + 1) out.push(p)
  }
  return out
}

/**
 * Covered once, twice, or not at all, over points spread evenly on the sphere,
 * and which pairs of pieces lie on top of each other and by how much.
 */
function measure(m: MomentInfo, pieces: PieceInfo[], piece: Uint8Array) {
  const q = placed(m, pieces)
  const N = 200000
  let gap = 0
  let overlap = 0
  const pairs = new Map<string, number>()
  for (let s = 0; s < N; s++) {
    const y = 1 - (2 * (s + 0.5)) / N
    const r = Math.sqrt(1 - y * y)
    const a = s * Math.PI * (3 - Math.sqrt(5))
    const hits = piecesAt([r * Math.cos(a), y, r * Math.sin(a)], q, m.k, piece)
    if (!hits.length) gap++
    if (hits.length > 1) {
      overlap++
      const key = hits.map((h) => pieces[h].id).join('+')
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
  }
  const worst = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8)
  for (const [key, n] of worst) console.log(`      ${key} ${((100 * n) / N).toFixed(2)}%`)
  return { gap: gap / N, overlap: overlap / N }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
