import { R0_KM, sampleCurve, type Meta } from '@shared/model'

export interface Dataset {
  meta: Meta
  /** Present-day unit direction per vertex; the crust's identity, never moves. */
  dirs: Float32Array
  indices: Uint32Array
  /** When each vertex's crust came into existence, Ma. */
  vertexAge: Float32Array
  /** Reconstructed unit directions: frameCount x vertexCount x 3, quantised. */
  frames: Int16Array
  /** Per-vertex strain, one byte per vertex per frame. */
  strain: Uint8Array
  radiusKm: number[]
}

export async function loadDataset(): Promise<Dataset> {
  const [meta, mesh, frames, strain] = await Promise.all([
    fetch('data/meta.json').then((r) => r.json() as Promise<Meta>),
    fetch('data/mesh.bin').then((r) => r.arrayBuffer()),
    fetch('data/frames.bin').then((r) => r.arrayBuffer()),
    fetch('data/strain.bin').then((r) => r.arrayBuffer()),
  ])

  const [vertexCount, faceCount] = new Uint32Array(mesh, 0, 2)
  let offset = 8
  const dirs = new Float32Array(mesh, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(mesh, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(mesh, offset, faceCount)

  // A vertex exists as long as any triangle around it does, so it takes the
  // oldest age of its neighbours. Interpolating this across a triangle gives a
  // soft edge where new crust appears, which reads better than a hard sawtooth.
  const vertexAge = new Float32Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    const age = faceAges[f]
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (age > vertexAge[v]) vertexAge[v] = age
    }
  }

  return {
    meta,
    dirs,
    indices,
    vertexAge,
    frames: new Int16Array(frames),
    strain: new Uint8Array(strain),
    radiusKm: meta.crustModels[0].radiusKm,
  }
}

export const radiusAt = (data: Dataset, timeMa: number) =>
  sampleCurve(data.radiusKm, timeMa, data.meta.radiusStepMa)

/**
 * Write the reconstruction at `timeMa` into the render buffers.
 *
 * Keyframes are 5 Myr apart, so we interpolate. Directions are normalised after
 * mixing rather than mixed as points: on a sphere the straight line between two
 * positions cuts under the surface, and over a 5 Myr step that shows up as a
 * visible dent. Radius is applied afterwards, scaled so that today's Earth is
 * one unit and the growth is what you see.
 */
export function sampleFrame(
  data: Dataset,
  timeMa: number,
  positions: Float32Array,
  strain: Float32Array,
) {
  const { meta, frames } = data
  const vertexCount = meta.vertexCount
  const x = Math.min(Math.max(timeMa / meta.frameStepMa, 0), meta.frameCount - 1)
  const i0 = Math.min(Math.floor(x), meta.frameCount - 1)
  const i1 = Math.min(i0 + 1, meta.frameCount - 1)
  const f = x - i0
  const radius = radiusAt(data, timeMa) / R0_KM

  const a = i0 * vertexCount * 3
  const b = i1 * vertexCount * 3
  const sa = i0 * vertexCount
  const sb = i1 * vertexCount
  const k = 1 / 32767

  for (let i = 0; i < vertexCount; i++) {
    const j = i * 3
    const ax = frames[a + j] * k, ay = frames[a + j + 1] * k, az = frames[a + j + 2] * k
    const bx = frames[b + j] * k, by = frames[b + j + 1] * k, bz = frames[b + j + 2] * k
    let vx = ax + (bx - ax) * f
    let vy = ay + (by - ay) * f
    let vz = az + (bz - az) * f
    const length = Math.hypot(vx, vy, vz) || 1
    const s = radius / length
    positions[j] = vx * s
    positions[j + 1] = vy * s
    positions[j + 2] = vz * s
    const s0 = data.strain[sa + i]
    const s1 = data.strain[sb + i]
    strain[i] = ((s0 + (s1 - s0) * f) / 127.5 - 1) * 0.2
  }
}
