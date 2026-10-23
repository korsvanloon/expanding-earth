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
import { CONCEPT_JOINS, CONCEPT_MOMENTS, CONCEPT_PIECES, type ConceptPiece, type Placement } from '../shared/concepts.js'
import { R0_KM } from '../shared/model.js'
import { loadAgeGrid } from './lib/agegrid.js'
import { areaQuantile, downsample, downsampleField, loadRaster, type Raster } from './lib/raster.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.env.CONCEPT_OUT ?? '.stage/concepts')
const TEXTURES = resolve(ROOT, 'public/textures')

/** The grid the model classifies its crust on (CONFIG in build-data.ts). */
/** The pieces as cut: the ones written down, and the slats some are split into. */
const DEFS: ConceptPiece[] = CONCEPT_PIECES.map((p) => ({ ...p }))

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
      for (let p = 0; p < DEFS.length; p++) {
        if (DEFS[p].from) continue
        if (insideOutline(cellLon(x), cellLat(y), DEFS[p].outline)) {
          piece[i] = p + 1
          break
        }
      }
    }
  }

  // A piece of sea floor claims what its outline holds that no continent took.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (piece[i]) continue
      for (let p = 0; p < DEFS.length; p++) {
        if (DEFS[p].ocean && insideOutline(cellLon(x), cellLat(y), DEFS[p].outline)) {
          piece[i] = p + 1
          break
        }
      }
    }
  }
  tidyPieces(piece)
  splitSlats(piece, (i) => continental[i] === 1, (d) => !DEFS[d].from)

  const rowWeight = (y: number) => age.rowWeight(y)
  let sphere = 0
  for (let y = 0; y < H; y++) sphere += rowWeight(y) * W

  // What no outline claimed, as connected patches, so it can be named or let go.
  reportLeftovers(continental, piece, rowWeight, sphere)

  // Sea floor by the model's nearest-age rule, and every cell of it given to
  // the piece on its side of the ridge.
  const oceanAge = nearestAgeOcean(age, height, shelfBreak)
  const body = piece.slice()
  floodOcean(piece, continental, oceanAge)
  // Plates the flood made whole, cut where an outline says so; such a piece
  // has no continent of its own, so its body is all of it.
  DEFS.forEach((cut, c) => {
    if (!cut.from) return
    const parent = DEFS.findIndex((p) => p.id === cut.from) + 1
    const anyCell = DEFS[parent - 1].ocean
    let n = 0
    if (cut.seed) {
      // Grown from a point over the parent's crust old enough, continent
      // counting as the oldest of all.
      const old = (i: number) => piece[i] === parent && (oceanAge[i] < 0 || oceanAge[i] >= (cut.olderThan ?? 0))
      const sx = Math.min(W - 1, Math.floor(((cut.seed[0] + 180) / 360) * W))
      const sy = Math.min(H - 1, Math.floor(((90 - cut.seed[1]) / 180) * H))
      const queue = old(sy * W + sx) ? [sy * W + sx] : []
      if (!queue.length) throw new Error(`${cut.id}: the seed does not lie on ${cut.from} crust old enough`)
      piece[queue[0]] = c + 1
      for (let k = 0; k < queue.length; k++) {
        const i = queue[k]
        body[i] = c + 1
        n++
        const x = i % W
        const y = (i / W) | 0
        const around = [y * W + ((x + 1) % W), y * W + ((x + W - 1) % W)]
        if (y > 0) around.push(i - W)
        if (y < H - 1) around.push(i + W)
        for (const j of around) {
          if (old(j)) {
            piece[j] = c + 1
            queue.push(j)
          }
        }
      }
      console.log(`[concepts] ${cut.id}: ${n} cells of ${cut.from} older than ${cut.olderThan} Ma, grown from ${cut.seed}`)
      return
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (piece[i] !== parent || (!anyCell && continental[i])) continue
        if (cut.above !== undefined && height.data[i] < cut.above) continue
        if (!insideOutline(cellLon(x), cellLat(y), cut.outline)) continue
        piece[i] = c + 1
        body[i] = c + 1
        n++
      }
    }
    console.log(`[concepts] ${cut.id}: ${n} cells cut out of ${cut.from}`)
  })
  // Pieces cut out of a plate that are slats themselves, the seamounts.
  splitSlats(piece, () => true, (d) => Boolean(DEFS[d].from), body)
  cellAge = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) {
    cellAge[i] = oceanAge[i] < 0 ? 255 : Math.max(1, Math.min(254, Math.ceil(oceanAge[i])))
  }

  // Each piece's area and centre, and how far out its furthest cell lies.
  const pieces = DEFS.map((p, index) => {
    let area = 0
    const sum: V3 = [0, 0, 0]
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // The centre is the continent's as it was cut, before sea floor and
        // loose scraps were given out: placements laid before stay valid.
        if (body[y * W + x] !== index + 1) continue
        const w = rowWeight(y)
        const d = direction(cellLon(x), cellLat(y))
        area += w
        sum[0] += d[0] * w
        sum[1] += d[1] * w
        sum[2] += d[2] * w
      }
    }
    const centre = p.centre ? direction(p.centre[0], p.centre[1]) : unit(sum)
    let reach = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (piece[y * W + x] !== index + 1) continue
        reach = Math.max(reach, Math.acos(Math.min(1, dot(centre, direction(cellLon(x), cellLat(y))))))
      }
    }
    const [lon, lat] = lonLat(centre)
    return { id: p.id, name: p.name, fold: p.fold ?? false, lon, lat, share: area / sphere, reach: reach + 0.01 }
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
    // Everything that exists then -- continent and the sea floor already made
    // -- shrunk alike so that it covers the smaller sphere exactly: what the
    // radius curve leaves room for, against that crust at today's size. The
    // shortfall is what the stretched margins gave back.
    const shrink = m.ma === 0 ? 1 : Math.min(1, sphereShare / (continentShare + oceanShare))
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
  // today's rather than being found afresh each time -- until the moment a
  // reader laid by hand, if one is given. That layout is taken as it is, and
  // every older moment grows out of it instead: each piece carried further
  // along the turn the reader gave it, then settled against the joins.
  const base = readBase(pieces, piece, (ma) => moments.find((m) => m.ma === ma)!.k)
  const today = () => moments.find((x) => x.ma === 0)!.place
  let previous: Record<string, Placement> | null = null
  for (const m of moments) {
    for (const j of joins) j.gapKm[m.ma] = oldFloorBetween(j.pointA, j.pointB, m.ma, oceanAge)
    if (previous) m.place = Object.fromEntries(pieces.map((p) => [p.id, { ...previous![p.id] }]))
    if (base?.layouts[m.ma]) {
      // Laid by hand, taken as it is -- or, with CONCEPT_ALIGN=1, turned as a
      // whole into the frame of the moment before, for moments that were laid
      // each on their own rather than one from the other.
      m.place = ALIGN ? aligned(pieces, base.layouts, today())[m.ma] : { ...base.layouts[m.ma] }
    } else if (base && m.ma > base.ma) {
      if (GROW === 'carry') {
        // Each piece's last step carried on, then only what lies on top of
        // something else nudged apart.
        m.place = extrapolate(pieces, base.layouts, today(), m.ma, radius)
        settle(m, pieces, piece, [], undefined, 150)
      } else {
        // The last hand-laid moment as it is: every piece where it was and
        // turned as it was, to be laid from there on the smaller sphere.
        m.place = { ...(ALIGN ? aligned(pieces, base.layouts, today())[base.ma] : base.layouts[base.ma]) }
      }
    } else if (m.ma > 0) {
      settle(m, pieces, piece, joins)
    }
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
        `overlap ${(100 * stats.overlap).toFixed(1)}%  folded ${(100 * stats.folded).toFixed(1)}%`,
    )
  }

  writeFileSync(
    resolve(OUT, 'concepts.json'),
    JSON.stringify({
      r0Km: R0_KM, width: W, height: H, seaLevel, pieces, moments,
      joins: joins.map((j) => ({ a: j.a, b: j.b, why: j.why, pieceA: pieces[j.pieceA].id, pieceB: pieces[j.pieceB].id, gapKm: j.gapKm, pacific: j.pacific })),
      baseMa: base?.ma ?? null,
      growMode: GROW,
      byHand: base ? Object.keys(base.layouts).map(Number) : [],
    }, null, 1),
  )
  const png = new PNG({ width: W, height: H })
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = piece[i]
    // How old the crust is, in whole Ma, 255 for continent: a cell is part of
    // its piece at every moment younger than that.
    png.data[i * 4 + 1] = cellAge[i]
    // How high it stands, so that where two pieces lie over each other the
    // viewer can show the higher; in steps of four, which the eye cannot tell
    // apart and the PNG compresses far better.
    png.data[i * 4 + 2] = height.data[i] & 0xfc
    png.data[i * 4 + 3] = 255
  }
  writeFileSync(resolve(OUT, 'pieces.png'), PNG.sync.write(png))
  // The photograph at twice the piece grid: it is only looked at.
  writeFileSync(
    resolve(OUT, 'marble.jpg'),
    jpeg.encode({ width: 2 * W, height: 2 * H, data: Buffer.from(loadMarble(2 * W, 2 * H)) }, 84).data,
  )
  if (base) {
    writeFileSync(resolve(OUT, 'aligned.json'), JSON.stringify(
      Object.fromEntries(Object.keys(base.layouts).map((ma) => [ma, moments.find((m) => m.ma === Number(ma))!.place])), null, 1))
  }
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

