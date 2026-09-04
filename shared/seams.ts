/**
 * Which triangles are bridging crust that is gone.
 *
 * The mesh loses vertices as it runs backwards: crust that has not been made
 * yet is collapsed away rather than crumpled into a corner (see
 * tools/lib/dynamic-mesh.ts). What is left behind is a triangulation whose
 * triangles all exist and whose *insides* sometimes do not. A collapse merges
 * two points into one, so a triangle round that point now has corners that were
 * hundreds of kilometres apart on today's Earth -- and every per-vertex thing
 * the renderer knows about the crust, the present-day direction most of all, is
 * interpolated between them. The inside of such a triangle gets painted with
 * every scrap of sea floor that used to lie between its corners.
 *
 * That is why the East Pacific Rise stays visible, growing and blurring, in a
 * reconstruction that has already removed it. The crust is gone from the model
 * and still on the picture.
 *
 * Nothing here changes the model. It measures the size of the lie so the
 * renderer can stop telling it.
 */

import { R0_KM } from './model.js'

/**
 * How far apart a triangle's corners may be on today's Earth before its inside
 * stops being crust, and where it is nothing but seam. Kilometres.
 *
 * The shell is an icosphere, so a triangle's own edges are a fixed length on
 * today's sphere whatever the time -- present-day directions never move, which
 * is the whole point of them. At subdivision 6 that is 110 to 132 km, and by
 * 200 Ma the worst spans reach nearly three thousand.
 *
 * The start had been 220 km, and that was wrong for a reason worth writing
 * down. A single edge flip replaces a quad's diagonal, joining the two apexes
 * either side of it: measured over all 122,880 interior edges of the present-day
 * mesh, that distance runs from 178 to **228 km**, median 213. So the old
 * threshold sat *inside* the range one flip produces, and most single flips
 * tinted. They should not. A flip removes no crust and bridges no gap -- the
 * quad still covers exactly the ground it covered before, drawn the other way
 * -- so a triangle one flip old is still made of the crust it is painted with.
 *
 * This matters much more since the model started folding un-erupted crust
 * inside the shell rather than collapsing it away: there are no collapses left,
 * so flips are the *only* thing that can carry a triangle's corners apart, and
 * there are 287,643 of them in a run. Tinting the first one turned the tint
 * from a warning into a picture of the retriangulation.
 *
 * So it starts above the widest single flip, and the ramp keeps its 300 km.
 * Two flips in the same neighbourhood reach past it, which is the point at
 * which a triangle really has stopped standing for contiguous crust.
 */
export const SEAM_START_KM = 240
export const SEAM_FULL_KM = 540

/**
 * The vertex count those two numbers were derived at, and the spacing there.
 *
 * Both thresholds are statements about the mesh rather than about the Earth:
 * one edge, one flip, two flips. So on another mesh they are other numbers, and
 * a coarse one shows it -- the viewer's explorer solves 2,562 points, whose
 * ordinary edges are four times longer than the widest seam this ramp admits,
 * and the whole globe came out painted as suture. It looked like a lighting bug
 * for an hour.
 *
 * Held as multiples of the mesh spacing, `sqrt(4 pi R^2 / n)`, which at
 * subdivision 6 is 111.6 km and reproduces 240 and 540 exactly.
 */
const SEAM_REFERENCE_POINTS = 40962
const spacingKm = (points: number) =>
  Math.sqrt((4 * Math.PI * R0_KM * R0_KM) / Math.max(4, points))
const START_SPACINGS = SEAM_START_KM / spacingKm(SEAM_REFERENCE_POINTS)
const FULL_SPACINGS = SEAM_FULL_KM / spacingKm(SEAM_REFERENCE_POINTS)

/** Where the ramp starts and ends on a mesh of this many points, km. */
export function seamThresholds(points = SEAM_REFERENCE_POINTS): {
  startKm: number
  fullKm: number
} {
  const spacing = spacingKm(points)
  return { startKm: START_SPACINGS * spacing, fullKm: FULL_SPACINGS * spacing }
}

/** How much of a seam a triangle spanning `spanKm` of today's crust is, 0 to 1. */
export function seamReach(spanKm: number, points = SEAM_REFERENCE_POINTS): number {
  const { startKm, fullKm } = seamThresholds(points)
  if (spanKm <= startKm) return 0
  return Math.min(1, (spanKm - startKm) / (fullKm - startKm))
}

/**
 * The widest reach of any triangle at each corner, written into `seam`.
 *
 * Per vertex rather than per triangle because the geometry is indexed and a
 * vertex is shared between six faces, so a face attribute would mean expanding
 * the mesh threefold and writing three times as much every frame. WebGL2 has no
 * `gl_PrimitiveID` in a fragment shader to do it without.
 *
 * The cost is a halo: a corner of a bridging triangle carries the seam into its
 * good triangles too. It roughly doubles the area tinted against the area that
 * strictly earns it -- 2.0% against 1.0% at 13 Ma, 31% against 25% at 200 --
 * which reads as a soft band rather than a hard cut. Stated rather than hidden;
 * see tools/measure-mesh.ts, which prints both columns.
 */
export function measureSeams(
  /** Present-day unit direction per vertex, three floats each. */
  dirs: ArrayLike<number>,
  /** The live triangulation, three vertex indices per face. */
  index: ArrayLike<number>,
  /** How many indices of `index` are live. */
  count: number,
  seam: Float32Array,
  /**
   * How many points the mesh has, which is what sets the scale.
   *
   * `seam` is one float per vertex, so the real callers need not say. A test
   * on a mesh of four points does, or the spacing of a four-point sphere makes
   * every threshold thousands of kilometres wide.
   */
  points = seam.length,
): void {
  seam.fill(0)
  // The mesh this is being run on says what a wide span is; `seam` is one
  // float per vertex, so it says how many there are without being asked.
  const { startKm, fullKm } = seamThresholds(points)
  // Chord rather than arc: at these angles the two agree to under a percent,
  // and this runs over a quarter of a million corner pairs every frame.
  const start = 2 * Math.sin(startKm / (2 * R0_KM))
  const full = 2 * Math.sin(fullKm / (2 * R0_KM))
  for (let f = 0; f + 2 < count; f += 3) {
    const a = index[f] * 3
    const b = index[f + 1] * 3
    const c = index[f + 2] * 3
    let span = 0
    for (let e = 0; e < 3; e++) {
      const p = e === 0 ? a : e === 1 ? b : c
      const q = e === 0 ? b : e === 1 ? c : a
      const dx = dirs[p] - dirs[q]
      const dy = dirs[p + 1] - dirs[q + 1]
      const dz = dirs[p + 2] - dirs[q + 2]
      const d = dx * dx + dy * dy + dz * dz
      if (d > span) span = d
    }
    span = Math.sqrt(span)
    const reach = span <= start ? 0 : Math.min(1, (span - start) / (full - start))
    if (!reach) continue
    for (let k = 0; k < 3; k++) {
      const v = index[f + k]
      if (reach > seam[v]) seam[v] = reach
    }
  }
}
