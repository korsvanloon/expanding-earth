/**
 * The reconstruction as a flat map: where the crust does not reach, and where
 * it is being squeezed to make it reach.
 *
 * Everything else about these two failures has been a percentage. A percentage
 * says how much and never where, and where is the whole question -- 0.48% of
 * the sphere bare is a different problem if it is a ring round every ridge than
 * if it is one hole off Patagonia. The globe shows it but only half at a time
 * and only if you already know where to look, so: a rectangle, in the
 * reconstruction's own coordinates at the moment asked for.
 *
 * Green is continental crust and blue is sea floor, at the size and place the
 * model puts them, so the picture can be read against an atlas before anything
 * is believed about the colours on top of it. Red is crust holding less ground
 * than it should, white is crust holding more, and magenta is sphere with no
 * crust on it at all.
 *
 *     FRAME_STEP=1 END_MA=1 tsx tools/solve.ts   # keep the first step
 *     AT=1 tsx tools/draw-map.ts                 # draw it
 *
 * The area each triangle *should* hold is its present-day area times the share
 * of it that has erupted by now, off the same sixteen samples the solver uses,
 * scaled by the radius. It leaves out the un-stretching of continental margins,
 * which ramps in over each margin's own rifting and is worth nothing at all in
 * the first few million years -- so read the reds on a deep frame as slightly
 * overstated on the shelves, and not at all overstated in the ocean.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { PERMANENT_MA, sampleCurve, type Meta } from '../shared/model.js'
import { readChannel, readFrames } from '../shared/frames.js'
import { applyTopology, readTopology } from '../shared/topology.js'
import { lonLatToDirection } from '../shared/sphere.js'
import { AGE_SAMPLES, momentOf, olderShare } from '../shared/age-samples.js'
import { bucketFace, cellBuckets, cellOf, inside } from './lib/coverage.js'
import { pairPulls, readTracks } from '../shared/tracks.js'
import { directionToUv } from '../shared/sphere.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

/** How far a triangle has to be off its own area before it is worth colouring. */
const DEAD_BAND = 0.02
/** Where the colour saturates: this much squeezed or stretched is full red. */
const FULL = 0.25

const WIDTH = Number(process.env.WIDTH ?? 1800)
const HEIGHT = WIDTH >> 1

/** Signed area of a spherical triangle, by Van Oosterom and Strackee. */
function solidAngle(pos: Float64Array, a: number, b: number, c: number): number {
  const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
  const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
  const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
  const la = Math.hypot(ax, ay, az)
  const lb = Math.hypot(bx, by, bz)
  const lc = Math.hypot(cx, cy, cz)
  if (!la || !lb || !lc) return 0
  const triple = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  const denominator = la * lb * lc
    + (ax * bx + ay * by + az * bz) * lc
    + (ax * cx + ay * cy + az * cz) * lb
    + (bx * cx + by * cy + bz * cz) * la
  return 2 * Math.abs(Math.atan2(triple, denominator))
}

