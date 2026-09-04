/**
 * How far apart the pairs that should have met still are.
 *
 * Split out of tools/lib/flowlines.ts, which traces the paths these pairs are
 * read off. The reason is not tidiness: the solver needs only this one measure,
 * and the tracer reaches a gravity grid that reads gzip, so importing the pair
 * score used to drag `node:zlib` in with it -- which a browser has no answer
 * for, and the solver now runs in a browser worker as well as on a command
 * line. The measurement and the tracing were always two different jobs.
 */
import { length3 } from '../../shared/sphere.js'

export interface ConjugateFit {
  /** How many pairs were due to coincide at this time. */
  conjugateCount: number
  /** Median separation of those pairs, km. */
  conjugateMedianKm: number
  /** Share of them within `contactKm` of each other. */
  conjugateMatched: number
  /**
   * Share whose two halves the mesh has already merged into one point.
   *
   * Reported because it is the part of the score that cannot fail. A collapse
   * is the model closing the ocean and merging the two banks, which is the
   * right answer -- but it also makes the separation exactly zero by
   * construction, so a run that merged everything would look perfect. Read the
   * matched share against this one.
   */
  conjugateMerged: number
}

/**
 * How well the reconstruction brings each conjugate pair back together.
 *
 * At time `t` the pairs whose crust formed at `t` were, on the evidence of the
 * age grid, the same point. So their separation in the frame at `t` is a
 * residual with a known right answer of zero, and there are thousands of them
 * where the scorecard had four continent pairs.
 *
 * Pairs of other ages are not measured here. Saying anything about where a pair
 * should be at some other time takes a prediction of how fast it separated,
 * which is a second model stacked on the one being tested.
 */
export function conjugateFit(
  pairs: {
    aVerts: Uint32Array
    aWeights: Float32Array
    bVerts: Uint32Array
    bWeights: Float32Array
    ageMa: Float32Array
  },
  timeMa: number,
  pos: Float64Array,
  radiusKm: number,
  contactKm: number,
  survivor: (v: number) => number,
  /**
   * Which pairs count. Left out, all of them do.
   *
   * The solver hands in only the ones it was not told to close. A pair used as
   * a constraint scores whatever the constraint made it score, so counting it
   * would be reading back the instruction rather than testing the answer.
   */
  include?: (i: number) => boolean,
): ConjugateFit {
  const gaps: number[] = []
  let merged = 0
  /** Where a barycentric point has got to, as a unit direction. */
  const place = (verts: Uint32Array, weights: Float32Array, i: number) => {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 3; k++) {
      const v = survivor(verts[i * 3 + k]) * 3
      const w = weights[i * 3 + k]
      x += w * pos[v]; y += w * pos[v + 1]; z += w * pos[v + 2]
    }
    const l = length3(x, y, z) || 1
    return [x / l, y / l, z / l]
  }
  for (let i = 0; i < pairs.ageMa.length; i++) {
    if (pairs.ageMa[i] !== timeMa) continue
    if (include && !include(i)) continue
    // Merged means the mesh has closed every corner of both triangles onto one
    // point: the ocean shut and the two banks became the same crust. The right
    // answer, and an unfalsifiable zero, which is why it is counted apart.
    const first = survivor(pairs.aVerts[i * 3])
    let same = true
    for (let k = 0; k < 3 && same; k++) {
      same = survivor(pairs.aVerts[i * 3 + k]) === first
        && survivor(pairs.bVerts[i * 3 + k]) === first
    }
    if (same) {
      merged++
      gaps.push(0)
      continue
    }
    const a = place(pairs.aVerts, pairs.aWeights, i)
    const b = place(pairs.bVerts, pairs.bWeights, i)
    const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
    gaps.push(Math.acos(dot) * radiusKm)
  }
  if (!gaps.length) {
    return {
      conjugateCount: 0, conjugateMedianKm: 0, conjugateMatched: 0, conjugateMerged: 0,
    }
  }
  gaps.sort((x, y) => x - y)
  return {
    conjugateCount: gaps.length,
    conjugateMedianKm: gaps[gaps.length >> 1],
    conjugateMatched: gaps.filter((g) => g <= contactKm).length / gaps.length,
    conjugateMerged: merged / gaps.length,
  }
}
