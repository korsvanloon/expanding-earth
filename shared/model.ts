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
   * Fraction of the sphere still taken up by crust that did not exist yet.
   * If the reconstruction closes perfectly this goes to zero; whatever is left
   * is the model failing to account for the surface, stated plainly.
   */
  gapFraction: number
  /** Fraction of the sphere in triangles the solver has folded over. */
  overlapFraction: number
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
  scorecard: { a: string; b: string; joinedByMa: number; note: string; separationKm: number[] }[]

  diagnostics: FrameDiagnostics[]
  /** Same, for a control run with the radius held at R0 (plate tectonics null model). */
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
  /** They should be in contact at and before this time. */
  joinedByMa: number
  note: string
}

export const FIT_TARGETS: FitTarget[] = [
  { a: 'south-america', b: 'africa', joinedByMa: 180, note: 'The South Atlantic had not opened' },
  { a: 'australia', b: 'antarctica', joinedByMa: 100, note: 'Australia had not yet left Antarctica' },
  { a: 'india', b: 'africa', joinedByMa: 120, note: 'India still sat against Madagascar and Africa' },
  { a: 'greenland', b: 'north-america', joinedByMa: 60, note: 'The Labrador Sea had not opened' },
  { a: 'north-america', b: 'africa', joinedByMa: 190, note: 'North-west Africa against eastern North America' },
]

/** Geological periods, for the timeline ruler. Ages in Ma. */
export const PERIODS: { name: string; startMa: number; endMa: number; color: string }[] = [
  { name: 'Neogene+Quaternary', startMa: 0, endMa: 23, color: '#f5d76e' },
  { name: 'Paleogene', startMa: 23, endMa: 66, color: '#f2a65a' },
  { name: 'Cretaceous', startMa: 66, endMa: 145, color: '#7fb069' },
  { name: 'Jurassic', startMa: 145, endMa: 201, color: '#4f9dab' },
  { name: 'Triassic', startMa: 201, endMa: 252, color: '#8f6ea8' },
]
