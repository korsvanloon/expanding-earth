/**
 * How much of a piece of crust exists at a given moment, read off samples of
 * the age grid rather than reasoned about.
 *
 * Two things need this answer and they used to compute it differently, which
 * cost the model about one and a half percent of its own radius. The builder
 * works out how big the Earth was -- the surviving area is the radius, in this
 * model, and nothing else sets it -- and the solver works out what it should
 * ask each triangle and each edge to measure. If those two disagree about how
 * much crust is left, the crust either cannot reach round the sphere or has to
 * stretch to cover it, and the difference shows up as deformation nobody asked
 * for. So the rule lives here, once.
 *
 * The samples sit at the middles of equal pieces -- equal lengths along an
 * edge, equal areas over a triangle -- so counting how many are older than the
 * moment *is* the surviving share, to one sixteenth. See `sampleCrustAge` in
 * tools/build-data.ts for how they are taken and why the corners cannot answer
 * this.
 */

/** Samples per edge and per triangle. Sixteen is 8 km on a 129 km edge. */
export const AGE_SAMPLES = 16
/** Hundredths of a million years, which is finer than the grid can support. */
export const AGE_UNIT = 100
/** Crust that never goes away, and is larger than any moment by construction. */
export const AGE_PERMANENT = 65535

/** A moment in the units the samples are stored in. */
export const momentOf = (timeMa: number): number => Math.round(timeMa * AGE_UNIT)

export function encodeAge(ageMa: number, permanentMa: number): number {
  if (!(ageMa < permanentMa)) return AGE_PERMANENT
  return Math.max(0, Math.min(AGE_PERMANENT - 1, Math.round(ageMa * AGE_UNIT)))
}

/**
 * The share of a sampled run of crust older than `moment`, from 0 to 1.
 *
 * `samples` must be sorted ascending, `AGE_SAMPLES` of them starting at `base`.
 * Counting alone would give a staircase in sixteenths, and this is a target the
 * solver chases: a step of a sixteenth is a shove of eight kilometres arriving
 * in a single frame. So the straight line between the two samples that straddle
 * the moment carries the crossing smoothly across one piece's width.
 */
export function olderShare(samples: Uint16Array, base: number, moment: number): number {
  if (samples[base] >= moment) return 1
  if (samples[base + AGE_SAMPLES - 1] < moment) return 0
  let k = 1
  while (samples[base + k] < moment) k++
  const younger = samples[base + k - 1]
  const older = samples[base + k]
  // A permanent sample has no position on the age axis to interpolate towards,
  // and equal samples would divide by nothing; both mean the crossing sits at
  // the edge of the piece rather than inside it.
  const within = older >= AGE_PERMANENT || older <= younger
    ? 1
    : (older - moment) / (older - younger)
  return (AGE_SAMPLES - k + within) / AGE_SAMPLES
}