/**
 * A piece is one body of crust, not whatever its outline happened to hold.
 *
 * An outline claims every continental cell inside it that no earlier outline
 * took, so the last piece of a cut -- the shield, Europe, Indochina -- also
 * picks up every scrap the smaller outlines just missed: a rim of Greenland,
 * the edge of Cyprus, a few cells of the Caribbean. Those are the cut being
 * sloppy, not geology.
 *
 * So each piece keeps its largest connected body and any other body at least a
 * quarter its size (an island chain is several bodies of a size); every other
 * scrap goes to whichever kept body is nearest across the grid, its own piece's
 * included, so a small island next to the rest of its arc stays with it.
 */
function tidyPieces(piece: Uint8Array) {
  const component = new Int32Array(W * H).fill(-1)
  const bodies: { piece: number; cells: number[] }[] = []
  const around = (i: number) => {
    const x = i % W
    const y = (i / W) | 0
    const out: number[] = []
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= H) continue
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push(ny * W + ((x + dx + W) % W))
    }
    return out
  }
  for (let start = 0; start < W * H; start++) {
    if (!piece[start] || component[start] >= 0) continue
    const id = bodies.length
    const cells = [start]
    component[start] = id
    for (let k = 0; k < cells.length; k++) {
      for (const j of around(cells[k])) {
        if (piece[j] === piece[start] && component[j] < 0) {
          component[j] = id
          cells.push(j)
        }
      }
    }
    bodies.push({ piece: piece[start], cells })
  }
  const largest = new Map<number, number>()
  for (const b of bodies) largest.set(b.piece, Math.max(largest.get(b.piece) ?? 0, b.cells.length))
  const kept = bodies.map((b) => b.cells.length * 4 >= largest.get(b.piece)!)

  // Nearest kept body for every cell of the grid, by a breadth-first flood.
  const nearest = new Uint8Array(W * H)
  const queue: number[] = []
  bodies.forEach((b, id) => {
    if (!kept[id]) return
    for (const c of b.cells) {
      nearest[c] = b.piece
      queue.push(c)
    }
  })
  for (let k = 0; k < queue.length; k++) {
    for (const j of around(queue[k])) {
      if (!nearest[j]) {
        nearest[j] = nearest[queue[k]]
        queue.push(j)
      }
    }
  }
  let moved = 0
  const moves = new Map<string, number>()
  bodies.forEach((b, id) => {
    if (kept[id]) return
    const votes = new Map<number, number>()
    for (const c of b.cells) {
      // The scrap's own cells are not seeds; ask the cells just outside it.
      for (const j of around(c)) {
        if (component[j] === id) continue
        const label = nearest[j]
        if (label) votes.set(label, (votes.get(label) ?? 0) + 1)
      }
    }
    const best = [...votes].sort((x, y) => y[1] - x[1])[0]
    if (!best || best[0] === b.piece) return
    for (const c of b.cells) piece[c] = best[0]
    moved += b.cells.length
    const key = `${DEFS[b.piece - 1].id}>${DEFS[best[0] - 1].id}`
    moves.set(key, (moves.get(key) ?? 0) + b.cells.length)
  })
  console.log(
    `[concepts] ${moved} cells in scraps handed to the piece they lie against: ` +
      [...moves].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(', '),
  )
}

