/**
 * Do the rigid islands ride over one another?
 *
 * An island of strong crust is the part of the model that is not allowed to
 * deform: a shield, a platform, a stable basin, held to its own shape while
 * everything between them gives. Two of them occupying the same piece of sky is
 * therefore not a soft failure like a bit of stretching, it is two continents
 * in the same place -- and the diagnostics could not see it. `overlapFraction`
 * counts sky covered by more than one triangle whoever it belongs to, so a
 * craton lying on a craton and a triangle overlapping its own neighbour read
 * the same, and at a tenth of a percent the number looked harmless.
 *
 * This asks the sharper question: how much of the sphere is covered by two
 * *different* islands at once, and which pairs.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTopology, readTopology } from '../shared/topology.js'
import { sampleCurve, type Meta } from '../shared/model.js'
import { bucketFace, cellBuckets, inside, probeCells, probeDirections } from './lib/coverage.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')

const read = (name: string) => {
  const b = readFileSync(resolve(OUT, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

function main() {
  const meta = JSON.parse(readFileSync(resolve(OUT, 'meta.json'), 'utf8')) as Meta
  const mesh = read('mesh.bin')
  const frames = new Int16Array(read('frames.bin'))
  const [vertexCount, faceCount, , cutPairCount] = new Uint32Array(mesh, 0, 4)
  // The island each vertex belongs to sits after the per-face arrays; see
  // loadDataset in src/data.ts for the layout.
  let offset = 16 + vertexCount * 12 + faceCount * 12 + faceCount * 4 * 3
  offset += vertexCount * 4 * 3 + cutPairCount * 8 + faceCount * 2
  const vertexIsland = new Uint16Array(mesh, offset, vertexCount)
  const indices = new Uint32Array(mesh, 16 + vertexCount * 12, faceCount * 3)
  const deltas = readTopology(read('topology.bin'), faceCount)

  const working = new Int32Array(faceCount * 3)
  const out = new Uint32Array(faceCount * 3)
  const probes = probeDirections(200000)
  const cells = probeCells(probes)
  const buckets = cellBuckets()
  const pos = new Float64Array(vertexCount * 3)
  const faceAlive = new Uint8Array(faceCount)
  const faceIsland = new Uint16Array(faceCount)

  // Islands are numbered, and a number says nothing. Name each one by where its
  // crust sits today and how big it is, so a reported overlap can be checked
  // against the globe.
  {
    const dirs0 = new Float32Array(mesh, 16, vertexCount * 3)
    const sum = new Map<number, { x: number; y: number; z: number; n: number }>()
    for (let v = 0; v < vertexCount; v++) {
      const id = vertexIsland[v]
      if (!id) continue
      const s2 = sum.get(id) ?? { x: 0, y: 0, z: 0, n: 0 }
      s2.x += dirs0[v * 3]; s2.y += dirs0[v * 3 + 1]; s2.z += dirs0[v * 3 + 2]; s2.n++
      sum.set(id, s2)
    }
    const named = [...sum.entries()].sort((a, b) => b[1].n - a[1].n)
    console.log('the islands of strong crust, by where they sit today')
    for (const [id, c] of named) {
      const l = Math.hypot(c.x, c.y, c.z) || 1
      const lon = (Math.atan2(-c.z / l, c.x / l) * 180) / Math.PI
      const lat = (Math.asin(Math.max(-1, Math.min(1, c.y / l))) * 180) / Math.PI
      console.log(`  #${String(id).padStart(2)}  ${String(c.n).padStart(5)} points`
        + `  centred ${lon.toFixed(0)}, ${lat.toFixed(0)}`)
    }
    console.log()
  }

  const foldReport: string[] = []
  const pairReport: string[] = []
  console.log('sky covered by two different islands of strong crust at once')
  console.log('  Ma   any two triangles   two islands   one is an island   worst pair')
  for (const timeMa of [0, 20, 38, 60, 90, 120, 160, 200]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    applyTopology(indices, deltas, frame - 1, working, out)
    const radius = sampleCurve(meta.crustModels[0].radiusKm, timeMa, meta.radiusStepMa)
    const base = frame * vertexCount * 3
    for (let v = 0; v < vertexCount * 3; v++) pos[v] = frames[base + v]
    for (let f = 0; f < faceCount; f++) {
      const a = working[f * 3]
      faceAlive[f] = a < 0 ? 0 : 1
      if (a < 0) { faceIsland[f] = 0; continue }
      // A face belongs to an island only if all three corners do. A face with
      // one corner outside is the island's ragged edge, and counting it would
      // make every neighbouring pair look like an overlap.
      const ia = vertexIsland[a]
      const ib = vertexIsland[working[f * 3 + 1]]
      const ic = vertexIsland[working[f * 3 + 2]]
      faceIsland[f] = ia !== 0 && ia === ib && ib === ic ? ia : 0
    }
    const tiling = { faceVerts: working, faceAlive }
    for (const list of buckets) list.length = 0
    for (let f = 0; f < faceCount; f++) if (faceAlive[f]) bucketFace(pos, tiling, f, buckets)

    let doubled = 0
    let islandDoubled = 0
    let withIsland = 0
    const pairs = new Map<string, number>()
    const unit = [0, 0, 0]
    const boundary: number[] = []
    const seen: number[] = []
    for (let p = 0; p < cells.length; p++) {
      const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
      let hits = 0
      seen.length = 0
      for (const f of buckets[cells[p]]) {
        const a = working[f * 3] * 3
        const b = working[f * 3 + 1] * 3
        const c = working[f * 3 + 2] * 3
        if (!inside(pos, a, b, c, dx, dy, dz, unit, boundary)) continue
        hits++
        const island = faceIsland[f]
        if (island && !seen.includes(island)) seen.push(island)
      }
      if (hits > 1) doubled++
      if (hits > 1 && seen.length) withIsland++
      if (seen.length > 1) {
        islandDoubled++
        seen.sort((x, y) => x - y)
        for (let i = 0; i < seen.length; i++) {
          for (let j = i + 1; j < seen.length; j++) {
            const key = `${seen[i]}+${seen[j]}`
            pairs.set(key, (pairs.get(key) ?? 0) + 1)
          }
        }
      }
    }
    // A triangle turned inside out has its outward face pointing at the core,
    // which is why it renders as a dark patch: the light is behind it. That is
    // a different failure from two triangles overlapping and worth locating,
    // not just counting.
    const dirs = new Float32Array(mesh, 16, vertexCount * 3)
    let folded = 0
    let foldedOnIsland = 0
    const where: { lon: number; lat: number; island: number }[] = []
    for (let f = 0; f < faceCount; f++) {
      if (!faceAlive[f]) continue
      const a = working[f * 3] * 3, b = working[f * 3 + 1] * 3, c = working[f * 3 + 2] * 3
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      if (nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2] >= 0) continue
      folded++
      if (faceIsland[f]) foldedOnIsland++
      if (where.length < 2000) {
        // Named by where the crust is today, which is the only name it has.
        const x = dirs[a], y = dirs[a + 1], z = dirs[a + 2]
        where.push({
          lon: (Math.atan2(-z, x) * 180) / Math.PI,
          lat: (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI,
          island: faceIsland[f],
        })
      }
    }
    foldReport.push(`${String(timeMa).padStart(4)}  ${String(folded).padStart(5)} inside out, `
      + `${String(foldedOnIsland).padStart(4)} of them on an island`
      + (where.length
        ? `; first at ${where[0].lon.toFixed(0)}, ${where[0].lat.toFixed(0)}`
        : ''))

    const worst = [...pairs.entries()].sort((a, b) => b[1] - a[1])[0]
    if (timeMa >= 120 && pairs.size) {
      pairReport.push(`${timeMa} Ma: ` + [...pairs.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${((n / cells.length) * 4 * Math.PI * radius * radius).toFixed(0)} km2`)
        .join(', '))
    }
    const areaKm2 = 4 * Math.PI * radius * radius
    console.log(
      `${String(timeMa).padStart(4)}${`${(100 * doubled / cells.length).toFixed(3)}%`.padStart(18)}`
      + `${`${(100 * islandDoubled / cells.length).toFixed(3)}%`.padStart(14)}`
      + `${`${(100 * withIsland / cells.length).toFixed(3)}%`.padStart(14)}`
      + `   ${worst
        ? `${worst[0]} over ${((worst[1] / cells.length) * areaKm2).toFixed(0)} km2`
        : 'none'}`,
    )
  }
  console.log()
  console.log('which islands are in the same place, and over how much sky')
  for (const line of pairReport) console.log(line)
  console.log()
  console.log('triangles turned inside out -- the dark patches, where the light is behind them')
  for (const line of foldReport) console.log(line)
}

main()
