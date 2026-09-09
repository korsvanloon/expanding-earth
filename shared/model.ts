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
   * The same, but counting only where two *different* islands of strong crust
   * are in the same place.
   *
   * An island is the part of the model that is not allowed to deform, so this
   * is not a soft failure the way a bit of stretching is: it is two continents
   * occupying the same ground. `overlapFraction` cannot see it -- a triangle
   * overlapping its own neighbour during a closure counts there just the same,
   * and at a few tenths of a percent that number looked harmless while Arabia
   * was riding onto Africa. Nothing in the solver forbids it yet; this is the
   * measurement that says how much there is to forbid.
   */
  islandOverlapFraction: number
  /**
   * How far the deepest of those interpenetrations goes, km.
   *
   * The number that says what kind of failure it is, which the share above
   * cannot. Every pair that overlaps turns out to be a pair the age grid says
   * was one block at that moment -- Arabia and Africa have no dated sea floor
   * between them at all -- so what is being measured is two rigid blocks
   * meeting along a suture. At 41 km against a mesh spacing of 129 it is
   * below what the triangulation can resolve, which is also why a constraint
   * that pushed them apart made everything worse. See MODEL.md.
   */
  islandOverlapDeepestKm: number
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
  /**
   * What the data licenses the crust to deform, as a share of the sphere.
   *
   * The sphere's area at this radius and the rest area of the crust that exists
   * come out of the same age grid by two different routes -- a raster at
   * 8192x4096 and 81,920 triangles -- so they disagree by a few tenths of a
   * percent, and that disagreement is the whole of the licence. Everything else
   * the crust is asked to squash or stretch is the reconstruction failing to
   * move it.
   */
  budgetFraction: number
  /** Of the sphere: crust squashed below its own area, with nowhere to go. */
  squeezedFraction: number
  /** Of the sphere: crust pulled beyond its own area to cover ground. */
  stretchedFraction: number
  /** The two together. */
  deformedFraction: number
  /** `deformedFraction / budgetFraction`. One would be a model that moves crust. */
  overBudget: number
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

  /**
   * How worked each kind of crust is, from the vertical gravity gradient.
   *
   * Eotvos per 100 km, over the mesh's vertices grouped by ECM1's
   * classification of them. It is here because it is the check on whether the
   * gravity grid says anything the classification does not: the medians have to
   * separate a platform from an orogen, and the spread inside each type is the
   * part no classification can see. See tools/lib/structure.ts.
   */
  crustalFabric: { type: string; median: number; low: number; high: number }[]

  /**
   * The detected fracture zones, one entry per curve, in the order their ids
   * are painted into zones.png. Enough to name what a reader clicked on.
   */
  /**
   * The detected fracture zones, one entry per curve, numbered from 1 in the
   * order they are painted into zones.png.
   *
   * The last three are what a reader needs to argue with a detection rather
   * than only to find it: see zoneSummaries in tools/build-data.ts.
   */
  fractureZones: {
    lengthKm: number
    lon: number
    lat: number
    /** Mean sea-floor age along the curve, or null where it is undated. */
    ageMa: number | null
    /** How much the gravity swings *along* the line, Eotvos, 10th to 90th. */
    swingE: number
    /** How far the age dips on the line against 60 km either side, Myr. */
    bowlMa: number
  }[]

  /** Crust-classification variants. The first entry is the one that was solved. */
  crustModels: CrustModel[]
  solvedModel: CrustModelId
  /**
   * Where the per-triangle strength came from: `te` is Audet & Burgmann 2011's
   * measured effective elastic thickness over the third of the globe it covers,
   * `assigned` is the eleven hand-set values per ECM1 class.
   */
  strengthField: 'te' | 'assigned'
  /** Which of the first stage's knobs were turned; see BUILD_KNOBS. */
  buildOverrides: string[]
  radiusStepMa: number

  /** Reference radius curve computed at full 8192x4096 raster resolution. */
  referenceRadiusKm: number[]

  frameStepMa: number
  frameCount: number
  endTimeMa: number

  /**
   * Whether un-erupted crust was folded inside the shell rather than collapsed
   * away, which is what says there is a `sink.bin` to read. See
   * tools/lib/fold.ts.
   */
  folded?: boolean

  /**
   * When the reconstruction in this dataset was computed, ISO.
   *
   * Shown in the viewer, and the reason is a reader waiting a quarter of an
   * hour for a Pages build and then having no way to tell whether the globe in
   * front of them was the new run or a cached old one. The data is not
   * committed -- every build recomputes it -- so nothing else on the page says
   * which run it is.
   */
  builtAt?: string
  /**
   * The environment variables that were set for this run, if any.
   *
   * Empty means the run is the model as it is written down: the documents are
   * checked against it. Anything in it means the run is an experiment, and the
   * check says so and stands down rather than failing.
   */
  overrides?: string[]

  /**
   * How near a frame's age a piece of crust has to be to be paired at it, Ma.
   *
   * The floor of the conjugate check. A pair may have spread for up to this
   * long before the frame it is judged at, and that spreading lands in the
   * residual as though the model had put it there.
   */
  conjugateToleranceMa: number

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

  /**
   * An externally picked conjugate set, and what the run does with it.
   *
   * The pairs the model grades itself on come out of its own fracture-zone
   * tracer, reading the same age grid it reconstructs. Half of them are held
   * back from the solver, which controls for overfitting -- but not for the
   * tracer being wrong in the same way twice. These are somebody else's picks,
   * from the GSFML Hellinger archive, and they carry the thing the tracer
   * cannot supply: a published positional error per pick.
   *
   * `aVert` and `bVert` are the mesh points that carry the two flanks;
   * `separationKm` is what the reconstruction leaves between them at the frame
   * nearest the chron's own age. Nothing here pulls the solver -- these are a
   * ruler, and were never part of what it is fitting.
   */
  externalPairs: {
    /** Plate pair as the study named it: `SAM-AFR` and so on. */
    pair: string
    chron: string
    ageMa: number
    /** The study's own 1-sigma position error for the picks, km. */
    sigmaKm: number
    aVert: number
    bVert: number
    /** What the run leaves between them at that age, km. */
    separationKm: number
    /**
     * The two sides were welded into one point, and how far apart they were
     * when it happened.
     *
     * A reader pushed back on calling this unmeasurable and was right to. Two
     * conjugate picks were one place at the ridge, so zero apart at their own
     * chron's age is not a suspicious reading -- it is the *answer*. And when
     * the solver collapses dead crust out of the mesh it is asserting exactly
     * that: the crust between these two flanks did not exist yet, so the flanks
     * were together. Under the collapse it happens to 859 of 1,302 segments.
     *
     * What the zero cannot tell you is how good the closure was. The collapse
     * puts the merged point at the *midpoint* of the two -- see
     * `collapseVanished`, "the two sides meet in the middle" -- across whatever
     * distance it has to cross to get there. Ten kilometres is a fit as good as
     * any published; four hundred is an error the merge makes invisible.
     *
     * So this is that distance: the separation at the last recorded frame
     * before the two stopped being two points. `separationKm` stays 0, because
     * 0 is where the model put them, and it is not wrong about that.
     */
    weldedFromKm?: number
  }[]

  /**
   * How much of the paleolatitude miss a different spin axis would account for.
   *
   * Per age: the rms miss on the present axis, the rms miss after searching for
   * the axis that best reconciles the model's own positions with the measured
   * latitudes, and how far that axis had to be tilted. A latitude needs only
   * the axis and not a full rotation, so this is a two-parameter fit.
   *
   * The point of it is that a miss shared by every point in the same direction
   * is a different finding from five points missing independently. The first
   * says the whole assembly is turned, which a reference frame or true polar
   * wander can be wrong about; the second says the continents are in the wrong
   * places relative to each other, which nothing excuses. `rmsAfterDeg` is that
   * second number.
   */
  paleoAxisFit: {
    atMa: number
    rmsBeforeDeg: number
    rmsAfterDeg: number
    tiltDeg: number
  }[]

  /**
   * Where the reconstruction puts each paleomagnetic anchor, per recorded
   * frame, as a latitude in degrees.
   *
   * The one check in this project that does not depend on the radius: an
   * inclination reads an angle from the spin axis, and an angle is an angle on
   * a globe of any size. See PALEO_TARGETS.
   */
  paleolatitude: { id: string; latDeg: number[] }[]

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
  // Added when a research pass came back with dated joins this scorecard had no
  // continents to score. Boxes as that pass gave them; see RESEARCH-FINDINGS.md.
  { id: 'madagascar', label: 'Madagascar', latMin: -26, latMax: -11, lonMin: 43, lonMax: 51 },
  { id: 'arabia', label: 'Arabia', latMin: 12, latMax: 32, lonMin: 34, lonMax: 60 },
  { id: 'iberia', label: 'Iberia', latMin: 36, latMax: 44, lonMin: -10, lonMax: 3 },
  /*
   * Enderby and Kemp Land, which is the sector of East Antarctica that India
   * left. `antarctica` above is the whole continent at every longitude, and a
   * whole-continent box cannot test this join: it reports contact as soon as
   * India comes near any part of Antarctica, including the part facing
   * Australia. The box is the Rayner Complex, whose 1.0-0.9 Ga rocks correlate
   * with the Eastern Ghats belt of India -- a join attested by Precambrian
   * geology and not by sea floor at all, which is what makes it a check this
   * model cannot have been tuned against.
   */
  {
    id: 'east-antarctica', label: 'Enderby &ndash; Kemp Land',
    latMin: -72, latMax: -64, lonMin: 45, lonMax: 80,
  },
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

