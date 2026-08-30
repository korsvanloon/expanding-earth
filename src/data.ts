import { R0_KM, sampleCurve, type Meta } from '@shared/model'
import type { InlineData } from '@/assets'
import { asset, inlineData } from '@/assets'

export interface Dataset {
  meta: Meta
  /**
   * Vertices in the cut mesh, read from mesh.bin rather than taken from the
   * metadata. The mesh file is the authority on its own shape: cutting the
   * shell into fragments duplicates vertices, so a count computed anywhere
   * earlier is a count of a different mesh.
   */
  vertexCount: number
  /** Present-day unit direction per vertex; the crust's identity, never moves. */
  dirs: Float32Array
  indices: Uint32Array
  /** When each vertex's crust came into existence, Ma. */
  vertexAge: Float32Array
  /** Reconstructed unit directions: frameCount x vertexCount x 3, quantised. */
  frames: Int16Array
  /** Per-vertex strain, one byte per vertex per frame. */
  strain: Uint8Array
  /**
   * Which plate each vertex belonged to, one byte per vertex per frame.
   *
   * Measured rather than assumed, and different at every frame: a plate here is
   * a patch of the Earth whose points turned out to be moving as one rigid
   * body, found by fitting rotations to the answer. Nothing was declared a
   * plate before the run. See findPlates in tools/solve.ts.
   */
  plates: Uint8Array
  /** Which island of strong crust each vertex belongs to; 0 for none. */
  islands: Uint16Array
  /** How strongly the crust at each vertex resists deformation. */
  rigidity: Float32Array
  /** Crustal thickness in km at each vertex, from ECM1. */
  thickness: Float32Array
  /** Crustal type index at each vertex; see shared/crust.ts CRUST_TYPES. */
  crustType: Uint8Array
  radiusKm: number[]
}

export async function loadDataset(): Promise<Dataset> {
  const inline = inlineData()
  const { meta, mesh, frames, strain, plates } = inline ? await inline : await fetchDataset()

  const [vertexCount, faceCount, , cutPairCount] = new Uint32Array(mesh, 0, 4)
  let offset = 16
  const dirs = new Float32Array(mesh, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(mesh, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  const rigidity = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  const faceThickness = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  offset += vertexCount * 4 // origin vertex, needed only by the solver
  offset += cutPairCount * 8 // fracture constraints, needed only by the solver
  offset += faceCount * 2 // per-face fragment, unused
  // Which island of strong crust each vertex belongs to, 0 for none. These are
  // an input to the reconstruction rather than a reading of it: the shields,
  // platforms and stable basins that are held to their own shape while
  // everything between them is free.
  const vertexIsland = new Uint16Array(mesh, offset, vertexCount)
  offset += vertexCount * 2
  const faceCrustType = new Uint8Array(mesh, offset, faceCount)

  // A vertex exists as long as any triangle around it does, so it takes the
  // oldest age of its neighbours. Interpolating this across a triangle gives a
  // soft edge where new crust appears, which reads better than a hard sawtooth.
  const vertexAge = new Float32Array(vertexCount)
  const vertexRigidity = new Float32Array(vertexCount)
  const vertexThickness = new Float32Array(vertexCount)
  // A vertex takes the weakest crust it touches: a fault runs through the weak
  // side of a contact, not the strong one.
  const vertexType = new Uint8Array(vertexCount)
  const weakest = new Float32Array(vertexCount).fill(Infinity)
  const share = new Float32Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    const age = faceAges[f]
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (age > vertexAge[v]) vertexAge[v] = age
      vertexRigidity[v] += rigidity[f]
      vertexThickness[v] += faceThickness[f]
      if (rigidity[f] < weakest[v]) {
        weakest[v] = rigidity[f]
        vertexType[v] = faceCrustType[f]
      }
      share[v]++
    }
  }
  for (let v = 0; v < vertexCount; v++) {
    if (!share[v]) continue
    vertexRigidity[v] /= share[v]
    vertexThickness[v] /= share[v]
  }

  return {
    meta,
    vertexCount,
    dirs,
    indices,
    vertexAge,
    frames: new Int16Array(frames),
    strain: new Uint8Array(strain),
    plates: new Uint8Array(plates),
    islands: vertexIsland,
    rigidity: vertexRigidity,
    thickness: vertexThickness,
    crustType: vertexType,
    radiusKm: meta.crustModels[0].radiusKm,
  }
}

async function fetchDataset(): Promise<InlineData> {
  const [meta, mesh, frames, strain, plates] = await Promise.all([
    fetch(asset('data/meta.json')).then((r) => r.json() as Promise<Meta>),
    fetch(asset('data/mesh.bin')).then((r) => r.arrayBuffer()),
    fetch(asset('data/frames.bin')).then((r) => r.arrayBuffer()),
    fetch(asset('data/strain.bin')).then((r) => r.arrayBuffer()),
    fetch(asset('data/plates.bin')).then((r) => r.arrayBuffer()),
  ])
  return { meta, mesh, frames, strain, plates }
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
  /** Per-frame 3x3 rotations that hold one continent still; see src/frames.ts. */
  reference?: Float32Array,
) {
  const { meta, frames, vertexCount } = data
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
    // Each keyframe is rotated into the reference frame before they are mixed;
    // rotating the blend instead would swing the globe on the way through.
    let pax = ax, pay = ay, paz = az, pbx = bx, pby = by, pbz = bz
    if (reference) {
      const ra = i0 * 9
      const rb = i1 * 9
      pax = reference[ra] * ax + reference[ra + 1] * ay + reference[ra + 2] * az
      pay = reference[ra + 3] * ax + reference[ra + 4] * ay + reference[ra + 5] * az
      paz = reference[ra + 6] * ax + reference[ra + 7] * ay + reference[ra + 8] * az
      pbx = reference[rb] * bx + reference[rb + 1] * by + reference[rb + 2] * bz
      pby = reference[rb + 3] * bx + reference[rb + 4] * by + reference[rb + 5] * bz
      pbz = reference[rb + 6] * bx + reference[rb + 7] * by + reference[rb + 8] * bz
    }
    const vx = pax + (pbx - pax) * f
    const vy = pay + (pby - pay) * f
    const vz = paz + (pbz - paz) * f
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
