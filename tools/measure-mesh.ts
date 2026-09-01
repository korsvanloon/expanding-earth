/**
 * How much of what the globe paints at a given time is crust that is gone.
 *
 * A reader watching the East Pacific Rise close from today back to 38 Ma saw
 * the ridge still there in the middle, growing and blurring as the triangles
 * around it grew: "eigenlijk zou het midden helemaal verdwenen moeten zijn."
 *
 * The mesh does remove it -- an edge collapse merges two points and drops the
 * two triangles along it -- but the triangles left behind bridge the seam, and
 * each one still carries its corners' *present-day* directions. The fragment
 * shader interpolates between them, so the inside of a bridging triangle is
 * painted with every scrap of sea floor that used to lie between its corners,
 * including the ridge. The crust is gone from the model and still on the
 * picture.
 *
 * This measures the size of that: per frame, how far apart a triangle's corners
 * are on today's Earth against how big the triangle actually is, and what share
 * of the visible sphere is painted by triangles stretched past a given factor.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyTopology, readTopology } from '../shared/topology.js'
import { R0_KM, sampleCurve, type Meta } from '../shared/model.js'
import { seamReach } from '../shared/seams.js'

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
  const topology = read('topology.bin')

  const [vertexCount, faceCount] = new Uint32Array(mesh, 0, 4)
  const dirs = new Float32Array(mesh, 16, vertexCount * 3)
  const indices = new Uint32Array(mesh, 16 + vertexCount * 12, faceCount * 3)
  const deltas = readTopology(topology, faceCount)
  const radiusKm = meta.crustModels[0].radiusKm

  const working = new Int32Array(faceCount * 3)
  const out = new Uint32Array(faceCount * 3)
  const k = 1 / 32767

  const angle = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const d = ax * bx + ay * by + az * bz
    const la = Math.hypot(ax, ay, az) || 1
    const lb = Math.hypot(bx, by, bz) || 1
    return Math.acos(Math.min(1, Math.max(-1, d / (la * lb))))
  }

  console.log('  Ma   R km   faces   median span km   p90   p99   share of area painted from crust')
  console.log('                     (on the sphere)              >100 / >300 / >1000 km away   tinted   triangles/sphere')
  for (const timeMa of [0, 13, 20, 38, 60, 90, 120, 160, 200]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    const live = applyTopology(indices, deltas, frame - 1, working, out) / 3
    const base = frame * vertexCount * 3
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)

    const spans: number[] = []
    let area = 0
    let tinted = 0
    const smeared = [0, 0, 0]
    const cuts = [100, 300, 1000]
    // The same ramp the viewer paints with, so the last column says how much of
    // the globe actually goes grey rather than how much strictly earns it. They
    // differ because the seam is carried per vertex and a vertex is shared.
    const seam = new Float32Array(vertexCount)
    for (let f = 0; f < live; f++) {
      const a = out[f * 3], b = out[f * 3 + 1], c = out[f * 3 + 2]
      // How far apart the three corners are on today's Earth: the width of the
      // strip of sea floor this one triangle is painted from.
      let span = 0
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        span = Math.max(span, angle(
          dirs[p * 3], dirs[p * 3 + 1], dirs[p * 3 + 2],
          dirs[q * 3], dirs[q * 3 + 1], dirs[q * 3 + 2],
        ) * R0_KM)
      }
      spans.push(span)
      // The triangle's own area at this time, on a sphere of this radius.
      const px = frames[base + a * 3] * k, py = frames[base + a * 3 + 1] * k, pz = frames[base + a * 3 + 2] * k
      const qx = frames[base + b * 3] * k, qy = frames[base + b * 3 + 1] * k, qz = frames[base + b * 3 + 2] * k
      const rx = frames[base + c * 3] * k, ry = frames[base + c * 3 + 1] * k, rz = frames[base + c * 3 + 2] * k
      const ux = qx - px, uy = qy - py, uz = qz - pz
      const vx = rx - px, vy = ry - py, vz = rz - pz
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
      const faceArea = 0.5 * Math.hypot(cx, cy, cz) * radius * radius
      area += faceArea
      for (let i = 0; i < cuts.length; i++) if (span > cuts[i]) smeared[i] += faceArea
      const r = seamReach(span)
      if (r > seam[a]) seam[a] = r
      if (r > seam[b]) seam[b] = r
      if (r > seam[c]) seam[c] = r
    }
    // Second pass, now that every vertex knows the widest triangle around it:
    // a fragment's tint is the barycentric blend of its corners', so the mean
    // of the three is the face's share.
    for (let f = 0; f < live; f++) {
      const a = out[f * 3], b = out[f * 3 + 1], c = out[f * 3 + 2]
      const px = frames[base + a * 3] * k, py = frames[base + a * 3 + 1] * k, pz = frames[base + a * 3 + 2] * k
      const qx = frames[base + b * 3] * k, qy = frames[base + b * 3 + 1] * k, qz = frames[base + b * 3 + 2] * k
      const rx = frames[base + c * 3] * k, ry = frames[base + c * 3 + 1] * k, rz = frames[base + c * 3 + 2] * k
      const ux = qx - px, uy = qy - py, uz = qz - pz
      const vx = rx - px, vy = ry - py, vz = rz - pz
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
      tinted += 0.5 * Math.hypot(cx, cy, cz) * radius * radius
        * ((seam[a] + seam[b] + seam[c]) / 3)
    }
    spans.sort((x, y) => x - y)
    const q = (p: number) => spans[Math.min(spans.length - 1, Math.floor(p * spans.length))]
    console.log(
      `${String(timeMa).padStart(4)} ${radius.toFixed(0).padStart(6)} ${String(live).padStart(7)}`
      + `${q(0.5).toFixed(0).padStart(10)}${q(0.9).toFixed(0).padStart(7)}`
      + `${q(0.99).toFixed(0).padStart(7)}   `
      + smeared.map((s) => `${(100 * s / area).toFixed(1)}%`).join('  ')
      + `   ${(100 * tinted / area).toFixed(1)}%`
      + `   ${(100 * area / (4 * Math.PI * radius * radius)).toFixed(1)}%`,
    )
  }
}

main()
