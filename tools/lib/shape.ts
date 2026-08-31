/**
 * Does a piece of crust still have its own shape?
 *
 * The solver already reported strain, and strain could not answer this. Face
 * strain is the change in a triangle's area, so it is blind to shear -- which
 * preserves area exactly -- and it is local, so a shield bent in half reports
 * nothing at all as long as each of its own triangles keeps its size. Cratons
 * were reporting 0.7% while the distance between points of the same continent
 * changed by a third.
 *
 * So measure the thing that has to hold instead: a rigid body keeps the
 * distance between every pair of its own points. Sample pairs once, remember
 * how far apart they are today, and ask again at every frame. Distances are in
 * kilometres along the surface, so the sphere's own growth is divided out and
 * what is left is deformation.
 *
 * Pairs rather than a rigid fit on purpose: a fit needs a rotation, and a
 * rotation is three more numbers to get wrong. Pairwise distance is invariant
 * under every rotation and reflection there is, so nothing has to be fitted
 * and nothing can be fitted badly.
 */
import { length3 } from '../../shared/sphere.js'

export interface ShapePairs {
  /** Pairs of vertex indices, both in the same group. */
  a: Int32Array
  b: Int32Array
  /** How far apart they are today, km along the surface. */
  restKm: Float64Array
  /** Which group each pair belongs to, for the per-group figures. */
  group: Int32Array
  groupCount: number
}

/**
 * Pairs too close together to say anything are dropped.
 *
 * A triangle is about a degree across, a hundred kilometres. Two points that
 * near each other are one edge apart, their distance is what the edge springs
 * already constrain directly, and dividing by a small number turns the mesh's
 * own quantisation into a large relative error. Shape is a question about a
 * body, so ask it across the body.
 */
const NEAREST_KM = 500

/**
 * Take a fixed sample of pairs within each group.
 *
 * Fixed, not random per run: the same pairs at every frame and in every run, so
 * two runs can be compared and a change in the number means a change in the
 * model. The stride walks the group's own point list, which is in mesh order
 * and so is spread over the group rather than clustered.
 */
export function shapePairs(
  dirs: Float32Array,
  group: Int32Array,
  groupCount: number,
  vertexCount: number,
  r0: number,
  perGroup = 2000,
): ShapePairs {
  const members: number[][] = Array.from({ length: groupCount }, () => [])
  for (let v = 0; v < vertexCount; v++) {
    const g = group[v]
    if (g >= 0) members[g].push(v)
  }
  const a: number[] = []
  const b: number[] = []
  const restKm: number[] = []
  const owner: number[] = []
  for (let g = 0; g < groupCount; g++) {
    const list = members[g]
    if (list.length < 3) continue
    // Two coprime-ish strides so the pairs are spread over the group instead of
    // being the same short hop repeated all the way round it.
    let taken = 0
    for (let offset = 1; offset < list.length && taken < perGroup; offset++) {
      for (let i = 0; i + offset < list.length && taken < perGroup; i += 7) {
        const v = list[i]
        const w = list[i + offset]
        const dot = Math.min(1, Math.max(-1,
          dirs[v * 3] * dirs[w * 3] + dirs[v * 3 + 1] * dirs[w * 3 + 1]
            + dirs[v * 3 + 2] * dirs[w * 3 + 2]))
        const km = Math.acos(dot) * r0
        if (km < NEAREST_KM) continue
        a.push(v)
        b.push(w)
        restKm.push(km)
        owner.push(g)
        taken++
      }
    }
  }
  return {
    a: Int32Array.from(a),
    b: Int32Array.from(b),
    restKm: Float64Array.from(restKm),
    group: Int32Array.from(owner),
    groupCount,
  }
}

export interface Distortion {
  /** RMS relative change in distance over every pair, all groups together. */
  islandDistortion: number
  /** The same for the worst single group. */
  worstIslandDistortion: number
  /** Which group that was, or -1 if there were no pairs at all. */
  worstGroup: number
}

/**
 * How far every sampled pair is from the distance it should be.
 *
 * `pos` is the reconstruction at radius `radiusKm`; only direction is read from
 * it, so a point drifting off the sphere is not counted twice.
 */
export function distortion(
  pairs: ShapePairs, pos: Float64Array, radiusKm: number,
): Distortion {
  const sum = new Float64Array(pairs.groupCount)
  const seen = new Int32Array(pairs.groupCount)
  let total = 0
  for (let i = 0; i < pairs.a.length; i++) {
    const v = pairs.a[i] * 3
    const w = pairs.b[i] * 3
    const lv = length3(pos[v], pos[v + 1], pos[v + 2]) || 1
    const lw = length3(pos[w], pos[w + 1], pos[w + 2]) || 1
    const dot = Math.min(1, Math.max(-1,
      (pos[v] * pos[w] + pos[v + 1] * pos[w + 1] + pos[v + 2] * pos[w + 2]) / (lv * lw)))
    const error = (Math.acos(dot) * radiusKm - pairs.restKm[i]) / pairs.restKm[i]
    const g = pairs.group[i]
    sum[g] += error * error
    seen[g]++
    total += error * error
  }
  let worst = 0
  let worstGroup = -1
  for (let g = 0; g < pairs.groupCount; g++) {
    if (!seen[g]) continue
    const rms = Math.sqrt(sum[g] / seen[g])
    if (rms > worst) {
      worst = rms
      worstGroup = g
    }
  }
  return {
    islandDistortion: pairs.a.length ? Math.sqrt(total / pairs.a.length) : 0,
    worstIslandDistortion: worst,
    worstGroup,
  }
}
