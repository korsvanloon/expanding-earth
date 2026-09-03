/**
 * The grooves this can find, on the fabric window a reader can check them in.
 *
 * Nothing here touches the pairing yet, on purpose. The reader's diagnosis was
 * that the pairs are bad because the fracture zones are badly found, and their
 * rule for finding one -- a light band with a dark centre line -- is now a
 * measurement. The one thing worth doing with it before it is wired into
 * anything is to draw what it finds over the picture they read, so they can say
 * whether these are the lines they were following.
 *
 *     LON=-40,5 LAT=-45,-5 SCALE=3 tsx tools/draw-grooves.ts
 *
 * PAIRS=n also puts the pairs of that window on it, spread over their ages and
 * numbered as draw-fabric numbers them, so a verdict already given about pair
 * four can be looked at beside the grooves near it.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { directionToPixel, directionToUv, lonLatToDirection } from '../shared/sphere.js'
import { pairHue, readTracks } from '../shared/tracks.js'
import { apartKm, axisDiff, bearingDeg, type Place } from './lib/bearing.js'
import { loadAgeGrid } from './lib/agegrid.js'
import { overDisc, spreadingDirection } from './lib/age-gradient.js'
import { loadRaster } from './lib/raster.js'
import {
  axisOf, grainReference, grooveField, linkGrooves, trimEither, walkGrooves,
  type Fabric, type Groove, type GroovePoint,
} from './lib/grooves.js'
import { fabricWindow, windowFromEnv, type Colour } from './lib/window-map.js'

/**
 * How well a pair's join follows the grooves along its whole length.
 *
 * The join is walked at intervals and each step compared with the nearest
 * detected groove to it, because the join is thousands of kilometres long and a
 * groove near one end says nothing about the crust at the other. What comes
 * back is the median disagreement over the steps that had a groove near them at
 * all, and how many of them did: a pair with two steps covered is not judged,
 * it is unjudged, and saying so is the point.
 */
function againstGrooves(
  grooves: Groove[], a: Place, b: Place, reachKm: number, stepKm = 100,
): { off: number; covered: number; steps: number } {
  const total = apartKm(a, b)
  const steps = Math.max(2, Math.round(total / stepKm))
  const offs: number[] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    // Along the join in longitude and latitude, which is not the great circle
    // but is within a few kilometres of it over these distances.
    const at = { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t }
    const ahead = {
      lon: a.lon + (b.lon - a.lon) * Math.min(1, t + 0.01),
      lat: a.lat + (b.lat - a.lat) * Math.min(1, t + 0.01),
    }
    const behind = {
      lon: a.lon + (b.lon - a.lon) * Math.max(0, t - 0.01),
      lat: a.lat + (b.lat - a.lat) * Math.max(0, t - 0.01),
    }
    let nearest: { axis: number; awayKm: number } | null = null
    for (const groove of grooves) {
      for (let i = 0; i < groove.points.length; i++) {
        // Only where the trough was read: a carried-through stretch is a claim,
        // not evidence, and must not be able to judge a pair.
        if (!groove.points[i].measured) continue
        const awayKm = apartKm(at, groove.points[i])
        if (awayKm > reachKm || (nearest && awayKm >= nearest.awayKm)) continue
        const from = groove.points[Math.max(0, i - 1)]
        const to = groove.points[Math.min(groove.points.length - 1, i + 1)]
        if (from === to) continue
        nearest = { axis: bearingDeg(from, to), awayKm }
      }
    }
    if (nearest) offs.push(axisDiff(bearingDeg(behind, ahead), nearest.axis))
  }
  offs.sort((p, q) => p - q)
  return {
    off: offs.length ? offs[Math.floor(offs.length / 2)] : NaN,
    covered: offs.length,
    steps: steps + 1,
  }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

/**
 * The bearing a groove should run in at a place, off the age grid.
 *
 * Null over land, where the grid does not date the crust, and on the floor of
 * a valley in the age field, where there is no slope to read -- at a spreading
 * axis, that is, where the age turns round and the direction is undefined
 * rather than uncertain.
 */
