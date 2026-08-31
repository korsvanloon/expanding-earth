/**
 * Types and constants shared between the offline pipeline (`tools/`) and the
 * browser app (`src/`).
 *
 * The model in one line: the Earth at time t consists of exactly that crust
 * which already existed at time t, and nothing else. Everything below follows
 * from that single assumption plus the seafloor age grid.
 */

/** Present-day mean Earth radius, km. */
export const R0_KM = 6371

/** Sentinel age for crust that the age grid does not date (continental). */
export const PERMANENT_MA = 1e9

/** Present-day Earth mass, kg — used only for the surface-gravity read-out. */
export const EARTH_MASS_KG = 5.972e24
export const GRAVITATIONAL_CONSTANT = 6.6743e-11

export type CrustModelId = 'permanent' | 'depth-age' | 'nearest-age'

export interface CrustModel {
  id: CrustModelId
  label: string
  /** One-line statement of what this variant assumes about the undated cells. */
  assumption: string
  /** Radius in km, sampled at `radiusStepMa` intervals from 0 Ma. */
  radiusKm: number[]
}

export interface FrameDiagnostics {
  timeMa: number
  radiusKm: number
  /**
   * Fraction of the sphere no surviving crust covers -- bare sky.
   *
   * Measured by asking a fixed set of directions whether any live triangle lies
   * that way, because summing triangle areas cannot answer it: a sheet folded
   * over itself in one place and short in another adds to exactly the right
   * total while covering neither. If the reconstruction closes perfectly this
   * goes to zero; whatever is left is the model failing to account for the
   * surface, stated plainly.
   *
   * This said the opposite until it was read against `tiling` in
   * tools/solve.ts, which computes `1 - covered / probes`. Anything reading
   * this as "crust that should not be there" was reading it backwards.
   */
  gapFraction: number
  /** Fraction of the sphere covered by more than one triangle at once. */
  overlapFraction: number
  /**
   * Fraction of the live crust lying inside out.
   *
   * Reported separately from the overlap because the two are measured
   * differently and mean different things. Overlap asks how much of the sky is
   * covered twice, which a merely crumpled shell does as readily as a folded
   * one. This asks how much of the rock has its outward face pointing at the
   * core -- a thing real crust never does, and a thing edge-length springs
   * cannot see, since a triangle and its mirror image measure the same.
   */
  foldFraction: number
  /** Area-weighted RMS of (current edge length / present-day edge length) - 1. */
  rmsStrain: number
  /** Signed mean of the same. Negative means the model demands compression. */
  meanStrain: number
  /** Median |strain|: what the crust away from ridges and faults is asked to do. */
  medianStrain: number
  /** 90th percentile |strain|. */
  p90Strain: number
  /** Median |strain| inside rigid craton cores -- this is what must stay small. */
  cratonStrain: number
  /** Median |strain| in weak crust: thin necks, shelves, island arcs. */
  weakStrain: number
  /** RMS departure from the sphere of radius R(t), km: where crust must buckle. */
  reliefKm: number
  /** Number of rigid blocks the age data splits the crust into at this time. */
  blockCount: number
  /**
   * Share of the biggest of those blocks, as a fraction of the live crust.
   *
   * The count on its own cannot tell a shattered shell from a welded one --
   * two hundred blocks of half a percent each and two blocks of ninety-six
   * both fail, in opposite directions -- and it was the count alone that was
   * reported for most of this project's life.
   */
  biggestBlockShare: number
  /**
   * Share of today's surface whose crust the age grid took away arriving here,
   * per Myr. This is the forcing: the only thing that makes the model move.
   *
   * It goes to zero at 180 Ma, because that is as far back as the sea floor
   * goes. Frames past that are the solver settling, not history, and the
   * diagnostics beside them freeze -- which is exactly what makes the block
   * count read 2 at 200 Ma. See `medianSpeedKmMyr`.
   */
  forcingFraction: number
  /**
   * Median surface speed of the live crust over the interval behind this frame,
   * km/Myr. Radial growth is excluded: only motion across the surface counts.
   *
   * The number the block count has to be read against. Blocks are found by
   * growing a region over everything one rotation explains to within a few
   * km/Myr, so once the median speed falls below that tolerance a still shell
   * is indistinguishable from a rigid one and everything joins a single block
   * turning at nearly zero. The finder is not wrong; it has nothing to see.
   */
  medianSpeedKmMyr: number
  /**
   * How much the islands of strong crust have lost their own shape: RMS change
   * in the distance between pairs of points of the same island, as a fraction
   * of that distance today.
   *
   * `cratonStrain` was doing this job and cannot: it is a per-face area strain,
   * so it is blind to shear, which preserves area exactly, and it is local, so
   * a shield folded in half reports nothing as long as each of its triangles
   * keeps its size. This measures the thing that actually has to hold -- a
   * shield is the same distance across as it was -- and measures it across the
   * whole island rather than triangle by triangle.
   */
  islandDistortion: number
  /** The same for the worst single island, which is where it will fail first. */
  worstIslandDistortion: number
  /**
   * How many conjugate pairs were due to come together at this time.
   *
   * A pair is two pieces of crust that the age grid says left the same place on
   * the same fracture zone at the same moment -- so at that moment they were
   * one point, and their separation here is a residual whose right answer is
   * zero. There are thousands of them, against the four hand-chosen continent
   * pairs in the scorecard, and they come out of the same observation the model
   * is driven by rather than out of anybody's reconstruction.
   *
   * They are a check and not a constraint. Nothing in the solver is told about
   * them, because a model steered by them could not then be scored on them.
   * See tools/lib/flowlines.ts.
   */
  conjugateCount: number
  /** Median separation of those pairs, km. Zero is the right answer. */
  conjugateMedianKm: number
  /** Share of them that got within 200 km of each other. */
  conjugateMatched: number
  /** Share whose halves the mesh merged, which is the part that cannot fail. */
  conjugateMerged: number
}