function main() {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'meta.json'), 'utf8')) as Meta
  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount, faceCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  let off = mesh.byteOffset + 16
  const dirs = new Float32Array(mesh.buffer, off, vertexCount * 3)
  off += vertexCount * 12
  const indices = new Uint32Array(mesh.buffer, off, faceCount * 3)
  off += faceCount * 12
  const faceAges = new Float32Array(mesh.buffer, off, faceCount)

  const read = (name: string) => {
    const file = readFileSync(resolve(DATA, name))
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
  }
  const frames = readFrames(read('frames.bin'), vertexCount)
  // Through readChannel: sink.bin holds differences between frames, and reading
  // the bytes straight puts every point at the centre of the Earth.
  const sink = meta.folded ? readChannel(read('sink.bin'), vertexCount) : null
  const topology = readTopology(read('topology.bin'), faceCount)

  const ageFile = readFileSync(resolve(DATA, 'crust-age.bin'))
  const [ageFaces, ageSamples] = new Uint32Array(ageFile.buffer, ageFile.byteOffset, 2)
  if (ageFaces !== faceCount || ageSamples !== AGE_SAMPLES) {
    throw new Error(`crust-age.bin is for ${ageSamples} samples over ${ageFaces} faces`)
  }
  const faceAgeSamples = new Uint16Array(
    ageFile.buffer,
    ageFile.byteOffset + 8 + faceCount * 3 * AGE_SAMPLES * 2,
    faceCount * AGE_SAMPLES,
  )

  const radiusKm = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  const r0 = meta.r0Km

  /**
   * The conjugate pairs due at the drawn moment, if asked for.
   *
   * A reader looking at the globe saw short yellow stubs where the flat map
   * showed long lines straddling a ridge, and reasonably asked which was real.
   * Both are: the flat map drew each pair where its two ends sit *today*, which
   * is the whole ocean that has to close -- 794 km at 20 Ma -- and the globe
   * draws them where the reconstruction has put them *at their own moment*,
   * which is what is left over: 108 km. The second is the error, the first is
   * the claim, and nothing said so.
   *
   * Drawn here on the reconstruction, over the gaps and the crushed crust, so
   * the two can be read together: an unclosed pair sitting in a hole is a
   * different problem from one sitting on crust that had to be squeezed.
   */
  const tracks = (() => {
    if (!(Number(process.env.PAIRS ?? 0) > 0)) return null
    const file = readFileSync(resolve(DATA, 'tracks.bin'))
    return readTracks(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
    )
  })()

  // Each face's present-day area, on the unit sphere, from the mesh as built.
  const today = new Float64Array(vertexCount * 3)
  for (let i = 0; i < today.length; i++) today[i] = dirs[i]
  const restAngle = new Float64Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    restAngle[f] = solidAngle(
      today, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3,
    )
  }

  const working = new Int32Array(faceCount * 3)
  const live = new Uint32Array(faceCount * 3)
  const pos = new Float64Array(vertexCount * 3)
  const alive = new Uint8Array(faceCount)
  const buckets = cellBuckets()
  const unit: number[] = [0, 0, 0]
  const boundary: number[] = []

  mkdirSync(OUT, { recursive: true })
  const times = (process.env.AT ?? '1').split(',').map(Number)
  for (const timeMa of times) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) {
      console.log(
        `[map] ${timeMa} Ma is not in this run: ${meta.frameCount} frames `
          + `${meta.frameStepMa} Ma apart. Re-solve with FRAME_STEP=${timeMa}.`,
      )
      continue
    }
    applyTopology(indices, topology, frame, working, live)
    const r = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
    const base = frame * vertexCount * 3
    for (let v = 0; v < vertexCount; v++) {
      const deep = sink ? sink[frame * vertexCount + v] / 255 : 1
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = (frames[base + v * 3 + c] / 32767) * deep
    }

    // How much of its own ground each triangle is holding: what it covers now
    // against what the age grid says of it has erupted, both in km2.
    const moment = momentOf(timeMa)
    const ratio = new Float64Array(faceCount)
    const scale = (r * r) / (r0 * r0)
    for (let f = 0; f < faceCount; f++) {
      alive[f] = working[f * 3] >= 0 && faceAges[f] >= timeMa ? 1 : 0
      if (!alive[f]) continue
      const share = olderShare(faceAgeSamples, f * AGE_SAMPLES, moment)
      const want = restAngle[f] * share
      if (want <= 0) { alive[f] = 0; continue }
      const now = solidAngle(
        pos, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3,
      ) * scale
      ratio[f] = now / want
    }

    for (const list of buckets) list.length = 0
    const shell = { faceVerts: indices, faceAlive: alive }
    for (let f = 0; f < faceCount; f++) if (alive[f]) bucketFace(pos, shell, f, buckets)

    const png = new PNG({ width: WIDTH, height: HEIGHT })
    let bare = 0
    let squeezed = 0
    let stretched = 0
    let weight = 0
    for (let y = 0; y < HEIGHT; y++) {
      const lat = 90 - ((y + 0.5) / HEIGHT) * 180
      const cos = Math.cos((lat * Math.PI) / 180)
      for (let x = 0; x < WIDTH; x++) {
        const lon = ((x + 0.5) / WIDTH) * 360 - 180
        const [dx, dy, dz] = lonLatToDirection((lon * Math.PI) / 180, (lat * Math.PI) / 180)
        let found = -1
        for (const f of buckets[cellOf(dx, dy, dz)]) {
          const a = indices[f * 3] * 3
          const b = indices[f * 3 + 1] * 3
          const c = indices[f * 3 + 2] * 3
          if (inside(pos, a, b, c, dx, dy, dz, unit, boundary)) { found = f; break }
        }
        weight += cos
        let red: number
        let green: number
        let blue: number
        if (found < 0) {
          // Magenta, which nothing else on this map is.
          red = 226; green = 42; blue = 190
          bare += cos
        } else {
          const continental = faceAges[found] >= PERMANENT_MA
          red = continental ? 92 : 40
          green = continental ? 122 : 84
          blue = continental ? 74 : 132
          const off = ratio[found] - 1
          if (off < -DEAD_BAND) {
            const t = Math.min(1, (-off - DEAD_BAND) / FULL)
            red += (214 - red) * t
            green += (48 - green) * t
            blue += (38 - blue) * t
            squeezed += cos * t
          } else if (off > DEAD_BAND) {
            const t = Math.min(1, (off - DEAD_BAND) / FULL)
            red += (246 - red) * t
            green += (244 - green) * t
            blue += (232 - blue) * t
            stretched += cos * t
          }
        }
        // A graticule every thirty degrees, faint, so a reader can place a blob
        // without counting pixels.
        const line = Math.abs(((lon + 180) % 30) - 15) > 14.85
          || Math.abs(((lat + 90) % 30) - 15) > 14.85
        if (line) { red = red * 0.72 + 60; green = green * 0.72 + 60; blue = blue * 0.72 + 60 }
        const at = (y * WIDTH + x) * 4
        png.data[at] = red
        png.data[at + 1] = green
        png.data[at + 2] = blue
        png.data[at + 3] = 255
      }
    }
    // Alternating, or regional? The picture shows the squeeze and the stretch
    // interleaved at the size of single triangles, which would mean the shell is
    // not deforming so much as buckling into a checkerboard -- neighbours
    // taking opposite signs, which costs area everywhere and moves nothing. The
    // measurement is the correlation between a triangle's area error and its
    // neighbours': strongly negative is a checkerboard, positive is real
    // regional strain, and nothing near zero is either.
    const edges = new Map<number, number>()
    let pairs = 0
    let sxy = 0
    let sxx = 0
    let syy = 0
    for (let f = 0; f < faceCount; f++) {
      if (!alive[f]) continue
      for (let k = 0; k < 3; k++) {
        const a = indices[f * 3 + k]
        const b = indices[f * 3 + ((k + 1) % 3)]
        const key = a < b ? a * vertexCount + b : b * vertexCount + a
        const other = edges.get(key)
        if (other === undefined) { edges.set(key, f); continue }
        const x = ratio[other] - 1
        const y = ratio[f] - 1
        pairs++
        sxy += x * y
        sxx += x * x
        syy += y * y
      }
    }
    const correlation = pairs && sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
    if (tracks) {
      const place = (verts: Uint32Array, weights: Float32Array, i: number) => {
        let x = 0
        let y = 0
        let z = 0
        for (let k = 0; k < 3; k++) {
          const v = verts[i * 3 + k] * 3
          const w = weights[i * 3 + k]
          x += pos[v] * w
          y += pos[v + 1] * w
          z += pos[v + 2] * w
        }
        const l = Math.hypot(x, y, z) || 1
        const [u, w] = directionToUv(x / l, y / l, z / l)
        return [u * WIDTH, (1 - w) * HEIGHT] as const
      }
      const plot = (x: number, y: number, r: number, g: number, b: number) => {
        if (y < 0 || y >= HEIGHT) return
        const cx = ((Math.round(x) % WIDTH) + WIDTH) % WIDTH
        const at = (y * WIDTH + cx) * 4
        png.data[at] = r
        png.data[at + 1] = g
        png.data[at + 2] = b
      }
      let due = 0
      for (let i = 0; i < tracks.pairAgeMa.length; i++) {
        if (Math.abs(tracks.pairAgeMa[i] - timeMa) > 0.01) continue
        due++
        // Held back in white, pulling in yellow: only the white ones are a
        // score, and on a picture of the residual that is worth telling apart.
        const scores = !pairPulls(tracks, i)
        const [r, g, b] = scores ? [255, 255, 255] : [250, 210, 70]
        const from = place(tracks.pairAVerts, tracks.pairAWeights, i)
        const to = place(tracks.pairBVerts, tracks.pairBWeights, i)
        let dx = to[0] - from[0]
        if (dx > WIDTH / 2) dx -= WIDTH
        if (dx < -WIDTH / 2) dx += WIDTH
        const dy = to[1] - from[1]
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
        for (let n = 0; n <= steps; n++) {
          const x = from[0] + (dx * n) / steps
          const y = Math.round(from[1] + (dy * n) / steps)
          plot(x, y, r, g, b)
          plot(x, y - 1, r, g, b)
        }
        for (const end of [from, to]) {
          for (let ey = -2; ey <= 2; ey++) {
            for (let ex = -2; ex <= 2; ex++) {
              if (ex * ex + ey * ey > 5) continue
              plot(end[0] + ex, Math.round(end[1]) + ey, r, g, b)
            }
          }
        }
      }
      console.log(
        `[map] ${due} conjugate pairs are due at ${timeMa} Ma; white ones are held back to `
          + 'score, yellow ones pull',
      )
    }

    const file = resolve(OUT, `step-${timeMa}Ma.png`)
    writeFileSync(file, PNG.sync.write(png))
    console.log(
      `[map] ${timeMa} Ma  R=${r.toFixed(0)} km  bare ${(100 * bare / weight).toFixed(3)}%  `
        + `squeezed ${(100 * squeezed / weight).toFixed(2)}%  `
        + `stretched ${(100 * stretched / weight).toFixed(2)}%  `
        + `neighbour correlation ${correlation.toFixed(3)} over ${pairs} shared edges`
        + `  -> ${file}`,
    )
  }
}

main()