/**
 * Pieces marked `slats` cut along their own shallow bodies, Lord Howe's ridges
 * or a line of seamounts: bodies within `join` cells of each other make one
 * slat, slats smaller than `least` cells go to the nearest bigger one. The
 * largest keeps the piece's id; the others are new pieces, luxaflex all.
 */
function splitSlats(
  piece: Uint8Array, counts: (i: number) => boolean, which: (d: number) => boolean, body?: Uint8Array,
) {
  const count = DEFS.length
  for (let d = 0; d < count; d++) {
    const def = DEFS[d]
    if (!def.slats || !which(d)) continue
    const cells: number[] = []
    for (let i = 0; i < W * H; i++) if (piece[i] === d + 1 && counts(i)) cells.push(i)
    const index = new Map(cells.map((c, k) => [c, k]))
    const root = cells.map((_, k) => k)
    const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k])))
    const j = def.slats.join
    cells.forEach((c, k) => {
      const x = c % W
      const y = (c / W) | 0
      for (let dy = -j; dy <= j; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= H) continue
        for (let dx = -j; dx <= j; dx++) {
          const other = index.get(ny * W + ((x + dx + W) % W))
          if (other !== undefined) root[find(other)] = find(k)
        }
      }
    })
    const groups = new Map<number, number[]>()
    cells.forEach((c, k) => {
      const r = find(k)
      if (!groups.has(r)) groups.set(r, [])
      groups.get(r)!.push(c)
    })
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length)
    const big = sorted.filter((g, k) => k === 0 || g.length >= def.slats!.least)
    const middle = (g: number[]) => unit(g.reduce<V3>((s2, c) => {
      const d2 = direction(cellLon(c % W), cellLat((c / W) | 0))
      return [s2[0] + d2[0], s2[1] + d2[1], s2[2] + d2[2]]
    }, [0, 0, 0]))
    const centres = big.map(middle)
    for (const g of sorted) {
      if (big.includes(g)) continue
      const m = middle(g)
      let best = 0
      centres.forEach((c, k) => { if (dot(c, m) > dot(centres[best], m)) best = k })
      big[best].push(...g)
    }
    const name = def.name
    big.forEach((g, k) => {
      let id = d + 1
      if (k > 0) {
        DEFS.push({ id: `${def.id}${k + 1}`, name: `${name} ${k + 1}`, fold: true, outline: [] })
        id = DEFS.length
      }
      for (const c of g) {
        piece[c] = id
        if (body) body[c] = id
      }
    })
    if (big.length > 1) def.name = `${name} 1`
    console.log(`[concepts] ${def.id}: ${big.length} slats of ${big.map((g) => g.length).join(', ')} cells`)
  }
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

