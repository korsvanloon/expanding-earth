/**
 * When did each pair of islands part company, according to the age grid?
 *
 * The sea floor between two blocks is dated, so the oldest crust on the
 * shortest path from one to the other is when they were last joined. Before
 * that moment they were one piece and any overlap between them is a suture the
 * mesh cannot draw; after it, an overlap is two continents in the wrong place.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRaster } from './lib/raster.js'
import { directionToPixel } from '../shared/sphere.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')
const read = (n: string) => {
  const b = readFileSync(resolve(OUT, n))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
const mesh = read('mesh.bin')
const [vertexCount, faceCount, , cutPairCount] = new Uint32Array(mesh, 0, 4)
const dirs = new Float32Array(mesh, 16, vertexCount * 3)
let off = 16 + vertexCount * 12 + faceCount * 12 + faceCount * 12
off += vertexCount * 12 + cutPairCount * 8 + faceCount * 2
const vertexIsland = new Uint16Array(mesh, off, vertexCount)

const age = loadRaster(resolve(ROOT, 'public/textures/age-map.png'))
const MAX = 280
const ageAt = (x: number, y: number, z: number) => {
  const [c, r] = directionToPixel(x, y, z, age.width, age.height)
  const g = age.data[r * age.width + c]
  return g === 255 ? NaN : (g / 255) * MAX
}

const byIsland = new Map<number, number[]>()
for (let v = 0; v < vertexCount; v++) {
  const id = vertexIsland[v]
  if (!id) continue
  ;(byIsland.get(id) ?? byIsland.set(id, []).get(id)!).push(v)
}
// The pairs measure-islands.ts reports as overlapping, or any pair named on
// the command line as `11,12`.
const named = process.argv.slice(2).filter((a) => a.includes(','))
const want = named.length
  ? named.map((a) => a.split(',').map(Number))
  : [[11, 12], [7, 9], [9, 15], [1, 13], [4, 11]]
for (const [i, j] of want) {
  const A = byIsland.get(i) ?? []
  const B = byIsland.get(j) ?? []
  let best = -1, bp = 0, bq = 0
  for (const p of A) for (const q of B) {
    const d = dirs[p * 3] * dirs[q * 3] + dirs[p * 3 + 1] * dirs[q * 3 + 1] + dirs[p * 3 + 2] * dirs[q * 3 + 2]
    if (d > best) { best = d; bp = p; bq = q }
  }
  // Walk the great circle between the two nearest points, oldest sea floor wins.
  let oldest = 0
  let dated = 0
  const steps = 200
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const x = dirs[bp * 3] * (1 - t) + dirs[bq * 3] * t
    const y = dirs[bp * 3 + 1] * (1 - t) + dirs[bq * 3 + 1] * t
    const z = dirs[bp * 3 + 2] * (1 - t) + dirs[bq * 3 + 2] * t
    const l = Math.hypot(x, y, z) || 1
    const a = ageAt(x / l, y / l, z / l)
    if (Number.isFinite(a)) { dated++; if (a > oldest) oldest = a }
  }
  const km = Math.acos(Math.min(1, best)) * 6371
  console.log(
    `#${i}+#${j}:  ${km.toFixed(0)} km apart today; `
    + `${dated} of ${steps + 1} steps between them are dated sea floor, oldest ${oldest.toFixed(0)} Ma`
    + `  -> one block before about ${dated ? oldest.toFixed(0) : '?'} Ma`,
  )
}
