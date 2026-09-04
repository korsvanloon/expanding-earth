/**
 * The paths and their pairs, drawn the way a reader drew them by hand.
 *
 * A reader sketched what they wanted over a fabric window: a path running from
 * one flank, through the ridge, to the other flank; the point where the two
 * halves were one point marked in red; and the pairs along it as two circles
 * of one colour each. That is exactly what a flow track is, so this draws the
 * real ones in that form -- against the sketch, so the answer to "is this what
 * you had in mind" can be given by looking rather than by reading numbers.
 *
 *     LON=-40,5 LAT=-45,-5 SCALE=3 BASE=age tsx tools/draw-paths.ts
 *
 * BASE=age puts the sea floor's age underneath, which is the base a path can be
 * judged against: a path should run square to the age bands, since that is what
 * spreading means. BASE=fabric puts the crustal fabric there instead, which is
 * the base a *groove* is judged against. Neither is decoration: they answer
 * different questions and the one to pick is the question being asked.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { directionToUv } from '../shared/sphere.js'
import { pairHue, readTracks } from '../shared/tracks.js'
import { loadAgeGrid } from './lib/agegrid.js'
import { ageWindow, fabricWindow, windowFromEnv, type Canvas, type Colour } from './lib/window-map.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

async function main() {
  const window = windowFromEnv()

  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  const dirs = new Float32Array(mesh.buffer, mesh.byteOffset + 16, vertexCount * 3)
  const file = readFileSync(resolve(DATA, 'tracks.bin'))
  const tracks = readTracks(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer,
  )

  /** Where a stored point sits today, as longitude and latitude. */
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

  let canvas: Canvas
  if (process.env.BASE === 'fabric') {
    const decoded = jpeg.decode(readFileSync(resolve(DATA, 'fabric.jpg')), { useTArray: true })
    canvas = fabricWindow(window, {
      width: decoded.width,
      height: decoded.height,
      at: (column, row) => decoded.data[(row * decoded.width + column) * 4],
    })
  } else {
    canvas = ageWindow(window, await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc')))
  }

  // The paths first, so the circles sit on top of their own line.
  let drawn = 0
  let inside = 0
  for (let t = 0; t + 1 < tracks.offsets.length; t++) {
    const from = tracks.offsets[t]
    const to = tracks.offsets[t + 1]
    let seen = false
    for (let i = from + 1; i < to; i++) {
      const a = place(tracks.pointVerts, tracks.pointWeights, i - 1)
      const b = place(tracks.pointVerts, tracks.pointWeights, i)
      // A step across the date line would otherwise be drawn right across the
      // map; the path is real, the line joining its two ends on paper is not.
      if (Math.abs(b.lon - a.lon) > 90) continue
      if (!canvas.inside(a) && !canvas.inside(b)) continue
      seen = true
      for (const lift of [-1, 0, 1]) {
        const at = canvas.at(a.lon, a.lat)
        const on = canvas.at(b.lon, b.lat)
        canvas.line({ px: at.px, py: at.py + lift }, { px: on.px, py: on.py + lift },
          [236, 72, 200])
      }
    }
    if (seen) drawn++
    // The coincidence point: where this path's two halves were one point, and
    // the one circle on it that is not half of a pair.
    const ridge = place(tracks.pointVerts, tracks.pointWeights, tracks.ridge[t])
    if (canvas.inside(ridge)) {
      inside++
      const at = canvas.at(ridge.lon, ridge.lat)
      // Ringed in near-black and drawn larger, not merely red: the pair palette
      // is a golden-angle sweep of hue and produces reds of its own, so colour
      // alone had the one point that is *not* half of a pair looking like one
      // -- and a reader would have read coincidence points as scattered off the
      // ridges, which is the opposite of what the picture shows.
      for (const radius of [7, 8, 9]) canvas.ring(at, [10, 10, 14], [radius])
      for (const radius of [0, 1, 2, 3, 4, 5, 6]) canvas.ring(at, [255, 40, 40], [radius])
    }
  }

  // Then the pairs, both ends of one pair in one colour, as the sketch had them.
  let pairs = 0
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
    if (!canvas.inside(a) && !canvas.inside(b)) continue
    pairs++
    const colour = pairHue(i).map((c) => Math.round(255 * c)) as unknown as Colour
    for (const point of [a, b]) {
      if (!canvas.inside(point)) continue
      const at = canvas.at(point.lon, point.lat)
      for (const radius of [0, 1, 2, 3, 4]) canvas.ring(at, colour, [radius])
    }
  }

  console.log(
    `[paths] ${drawn} of ${tracks.offsets.length - 1} paths cross the window, `
      + `${inside} coincidence points in it, ${pairs} pairs`,
  )
  console.log(`[paths] ${canvas.write(resolve(OUT, 'paths.png'))}`)
}

await main()
