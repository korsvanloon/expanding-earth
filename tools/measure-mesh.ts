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
  // When the crust under each triangle came into existence, Ma. A live face
  // whose age is below the frame time is a triangle of sea floor that has not
  // erupted yet -- crust the model is drawing before it exists.
  const faceAge = new Float32Array(mesh, 16 + vertexCount * 12 + faceCount * 12, faceCount)
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

  /**
   * How far a triangle is from the size and shape it has today.
   *
   * The span above says which crust a triangle is painted from; this says what
   * the solver has done to the triangle itself. A reader watching the mesh
   * noticed some triangles growing very large while others stayed small, which
   * is not something an area-conserving shell should do to itself.
   *
   * Reported as the ratio of a face's area now to its area today, corrected for
   * the sphere having shrunk -- so 1.00 is a triangle carrying exactly its own
   * crust and nothing has to be read against the radius.
   */
  const restArea = new Float64Array(faceCount)
  {
    const area = (a: number, b: number, c: number, p: ArrayLike<number>, scale: number) => {
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2]
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2]
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
      return 0.5 * Math.hypot(cx, cy, cz) * scale * scale
    }
    for (let f = 0; f < faceCount; f++) {
      restArea[f] = area(
        indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3, dirs, R0_KM,
      )
    }
    console.log('how far each triangle is from its own size today')
    console.log('  Ma      p10    p25   median    p75    p90    p99')
    for (const timeMa of [0, 38, 60, 90, 120, 160, 200]) {
      const frame = Math.round(timeMa / meta.frameStepMa)
      if (frame >= meta.frameCount) continue
      applyTopology(indices, deltas, frame, working, out)
      const base = frame * vertexCount * 3
      const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
      const ratios: number[] = []
      for (let f = 0; f < faceCount; f++) {
        if (working[f * 3] < 0 || restArea[f] <= 0) continue
        const a = working[f * 3] * 3, b = working[f * 3 + 1] * 3, c = working[f * 3 + 2] * 3
        ratios.push(area(a, b, c, frames.subarray(base), radius / 32767) / restArea[f])
      }
      ratios.sort((x, y) => x - y)
      const q = (p: number) => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))]
      console.log(
        `${String(timeMa).padStart(4)}${q(0.1).toFixed(2).padStart(9)}${q(0.25).toFixed(2).padStart(7)}`
        + `${q(0.5).toFixed(2).padStart(9)}${q(0.75).toFixed(2).padStart(7)}`
        + `${q(0.9).toFixed(2).padStart(7)}${q(0.99).toFixed(2).padStart(7)}`,
      )
    }
    console.log()
  }

  console.log('  Ma   R km   faces   median span km   p90   p99   share of area painted from crust')
  console.log('                     (on the sphere)              >100 / >300 / >1000 km away   tinted   tri/sphere   not yet erupted')
  for (const timeMa of [0, 13, 20, 38, 60, 90, 120, 160, 200]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    // applyTopology compacts the live faces into `out`, so out's slot f is not
    // face f -- reading faceAge[f] against it lines a triangle up with another
    // triangle's age, which is how a first pass at this reported that 63% of
    // the shell at 200 Ma had not erupted yet. `working` keeps every face in
    // its own slot, with -1 for the ones that are gone.
    // Delta i is the change that arrives *at* frame i -- record(0) pushes an
    // empty one -- so the topology at a frame is every delta up to and
    // including it. This read frame - 1 and was quietly a frame behind.
    applyTopology(indices, deltas, frame, working, out)
    const base = frame * vertexCount * 3
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)

    const spans: number[] = []
    let area = 0
    let tinted = 0
    let unborn = 0
    let unbornFaces = 0
    const smeared = [0, 0, 0]
    const cuts = [100, 300, 1000]
    // The same ramp the viewer paints with, so the last column says how much of
    // the globe actually goes grey rather than how much strictly earns it. They
    // differ because the seam is carried per vertex and a vertex is shared.
    const seam = new Float32Array(vertexCount)
    let live = 0
    for (let f = 0; f < faceCount; f++) {
      const a = working[f * 3], b = working[f * 3 + 1], c = working[f * 3 + 2]
      if (a < 0) continue
      live++
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
      if (faceAge[f] < timeMa) { unborn += faceArea; unbornFaces++ }
      const r = seamReach(span)
      if (r > seam[a]) seam[a] = r
      if (r > seam[b]) seam[b] = r
      if (r > seam[c]) seam[c] = r
    }
    // Second pass, now that every vertex knows the widest triangle around it:
    // a fragment's tint is the barycentric blend of its corners', so the mean
    // of the three is the face's share.
    for (let f = 0; f < faceCount; f++) {
      const a = working[f * 3], b = working[f * 3 + 1], c = working[f * 3 + 2]
      if (a < 0) continue
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
      + `   ${(100 * area / (4 * Math.PI * radius * radius)).toFixed(1)}%`
      + `   ${(100 * unborn / area).toFixed(1)}% (${unbornFaces})`,
    )
  }
}

main()
