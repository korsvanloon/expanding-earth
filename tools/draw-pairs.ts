/**
 * The conjugate pairs and the flow lines they came off, on a flat map.
 *
 * Every number this model is scored by rests on these, and the reader put the
 * objection better than the measurements had: the pairs come off traced flow
 * lines, the flow lines come off fracture-zone detection, and the detection is
 * not good yet. Whatever is wrong with the lines is inherited by the pairs, and
 * then by both halves of the score at once -- the half that pulls the crust and
 * the half that is held back to judge it. So there is no internal number that
 * can catch it. It has to be looked at.
 *
 * This makes it lookable. Green is land and blue is sea floor, straight off the
 * age grid rather than through the mesh, so the base map is the data and not the
 * model. The **bright band is crust younger than two million years**, which is
 * where the spreading axes are today -- and that is the test: two points that
 * were one point should sit either side of an axis, at about the same distance
 * from it, and their line should cross it at about a right angle. A pair that
 * straddles nothing, or sits lopsided, or runs along an axis instead of across
 * it, is wrong however good the residual looks.
 *
 *     PAIRS=150 tsx tools/draw-pairs.ts        # a readable subset
 *     TRACK=17 tsx tools/draw-pairs.ts         # one flow line and its pairs
 *     HELD=1 tsx tools/draw-pairs.ts           # only the pairs that score
 *
 * Each pair gets its own hue, so the two ends of one claim can be told from its
 * neighbour's. The faint line through them is the flow line itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { directionToUv } from '../shared/sphere.js'
import { pairPulls, readTracks } from '../shared/tracks.js'
import { loadAgeGrid } from './lib/agegrid.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

const WIDTH = Number(process.env.WIDTH ?? 2400)
const HEIGHT = WIDTH >> 1
/** Crust younger than this is drawn as the axis it erupted at, Ma. */
const AXIS_MA = 2

/** A hue per pair, spun by the golden angle so neighbours never share one. */
function hue(i: number): [number, number, number] {
  const h = (i * 0.61803398875) % 1
  const s = 0.85
  const l = 0.55
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 1 / 6 ? [c, x, 0]
    : h < 2 / 6 ? [x, c, 0]
      : h < 3 / 6 ? [0, c, x]
        : h < 4 / 6 ? [0, x, c]
          : h < 5 / 6 ? [x, 0, c]
            : [c, 0, x]
  return [Math.round(255 * (r + m)), Math.round(255 * (g + m)), Math.round(255 * (b + m))]
}

