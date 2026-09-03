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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { directionToUv } from '../shared/sphere.js'
import { pairHue, pairPulls, readTracks } from '../shared/tracks.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

/** Three by five, which is the smallest a digit can be and stay a digit. */
const DIGITS: Record<string, string> = {
  0: '111101101101111', 1: '010010010010010', 2: '111001111100111',
  3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001001',
}

/** The globe's own fabric ramp, so the window looks like the view it came from. */
function fabricColour(encoded: number): [number, number, number] {
  if (encoded < 1) return [51, 51, 56]
  const t = Math.min(1, Math.max(0, (encoded - 1) / 254))
  const quiet = [23, 28, 41]
  const middle = [74, 107, 140]
  const busy = [247, 222, 158]
  const mix = (a: number[], b: number[], f: number) =>
    [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  const c = t < 0.55 ? mix(quiet, middle, t / 0.55) : mix(middle, busy, (t - 0.55) / 0.45)
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
}

function main() {
  const [lonFrom, lonTo] = (process.env.LON ?? '-50,-5').split(',').map(Number)
  const [latFrom, latTo] = (process.env.LAT ?? '0,45').split(',').map(Number)
  const scale = Number(process.env.SCALE ?? 2)
  const budget = Number(process.env.PAIRS ?? 8)

  const fabric = jpeg.decode(readFileSync(resolve(DATA, 'fabric.jpg')), { useTArray: true })
  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  const dirs = new Float32Array(mesh.buffer, mesh.byteOffset + 16, vertexCount * 3)
  const trackFile = readFileSync(resolve(DATA, 'tracks.bin'))
  const tracks = readTracks(
    trackFile.buffer.slice(
      trackFile.byteOffset, trackFile.byteOffset + trackFile.byteLength,
    ) as ArrayBuffer,
  )

  // The window, in the fabric's own cells, then blown up so a join is not one
  // pixel wide on the thing it is supposed to be judged against.
  const cellsX = Math.round(((lonTo - lonFrom) / 360) * fabric.width)
  const cellsY = Math.round(((latTo - latFrom) / 180) * fabric.height)
  const width = cellsX * scale
  const height = cellsY * scale
  const png = new PNG({ width, height })
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const at = (y * width + x) * 4
    png.data[at] = r
    png.data[at + 1] = g
    png.data[at + 2] = b
    png.data[at + 3] = 255
  }
  for (let y = 0; y < height; y++) {
    const lat = latTo - ((y + 0.5) / height) * (latTo - latFrom)
    const row = Math.min(fabric.height - 1, Math.floor(((90 - lat) / 180) * fabric.height))
    for (let x = 0; x < width; x++) {
      const lon = lonFrom + ((x + 0.5) / width) * (lonTo - lonFrom)
      const column = ((Math.floor(((lon + 180) / 360) * fabric.width) % fabric.width)
        + fabric.width) % fabric.width
      const [r, g, b] = fabricColour(fabric.data[(row * fabric.width + column) * 4])
      put(x, y, r, g, b)
    }
  }

  /** Where a stored point sits today, as this window's pixels and as lon/lat. */
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
    const lon = (u - 0.5) * 360
    const lat = (v - 0.5) * 180
    return {
      lon,
      lat,
      px: ((lon - lonFrom) / (lonTo - lonFrom)) * width,
      py: ((latTo - lat) / (latTo - latFrom)) * height,
    }
  }
  const inside = (p: { lon: number; lat: number }) =>
    p.lon >= lonFrom && p.lon <= lonTo && p.lat >= latFrom && p.lat <= latTo

  const line = (
    from: { px: number; py: number }, to: { px: number; py: number },
    r: number, g: number, b: number,
  ) => {
    const dx = to.px - from.px
    const dy = to.py - from.py
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(from.px + (dx * s) / steps)
      const y = Math.round(from.py + (dy * s) / steps)
      put(x, y, r, g, b)
      put(x, y - 1, r, g, b)
    }
  }
  const ring = (at: { px: number; py: number }, r: number, g: number, b: number) => {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * 2 * Math.PI
      for (const radius of [5, 6]) {
        put(Math.round(at.px + Math.cos(t) * radius), Math.round(at.py + Math.sin(t) * radius),
          r, g, b)
      }
    }
  }
  const label = (
    text: string, atX: number, atY: number, r: number, g: number, b: number, size = 5,
  ) => {
    let x = atX
    for (const ch of text) {
      const bits = DIGITS[ch]
      if (bits) {
        for (let row = 0; row < 5; row++) {
          for (let column = 0; column < 3; column++) {
            if (bits[row * 3 + column] !== '1') continue
            for (let dy = 0; dy < size; dy++) {
              for (let dx = 0; dx < size; dx++) {
                put(x + column * size + dx, atY + row * size + dy, r, g, b)
              }
            }
          }
        }
      }
      x += 4 * size
    }
  }

  // Pairs with both ends in the window, spread over the ages they cover so the
  // easy young ones and the hard old ones are both up for judgement.
  const here: { i: number; age: number }[] = []
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
    if (inside(a) && inside(b)) here.push({ i, age: tracks.pairAgeMa[i] })
  }
  here.sort((p, q) => p.age - q.age)
  const stride = Math.max(1, Math.round(here.length / budget))
  const chosen = here.filter((_, n) => n % stride === 0).slice(0, budget)

  console.log(
    `[fabric] ${lonFrom}..${lonTo} lon, ${latFrom}..${latTo} lat  `
      + `${here.length} pairs have both ends in the window; drawing ${chosen.length}`,
  )
  console.log('  no   age    A (lon, lat)        B (lon, lat)       apart   pulls?')
  /** Where a number has already been put, so the next one can dodge it. */
  const placed: { x: number; y: number }[] = []
  chosen.forEach(({ i, age }, n) => {
    const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
    const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
    const [r, g, blue] = pairHue(i).map((c) => Math.round(255 * c))
    line(a, b, r, g, blue)
    ring(a, r, g, blue)
    ring(b, r, g, blue)
    const name = String(n + 1)
    // On the join's midpoint, nudged clear of it, with a dark backing so a
    // number over bright fabric is still a number.
    // Beside the first end rather than in the middle of the join, pushed clear
    // of any label already placed: two pairs that nearly coincide had put their
    // numbers on top of each other, which is the one thing a numbered picture
    // may not do.
    let mx = Math.round(a.px) + 12
    let my = Math.round(a.py) - 18
    const wide = name.length * 20 + 8
    while (placed.some((q) => Math.abs(q.x - mx) < wide && Math.abs(q.y - my) < 34)) my += 34
    placed.push({ x: mx, y: my })
    if (my > height - 40) { my = Math.round(a.py) - 18; mx += wide }
    for (let by = -4; by < 29; by++) {
      for (let bx = -4; bx < wide - 4; bx++) put(mx + bx, my + by, 14, 16, 20)
    }
    label(name, mx, my, r, g, blue)
    const apart = Math.acos(Math.max(-1, Math.min(1,
      Math.sin((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180)
      + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180)
        * Math.cos(((a.lon - b.lon) * Math.PI) / 180)))) * 6371
    console.log(
      `  ${String(n + 1).padStart(2)}  ${age.toFixed(0).padStart(4)} Ma  `
        + `${a.lon.toFixed(1).padStart(6)}, ${a.lat.toFixed(1).padStart(5)}   `
        + `${b.lon.toFixed(1).padStart(6)}, ${b.lat.toFixed(1).padStart(5)}   `
        + `${apart.toFixed(0).padStart(5)} km  ${pairPulls(tracks, i) ? 'pulls' : 'scores'}`,
    )
  })

  mkdirSync(OUT, { recursive: true })
  const file = resolve(OUT, 'fabric-pairs.png')
  writeFileSync(file, PNG.sync.write(png))
  console.log(`[fabric] ${width}x${height} -> ${file}`)
}

main()