function loadMarble(width = W, height = H): Uint8Array {
  const src = jpeg.decode(readFileSync(resolve(TEXTURES, 'blue-marble-map.jpg')), {
    useTArray: true,
    maxMemoryUsageInMB: 1024,
  })
  const out = new Uint8Array(width * height * 4)
  const sx = src.width / width
  const sy = src.height / height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
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
      const o = (y * width + x) * 4
      out[o] = r[0] / n
      out[o + 1] = r[1] / n
      out[o + 2] = r[2] / n
      out[o + 3] = 255
    }
  }
  return out
}

interface PieceInfo { id: string; lon: number; lat: number; reach: number; share: number; fold?: boolean }
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

/**
 * Layouts laid by hand in the viewer, whole -- every piece, the ones the
 * reader left alone included -- named by CONCEPT_BASE:
 * `{ moments: { "45": { id: { lat, lon, spin } }, ... } }`. Those moments are
 * taken as they are, and every older one grows out of the oldest of them.
 *
 * The layouts may have been laid with an older cut of the pieces. Then the
 * file also carries that cut (`ids`, `homes` and the `raster` of it), and each
 * piece of today's cut takes the place the piece it mostly came from had: its
 * centre goes where that piece carried it, and it is turned the way that piece
 * was turned there.
 */
function readBase(
  pieces: PieceInfo[], piece: Uint8Array, kOf: (ma: number) => number,
): { ma: number; layouts: Record<number, Record<string, Placement>> } | null {
  const file = process.env.CONCEPT_BASE
  if (!file) return null
  const body = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as {
    moments: Record<string, Record<string, Placement>>
    ids?: string[]
    homes?: Record<string, { lat: number; lon: number }>
    raster?: string
  }
  let layouts = Object.fromEntries(Object.entries(body.moments).map(([ma, l]) => [Number(ma), l]))
  if (body.raster && body.ids && body.homes) {
    const old = PNG.sync.read(readFileSync(resolve(ROOT, body.raster)))
    const parentOf = pieces.map((_, p) => {
      const count = new Map<number, number>()
      for (let i = 0; i < W * H; i++) {
        if (piece[i] !== p + 1) continue
        const o = old.data[i * 4]
        if (o) count.set(o - 1, (count.get(o - 1) ?? 0) + 1)
      }
      const best = [...count].sort((a, b) => b[1] - a[1])[0]
      return body.ids![best[0]]
    })
    console.log('[concepts] each piece from: ' + pieces.map((p, i) => `${p.id}<${parentOf[i]}`).join(' '))
    layouts = Object.fromEntries(Object.entries(layouts).map(([ma, layout]) => {
      const k = kOf(Number(ma))
      return [ma, Object.fromEntries(pieces.map((p, i) => {
        const home = frame(direction(body.homes![parentOf[i]].lon, body.homes![parentOf[i]].lat))
        const at = layout[parentOf[i]]
        const there = frame(direction(at.lon, at.lat))
        const spin = (at.spin ?? 0) * DEG
        const c = direction(p.lon, p.lat)
        const centre = forward(c, home, there, spin, k)
        const ahead = forward(from(frame(c), 0.01, 0), home, there, spin, k)
        const f = frame(centre)
        const h = tangentAt(centre, [ahead[0] - centre[0], ahead[1] - centre[1], ahead[2] - centre[2]])
        const [lon, lat] = lonLat(centre)
        return [p.id, { lat, lon, spin: Math.atan2(dot(h, f.east), dot(h, f.north)) / DEG }]
      }))]
    }))
  }
  const ma = Math.max(...Object.keys(layouts).map(Number))
  console.log(`[concepts] ${Object.keys(layouts).join(' and ')} Ma laid by hand; growing every moment after ${ma} Ma out of it`)
  return { ma, layouts }
}