export interface Meta {
  version: number
  generatedAt: string
  /** Provenance of every input file, so the output is traceable. */
  sources: { file: string; note: string }[]

  r0Km: number
  subdivision: number
  vertexCount: number
  faceCount: number

  /** Grey level 255 of the age map corresponds to this age. */
  maxAgeMa: number
  /** Calibration of the height map against the age grid; see tools/build-data.ts. */
  depthAgeFit: { slope: number; intercept: number; r2: number; sampleCount: number }

  /** Crust-classification variants. The first entry is the one that was solved. */
  crustModels: CrustModel[]
  solvedModel: CrustModelId
  radiusStepMa: number

  /** Reference radius curve computed at full 8192x4096 raster resolution. */
  referenceRadiusKm: number[]

  frameStepMa: number
  frameCount: number
  endTimeMa: number

  /** Distance in km between each scored pair, per recorded frame. */
  scorecard: {
    a: string
    b: string
    joinedByMa: number
    note: string
    /** Closest approach between the two, per recorded frame. */
    separationKm: number[]
    /**
     * How much of the shorter of the two margins lies against the other, as a
     * fraction of it, per recorded frame.
     *
     * The closest approach on its own is not a fit and never was: one corner
     * brushing another reads as 0 km while the coastlines beside it are
     * thousands of kilometres from nesting, which is exactly what South America
     * and Africa do in this model -- 0 km on the scorecard and visibly wrong on
     * the globe. A fit is a length of margin in contact, so that is what this
     * measures. Zero means they touch at a point or not at all.
     */
    matchedFraction: number[]
  }[]

  diagnostics: FrameDiagnostics[]
  /**
   * The same frames read against a sphere that never grew -- arithmetic, not a
   * second solve.
   *
   * `gapFraction` here is `1 - (R(t)/R0)^2`: how far the crust that existed at
   * time t falls short of covering today's sphere. That is a statement about
   * the area budget and needs no reconstruction, which is why it is computed
   * rather than solved. The remaining fields are carried over or set to zero
   * because nothing measured them; do not read `overlapFraction` or
   * `rmsStrain` from this array. Calling it a control run, as this comment did,
   * promised a plate-tectonic null model that has never been run.
   */
  fixedRadiusDiagnostics: FrameDiagnostics[]
}

/**
 * Window, in Myr, over which crust is un-created as we integrate backwards.
 *
 * Crust does not blink out of existence at a hard cutoff: over TAU_MA its rest
 * length is faded to almost nothing, so a mid-ocean ridge closes as a smooth
 * zip rather than as a row of triangles vanishing. The area budget uses the
 * same fade, which keeps the radius curve and the constraint system consistent
 * with each other.
 */
export const TAU_MA = 5
/** Crust never shrinks below this fraction of its size, to avoid degeneracy. */
export const MIN_SCALE = 0.04

/**
 * How much of its present-day size a piece of crust of age `ageMa` still has at
 * time `t`. 1 while the crust exists, fading to MIN_SCALE once it does not.
 */
export function crustScale(ageMa: number, t: number): number {
  if (t <= ageMa) return 1
  return Math.max(MIN_SCALE, 1 - (t - ageMa) / TAU_MA)
}

