/**
 * How the triangulation travels with the frames.
 *
 * The mesh in the viewer is not the mesh the solver worked on. Collapses rename
 * the corners of every triangle around a point they swallow, and flips swap
 * diagonals -- a hundred and sixty thousand of them over a two hundred million
 * year run -- while mesh.bin is written before any of that happens. A viewer
 * that reads mesh.bin's index array is drawing a triangulation that stopped
 * being true at the first step, and it does not go wrong gently: a stale
 * mixture of two triangulations is not a triangulation at all, so it shows as
 * folds, as crust lying over crust, and as single triangles stretched right
 * across the Pacific.
 *
 * So the connectivity is recorded per frame, as the change since the frame
 * before -- a few thousand triangles a frame rather than eighty thousand -- and
 * both ends replay it from today's triangulation, which is where playback ends
 * and which mesh.bin already holds.
 */

/** Triangles whose corners changed at one frame; `verts` runs three per face. */
export interface TopologyDelta {
  faces: Uint32Array
  verts: Uint16Array
}

/**
 * A removed triangle, written in all three corner slots.
 *
 * No real vertex index can collide with it: the shell has forty thousand points
 * at its most detailed, not sixty-five thousand.
 */
export const FACE_REMOVED = 0xffff

/**
 * The change between two triangulations, each three vertex indices per face.
 *
 * `was` is updated in place to `now`, so calling this once per frame against
 * the same array gives the sequence of deltas.
 */
export function topologyDelta(
  was: Uint16Array,
  now: ArrayLike<number>,
  faceCount: number,
  /** Whether each face is still part of the surface. */
  alive: ArrayLike<number>,
): TopologyDelta {
  const faces: number[] = []
  const verts: number[] = []
  for (let f = 0; f < faceCount; f++) {
    const i = f * 3
    const live = alive[f] === 1
    const a = live ? now[i] : FACE_REMOVED
    const b = live ? now[i + 1] : FACE_REMOVED
    const c = live ? now[i + 2] : FACE_REMOVED
    if (was[i] === a && was[i + 1] === b && was[i + 2] === c) continue
    was[i] = a
    was[i + 1] = b
    was[i + 2] = c
    faces.push(f)
    verts.push(a, b, c)
  }
  return { faces: Uint32Array.from(faces), verts: Uint16Array.from(verts) }
}

/** One block per frame: a count, that many face indices, then three corners each. */
export function writeTopology(deltas: TopologyDelta[]): Uint8Array {
  let bytes = 0
  for (const { faces } of deltas) bytes += 4 + faces.length * 10
  const out = new Uint8Array(bytes)
  const view = new DataView(out.buffer)
  let offset = 0
  for (const { faces, verts } of deltas) {
    view.setUint32(offset, faces.length, true)
    offset += 4
    for (const f of faces) {
      view.setUint32(offset, f, true)
      offset += 4
    }
    for (const v of verts) {
      view.setUint16(offset, v, true)
      offset += 2
    }
  }
  return out
}

export function readTopology(buffer: ArrayBuffer, faceCount: number): TopologyDelta[] {
  const view = new DataView(buffer)
  const deltas: TopologyDelta[] = []
  let offset = 0
  while (offset + 4 <= buffer.byteLength) {
    const count = view.getUint32(offset, true)
    offset += 4
    // A count past the whole mesh means the stream is not what it claims to be;
    // stop rather than read gigabytes of noise.
    if (count > faceCount || offset + count * 10 > buffer.byteLength) break
    const faces = new Uint32Array(count)
    for (let i = 0; i < count; i++) faces[i] = view.getUint32(offset + i * 4, true)
    offset += count * 4
    const verts = new Uint16Array(count * 3)
    for (let i = 0; i < count * 3; i++) verts[i] = view.getUint16(offset + i * 2, true)
    offset += count * 6
    deltas.push({ faces, verts })
  }
  return deltas
}

/**
 * Replay the deltas up to `frame` and write out the triangles that exist there.
 *
 * `working` carries the full triangulation, removed faces included, and `out`
 * receives only the live triangles, packed from the front. Returns how many
 * indices were written, which is what the draw range wants.
 *
 * This replays from the start each time rather than tracking which way the last
 * jump went, because the timeline can be dragged anywhere. Forty frames of a
 * few thousand changes is a fraction of a millisecond, and it only has to run
 * when the frame changes, not on every animation tick.
 */
export function applyTopology(
  indices: ArrayLike<number>,
  deltas: TopologyDelta[],
  frame: number,
  working: Int32Array,
  out: Uint32Array,
): number {
  working.set(indices)
  for (let i = 0; i <= frame && i < deltas.length; i++) {
    const { faces, verts } = deltas[i]
    for (let k = 0; k < faces.length; k++) {
      const f = faces[k] * 3
      const a = verts[k * 3]
      working[f] = a === FACE_REMOVED ? -1 : a
      working[f + 1] = verts[k * 3 + 1]
      working[f + 2] = verts[k * 3 + 2]
    }
  }
  let n = 0
  for (let f = 0; f < working.length; f += 3) {
    if (working[f] < 0) continue
    out[n++] = working[f]
    out[n++] = working[f + 1]
    out[n++] = working[f + 2]
  }
  return n
}