async function spreadingReference(): Promise<(at: GroovePoint) => number | null> {
  const grid = await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc'))
  const raw = (x: number, y: number, z: number) => {
    const [column, row] = directionToPixel(x, y, z, grid.width, grid.height)
    return grid.at(column, row)
  }
  // The regional age field, whose gradient is the spreading direction. Read
  // cell by cell it is the wrong field on exactly the lines this is about; see
  // overDisc in ./lib/age-gradient.ts for why, and for what else was tried.
  const age = overDisc(raw, Number(process.env.AGESMOOTH ?? 200))

  const RADIANS = Math.PI / 180
  return (at: GroovePoint) => {
    const [x, y, z] = lonLatToDirection(at.lon * RADIANS, at.lat * RADIANS)
    const direction = spreadingDirection(age, x, y, z, Number(process.env.AGESTEP ?? 60))
    if (!direction) return null
    // The tangent as a bearing: north and east here, then the angle between.
    const l = Math.hypot(x, y, z) || 1
    const ux = x / l
    const uy = y / l
    const uz = z / l
    let nx = -uy * ux
    let ny = 1 - uy * uy
    let nz = -uy * uz
    const nl = Math.hypot(nx, ny, nz)
    if (nl < 1e-6) return null
    nx /= nl
    ny /= nl
    nz /= nl
    const ex = ny * uz - nz * uy
    const ey = nz * ux - nx * uz
    const ez = nx * uy - ny * ux
    const north = direction[0] * nx + direction[1] * ny + direction[2] * nz
    const east = direction[0] * ex + direction[1] * ey + direction[2] * ez
    return (((Math.atan2(east, north) / RADIANS) % 180) + 180) % 180
  }
}

/**
 * Whether a place sits on crust ECM1 calls continental.
 *
 * Read off the published crust raster, whose red channel is the class index.
 * Normal ocean, ridge and oceanic plateau are sea floor; everything else --
 * margins, extended crust, shields, orogens, platforms, basins, arcs -- is
 * crust that was not erupted at a ridge.
 */
function ashore(): (at: GroovePoint) => boolean {
  const raster = loadRaster(resolve(DATA, 'crust.png'))
  const RADIANS = Math.PI / 180
  const OCEANIC = new Set([0, 1, 2])
  return (at: GroovePoint) => {
    const [x, y, z] = lonLatToDirection(at.lon * RADIANS, at.lat * RADIANS)
    const [column, row] = directionToPixel(x, y, z, raster.width, raster.height)
    return !OCEANIC.has(raster.at(column, row))
  }
}

