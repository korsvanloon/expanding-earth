/**
 * How much deformation the data actually asks for, against how much the run
 * performs.
 *
 * A reader put the model's own principle sharply: *we weten de oppervlakte en
 * hoeveel korst er op moet. alles wat er niet op moet klapt naar binnen, en
 * misschien is er een klein beetje te veel korst voor de radius vanwege
 * incomplete data. die delta mag vervormen.* The crust should **move**. Only
 * the mismatch between what the sphere can hold and what the crust measures is
 * allowed to squash, and that mismatch is knowable in advance -- it comes out
 * of the age grid and the radius curve, with no reconstruction involved.
 *
 * So this computes it. For each frame:
 *
 * - **available** is the sphere at that radius, 4 pi R(t)^2. The radius is
 *   itself derived from the age grid, so this is not an independent number.
 * - **demanded** is the rest area of every triangle whose crust exists, with
 *   the same un-stretching correction the solver applies to rifted margins.
 * - **the budget** is the difference. It exists only because the two are
 *   computed from the same data by different routes: the radius from the
 *   raster at 8192x4096, the demand from 81,920 triangles, and 2.8% of the
 *   grid is undated and treated as crust that was always there.
 *
 * Then, from the run on disk, what the reconstruction actually deforms. The
 * gap between the two is the number this direction is aiming at.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERMANENT_MA, R0_KM, sampleCurve, type Meta } from '../shared/model.js'
import { readChannel, readFrames } from '../shared/frames.js'
import { unstretching } from './lib/unstretching.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')

function solid(pos: ArrayLike<number>, a: number, b: number, c: number): number {
  const la = Math.hypot(pos[a], pos[a + 1], pos[a + 2]) || 1
  const lb = Math.hypot(pos[b], pos[b + 1], pos[b + 2]) || 1
  const lc = Math.hypot(pos[c], pos[c + 1], pos[c + 2]) || 1
  const ax = pos[a] / la, ay = pos[a + 1] / la, az = pos[a + 2] / la
  const bx = pos[b] / lb, by = pos[b + 1] / lb, bz = pos[b + 2] / lb
  const cx = pos[c] / lc, cy = pos[c + 1] / lc, cz = pos[c + 2] / lc
  const num = Math.abs(ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx))
  const den = 1 + (ax * bx + ay * by + az * bz)
    + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az)
  return 2 * Math.atan2(num, den)
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
  off += faceCount * 4
  const rigidity = new Float32Array(mesh.buffer, off, faceCount)
  off += faceCount * 4
  const thickness = new Float32Array(mesh.buffer, off, faceCount)
  const crustType = new Uint8Array(
    mesh.buffer,
    mesh.byteOffset + 16 + vertexCount * 12 + faceCount * 12 + faceCount * 12
      + vertexCount * 8 + vertexCount * 4 + faceCount * 2 + vertexCount * 2,
    faceCount,
  )

  const read = (name: string) => {
    const f = readFileSync(resolve(DATA, name))
    return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
  }
  const frames = readFrames(read('frames.bin'), vertexCount)
  const sink = meta.folded ? readChannel(read('sink.bin'), vertexCount) : null

  const { stretch, riftMa } = unstretching(
    thickness, faceAges, rigidity, faceCount, indices, crustType,
  )
  const stretchAt = (f: number, t: number) =>
    1 + (stretch[f] - 1) * (riftMa[f] > 0 ? Math.min(1, t / riftMa[f]) : 0)

  const restArea = new Float64Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    restArea[f] = solid(dirs, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3)
      * R0_KM * R0_KM
  }

  const radius = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  const pos = new Float64Array(vertexCount * 3)
  const M = 1e6

  console.log(
    '  Ma      available    demanded     budget        squeezed   stretched   '
    + 'deformed   over budget',
  )
  for (let frame = 0; frame < meta.frameCount; frame++) {
    const timeMa = frame * meta.frameStepMa
    if (timeMa % 20 !== 0) continue
    const r = sampleCurve(radius, timeMa, meta.radiusStepMa)
    const available = 4 * Math.PI * r * r
    const base = frame * vertexCount * 3
    for (let v = 0; v < vertexCount; v++) {
      const deep = sink ? sink[frame * vertexCount + v] / 255 : 1
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = (frames[base + v * 3 + c] / 32767) * deep
    }
    let demanded = 0
    let squeezed = 0
    let stretchedNow = 0
    for (let f = 0; f < faceCount; f++) {
      if (faceAges[f] < timeMa) continue
      const rest = restArea[f] / stretchAt(f, timeMa)
      demanded += rest
      const now = solid(pos, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3)
        * r * r
      if (now < rest) squeezed += rest - now
      else stretchedNow += now - rest
    }
    // What the data allows: the whole mismatch, whichever way it points.
    const budget = Math.abs(demanded - available)
    const deformed = squeezed + stretchedNow
    console.log(
      `${String(timeMa).padStart(4)}  ${(available / M).toFixed(1).padStart(9)} `
      + `${(demanded / M).toFixed(1).padStart(11)} `
      + `${(budget / M).toFixed(1).padStart(10)} (${(100 * budget / available).toFixed(2)}%) `
      + `${(squeezed / M).toFixed(1).padStart(9)} ${(stretchedNow / M).toFixed(1).padStart(11)} `
      + `${(deformed / M).toFixed(1).padStart(10)} (${(100 * deformed / available).toFixed(1)}%) `
      + `  x${(deformed / (budget || 1)).toFixed(0)}`,
    )
  }
  console.log('\n  all areas in millions of km2; PERMANENT_MA =', PERMANENT_MA)
}

main()
