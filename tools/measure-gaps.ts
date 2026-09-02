/**
 * Where the bare sky is, and whose margin it is against.
 *
 * The coverage figure says *how much* of the sphere no surviving crust covers.
 * It has never said *where*, and a reader looking at 40 Ma could: enormous gaps
 * off South America. This answers it in the same words -- probe directions with
 * no crust over them, clustered, and named by the nearest continent whose
 * present-day margin the model tracks.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REGIONS, type Meta } from '../shared/model.js'
import { readFrames } from '../shared/frames.js'
import { readTopology, applyTopology } from '../shared/topology.js'
import { cellBuckets, coverage, probeCells, probeDirections } from './lib/coverage.js'
import { directionToUv } from '../shared/sphere.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')

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

  const framesFile = readFileSync(resolve(DATA, 'frames.bin'))
  const frames = readFrames(
    framesFile.buffer.slice(framesFile.byteOffset, framesFile.byteOffset + framesFile.byteLength),
    vertexCount,
  )
  const sinkFile = meta.folded ? readFileSync(resolve(DATA, 'sink.bin')) : null
  const sink = sinkFile
    ? new Uint8Array(sinkFile.buffer.slice(sinkFile.byteOffset, sinkFile.byteOffset + sinkFile.byteLength))
    : null
  const topoFile = readFileSync(resolve(DATA, 'topology.bin'))
  const topology = readTopology(
    topoFile.buffer.slice(topoFile.byteOffset, topoFile.byteOffset + topoFile.byteLength) as ArrayBuffer,
    faceCount,
  )

  // Which region each present-day vertex belongs to, for naming a gap.
  const regionOf = new Int32Array(vertexCount).fill(-1)
  for (let v = 0; v < vertexCount; v++) {
    const [u, w] = directionToUv(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2])
    const lat = (w - 0.5) * 180
    const lon = (u - 0.5) * 360
    for (let i = 0; i < REGIONS.length; i++) {
      const b = REGIONS[i]
      if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) {
        regionOf[v] = i
        break
      }
    }
  }

  const probes = probeDirections(Number(process.env.PROBES ?? 40000))
  const cells = probeCells(probes)
  const buckets = cellBuckets()
  const working = new Int32Array(faceCount * 3)
  const live = new Uint32Array(faceCount * 3)
  const pos = new Float64Array(vertexCount * 3)
  const alive = new Uint8Array(faceCount)

  for (const timeMa of (process.env.AT ?? '20,40,80,120,200').split(',').map(Number)) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    applyTopology(indices, topology, frame, working, live)
    const base = frame * vertexCount * 3
    for (let v = 0; v < vertexCount; v++) {
      const deep = sink ? sink[frame * vertexCount + v] / 255 : 1
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = (frames[base + v * 3 + c] / 32767) * deep
    }
    // Crust that exists at this time, in the drawn triangulation.
    for (let f = 0; f < faceCount; f++) {
      alive[f] = working[f * 3] >= 0 && faceAges[f] >= timeMa ? 1 : 0
    }
    const shell = { faceVerts: indices, faceAlive: alive }
    const seen = coverage(pos, shell, faceCount, probes, cells, buckets)

    // Re-run the probe test by hand to collect the misses. Same buckets.
    const missed: number[] = []
    for (let p = 0; p < probes.length / 3; p++) {
      let hit = false
      const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
      for (const f of buckets[cells[p]]) {
        const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3
        // Same sign test coverage uses: the probe is inside if it is on the
        // inner side of all three edge planes.
        const s1 = signOf(pos, a, b, dx, dy, dz)
        const s2 = signOf(pos, b, c, dx, dy, dz)
        const s3 = signOf(pos, c, a, dx, dy, dz)
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) { hit = true; break }
      }
      if (!hit) missed.push(p)
    }

    // Name each miss by the nearest piece of crust that does exist.
    const tally = new Map<string, number>()
    for (const p of missed) {
      const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
      let best = -1
      let bestDot = -2
      for (let v = 0; v < vertexCount; v += 7) {
        const l = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
        const dot = (pos[v * 3] * dx + pos[v * 3 + 1] * dy + pos[v * 3 + 2] * dz) / l
        if (dot > bestDot) { bestDot = dot; best = v }
      }
      const id = best >= 0 && regionOf[best] >= 0 ? REGIONS[regionOf[best]].label : 'open ocean'
      tally.set(id, (tally.get(id) ?? 0) + 1)
    }
    const total = probes.length / 3
    const rows = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 8)
    console.log(
      `${String(timeMa).padStart(4)} Ma  ${(100 * seen.gapFraction).toFixed(2)}% bare  `
      + rows.map(([k, n]) => `${k} ${(100 * n / total).toFixed(2)}%`).join('  '),
    )
  }
}

function signOf(
  pos: Float64Array, a: number, b: number, dx: number, dy: number, dz: number,
): number {
  const nx = pos[a + 1] * pos[b + 2] - pos[a + 2] * pos[b + 1]
  const ny = pos[a + 2] * pos[b] - pos[a] * pos[b + 2]
  const nz = pos[a] * pos[b + 1] - pos[a + 1] * pos[b]
  return nx * dx + ny * dy + nz * dz
}

main()
