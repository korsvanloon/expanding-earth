/**
 * Which way a conjugate pair's join runs, and whether its neighbours agree.
 *
 * The reader looked at seven pairs on the crustal fabric and said one of them
 * was wrong, two were doubtful and four were fine -- and, more usefully than the
 * verdicts, said *why* they could tell: **the joins in one stretch of ocean all
 * run at about the same angle, and keep that angle as you follow the ridge
 * along.** That makes the bearing a smooth field, and a pair whose bearing does
 * not fit its neighbours' a suspect, with no human needed for the next one.
 *
 * Measured against those seven, with neighbours taken within 1,500 km: the four
 * they passed come out 0 to 5 degrees off the local bearing, the two they
 * doubted 5 and 6, and the one they rejected 20. Narrowing the neighbourhood to
 * 500 km put one of the doubtful pairs at 13 and broke the ordering; adding an
 * age window did the same. So the estimator is deliberately wide, which is what
 * the reader's own reason for it implies.
 *
 * What this cannot yet say is what happens where the bearing is *not* nearly
 * constant. The same reader: further south, and further back in time, a flow
 * line kinks or runs an S -- the pole moved -- and there a wide neighbourhood
 * smears real variation into the estimate and would call good pairs bad. Seven
 * labels from one easy stretch of the North Atlantic is what this rests on.
 */

const RAD = Math.PI / 180
export const EARTH_KM = 6371

export interface Place { lon: number; lat: number }

/**
 * The initial azimuth from `a` to `b`, folded onto 0..180.
 *
 * Folded because a pair has no direction: which end is called A is an accident
 * of which flank the tracer walked first, so a bearing of 100 degrees and one
 * of 280 are the same claim and must not average to 190.
 */
export function bearingDeg(a: Place, b: Place): number {
  const dl = (b.lon - a.lon) * RAD
  const p1 = a.lat * RAD
  const p2 = b.lat * RAD
  const t = Math.atan2(
    Math.sin(dl) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
  )
  return (((t / RAD) % 180) + 180) % 180
}

/** Great-circle distance in km. */
export function apartKm(a: Place, b: Place): number {
  const cos = Math.sin(a.lat * RAD) * Math.sin(b.lat * RAD)
    + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((a.lon - b.lon) * RAD)
  return Math.acos(Math.max(-1, Math.min(1, cos))) * EARTH_KM
}

/** How far apart two bearings are on the 0..180 axis, 0 to 90. */
export function axisDiff(p: number, q: number): number {
  const d = Math.abs(p - q) % 180
  return d > 90 ? 180 - d : d
}

/**
 * The median of a set of bearings on the 0..180 axis.
 *
 * Swept over whole degrees rather than solved, because the cost function on a
 * circle is not convex and a mean is meaningless: bearings of 179 and 1 degrees
 * are two degrees apart and average to 90, which is square to both.
 */
export function axisMedian(values: number[]): number {
  let best = 0
  let bestCost = Infinity
  for (let guess = 0; guess < 180; guess++) {
    let cost = 0
    for (const v of values) cost += axisDiff(v, guess)
    if (cost < bestCost) {
      bestCost = cost
      best = guess
    }
  }
  return best
}

/** How wide a neighbourhood the local bearing is taken over, km. */
export const NEIGHBOURHOOD_KM = 1500
/** Below this many neighbours there is no local bearing worth comparing to. */
export const MIN_NEIGHBOURS = 4

/**
 * For each pair, the local bearing its neighbours agree on and how far it is
 * off. `NaN` where the neighbourhood is too thin to have an opinion.
 */
export function localBearings(
  pairs: { at: Place; bearing: number }[],
  radiusKm = NEIGHBOURHOOD_KM,
): { local: number; off: number }[] {
  return pairs.map((p, i) => {
    const near: number[] = []
    for (let q = 0; q < pairs.length; q++) {
      if (q === i) continue
      if (apartKm(p.at, pairs[q].at) < radiusKm) near.push(pairs[q].bearing)
    }
    if (near.length < MIN_NEIGHBOURS) return { local: NaN, off: NaN }
    const local = axisMedian(near)
    return { local, off: axisDiff(p.bearing, local) }
  })
}