type M3 = number[][]
const mul = (a: M3, b: M3): M3 => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]))
const transpose = (a: M3): M3 => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[c][r]))
const apply3 = (a: M3, v: V3): V3 => [0, 1, 2].map((r) => a[r][0] * v[0] + a[r][1] * v[1] + a[r][2] * v[2]) as V3

/** A piece's pose as a turn of the whole sphere: today's frame onto the placed one. */
function pose(p: PieceInfo, at: Placement): M3 {
  const home = frame(direction(p.lon, p.lat))
  const there = frame(direction(at.lon, at.lat))
  const s = (at.spin ?? 0) * DEG
  const heading: V3 = [0, 1, 2].map((i) => there.north[i] * Math.cos(s) + there.east[i] * Math.sin(s)) as V3
  const to = [cross(heading, there.up), heading, there.up]
  const fromF = [home.east, home.north, home.up]
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => to[0][r] * fromF[0][c] + to[1][r] * fromF[1][c] + to[2][r] * fromF[2][c]))
}

function placementOf(p: PieceInfo, q: M3): Placement {
  const home = frame(direction(p.lon, p.lat))
  const up = apply3(q, home.up)
  const north = apply3(q, home.north)
  const f = frame(up)
  const [lon, lat] = lonLat(up)
  return { lat, lon, spin: Math.atan2(dot(north, f.east), dot(north, f.north)) / DEG }
}

function axisAngle(q: M3): { axis: V3; angle: number } {
  const angle = Math.acos(Math.max(-1, Math.min(1, (q[0][0] + q[1][1] + q[2][2] - 1) / 2)))
  if (angle < 1e-9) return { axis: [0, 0, 1], angle: 0 }
  return { axis: unit([q[2][1] - q[1][2], q[0][2] - q[2][0], q[1][0] - q[0][1]]), angle }
}

function turnMatrix(axis: V3, angle: number): M3 {
  return transpose([rotate([1, 0, 0], axis, angle), rotate([0, 1, 0], axis, angle), rotate([0, 0, 1], axis, angle)])
}

/**
 * The one turn of the whole sphere that moves `from` onto `to` as little as
 * possible, every piece's centre and heading weighted by its area (Horn's
 * quaternion method). Laying a moment by hand fixes where the pieces lie
 * against each other, not where the whole lies on the globe, so two moments
 * laid by hand can sit a few degrees apart as a whole; this takes that out,
 * the way plate tectonics takes out net rotation.
 */
function netTurn(pieces: PieceInfo[], from: M3[], to: M3[]): M3 {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  pieces.forEach((p, i) => {
    const home = frame(direction(p.lon, p.lat))
    for (const v of [home.up, home.north]) {
      const a = apply3(from[i], v)
      const b = apply3(to[i], v)
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += p.share * a[r] * b[c]
    }
  })
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ]
  const shift = N.flat().reduce((s2, v) => s2 + Math.abs(v), 0)
  let q = [1, 0, 0, 0]
  for (let k = 0; k < 500; k++) {
    const next = N.map((row, r) => row.reduce((s2, v, c) => s2 + v * q[c], 0) + shift * q[r])
    const l = Math.hypot(...next)
    q = next.map((v) => v / l)
  }
  const [w, x, y, z] = q
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ]
}

/**
 * An older moment grown out of the hand-laid ones. The hand-laid moments are
 * first brought into one frame, each turned as a whole onto the one before it
 * (today for the first); then each piece's last step -- the turn that took it
 * from the second-last laid moment to the last -- is carried on, as far as the
 * sea floor that goes missing in the meantime says, relative to that last step.
 * Everything stays in that one frame, the hand-laid moments included, so a
 * piece's motion from moment to moment is its own and not the whole globe's.
 */