/** Surface gravity in m/s^2 for a given radius, holding mass constant. */
export const surfaceGravity = (radiusKm: number) =>
  (GRAVITATIONAL_CONSTANT * EARTH_MASS_KG) / (radiusKm * 1000) ** 2

/** Linear interpolation into a curve sampled every `stepMa` from 0 Ma. */
export function sampleCurve(curve: number[], timeMa: number, stepMa: number): number {
  const x = Math.min(Math.max(timeMa / stepMa, 0), curve.length - 1)
  const i = Math.floor(x)
  const f = x - i
  return f === 0 ? curve[i] : curve[i] * (1 - f) + curve[i + 1] * f
}

/**
 * Regions used both as reference frames and as scorecard landmarks, given as
 * present-day latitude and longitude bounds over continental crust.
 */
export interface Region {
  id: string
  label: string
  latMin: number
  latMax: number
  lonMin: number
  lonMax: number
}

export const REGIONS: Region[] = [
  { id: 'africa', label: 'Africa', latMin: -35, latMax: 35, lonMin: -18, lonMax: 50 },
  { id: 'south-america', label: 'South America', latMin: -55, latMax: 12, lonMin: -82, lonMax: -34 },
  { id: 'north-america', label: 'North America', latMin: 25, latMax: 70, lonMin: -168, lonMax: -52 },
  { id: 'eurasia', label: 'Eurasia', latMin: 40, latMax: 75, lonMin: 10, lonMax: 130 },
  { id: 'antarctica', label: 'Antarctica', latMin: -90, latMax: -63, lonMin: -180, lonMax: 180 },
  { id: 'australia', label: 'Australia', latMin: -44, latMax: -10, lonMin: 112, lonMax: 154 },
  { id: 'india', label: 'India', latMin: 6, latMax: 30, lonMin: 68, lonMax: 90 },
  { id: 'greenland', label: 'Greenland', latMin: 60, latMax: 84, lonMin: -73, lonMax: -12 },
]

/**
 * Fits the reconstruction is scored against.
 *
 * Only pairs whose former adjacency is independently supported -- by matching
 * geology across the join, by magnetic isochrons, or by both -- and which plate
 * tectonics and Expanding Earth agree on. Reconstructions that were puzzled
 * together by hand are deliberately excluded: whether Australia or Antarctica
 * ends up against the west coast of South America is something this model
 * should be allowed to answer, not something to steer it towards.
 */
export interface FitTarget {
  a: string
  b: string
  /**
   * They should be in contact at and before this time, or 0 for a pair that is
   * only being watched. Some of the most interesting things the model has to
   * say are about joins nobody can independently check -- where Antarctica goes
   * as the Pacific closes, above all -- and those must not be scored, because
   * scoring them would be scoring the model against a guess. They are reported
   * with no target beside them, as readings.
   */
  joinedByMa: number
  note: string
}

export const FIT_TARGETS: FitTarget[] = [
  { a: 'south-america', b: 'africa', joinedByMa: 180, note: 'The South Atlantic had not opened' },
  { a: 'australia', b: 'antarctica', joinedByMa: 100, note: 'Australia had not yet left Antarctica' },
  { a: 'india', b: 'africa', joinedByMa: 120, note: 'India still sat against Madagascar and Africa' },
  { a: 'greenland', b: 'north-america', joinedByMa: 60, note: 'The Labrador Sea had not opened' },
  { a: 'north-america', b: 'africa', joinedByMa: 190, note: 'North-west Africa against eastern North America' },
  // Watched, not scored. Where Antarctica and Australia end up as the Pacific
  // shuts is the open question in this reconstruction, and hand-assembled
  // Expanding Earth maps put them somewhere the evidence cannot confirm.
  {
    a: 'antarctica', b: 'south-america', joinedByMa: 0,
    note: 'Watched: does Antarctica swing up the west side of South America, or stay on the pole?',
  },
  {
    a: 'australia', b: 'north-america', joinedByMa: 0,
    note: 'Watched: how far across the Pacific does Australia come?',
  },
]

/** Geological periods, for the timeline ruler. Ages in Ma. */
export const PERIODS: { name: string; startMa: number; endMa: number; color: string }[] = [
  { name: 'Neogene+Quaternary', startMa: 0, endMa: 23, color: '#f5d76e' },
  { name: 'Paleogene', startMa: 23, endMa: 66, color: '#f2a65a' },
  { name: 'Cretaceous', startMa: 66, endMa: 145, color: '#7fb069' },
  { name: 'Jurassic', startMa: 145, endMa: 201, color: '#4f9dab' },
  { name: 'Triassic', startMa: 201, endMa: 252, color: '#8f6ea8' },
]