/*
 * The dates below were checked against the literature by a research pass, and
 * three of them were wrong; see RESEARCH-FINDINGS.md, which carries the source
 * and a status for each. Two were wrong in the model's favour -- a join scored
 * so long after the geology closes it that it could not fail -- and one against
 * it. A ruler that cannot fail is not a ruler, so they are corrected here even
 * where that makes the model look worse.
 */
export const FIT_TARGETS: FitTarget[] = [
  {
    // Was 180, which left forty million years of slack: extension continues to
    // ~126 Ma and no oceanic crust exists before ~133. Heine, Zoethout & Muller
    // 2013, Solid Earth 4, 215; Bird & Hall 2016, GJI 206, 835.
    a: 'south-america', b: 'africa', joinedByMa: 140,
    note: 'The South Atlantic had not opened; extension until ~126 Ma, first crust ~133',
  },
  {
    // Spreading initiates at chron 34, 83 Ma, after rifting from ~160; 100 is
    // inside the joined interval. Williams, Whittaker, Halpin & Muller 2019.
    a: 'australia', b: 'antarctica', joinedByMa: 100,
    note: 'Australia had not yet left Antarctica; spreading from 83 Ma',
  },
  {
    // Was 120, by which time the West Somali Basin had already finished
    // opening -- the model was being asked to shut an ocean the geology says
    // was open. India leaves Africa inside the Madagascar block: basin
    // anomalies M24Bn (152 Ma) to M0r (121 Ma). Davis, Eagles, Reeves et al.
    // 2016; Mueller & Jokat 2019.
    a: 'india', b: 'africa', joinedByMa: 165,
    note: 'India sat against Africa inside the Madagascar block, before the West Somali Basin',
  },
  {
    // Was 60, three million years *after* spreading began in the Labrador Sea
    // -- an ocean about a hundred kilometres wide that the model was asked to
    // close. Hosseinpour, Muller, Williams & Whittaker 2013, Solid Earth 4, 461.
    a: 'greenland', b: 'north-america', joinedByMa: 65,
    note: 'The Labrador Sea had not opened; spreading from ~63 Ma',
  },
  {
    // Was 190, which is the breakup instant itself. Labails, Olivet, Aslanian
    // & Roest 2010, EPSL 297, 355: opening starts in the Late Sinemurian.
    a: 'north-america', b: 'africa', joinedByMa: 195,
    note: 'North-west Africa against eastern North America, before the Central Atlantic opened',
  },
  // The joins the research pass added, each with a date that cannot be tuned
  // against because it was not derived from this model.
  {
    // India's own conjugate: Madagascar's rifted eastern margin was emplaced at
    // 87.6 +/- 0.6 Ma. Storey et al. 1995, Science 267, 852.
    a: 'india', b: 'madagascar', joinedByMa: 90,
    note: 'India against eastern Madagascar, before the Mascarene Basin',
  },
  {
    // Gondwana's first rupture, and the join India-Africa used to stand for:
    // West Somali Basin spreading from 170-160 Ma. Davis et al. 2016.
    a: 'madagascar', b: 'africa', joinedByMa: 160,
    note: 'Madagascar against Mozambique and Kenya, before the West Somali Basin',
  },
  {
    // Flood basalts at ~30 Ma, ocean floor in the Gulf of Aden from ~20 and in
    // the Red Sea from ~5. Nyangena et al. 2024, Heliyon.
    a: 'arabia', b: 'africa', joinedByMa: 30,
    note: 'Arabia unrifted from Africa, before the Gulf of Aden and the Red Sea',
  },
  {
    // Exhumed mantle from ~130 and seafloor spreading only at the Aptian-Albian
    // transition. Causer et al. 2020, Solid Earth 11, 397. Newfoundland is the
    // western end of the north-america box.
    a: 'iberia', b: 'north-america', joinedByMa: 130,
    note: 'Iberia against Newfoundland, before the Bay of Biscay and the North Atlantic',
  },
  {
    /*
     * The join the research pass says this scorecard should have had from the
     * start, and the reason India's 1,009 km miss reads differently than it
     * looked.
     *
     * Not one Expanding Earth author read in that pass closes India onto
     * Africa. Every one of them -- Maxlow, Scalera in three revisions, Vogel,
     * Hilgenberg -- puts India's western margin against East Antarctica with
     * Madagascar between it and Mozambique, and opens the Indian Ocean by two
     * ruptures rather than by India travelling. So the model was being pulled
     * towards, and scored against, an assembly its own literature does not
     * hold, while the assembly every author does hold was not on the card.
     *
     * The date: spreading in the Enderby Basin begins at chron M9r, about 133
     * Ma (Altenbernd-Lang, Jokat & Leitchenkov 2022, GJI 231, 1959), so 135 is
     * the last joined instant. It wants one more reading -- the pass reached
     * that paper's abstract and not its figures -- and until it has one, 135
     * is the honest choice rather than a rounder, safer number: a date set
     * comfortably early is a test that cannot fail.
     *
     * Independently of any sea floor, the Eastern Ghats belt of India and the
     * Rayner Complex of Enderby Land are the same 1.0-0.9 Ga orogen, reworked
     * together at 550-500 Ma (Fitzsimons 2000, Geology 28, 879). That is what
     * makes this join a check and not a preference.
     */
    a: 'india', b: 'east-antarctica', joinedByMa: 135,
    note: 'India against Enderby Land, where every Expanding Earth reconstruction puts it',
  },
  // Added because a reader looking at the globe said Africa stays much too far
  // north, that southern Africa should finish on the pole and drive Antarctica
  // up into the Pacific, and that Europe and Arabia are being crushed for want
  // of the room that would make. They were pointing at the one join with a
  // known date that this scorecard did not score. East Antarctica sat against
  // Mozambique and Tanzania in Gondwana and the Mozambique Basin opened from
  // about 165 Ma, so a model that has not closed it by 170 is wrong about the
  // largest rotation in the southern hemisphere -- and had nothing telling it
  // so.
  {
    a: 'antarctica', b: 'africa', joinedByMa: 170,
    note: 'East Antarctica against Mozambique and Tanzania, before the Mozambique Basin opened',
  },
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

/**
 * A point of continental crust whose latitude the rocks have already measured.
 *
 * Every other check in this project is a *relative* one: two margins that
 * should nest, two conjugate points that were once one. All of them compare the
 * model to itself, and none of them can say whether the whole assembly is in
 * the right place. Paleomagnetism can. An inclination in a rock of known age
 * gives the angle to the spin axis at the time it cooled, and that is a
 * latitude.
 *
 * Two things make it worth more here than it would be anywhere else.
 *
 * **It does not depend on the radius.** A latitude is an angle. Every fit in
 * the scorecard is a distance in kilometres and therefore reads differently on
 * a smaller globe; this does not. It is the only external number in the project
 * that the radius curve cannot flatter or spoil.
 *
 * **It works where nothing else does.** Past 120 Ma the run has seven held-back
 * conjugate pairs, and past 140 it has none, because there is no sea floor left
 * to pair. That is precisely the stretch where the reconstruction is worst.
 * These five points are measured to 200 Ma.
 *
 * Both compilations are carried rather than averaged, because they disagree by
 * up to 7 degrees (Australia at 200 Ma) and that disagreement is a real part of
 * the uncertainty. T12 is Torsvik et al. 2012, Earth-Sci. Rev. 114, Table 11 --
 * the running-mean global path, quoted per plate so no rotation is needed. V23
 * is Vaes, Li, Gaina & van Hinsbergen 2023, Earth-Sci. Rev. 245, 104547,
 * Table S3, rotated through the plate circuit that ships with it. The error is
 * the pole's 95% circle, which is a conservative bound on the latitude: a pole
 * A95 of 2.8 degrees does not put a 2.8 degree error on every latitude derived
 * from it, but it does bound one.
 *
 * Two honest weaknesses, which belong here rather than in a footnote:
 *
 * - The 170 Ma window is the weakest in both compilations (A95 4.6, P95 6.1),
 *   which is unfortunate, because 170 Ma is where this model's Gondwana is.
 * - **India has no rock-based pole between 125 and 210 Ma** at quality 4 or
 *   better in GPMDB. Its 170 and 200 Ma rows are the plate circuit talking, not
 *   Indian rocks -- so they test the circuit as much as the model, and India is
 *   the one continent this model most needs testing. Its one real anchor is the
 *   Rajmahal Traps at 116 Ma, which give Nagpur 43.5 +/- 2.5 S and agree with
 *   the 120 Ma row below.
 *
 * The comparison also assumes the reconstruction's frame keeps the present spin
 * axis, which is two assumptions: no net rotation of the lithosphere, and no
 * true polar wander. Torsvik's own Table 12 puts the second at up to 22.5
 * degrees at 200 Ma, so a miss of that order at the old end is not evidence
 * against the model by itself.
 */
export interface PaleoTarget {
  id: string
  label: string
  /** Where this rock sits today. Its identity; never changes. */
  lonDeg: number
  latDeg: number
  /** What each compilation says the latitude was, degrees, south negative. */
  says: { atMa: number; t12: number; t12A95: number; v23: number; v23P95: number }[]
}

export const PALEO_TARGETS: PaleoTarget[] = [
  {
    // The stable Kaapvaal craton, and the frame both compilations are published
    // in, so this row is as close to a direct reading as the method gets.
    id: 'johannesburg', label: 'Johannesburg', lonDeg: 28.0, latDeg: -26.2,
    says: [
      { atMa: 60, t12: -43.1, t12A95: 2.1, v23: -43.0, v23P95: 1.0 },
      { atMa: 120, t12: -42.3, t12A95: 2.6, v23: -41.6, v23P95: 1.5 },
      { atMa: 170, t12: -45.7, t12A95: 4.6, v23: -42.9, v23P95: 6.1 },
      { atMa: 200, t12: -42.7, t12A95: 2.8, v23: -44.4, v23P95: 1.8 },
    ],
  },
  {
    // Central India, on the Deccan. The interesting one and the weakest one:
    // see the note above about the 125-210 Ma gap.
    id: 'nagpur', label: 'Nagpur', lonDeg: 79.1, latDeg: 21.1,
    says: [
      { atMa: 60, t12: -17.7, t12A95: 2.1, v23: -14.9, v23P95: 1.0 },
      { atMa: 120, t12: -42.8, t12A95: 2.6, v23: -43.0, v23P95: 1.5 },
      { atMa: 170, t12: -34.2, t12A95: 4.6, v23: -32.7, v23P95: 6.1 },
      { atMa: 200, t12: -22.8, t12A95: 2.8, v23: -26.7, v23P95: 1.8 },
    ],
  },
  {
    // Central Dronning Maud Land. This is the row that tests whether the model
    // moves East Antarctica off the pole, which it must: 39 S at 200 Ma.
    id: 'schirmacher', label: 'Schirmacher Oasis', lonDeg: 11.7, latDeg: -70.8,
    says: [
      { atMa: 60, t12: -77.1, t12A95: 2.1, v23: -77.7, v23P95: 1.0 },
      { atMa: 120, t12: -56.8, t12A95: 2.6, v23: -56.5, v23P95: 1.5 },
      { atMa: 170, t12: -44.9, t12A95: 4.6, v23: -42.6, v23P95: 6.1 },
      { atMa: 200, t12: -38.6, t12A95: 2.8, v23: -40.8, v23P95: 1.8 },
    ],
  },
  {
    // The Australian shield. The two compilations differ by 7 degrees at 200 Ma
    // here, which is the largest disagreement in the table.
    id: 'alice-springs', label: 'Alice Springs', lonDeg: 133.9, latDeg: -23.7,
    says: [
      { atMa: 60, t12: -45.5, t12A95: 2.1, v23: -44.2, v23P95: 1.0 },
      { atMa: 120, t12: -61.8, t12A95: 2.6, v23: -59.7, v23P95: 1.5 },
      { atMa: 170, t12: -50.3, t12A95: 4.6, v23: -53.3, v23P95: 6.1 },
      { atMa: 200, t12: -36.3, t12A95: 2.8, v23: -43.5, v23P95: 1.8 },
    ],
  },
  {
    // The Brazilian shield, conjugate to the African one above: if the South
    // Atlantic shuts at the right time these two must also agree on latitude.
    id: 'brasilia', label: 'Brasília', lonDeg: -47.9, latDeg: -15.8,
    says: [
      { atMa: 60, t12: -24.4, t12A95: 2.1, v23: -24.9, v23P95: 1.0 },
      { atMa: 120, t12: -13.4, t12A95: 2.6, v23: -13.0, v23P95: 1.5 },
      { atMa: 170, t12: -18.9, t12A95: 4.6, v23: -16.0, v23P95: 6.1 },
      { atMa: 200, t12: -19.6, t12A95: 2.8, v23: -19.8, v23P95: 1.8 },
    ],
  },
]

/** The band the two compilations together allow at one age, degrees. */
export function paleoBand(
  says: PaleoTarget['says'][number],
): [low: number, high: number] {
  return [
    Math.min(says.t12 - says.t12A95, says.v23 - says.v23P95),
    Math.max(says.t12 + says.t12A95, says.v23 + says.v23P95),
  ]
}
