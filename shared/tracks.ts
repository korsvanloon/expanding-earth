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
  /** Index into the point arrays of each track's ridge point. */
  ridge: Uint32Array
  /**
   * Every point of every track, ridge in the middle, as a place inside a
   * triangle: three mesh vertices and the weights that mix them.
   *
   * Not the nearest vertex, which is what these were. A path steps forty
   * kilometres and the mesh has points a hundred and twelve apart, so snapping
   * turned a smooth lineament into a staircase with the mesh's own period --
   * the triangulation's shape drawn over the top of the fracture zone's, which
   * is the one thing a reader must not confuse it with. Interpolating inside
   * the triangle puts the line back where the walk actually went, and it still
   * deforms with the crust, because the three corners do.
   */
  pointVerts: Uint32Array
  pointWeights: Float32Array
  /** Age of the crust at each point, Ma. */
  ageMa: Float32Array
  /** Distance from the ridge along the path, km. */
  fromRidgeKm: Float32Array
  /**
   * Conjugate pairs: two pieces of crust that were one point at `pairAgeMa`.
   *
   * Each end is a point inside a triangle -- three vertices and the weights
   * that mix them -- rather than the nearest vertex. Snapping to vertices put
   * the floor of the whole check at the mesh spacing, 115 km, which was most of
   * what the model was being blamed for in the frames where it does best.
   */
  pairAVerts: Uint32Array
  pairAWeights: Float32Array
  pairBVerts: Uint32Array
  pairBWeights: Float32Array
  pairAgeMa: Float32Array
  /**
   * Which drawn track each pair came off.
   *
   * The solver holds half of the tracks back. A pair used to pull the
   * reconstruction together cannot also be evidence that it came together, so
   * the ones that constrain and the ones that score are different tracks --
   * different tracks and not merely different pairs, because two pairs a few
   * million years apart on the same walk say almost the same thing.
   */
  pairTrack: Uint32Array
}

export function writeTracks(t: Tracks): ArrayBuffer {
  const trackCount = t.ridge.length
  const pointCount = t.ageMa.length
  const pairCount = t.pairAgeMa.length
  // header, the offsets (one more than there are tracks), the ridge indices,
  // eight words per point -- three corners, three weights, an age and a
  // distance -- and thirteen per pair.
  const words = 3 + (trackCount + 1) + trackCount + pointCount * 8 + pairCount * 14
  const buffer = new ArrayBuffer(words * 4)
  const u32 = new Uint32Array(buffer)
  const f32 = new Float32Array(buffer)
  u32[0] = trackCount
  u32[1] = pointCount
  u32[2] = pairCount
  let at = 3
  u32.set(t.offsets, at); at += trackCount + 1
  u32.set(t.ridge, at); at += trackCount
  u32.set(t.pointVerts, at); at += pointCount * 3
  f32.set(t.pointWeights, at); at += pointCount * 3
  f32.set(t.ageMa, at); at += pointCount
  f32.set(t.fromRidgeKm, at); at += pointCount
  u32.set(t.pairAVerts, at); at += pairCount * 3
  f32.set(t.pairAWeights, at); at += pairCount * 3
  u32.set(t.pairBVerts, at); at += pairCount * 3
  f32.set(t.pairBWeights, at); at += pairCount * 3
  f32.set(t.pairAgeMa, at); at += pairCount
  u32.set(t.pairTrack, at)
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
    pointVerts: u32(pointCount * 3),
    pointWeights: f32(pointCount * 3),
    ageMa: f32(pointCount),
    fromRidgeKm: f32(pointCount),
    pairAVerts: u32(pairCount * 3),
    pairAWeights: f32(pairCount * 3),
    pairBVerts: u32(pairCount * 3),
    pairBWeights: f32(pairCount * 3),
    pairAgeMa: f32(pairCount),
    pairTrack: u32(pairCount),
  }
}

/**
 * Whether a pair pulls on the crust, or is held back to score it.
 *
 * One rule, shared, because the solver and the viewer both need it and they
 * must not disagree: a pair the solver was told to close would look like a
 * triumph in the viewer and mean nothing. Split by track and not by pair --
 * two pairs a few million years apart on one walk are nearly the same claim.
 */
export const pairPulls = (tracks: Tracks, i: number) => tracks.pairTrack[i] % 2 === 0

/**
 * A colour per pair, so the two ends of one claim can be told from its
 * neighbour's.
 *
 * Shared between the globe and the flat map on purpose: a reader comparing the
 * two has to be able to find the same pair in both, and a hue computed twice
 * from two different indices is two different pictures of the same data. The
 * golden angle is what keeps neighbouring pairs -- which sit a few tens of
 * kilometres apart along a ridge -- from coming out the same colour.
 *
 * Returned as three channels from 0 to 1.
 */
export function pairHue(i: number): [number, number, number] {
  const h = (i * 0.61803398875) % 1
  const c = 0.85 * (1 - Math.abs(2 * 0.55 - 1))
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = 0.55 - c / 2
  const [r, g, b] = h < 1 / 6 ? [c, x, 0]
    : h < 2 / 6 ? [x, c, 0]
      : h < 3 / 6 ? [0, c, x]
        : h < 4 / 6 ? [0, x, c]
          : h < 5 / 6 ? [x, 0, c]
            : [c, 0, x]
  return [r + m, g + m, b + m]
}
