/**
 * The fracture-zone tracks and the conjugate pairs read off them, on disk.
 *
 * Written by tools/build-data.ts, measured by tools/solve.ts, drawn by the
 * viewer. Everything here is in mesh vertex indices rather than coordinates,
 * because a vertex is the same piece of crust in every frame: a track drawn at
 * 120 Ma is the same list of indices read at their 120 Ma positions, and no
 * interpolation or re-projection is involved.
 *
 * See tools/lib/flowlines.ts for where they come from and why they are allowed
 * to be a check on the model.
 */

export interface Tracks {
  /** Where each track's points start in `vertex`, with a final end offset. */
  offsets: Uint32Array
  /** Index into `vertex` of each track's ridge point. */
  ridge: Uint32Array
  /** Mesh vertex of each point of every track, ridge in the middle. */
  vertex: Uint32Array
  /** Age of the crust at each point, Ma. */
  ageMa: Float32Array
  /** Distance from the ridge along the path, km. */
  fromRidgeKm: Float32Array
  /** Conjugate pairs: two vertices that were one point at `pairAgeMa`. */
  pairA: Uint32Array
  pairB: Uint32Array
  pairAgeMa: Float32Array
}

export function writeTracks(t: Tracks): ArrayBuffer {
  const trackCount = t.ridge.length
  const pointCount = t.vertex.length
  const pairCount = t.pairA.length
  // header, the offsets (one more than there are tracks), the ridge indices,
  // three arrays per point and three per pair.
  const words = 3 + (trackCount + 1) + trackCount + pointCount * 3 + pairCount * 3
  const buffer = new ArrayBuffer(words * 4)
  const u32 = new Uint32Array(buffer)
  const f32 = new Float32Array(buffer)
  u32[0] = trackCount
  u32[1] = pointCount
  u32[2] = pairCount
  let at = 3
  u32.set(t.offsets, at); at += trackCount + 1
  u32.set(t.ridge, at); at += trackCount
  u32.set(t.vertex, at); at += pointCount
  f32.set(t.ageMa, at); at += pointCount
  f32.set(t.fromRidgeKm, at); at += pointCount
  u32.set(t.pairA, at); at += pairCount
  u32.set(t.pairB, at); at += pairCount
  f32.set(t.pairAgeMa, at)
  return buffer
}

export function readTracks(buffer: ArrayBuffer): Tracks {
  const head = new Uint32Array(buffer, 0, 3)
  const [trackCount, pointCount, pairCount] = head
  let at = 12
  const u32 = (n: number) => {
    const a = new Uint32Array(buffer, at, n)
    at += n * 4
    return a
  }
  const f32 = (n: number) => {
    const a = new Float32Array(buffer, at, n)
    at += n * 4
    return a
  }
  return {
    offsets: u32(trackCount + 1),
    ridge: u32(trackCount),
    vertex: u32(pointCount),
    ageMa: f32(pointCount),
    fromRidgeKm: f32(pointCount),
    pairA: u32(pairCount),
    pairB: u32(pairCount),
    pairAgeMa: f32(pairCount),
  }
}