function extrapolate(
  pieces: PieceInfo[], layouts: Record<number, Record<string, Placement>>, today: Record<string, Placement>,
  ma: number, radius: (ma: number) => number,
): Record<string, Placement> {
  const laid = Object.keys(layouts).map(Number).sort((a, b) => a - b)
  let previous = pieces.map((p) => pose(p, today[p.id]))
  const aligned: M3[][] = []
  const turns: M3[] = []
  for (const t of laid) {
    const raw = pieces.map((p) => pose(p, layouts[t][p.id]))
    const g = netTurn(pieces, raw, previous)
    turns.push(g)
    previous = raw.map((q) => mul(g, q))
    aligned.push(previous)
  }
  const last = laid[laid.length - 1]
  const before = laid.length > 1 ? laid[laid.length - 2] : 0
  const lastPoses = aligned[aligned.length - 1]
  const beforePoses = laid.length > 1 ? aligned[aligned.length - 2] : pieces.map((p) => pose(p, today[p.id]))
  const r2 = (t: number) => radius(t) ** 2
  const onward = (r2(last) - r2(ma)) / (r2(before) - r2(last))
  turns.forEach((t, i) => console.log(`[concepts] ${laid[i]} Ma laid ${(axisAngle(t).angle / DEG).toFixed(1)} deg off, as a whole, from the moment before`))
  console.log(`[concepts] ${ma} Ma: each piece's ${before}-${last} Ma step carried on ${onward.toFixed(2)} times`)
  return Object.fromEntries(pieces.map((p, i) => {
    const step = axisAngle(mul(lastPoses[i], transpose(beforePoses[i])))
    const q = mul(turnMatrix(step.axis, step.angle * onward), lastPoses[i])
    return [p.id, placementOf(p, q)]
  }))
}

/** The hand-laid moments, each turned as a whole onto the one before it. */
function aligned(
  pieces: PieceInfo[], layouts: Record<number, Record<string, Placement>>, today: Record<string, Placement>,
): Record<number, Record<string, Placement>> {
  let previous = pieces.map((p) => pose(p, today[p.id]))
  const out: Record<number, Record<string, Placement>> = {}
  for (const t of Object.keys(layouts).map(Number).sort((a, b) => a - b)) {
    const raw = pieces.map((p) => pose(p, layouts[t][p.id]))
    const g = netTurn(pieces, raw, previous)
    previous = raw.map((q) => mul(g, q))
    out[t] = Object.fromEntries(pieces.map((p, i) => [p.id, placementOf(p, previous[i])]))
  }
  return out
}

function rotate(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = cross(axis, v)
  const d = dot(axis, v) * (1 - c)
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d]
}

/**
 * How the moments after the last hand-laid one are made: `copy` (each piece
 * where it lay then, to be laid on from there) or `carry` (each piece's last
 * step carried on). And whether hand-laid moments are first turned as wholes
 * onto each other, which only helps when they were laid each on its own.
 */
const GROW = process.env.CONCEPT_GROW ?? 'copy'
const ALIGN = process.env.CONCEPT_ALIGN === '1'

/** How hard a grown layout is held to where it was carried. */
const ANCHOR = Number(process.env.CONCEPT_ANCHOR ?? 0.1)