async function main() {
  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  const dirs = new Float32Array(mesh.buffer, mesh.byteOffset + 16, vertexCount * 3)
  const trackFile = readFileSync(resolve(DATA, 'tracks.bin'))
  const tracks = readTracks(
    trackFile.buffer.slice(
      trackFile.byteOffset, trackFile.byteOffset + trackFile.byteLength,
    ) as ArrayBuffer,
  )
  const age = await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc'))

  const png = new PNG({ width: WIDTH, height: HEIGHT })
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (y < 0 || y >= HEIGHT) return
    const cx = ((x % WIDTH) + WIDTH) % WIDTH
    const at = (y * WIDTH + cx) * 4
    png.data[at] = r
    png.data[at + 1] = g
    png.data[at + 2] = b
    png.data[at + 3] = 255
  }

  // The base map, from the grid rather than through the mesh: what the data
  // says, so the pairs can be judged against it and not against the model.
  for (let y = 0; y < HEIGHT; y++) {
    const lat = 90 - ((y + 0.5) / HEIGHT) * 180
    const row = Math.min(age.height - 1, Math.floor(((90 - lat) / 180) * age.height))
    for (let x = 0; x < WIDTH; x++) {
      const lon = ((x + 0.5) / WIDTH) * 360 - 180
      const column = Math.min(age.width - 1, Math.floor(((lon + 180) / 360) * age.width))
      const value = age.data[row * age.width + column]
      if (Number.isNaN(value)) put(x, y, 74, 102, 62)
      else if (value < AXIS_MA) put(x, y, 236, 232, 150)
      else {
        // Older sea floor a little darker, so the axes read as ridges rather
        // than as stripes on a flat field.
        const t = Math.min(1, value / 180)
        put(x, y, 30 + 14 * (1 - t), 62 + 34 * (1 - t), 104 + 46 * (1 - t))
      }
    }
  }

  /** Where a stored barycentric point sits today, as pixels. */
  const pixel = (verts: Uint32Array, weights: Float32Array, i: number) => {
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
    const [u, w] = directionToUv(x / l, y / l, z / l)
    return [u * WIDTH, (1 - w) * HEIGHT] as const
  }

  const line = (
    from: readonly [number, number], to: readonly [number, number],
    r: number, g: number, b: number,
  ) => {
    // The shorter way round, so a segment across the date line does not draw a
    // stripe over the whole map.
    let dx = to[0] - from[0]
    if (dx > WIDTH / 2) dx -= WIDTH
    if (dx < -WIDTH / 2) dx += WIDTH
    const dy = to[1] - from[1]
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
    for (let s = 0; s <= steps; s++) {
      put(Math.round(from[0] + (dx * s) / steps), Math.round(from[1] + (dy * s) / steps), r, g, b)
    }
  }

  const dot = (at: readonly [number, number], r: number, g: number, b: number, size = 2) => {
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dy * dy > size * size + 1) continue
        put(Math.round(at[0]) + dx, Math.round(at[1]) + dy, r, g, b)
      }
    }
  }

  const onlyTrack = process.env.TRACK ? Number(process.env.TRACK) : null
  const held = process.env.HELD ? Number(process.env.HELD) > 0 : null

  // The flow lines first, faint, so the pairs sit on top of them.
  const trackCount = tracks.offsets.length - 1
  for (let t = 0; t < trackCount; t++) {
    if (onlyTrack !== null && t !== onlyTrack) continue
    for (let i = tracks.offsets[t]; i + 1 < tracks.offsets[t + 1]; i++) {
      line(
        pixel(tracks.pointVerts, tracks.pointWeights, i),
        pixel(tracks.pointVerts, tracks.pointWeights, i + 1),
        210, 210, 210,
      )
    }
  }

  const wanted: number[] = []
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    if (onlyTrack !== null && tracks.pairTrack[i] !== onlyTrack) continue
    if (held !== null && pairPulls(tracks, i) === held) continue
    wanted.push(i)
  }
  const budget = Number(process.env.PAIRS ?? 150)
  const stride = onlyTrack !== null ? 1 : Math.max(1, Math.round(wanted.length / budget))
  const drawn = wanted.filter((_, n) => n % stride === 0)

  let spans = 0
  for (const [n, i] of drawn.entries()) {
    const [r, g, b] = hue(n)
    const a = pixel(tracks.pairAVerts, tracks.pairAWeights, i)
    const c = pixel(tracks.pairBVerts, tracks.pairBWeights, i)
    line(a, c, r, g, b)
    dot(a, r, g, b)
    dot(c, r, g, b)
    spans++
  }

  /**
   * The one test of a pair that needs no theory at all.
   *
   * Two points that were one point erupted at the same moment, so **the age
   * grid must give them the same age**, and that age must be the age the pair
   * claims. Nothing about plates or poles or rotations is involved: it is the
   * definition, checked against the same grid the pair was traced on. A pair
   * whose ends differ by tens of millions of years is not a conjugate pair, and
   * neither is one with an end on continental crust, where no sea floor ever
   * erupted.
   *
   * Measured over every pair, not the drawn subset.
   */
  const gridAge = (verts: Uint32Array, weights: Float32Array, i: number) => {
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
    return age.atDirection(x / l, y / l, z / l)
  }
  const median = (values: number[]) => {
    if (!values.length) return NaN
    values.sort((p, q) => p - q)
    return values[values.length >> 1]
  }
  const mismatch: number[] = []
  const offClaim: number[] = []
  let onLand = 0
  let bothDated = 0
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const a = gridAge(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = gridAge(tracks.pairBVerts, tracks.pairBWeights, i)
    if (Number.isNaN(a) || Number.isNaN(b)) { onLand++; continue }
    bothDated++
    mismatch.push(Math.abs(a - b))
    offClaim.push(Math.abs((a + b) / 2 - tracks.pairAgeMa[i]))
  }
  /**
   * And the test that catches the failure the first one cannot.
   *
   * Equal ages at both ends rules out crude nonsense and says nothing about
   * being paired with the *right* partner: a point on one flank matched to a
   * point half a thousand kilometres along the ridge from its true conjugate
   * has the same age, sits on sea floor, and is wrong. What tells them apart is
   * direction. Sea floor moves away from its axis along the spreading
   * direction, which is the direction the age climbs fastest, so the line
   * joining a true pair runs **along the age gradient** at each of its ends.
   * A mispairing along strike runs across it.
   *
   * Reported as the angle between the two, per end, in degrees. Zero is
   * perfect; ninety means the pair was matched sideways along the ridge.
   */
  const gradient = (x: number, y: number, z: number) => {
    // Two steps of about thirty kilometres on the sphere, along whatever pair of
    // axes is furthest from the radius here, so nothing degenerates at a pole.
    const step = 30 / 6371
    const up: [number, number, number] = Math.abs(y) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    let ex: [number, number, number] = [
      up[1] * z - up[2] * y, up[2] * x - up[0] * z, up[0] * y - up[1] * x,
    ]
    let l = Math.hypot(...ex) || 1
    ex = [ex[0] / l, ex[1] / l, ex[2] / l]
    let ey: [number, number, number] = [
      y * ex[2] - z * ex[1], z * ex[0] - x * ex[2], x * ex[1] - y * ex[0],
    ]
    l = Math.hypot(...ey) || 1
    ey = [ey[0] / l, ey[1] / l, ey[2] / l]
    const at = (dx: number, dy: number) => {
      const px = x + ex[0] * dx + ey[0] * dy
      const py = y + ex[1] * dx + ey[1] * dy
      const pz = z + ex[2] * dx + ey[2] * dy
      const pl = Math.hypot(px, py, pz) || 1
      return age.atDirection(px / pl, py / pl, pz / pl)
    }
    const gx = at(step, 0) - at(-step, 0)
    const gy = at(0, step) - at(0, -step)
    if (Number.isNaN(gx) || Number.isNaN(gy) || (!gx && !gy)) return null
    // Back to a 3-vector in the tangent plane.
    const vx = ex[0] * gx + ey[0] * gy
    const vy = ex[1] * gx + ey[1] * gy
    const vz = ex[2] * gx + ey[2] * gy
    const vl = Math.hypot(vx, vy, vz) || 1
    return [vx / vl, vy / vl, vz / vl] as const
  }
  const unitAt = (verts: Uint32Array, weights: Float32Array, i: number) => {
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
    return [x / l, y / l, z / l] as const
  }
  const oblique: number[] = []
  const obliqueAt: { age: number; off: number }[] = []
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const a = unitAt(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = unitAt(tracks.pairBVerts, tracks.pairBWeights, i)
    // The chord from A to B, projected into A's tangent plane.
    let cx = b[0] - a[0]
    let cy = b[1] - a[1]
    let cz = b[2] - a[2]
    const radial = cx * a[0] + cy * a[1] + cz * a[2]
    cx -= radial * a[0]; cy -= radial * a[1]; cz -= radial * a[2]
    const cl = Math.hypot(cx, cy, cz)
    const g = gradient(a[0], a[1], a[2])
    if (!g || !cl) continue
    // The gradient climbs away from the axis and the chord runs towards it, so
    // a perfect pair is antiparallel; the angle is measured off 180 degrees.
    const dot = (cx * g[0] + cy * g[1] + cz * g[2]) / cl
    const off = 180 - (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
    oblique.push(off)
    obliqueAt.push({ age: tracks.pairAgeMa[i], off })
  }

  const p90 = (values: number[]) => {
    const sorted = [...values].sort((p, q) => p - q)
    return sorted[Math.floor(0.9 * sorted.length)] ?? NaN
  }
  console.log(
    `[pairs] the two ends should be the same age in the grid: median `
      + `${median([...mismatch]).toFixed(2)} Ma apart, ninetieth ${p90(mismatch).toFixed(2)} Ma`,
  )
  console.log(
    `[pairs] and that age should be the age the pair claims: median `
      + `${median([...offClaim]).toFixed(2)} Ma off, ninetieth ${p90(offClaim).toFixed(2)} Ma`,
  )
  // Split by age before believing it. The gradient is ill-defined *at* an axis,
  // where the age turns round, so a young pair sits where the measurement is
  // worst -- and if the bad ones are all young, this is the ruler and not the
  // pairs.
  const bands = [[0, 10], [10, 30], [30, 60], [60, 200]] as const
  for (const [from, to] of bands) {
    const band = obliqueAt.filter((q) => q.age >= from && q.age < to).map((q) => q.off)
    if (!band.length) continue
    const bad = band.filter((d) => d > 45).length
    console.log(
      `[pairs]   ${String(from).padStart(3)}-${String(to).padEnd(3)} Ma  ${
        String(band.length).padStart(5)} pairs  median ${median([...band]).toFixed(0)} deg  `
        + `${((100 * bad) / band.length).toFixed(1)}% past 45`,
    )
  }
  const wayOff = oblique.filter((d) => d > 45).length
  console.log(
    `[pairs] the join should run along the age gradient, not across the ridge: median `
      + `${median([...oblique]).toFixed(0)} degrees off, ninetieth ${p90(oblique).toFixed(0)}; `
      + `${wayOff} of ${oblique.length} (${((100 * wayOff) / oblique.length).toFixed(1)}%) `
      + 'are more than 45 degrees out',
  )
  console.log(
    `[pairs] ${onLand} of ${tracks.pairAgeMa.length} pairs `
      + `(${((100 * onLand) / tracks.pairAgeMa.length).toFixed(1)}%) have an end on crust the `
      + `grid does not date at all; ${bothDated} have both ends on sea floor`,
  )

  mkdirSync(OUT, { recursive: true })
  const name = onlyTrack !== null ? `pairs-track-${onlyTrack}.png` : 'pairs.png'
  const file = resolve(OUT, name)
  writeFileSync(file, PNG.sync.write(png))
  console.log(
    `[pairs] ${tracks.pairAgeMa.length} pairs on ${trackCount} flow lines; `
      + `drew ${spans} of ${wanted.length} matching`
      + `${onlyTrack !== null ? ` on track ${onlyTrack}` : ''}`
      + `${held !== null ? (held ? ', pulling only' : ', held back only') : ''} -> ${file}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
