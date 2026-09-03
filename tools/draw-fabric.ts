/**
 * A window of the crustal fabric with a handful of numbered pairs on it, for a
 * human to say which ones are wrong.
 *
 * The pairs come off traced flow lines and the flow lines come off
 * fracture-zone detection, which is not good enough yet to be trusted blind.
 * Every measurement that could be made from inside the model has been made --
 * both ends the same age, both on sea floor, the join along the spreading
 * direction -- and they cannot see a pair matched to the wrong partner along a
 * ridge when the age field is smooth. The reader can, off the fabric, because a
 * fracture zone is a line in it and two points that were one point sit on the
 * same line. So the fastest instrument left is a picture and a person.
 *
 *     LON=-50,-5 LAT=0,45 PAIRS=8 tsx tools/draw-fabric.ts
 *
 * The fabric is the gravity gradient's roughness, drawn with the same ramp the
 * globe uses: dark where the crust was left alone, bright where it was cut
 * about. Each pair is a numbered join between two rings, in its own colour, and
 * the numbers are printed beside their coordinates so an answer can name them.
 *
 * The picture that puts detected grooves on this same window, so an answer
 * about a pair can be compared with what a machine finds, is draw-grooves.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { directionToUv } from '../shared/sphere.js'
import { pairHue, pairPulls, readTracks } from '../shared/tracks.js'
import { apartKm, bearingDeg, localBearings } from './lib/bearing.js'
import { fabricWindow, windowFromEnv, type Colour } from './lib/window-map.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

function main() {
  const window = windowFromEnv()
  const budget = Number(process.env.PAIRS ?? 8)

  const decoded = jpeg.decode(readFileSync(resolve(DATA, 'fabric.jpg')), { useTArray: true })
  const canvas = fabricWindow(window, {
    width: decoded.width,
    height: decoded.height,
    at: (column, row) => decoded.data[(row * decoded.width + column) * 4],
  })

  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  const dirs = new Float32Array(mesh.buffer, mesh.byteOffset + 16, vertexCount * 3)
  const trackFile = readFileSync(resolve(DATA, 'tracks.bin'))
  const tracks = readTracks(
    trackFile.buffer.slice(
      trackFile.byteOffset, trackFile.byteOffset + trackFile.byteLength,
    ) as ArrayBuffer,
  )

  /** Where a stored point sits today. */
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

  // Pairs with both ends in the window, spread over the ages they cover so the
  // easy young ones and the hard old ones are both up for judgement.
  const here: { i: number; age: number }[] = []
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
    if (canvas.inside(a) && canvas.inside(b)) here.push({ i, age: tracks.pairAgeMa[i] })
  }
  here.sort((p, q) => p.age - q.age)
  const stride = Math.max(1, Math.round(here.length / budget))
  const chosen = here.filter((_, n) => n % stride === 0).slice(0, budget)

  console.log(
    `[fabric] ${window.lonFrom}..${window.lonTo} lon, ${window.latFrom}..${window.latTo} lat  `
      + `${here.length} pairs have both ends in the window; drawing ${chosen.length}`,
  )
  /**
   * What the neighbours think the bearing should be, over every pair on Earth.
   *
   * Not only the ones in the window: a pair on its edge has half its
   * neighbourhood outside, and cutting that off would give it a lopsided
   * opinion of the local bearing. See tools/lib/bearing.ts for what this is
   * worth -- which, since one reader's verdicts contradicted it, is not much.
   */
  const bearings = localBearings(
    Array.from({ length: tracks.pairAgeMa.length }, (_, i) => {
      const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
      const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
      return { at: a, bearing: bearingDeg(a, b) }
    }),
  )

  console.log(
    '  no   age    A (lon, lat)        B (lon, lat)       apart  bearing  local  off  role',
  )
  chosen.forEach(({ i, age }, n) => {
    const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
    const colour = pairHue(i).map((c) => Math.round(255 * c)) as unknown as Colour
    const from = canvas.at(a.lon, a.lat)
    const to = canvas.at(b.lon, b.lat)
    canvas.line(from, to, colour)
    canvas.ring(from, colour)
    canvas.ring(to, colour)
    canvas.label(String(n + 1), from.px + 12, from.py - 18, colour)
    const { local, off } = bearings[i]
    console.log(
      `  ${String(n + 1).padStart(2)}  ${age.toFixed(0).padStart(4)} Ma  `
        + `${a.lon.toFixed(1).padStart(6)}, ${a.lat.toFixed(1).padStart(5)}   `
        + `${b.lon.toFixed(1).padStart(6)}, ${b.lat.toFixed(1).padStart(5)}   `
        + `${apartKm(a, b).toFixed(0).padStart(5)} km  `
        + `${bearingDeg(a, b).toFixed(0).padStart(4)}   `
        + `${(Number.isNaN(local) ? '--' : local.toFixed(0)).padStart(4)}  `
        + `${(Number.isNaN(off) ? '--' : off.toFixed(0)).padStart(3)}  `
        + `${pairPulls(tracks, i) ? 'pulls' : 'scores'}`,
    )
  })

  console.log(`[fabric] ${canvas.write(resolve(OUT, 'fabric-pairs.png'))}`)
}

main()