async function main() {
  const window = windowFromEnv()
  const budget = Number(process.env.PAIRS ?? 0)

  const decoded = jpeg.decode(readFileSync(resolve(DATA, 'fabric.jpg')), { useTArray: true })
  const fabric: Fabric = {
    width: decoded.width,
    height: decoded.height,
    at: (column, row) => decoded.data[(row * decoded.width + column) * 4],
  }

  // The knobs the detector is being argued about through, so a picture can be
  // asked for without editing the library it is a picture of.
  const knobs = {
    alongKm: Number(process.env.ALONG ?? 120),
    stretchKm: Number(process.env.STRETCH ?? 40),
    minContrast: Number(process.env.SEED ?? 6),
    holdContrast: Number(process.env.HOLD ?? 4),
    bridgeSteps: Number(process.env.BRIDGE ?? 8),
    minLengthKm: Number(process.env.MINLEN ?? 80),
  }
  /** LINK=0 shows the segments as found, before anything is carried through. */
  const link = Number(process.env.LINK ?? 1) > 0
  const started = Date.now()
  const field = grooveField(fabric, window, knobs)
  const found = walkGrooves(fabric, field, knobs)
  /**
   * Which reference the segments are judged against, and TRIM=0 for none.
   *
   * The neighbours' own grain was the first answer and it has one assumption
   * in it that does not hold everywhere: that most of what is detected in a
   * neighbourhood is a groove. In the Pacific west of California most of it is
   * abyssal-hill fabric, which runs square to the fracture zones, so the
   * majority vote inverts and the test drops the very lines that are clearest
   * in the picture. The age grid does not have to guess: sea floor leaves its
   * axis along the spreading direction and a fracture zone runs the same way,
   * so the direction the age climbs fastest is what a groove here should run
   * in -- and it is measured from data the fabric had no part in.
   */
  const against = (process.env.AGAINST ?? 'both').split(',')
  const references: ((at: GroovePoint) => number | null)[] = []
  if (against.includes('spreading') || against.includes('both')) {
    references.push(await spreadingReference())
  }
  if (against.includes('grain') || against.includes('both')) {
    references.push(grainReference(found, Number(process.env.GRAIN ?? 800)))
  }
  /**
   * Segments on crust the age grid does not date, split from the rest.
   *
   * The reader: *on land it is the most chaotic and least useful, because land
   * in principle does not disappear.* Which is the whole argument. A groove is
   * a flow line -- a record of two pieces of sea floor moving apart -- and
   * continental crust did not come out of a ridge, so whatever is drawn on it
   * is not that, however clean a line it is. Undated *ocean* is a different
   * case and worth keeping separately: the survey is incomplete, and a groove
   * there is a groove nobody has dated yet.
   */
  const onLand = ashore()
  const ashoreSegments = Number(process.env.LAND ?? 0) > 0
    ? []
    : found.filter((g) => onLand(axisOf(g).at))
  const afloat = ashoreSegments.length
    ? found.filter((g) => !onLand(axisOf(g).at))
    : found
  const trimmed = Number(process.env.TRIM ?? 1) > 0 && references.length
    ? trimEither(afloat, references, Number(process.env.SWING ?? 30))
    : { kept: afloat, dropped: [] as Groove[] }
  const segments = trimmed.kept
  const grooves = link ? linkGrooves(segments, knobs, trimmed.dropped) : segments
  /**
   * The same window at a lower bar, drawn underneath in another colour.
   *
   * Where the bar belongs is the one thing no measurement here can settle: the
   * score says how clear a line is and only a reader can say whether a line
   * that clear is a groove. So the picture separates the lines the bar already
   * accepts from the ones lowering it would add, and the answer to *which of
   * the second colour are wrong* is what sets it.
   */
  const loose = process.env.SEED2
    ? walkGrooves(
      fabric,
      grooveField(fabric, window, { ...knobs, minContrast: Number(process.env.SEED2) }),
      { ...knobs, minContrast: Number(process.env.SEED2) },
    )
    : []
  const measured = (list: Groove[]) => list.reduce(
    (s, g) => s + g.points.filter((p) => p.measured).length, 0,
  ) * (Number(process.env.WALKSTEP ?? 20))
  console.log(
    `[grooves] ${field.width}x${field.height} cells in `
      + `${((Date.now() - started) / 1000).toFixed(1)}s; `
      + `${segments.length} segments, ${measured(segments).toFixed(0)} km read`
      + (trimmed.dropped.length ? `, ${trimmed.dropped.length} dropped across the grain` : '')
      + (ashoreSegments.length ? `, ${ashoreSegments.length} dropped as continental` : '')
      + (link
        ? `, joined into ${grooves.length} grooves of `
          + `${grooves.reduce((s, g) => s + g.lengthKm, 0).toFixed(0)} km`
        : ''),
  )
  // How nearly parallel the segments are, which the reader says they should be
  // here: all more or less one way, with a small swing here and there.
  const axes = segments.map((g) => {
    const a = g.points[0]
    const b = g.points[g.points.length - 1]
    return ((Math.atan2(
      (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), b.lat - a.lat,
    ) * 180) / Math.PI % 180 + 180) % 180
  })
  /**
   * How nearly parallel a set of segments is, as the reader's own test.
   *
   * Reported by band across the window as well as over the whole of it,
   * because the reader's complaint was about one band: the southernmost eighth
   * of the South Atlantic window, where the grain swings and the grain test
   * both dropped good segments and kept bad ones. A number per band is what
   * says whether that is fixed.
   */
  const parallelism = (list: number[]) => {
    if (list.length < 4) return `${list.length} segments, too few to say`
    const middle = list.slice().sort((p, q) => p - q)[Math.floor(list.length / 2)]
    const spread = list.map((a) => axisDiff(a, middle)).sort((p, q) => p - q)
    return `${String(list.length).padStart(3)} segments, median ${middle.toFixed(0)}deg, `
      + `half within ${spread[Math.floor(spread.length / 2)].toFixed(0)}, `
      + `nine in ten within ${spread[Math.floor(0.9 * spread.length)].toFixed(0)}`
  }
  console.log(`[grooves] bearings, all: ${parallelism(axes)}`)
  const bands = 4
  for (let b = 0; b < bands; b++) {
    const from = window.latTo - ((b + 1) / bands) * (window.latTo - window.latFrom)
    const to = window.latTo - (b / bands) * (window.latTo - window.latFrom)
    const inBand = axes.filter((_, n) => {
      const at = segments[n].points[Math.floor(segments[n].points.length / 2)].lat
      return at >= from && at < to
    })
    console.log(
      `[grooves]   lat ${from.toFixed(0).padStart(4)}..${to.toFixed(0).padStart(4)}: `
        + parallelism(inBand),
    )
  }

  const canvas = fabricWindow(window, fabric)
  // The lines first, so what is being asked about is not confused with the
  // pairs' own colours. The looser set underneath, the confident set over it.
  const draw = (list: Groove[], colour: Colour) => list.forEach((groove) => {
    for (let i = 1; i < groove.points.length; i++) {
      const from = canvas.at(groove.points[i - 1].lon, groove.points[i - 1].lat)
      const to = canvas.at(groove.points[i].lon, groove.points[i].lat)
      // A stretch the trough was actually read on is three pixels of solid
      // line; one only carried through is a single dim pixel every other
      // segment, so a claim about crust nothing was read on cannot be mistaken
      // for a reading.
      if (groove.points[i].measured && groove.points[i - 1].measured) {
        for (const lift of [-1, 0, 1]) {
          canvas.line(
            { px: from.px, py: from.py + lift }, { px: to.px, py: to.py + lift }, colour,
          )
        }
      } else if (i % 2) {
        // Bright yellow rather than a dimmed version of the line's own colour:
        // dimmed grey was there to say "this is less than a reading" and was
        // simply hard to see, which is not the same thing. Yellow says it is a
        // different kind of claim without saying it quietly.
        canvas.line(from, to, [255, 225, 60])
      }
    }
  })
  // What the grain test threw out, so the reader can say whether it was right
  // to: a filter that drops two segments in five has to be shown, not trusted.
  draw(ashoreSegments, [130, 110, 200])
  draw(trimmed.dropped, [220, 60, 60])
  draw(loose, [90, 220, 255])
  draw(grooves, [255, 255, 255])
  if (loose.length) {
    console.log(
      `[grooves] and ${loose.length} at a bar of ${process.env.SEED2}, `
        + `${loose.reduce((s, g) => s + g.lengthKm, 0).toFixed(0)} km, drawn in blue`,
    )
  }

  console.log(`[grooves] ${canvas.write(resolve(OUT, 'grooves.png'))}`)

  if (budget > 0) {
    const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
    const [vertexCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
    const dirs = new Float32Array(mesh.buffer, mesh.byteOffset + 16, vertexCount * 3)
    const file = readFileSync(resolve(DATA, 'tracks.bin'))
    const tracks = readTracks(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
    )
    const place = (verts: Uint32Array, weights: Float32Array, i: number) => {
      let x = 0
      let y = 0
      let z = 0
      for (let k = 0; k < 3; k++) {
        const v = verts[i * 3 + k] * 3
        const w = weights[i * 3 + k]
        x += dirs[v] * w
        y += dirs[v + 1] * w
        z += dirs[v + 2] * w
      }
      const l = Math.hypot(x, y, z) || 1
      const [u, v] = directionToUv(x / l, y / l, z / l)
      return { lon: (u - 0.5) * 360, lat: (v - 0.5) * 180 }
    }
    const here: { i: number; age: number }[] = []
    for (let i = 0; i < tracks.pairAgeMa.length; i++) {
      const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
      const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
      if (canvas.inside(a) && canvas.inside(b)) here.push({ i, age: tracks.pairAgeMa[i] })
    }
    here.sort((p, q) => p.age - q.age)
    const stride = Math.max(1, Math.round(here.length / budget))
    console.log('  no   age    join    off   steps with a groove within reach')
    here.filter((_, n) => n % stride === 0).slice(0, budget).forEach(({ i, age }, n) => {
      const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
      const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
      const colour = pairHue(i).map((c) => Math.round(255 * c)) as unknown as
        readonly [number, number, number]
      const from = canvas.at(a.lon, a.lat)
      const to = canvas.at(b.lon, b.lat)
      canvas.line(from, to, colour)
      canvas.ring(from, colour)
      canvas.ring(to, colour)
      canvas.label(String(n + 1), from.px + 12, from.py - 18, colour)
      const near = againstGrooves(grooves, a, b, Number(process.env.REACH ?? 250))
      console.log(
        `  ${String(n + 1).padStart(2)}  ${age.toFixed(0).padStart(4)} Ma  `
          + `${bearingDeg(a, b).toFixed(0).padStart(4)}  `
          + `${(Number.isNaN(near.off) ? '--' : near.off.toFixed(0)).padStart(5)}  `
          + `${String(near.covered).padStart(3)} of ${near.steps}`,
      )
    })
    console.log(`[grooves] ${canvas.write(resolve(OUT, 'grooves-pairs.png'))}`)
  }

  console.log(
    '   len   score  from (lon, lat)     to (lon, lat)       axis',
  )
  grooves.slice(0, 20).forEach((groove) => {
    const a = groove.points[0]
    const b = groove.points[groove.points.length - 1]
    const bearing = (Math.atan2(
      (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180), b.lat - a.lat,
    ) * 180) / Math.PI
    console.log(
      `  ${groove.lengthKm.toFixed(0).padStart(4)} km  ${groove.score.toFixed(1).padStart(4)}  `
        + `${a.lon.toFixed(1).padStart(6)}, ${a.lat.toFixed(1).padStart(5)}   `
        + `${b.lon.toFixed(1).padStart(6)}, ${b.lat.toFixed(1).padStart(5)}   `
        + `${(((bearing % 180) + 180) % 180).toFixed(0).padStart(4)}`,
    )
  })

}

await main()