/** Pieces held where they are, whatever pulls on them. Africa is the frame. */
const PINNED = new Set(['nubia'])

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
  pacific: boolean
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
        // A join is between two margins, so it lands on continent, not on the
        // sea floor the pieces now carry.
        if (!id || id - 1 === not || cellAge[y * W + x] !== 255) continue
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
    return { ...j, pieceA, pieceB, pointA, pointB, gapKm: {}, weight, pacific }
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
  anchor?: Record<string, Placement>, rounds = 400,
) {
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
  const ROUNDS = rounds
  const CLEAN = joins.length ? 100 : 0
  let lastPairs = 0
  const apply = (move: V3[], turn: number[], relax: number) => {
    for (let p = 0; p < pieces.length; p++) {
      if (PINNED.has(pieces[p].id)) continue
      centre[p] = unit([
        centre[p][0] + move[p][0] * relax,
        centre[p][1] + move[p][1] * relax,
        centre[p][2] + move[p][2] * relax,
      ])
      spin[p] += Math.max(-0.05, Math.min(0.05, turn[p] * relax))
    }
  }
  // Each pair's overlap as one patch: its centre, its area, and how long it
  // runs along the border, which together give how deep it is.
  const overlaps = () => {
    const q = placed({ ...m, place: Object.fromEntries(pieces.map((pc, i) => {
      const [lon, lat] = lonLat(centre[i])
      return [pc.id, { lat, lon, spin: spin[i] / DEG }]
    })) }, pieces)
    const patches = new Map<number, { p: number; r: number; xs: V3[] }>()
    for (const x of samples) {
      // Crust stacking in an arc or the Caribbean ladder is allowed to.
      const hits = piecesAt(x, q, m.k, piece, m.ma).filter((h) => !pieces[h].fold)
      if (hits.length < 2) continue
      for (let i = 0; i < hits.length; i++) {
        for (let i2 = i + 1; i2 < hits.length; i2++) {
          const key = hits[i] * 256 + hits[i2]
          let e = patches.get(key)
          if (!e) patches.set(key, (e = { p: hits[i], r: hits[i2], xs: [] }))
          e.xs.push(x)
        }
      }
    }
    return patches
  }
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
    // A layout grown from a hand-laid one stays near where it was carried to.
    if (anchor) {
      for (let p = 0; p < pieces.length; p++) {
        const a = direction(anchor[pieces[p].id].lon, anchor[pieces[p].id].lat)
        const t = tangentAt(centre[p], [a[0] - centre[p][0], a[1] - centre[p][1], a[2] - centre[p][2]])
        for (let c = 0; c < 3; c++) move[p][c] += t[c] * ANCHOR
        const want = (anchor[pieces[p].id].spin ?? 0) * DEG
        turn[p] += Math.atan2(Math.sin(want - spin[p]), Math.cos(want - spin[p])) * ANCHOR
      }
    }
    // The pulls first, a little at a time, and for the last rounds not at all,
    // so that what is left at the end is pieces lying apart.
    if (round < ROUNDS - CLEAN) apply(move, turn, 0.25)
    const patches = overlaps()
    const push: V3[] = pieces.map(() => [0, 0, 0])
    const twist = pieces.map(() => 0)
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
      const depth = Math.min(0.01, (xs.length * spacing * spacing) / (hi - lo + spacing))
      const share = PINNED.has(pieces[p].id) ? 0 : PINNED.has(pieces[r].id) ? 1 : 0.5
      for (const [piece2, sign, part] of [[p, -1, share], [r, 1, 1 - share]] as [number, number, number][]) {
        if (!part) continue
        const step: V3 = [v[0] * sign * depth * part, v[1] * sign * depth * part, v[2] * sign * depth * part]
        const c = centre[piece2]
        const lever = tangentAt(c, [g[0] - c[0], g[1] - c[1], g[2] - c[2]])
        twist[piece2] += -dot(cross(lever, step), c) / (dot(lever, lever) + 1e-2)
        const t = tangentAt(c, step)
        push[piece2][0] += t[0]
        push[piece2][1] += t[1]
        push[piece2][2] += t[2]
      }
    }
    // Then the overlaps, pushed apart in full.
    apply(push, twist, 1)
    lastPairs = patches.size
    if (round === ROUNDS - 1 || round % 100 === 0) {
      let residual = 0
      for (const j of joins) {
        const a = forward(j.pointA, homes[j.pieceA], frame(centre[j.pieceA]), spin[j.pieceA], m.k)
        const b = forward(j.pointB, homes[j.pieceB], frame(centre[j.pieceB]), spin[j.pieceB], m.k)
        residual += Math.abs(Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * m.radiusKm - j.gapKm[m.ma])
      }
      console.log(`    settle ${m.ma} Ma round ${round}: ` + (joins.length ? `joins off by ${(residual / joins.length).toFixed(0)} km on average, ` : '') + `${lastPairs} overlapping pairs`)
    }
  }
  const off = joins.map((j) => {
    const a = forward(j.pointA, homes[j.pieceA], frame(centre[j.pieceA]), spin[j.pieceA], m.k)
    const b = forward(j.pointB, homes[j.pieceB], frame(centre[j.pieceB]), spin[j.pieceB], m.k)
    return { j, km: Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * m.radiusKm - j.gapKm[m.ma] }
  }).sort((x, y) => Math.abs(y.km) - Math.abs(x.km))
  Object.assign(m, { joinOff: Object.fromEntries(off.map(({ j, km }) => [joins.indexOf(j), Math.round(km)])) })
  const kept = off.filter(({ j }) => !j.pacific)
  if (kept.length) {
    console.log(`      joins off by ${(kept.reduce((s2, o) => s2 + Math.abs(o.km), 0) / kept.length).toFixed(0)} km on average, outside the Pacific`)
  }
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
        let folded = false
        let colour: V3 = [20, 34, 60]
        for (let p = 0; p < q.length; p++) {
          if (dot(d, ups[p]) < q[p].cosReach) continue
          const back = lookBack(d, q[p], m.k)
          const [blon, blat] = lonLat(back)
          const cx = Math.min(W - 1, Math.floor(((blon + 180) / 360) * W))
          const cy = Math.min(H - 1, Math.floor(((90 - blat) / 180) * H))
          const c = cy * W + cx
          if (piece[c] !== p + 1 || cellAge[c] <= m.ma) continue
          hits++
          if (pieces[p].fold) folded = true
          colour = land[c]
            ? [marble[c * 4], marble[c * 4 + 1], marble[c * 4 + 2]]
            : PALETTE[p % PALETTE.length]
        }
        if (hits > 1) colour = folded ? [150, 110, 210] : [230, 30, 40]
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
function piecesAt(d: V3, q: ReturnType<typeof placed>, k: number, piece: Uint8Array, ma: number): number[] {
  const out: number[] = []
  for (let p = 0; p < q.length; p++) {
    if (dot(d, q[p].there.up) < q[p].cosReach) continue
    const [blon, blat] = lonLat(lookBack(d, q[p], k))
    const cx = Math.min(W - 1, Math.floor(((blon + 180) / 360) * W))
    const cy = Math.min(H - 1, Math.floor(((90 - blat) / 180) * H))
    const c = cy * W + cx
    if (piece[c] === p + 1 && cellAge[c] > ma) out.push(p)
  }
  return out
}

/** How old each cell's crust is, whole Ma, 255 for continent; set once the pieces are cut. */
let cellAge = new Uint8Array(0)

/**
 * Every cell of sea floor given to a piece: the one on its side of the ridge.
 *
 * Each continent grows out over the sea floor beside it, oldest crust first,
 * so two continents growing towards each other meet where the floor is
 * youngest -- at the ridge that made it. A priority flood on age does exactly
 * that, with buckets of one million years. Island arcs and the Caribbean
 * ladder take no sea floor: they fold, and a whole ocean riding on one of
 * them would count every overlap of that ocean as folding. Continental scraps
 * no outline took go to whichever piece reaches them, as the oldest crust of
 * all. Anything the flood cannot reach past an arc goes to the nearest piece.
 */
function floodOcean(piece: Uint8Array, continental: Uint8Array, oceanAge: Float32Array) {
  const TOP = 400
  const keyOf = (i: number) => (oceanAge[i] < 0 ? TOP : Math.max(0, Math.min(TOP - 1, Math.floor(oceanAge[i]))))
  const buckets: number[][] = Array.from({ length: TOP + 1 }, () => [])
  const around = (i: number) => {
    const x = i % W
    const y = (i / W) | 0
    const out = [y * W + ((x + 1) % W), y * W + ((x + W - 1) % W)]
    if (y > 0) out.push(i - W)
    if (y < H - 1) out.push(i + W)
    return out
  }
  const grows = (p: number) => p > 0 && !DEFS[p - 1].fold
  for (let i = 0; i < W * H; i++) {
    if (!grows(piece[i])) continue
    for (const j of around(i)) if (!piece[j]) buckets[keyOf(j)].push(j)
  }
  let given = 0
  for (let key = TOP; key >= 0; key--) {
    const bucket = buckets[key]
    for (let k = 0; k < bucket.length; k++) {
      const i = bucket[k]
      if (piece[i]) continue
      let label = 0
      for (const j of around(i)) if (grows(piece[j])) { label = piece[j]; break }
      if (!label) continue
      piece[i] = label
      given++
      // A cell older than the one it was reached from is taken now: the
      // flood cannot go back up.
      for (const j of around(i)) if (!piece[j]) buckets[Math.min(key, keyOf(j))].push(j)
    }
  }
  // What lies behind an arc, out of reach: the nearest piece of any kind.
  const queue: number[] = []
  for (let i = 0; i < W * H; i++) if (piece[i]) queue.push(i)
  let behind = 0
  for (let k = 0; k < queue.length; k++) {
    for (const j of around(queue[k])) {
      if (piece[j]) continue
      piece[j] = piece[queue[k]]
      behind++
      queue.push(j)
    }
  }
  let ocean = 0
  for (let i = 0; i < W * H; i++) if (!continental[i]) ocean++
  console.log(`[concepts] sea floor and loose continent given out: ${given} cells by the flood, ${behind} behind arcs, of ${ocean} cells of ocean`)
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
  let folded = 0
  const pairs = new Map<string, number>()
  for (let s = 0; s < N; s++) {
    const y = 1 - (2 * (s + 0.5)) / N
    const r = Math.sqrt(1 - y * y)
    const a = s * Math.PI * (3 - Math.sqrt(5))
    const hits = piecesAt([r * Math.cos(a), y, r * Math.sin(a)], q, m.k, piece, m.ma)
    if (!hits.length) gap++
    if (hits.length > 1 && hits.some((h) => pieces[h].fold)) folded++
    else if (hits.length > 1) {
      overlap++
      const key = hits.map((h) => pieces[h].id).join('+')
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
  }
  const worst = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8)
  for (const [key, n] of worst) console.log(`      ${key} ${((100 * n) / N).toFixed(2)}%`)
  return { gap: gap / N, overlap: overlap / N, folded: folded / N }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
