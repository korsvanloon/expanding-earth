/**
 * Stage 1 of the pipeline: turn the seafloor age grid into a mesh whose every
 * triangle knows when it was created, plus the radius curve that follows from
 * it.
 *
 * The whole model rests on one assumption -- no crust is ever destroyed -- from
 * which the Earth's past size is not a free parameter but a measurement:
 *
 *     A(t) = area of all crust already present at time t
 *     R(t) = sqrt( A(t) / 4pi )
 *
 * Note that R depends on the square root of an *area integral*. Per-pixel noise
 * in the age grid averages out completely, and even a 10% error in the area
 * budget moves the radius by only 5%. That is what makes this tractable despite
 * a source dataset that is neither complete nor entirely correct.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import {
  Raster, areaQuantile, downsample, downsampleField, loadRaster,
} from './lib/raster.js'
import { loadAgeGrid } from './lib/agegrid.js'
import { obliquityDeg, overDisc, spreadingDirection } from './lib/age-gradient.js'
import {
  axisOf, grainReference, grooveField, grooveLineaments, grooveRaster, linkGrooves, readKm,
  trimAgainst, trimEither, walkGrooves, type Groove,
} from './lib/grooves.js'
import {
  AGE_SAMPLES, encodeAge, momentOf, olderShare,
} from '../shared/age-samples.js'
import { buildIcosphere, sphericalTriangleArea } from './lib/icosphere.js'
import { directionToPixel, directionToUv, lonLatToDirection } from '../shared/sphere.js'
import { CRUST_RIGIDITY, CRUST_TYPES } from '../shared/crust.js'
import { gridValue, readGrid, type Grid } from './lib/grid.js'
import {
  fabricRaster, fillGaps, fractureZones, lineaments, sampleStructure,
} from './lib/structure.js'
import { flowField } from './lib/flowfield.js'
import { subdivision } from './lib/resolution.js'
import { unstretching } from './lib/unstretching.js'
import { findIslands } from './lib/islands.js'
import { conjugatePairs, faceSnapper, traceFlowLines } from './lib/flowlines.js'
import { writeTracks } from '../shared/tracks.js'
import {
  PERMANENT_MA,
  R0_KM,
  type CrustModel,
  type CrustModelId,
  type Meta,
} from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEXTURES = resolve(ROOT, 'public/textures')
const OUT = resolve(ROOT, 'public/data')
/**
 * Where the handover to the solver goes. Not in public/data: everything there
 * is copied onto the published site, and this is a hundred and ten kilobytes
 * of the solver's own working notes that the viewer never reads.
 */
const STAGE = resolve(ROOT, '.stage')

/** Quality of the crustal-fabric raster; see where it is written. */
const FABRIC_QUALITY = 90

export const CONFIG = {
  /**
   * How finely the shell is divided. Six is 40,962 points and is what the
   * published run uses.
   *
   * Five is a quarter of the triangles and solves the whole two hundred
   * million years in under a minute, which is the difference between trying a
   * parameter and deciding to try it tomorrow. It is a different model, not a
   * cheaper view of the same one: the area budget is read off a coarser shell,
   * so it ends 8 km smaller, and the fits it reports are its own -- the Pacific
   * measured 2083 km across where the full run says 2689, and North America
   * against Africa 454 km where the full run gets to 96. Use it to decide which
   * way a parameter moves things, never for a number worth quoting.
   *
   * Seven would need wider corner indices than the per-frame topology writes;
   * `shared/topology.ts` throws rather than wrap.
   */
  subdivision: subdivision(),
  /** Working resolution for the age and height rasters. */
  gridWidth: 2048,
  gridHeight: 1024,
  /**
   * The oldest age is not set here any more; it is read off the grid.
   *
   * It used to be, because the source was a picture: 255 grey levels needed a
   * span to be stretched over, and the span was calibrated on one identifiable
   * landmark -- grey 254 sits in the Herodotus Basin of the eastern
   * Mediterranean, the oldest oceanic crust on Earth at about 280 Ma. That was
   * a reasonable thing to do to a picture and it is not needed now: the netCDF
   * carries the ages themselves and says 338.81 Ma, which is the Herodotus
   * Basin again with the number the survey actually assigns it rather than the
   * one the ramp had room for.
   */

  /** Fraction of the globe that is dry land — calibrates the height map. */
  landFraction: 0.292,
  /** Fraction of the globe underlain by continental crust including margins. */
  continentalFraction: 0.41,
  endTimeMa: 200,
  radiusStepMa: 1,
  frameStepMa: 5,
  /**
   * How far apart the fracture-zone tracks are seeded along the ridges, km.
   *
   * Two hundred and fifty gives about five hundred tracks and two and a half
   * thousand conjugate pairs, against the four hand-chosen continent pairs the
   * model was scored on before. Closer spacing costs nothing to trace but the
   * pairs stop being independent: neighbouring seeds slide onto the same stretch
   * of axis and walk the same fracture zone.
   */
  seedSpacingKm: 250,
  /**
   * How far apart two conjugate pairs have to be, end for end, km.
   *
   * The point is an even spread over the whole world rather than the most
   * pairs obtainable, and those are different things: pairs are taken wherever
   * both flanks of a path survive, so the oceans that kept both flanks carried
   * the answer. Before this, 52% of pairs were Atlantic and 16% Pacific, while
   * the paths themselves were spread 80 to 54 -- the paths were never the
   * problem. A reader put the rule plainly: an even spread, and never mind
   * that the points end up far apart.
   *
   * A hundred and fifty is the knee of the curve, swept with PAIR_SWEEP=1:
   *
   *     spacing   pairs   Atlantic  Indian  Pacific
   *           0    2587        50%     30%      16%
   *         150     905        40%     32%      24%
   *         400     274        37%     32%      26%
   *
   * Four fifths of the balance for a third of the loss, and past it the trade
   * turns bad -- three more points of balance for seventy per cent of the
   * pairs. Past 150 the remaining imbalance is not a knob left loose: by area
   * the Pacific is about 46% of the sea floor, and most of its crust has no
   * surviving conjugate in the age grid at all, so no thinning rule can build
   * a pair whose other half is absent.
   */
  pairSpacingKm: Number(process.env.PAIR_SPACING ?? 150),
  /**
   * How far the gravity grid's lineaments may pull a traced step away from the
   * age gradient, at full coherence. Zero reads the age grid alone.
   *
   * Not read from the environment, though it was while it was being tuned, and
   * that cost a wasted comparison: the freshness check in tools/run.ts compares
   * the output's timestamp against its inputs, an environment variable is not
   * an input, and the second of two runs quietly reported "up to date" and
   * shipped the first one's answer. Anything that changes the output belongs in
   * a file, where changing it changes a timestamp.
   */
  structureWeight: 0.4,
  /** Where the lineament starts and stops being trusted, by coherence. */
  structureFloor: 0.15,
  structureFull: 0.35,
  /** How far it may disagree with the age gradient before it is ignored. */
  structureMaxDeg: 40,
  /** How far the gravity field is low-passed before the tensor, km. */
  structureSmoothKm: 100,
  /** How wide the tensor's own window is, km. */
  structureWindowKm: 200,
  /**
   * The sharper field the paths are pulled onto, and how hard.
   *
   * A quarter of the smoothing and a third of the window: at the blurred scale
   * a point picked at random already carries 89% of the strongest line-strength
   * within sixty kilometres, so there is no crest to aim at. At 25/60 that
   * share is 71% and the strong ridges come 133 km apart.
   */
  crestSmoothKm: 25,
  crestWindowKm: 60,
  /**
   * Off, and measured before being switched off.
   *
   * The mechanism works: at 0.2 it takes the median distance from a path to the
   * strongest line beside it from 31 km to 23, and lifts the line-strength a
   * path sits on from 0.70 of the best nearby to 0.77. Through the solver it
   * makes the reconstruction worse -- 215 km at 40 Ma against 228, but 364 at 60
   * against 320, 615 at 90 against 507, and 1062 at 120 against 998, on the same
   * number of pairs. At 90 Ma that is worse than using no gravity data at all.
   *
   * Which says what the lines at this scale are. Smoothed at 25 km the strong
   * ridges are not only fracture zones: they are also abyssal-hill fabric,
   * seamount chains and ridge segments, and none of those is a path the crust
   * took. Pulling onto the nearest strong ridge therefore sometimes moves a
   * path onto a feature that is not a flow line, after which it follows the
   * wrong thing for thousands of kilometres -- which is why the median track end
   * moved 2,724 km.
   *
   * And it cannot be fixed by choosing a better smoothing, because the two
   * requirements pull opposite ways: the smoothing that removes the hills from
   * the direction (100 km) is the smoothing that flattens the crest away. What
   * this needs is a field of flow-line features only, which means telling a
   * fracture zone from an abyssal hill before following either. Set crestPull
   * above zero and pass such a field as `crest` and the follower is waiting.
   */
  crestPull: Number(process.env.CREST_PULL ?? 0),
  /**
   * What counts as a fracture zone; see tools/lib/structure.ts for each.
   *
   * The gate is a ramp closing at thirty-five degrees, the strength cut is a
   * quantile of what survives the thinning, and a curve has to run 400 km to be
   * kept at all.
   *
   * The cut is set low on purpose. At 0.7 it gives 970 zones over 0.8% of the
   * sea floor, on ground at the 68th percentile of roughness against the 62nd
   * to either side; at 0.5 it gives 1,622 zones over 1.36%, on ground at the
   * 60th against the 55th. The stricter setting is the better *detector* and
   * the looser one is the better *anchor set*, which is what these are for: a
   * flow field fitted through them is constrained by all of them at once, so a
   * few soft calls are outvoted, while gaps between anchors are filled by
   * nothing but the smoothness of the fit.
   */
  alignmentGate: 0.82,
  /**
   * A spreading axis is not a fracture zone. See axisBowlMa in
   * tools/lib/structure.ts for what these mean and the 27 labelled curves they
   * were set against; zero switches the test off.
   */
  /**
   * **Off, because it makes a better detector and a worse model.**
   *
   * Dropping the 43 curves it flags -- 709 to 666, exactly as its cost grid
   * said -- costs the reconstruction plainly: conjugate pairs reunited fall
   * from 45% to 36% at 60 Ma, 35% to 22% at 90 and 32% to 17% at 120, with the
   * median separation at 120 Ma going 303 km to 447, and on the fixed
   * continent scorecard nothing improves and four pairs get worse, South
   * America and Africa from 40% to 30%.
   *
   * A wrong anchor beats no anchor, and this document already said so about the
   * strength cut: a loose cut is the worse detector and the better anchor set,
   * because the flow field is fitted through all of them at once, so a few soft
   * calls are outvoted while a gap between anchors is filled by nothing but the
   * smoothness of the fit. Removing curves for being wrong is the same trade
   * the other way and it loses for the same reason.
   *
   * So the axes stay in the fit and the viewer says which they are instead. The
   * bowl and the age travel with every zone in meta.json for exactly that.
   */
  axisBowlMa: Number(process.env.AXIS_BOWL ?? 0),
  axisAgeMa: Number(process.env.AXIS_AGE ?? 40),
  strengthQuantile: 0.5,
  minZoneLengthKm: 400,
  crestReachKm: 60,
  crestMaxShiftKm: 8,
  /**
   * Whether the walk follows the fitted field at all.
   *
   * Here so that the control run can be reproduced by changing a file, which
   * is the only kind of change the freshness check in tools/run.ts can see.
   */
  useFlowField: true,
  /** Relaxation sweeps for the flow field, and how hard an anchor holds. */
  flowPasses: 300,
  flowAnchorWeight: 0.6,
  /**
   * How near a frame's age a track point has to be to be paired at it, Ma.
   *
   * Every million years of slack is a few tens of kilometres of spreading the
   * pair is allowed to have done before the frame it is measured at, and that
   * slack lands in the residual as if the model had put it there. Four Ma of
   * tolerance put a couple of hundred kilometres into the floor. Two is about
   * as tight as the grid allows -- one grey level is 1.1 Ma.
   */
  conjugateToleranceMa: 2,
  /**
   * How far a pair's join may run off the local spreading direction, degrees.
   *
   * Forty-five is loose on purpose. The measurement it comes from shows the
   * bulk of the pairs within about fifteen degrees and a distinct tail past
   * forty-five, so this cuts the tail and leaves the argument about where
   * exactly to put it for when there is a number that decides it.
   */
  maxPairObliquityDeg: Number(process.env.PAIR_OBLIQUE ?? 45),
  /**
   * How wide a disc the age is averaged over before its gradient is read, km.
   *
   * The spreading direction is a property of the regional age field, not of a
   * tenth of a degree of it. A fracture zone offsets the isochrons, so read
   * narrowly the gradient on a fracture zone points across the zone -- and the
   * obliquity filter then rejected precisely the pairs that straddle one,
   * which are the pairs whose partners are least in doubt.
   */
  spreadingDiscKm: Number(process.env.AGE_DISC ?? 200),
  /**
   * How far a groove may run off its reference direction before it is dropped.
   *
   * Thirty degrees is loose, on purpose and on a reader's evidence: they went
   * through a window of the South Atlantic segment by segment and said the
   * rejected ones were right to be rejected but that a third of them were
   * good lines. Letting a little rubbish through is the cheaper mistake, since
   * a wrong line can be seen in the viewer and a right line never drawn cannot.
   */
  grooveSwingDeg: Number(process.env.GROOVE_SWING ?? 30),
  /**
   * Which share of the globe's cells the cheap scout throws out before the
   * real measurement. Higher is faster and finds fewer grooves.
   */
  grooveScoutQuantile: Number(process.env.GROOVE_SCOUT ?? 0.4),
  /**
   * Whether the grooves, rather than the old lineaments, anchor the
   * travelled-direction field -- and so decide which way the mesh moves.
   */
  grooveFlow: Number(process.env.GROOVE_FLOW ?? 1) > 0,
  /**
   * What a groove has to be to anchor the travelled-direction field.
   *
   * Every groove is drawn; only some of them get a vote. The first attempt gave
   * all ten thousand of them one, at thirty degrees of licence against either
   * reference, and the model came out worse on every measure -- 175 to 222 km
   * at 30 Ma, 184 to 268 at 60. The reason is that a fit takes a vote: twenty
   * times as many anchors outvote the clean ones, so a dense wrong anchor beats
   * a sparse right one. What was the cheaper mistake for a picture -- letting
   * rubbish through, since a reader can see a wrong line and cannot see a right
   * line never drawn -- is the dearer one here.
   *
   * The angle is the old detector's own gate, twenty degrees off the way the
   * crust travelled. The length is not: its four hundred kilometres was of
   * line, and applied to *read* line it left 48 grooves on 0.14% of the grid's
   * cells -- sparser than the detector it was copied from, which had 0.6% to
   * 1%. So the length is set to land at that density instead, which the
   * measured distribution puts at two hundred kilometres: 516 grooves carrying
   * 143,000 km of read line, the same order as the old detector's 679 curves.
   * The conditions are its conditions; only the lines underneath are new.
   *
   * Read length, not length, because a linked groove can be mostly bridge and
   * a bridge is a claim rather than evidence. And measured against the
   * spreading direction alone, not against the neighbours' grain as well,
   * because the grain is a vote among the very segments being judged and
   * cannot referee itself -- for a picture it can, since a reader checks the
   * answer, but not for a fit.
   */
  anchorMinReadKm: Number(process.env.ANCHOR_KM ?? 200),
  anchorMaxOffDeg: Number(process.env.ANCHOR_OFF ?? 20),
  /** How many tracks the viewer is given to draw. A picture, not the dataset. */
  drawnTracks: Number(process.env.DRAWN_TRACKS ?? 60),
  /**
   * Which classification the solver actually runs on. The depth-age fit only
   * reaches r2 ~ 0.18 against this particular height map, so interpolating ages
   * from genuinely dated neighbours is the more defensible default; depth-age
   * stays in the ensemble as a cross-check.
   */
  solvedModel: 'nearest-age' as CrustModelId,
}


async function main() {
  // Before anything is written, not beside the first thing that writes.
  // public/data is generated and so is not in the repository, which means it is
  // absent on a fresh checkout -- and a build step that made the directory on
  // its way past worked here and failed in CI the moment something else wrote
  // first.
  mkdirSync(OUT, { recursive: true })
  console.log('[build-data] loading rasters')
  const ageFull = await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc'))
  let oldest = 0
  let dated = 0
  for (const value of ageFull.data) {
    if (Number.isNaN(value)) continue
    dated++
    if (value > oldest) oldest = value
  }
  const maxAgeMa = Math.ceil(oldest)
  console.log(
    `  agegrid.nc        ${ageFull.width}x${ageFull.height}, ages to `
      + `${oldest.toFixed(2)} Ma over ${((100 * dated) / ageFull.data.length).toFixed(1)}% of cells`,
  )
  const referenceRadiusKm = referenceCurve(ageFull, maxAgeMa)

  const age = downsampleField(ageFull, CONFIG.gridWidth, CONFIG.gridHeight)
  const height = downsample(
    loadRaster(resolve(TEXTURES, 'height-map.jpg')),
    CONFIG.gridWidth,
    CONFIG.gridHeight,
    -1,
  )

  const seaLevel = areaQuantile(height, CONFIG.landFraction)
  const shelfBreak = areaQuantile(height, CONFIG.continentalFraction)
  console.log(`  height calibration: sea level grey=${seaLevel}, shelf break grey=${shelfBreak}`)

  const depthAgeFit = fitDepthAge(age, height, shelfBreak)
  console.log(
    `  depth-age fit: grey = ${depthAgeFit.intercept.toFixed(1)} ` +
      `${depthAgeFit.slope.toFixed(2)}*sqrt(age),  r2=${depthAgeFit.r2.toFixed(3)} ` +
      `(n=${depthAgeFit.sampleCount})`,
  )

  console.log('[build-data] classifying crust')
  const ageFields = {
    permanent: classify(age, height, shelfBreak, 'permanent', depthAgeFit, maxAgeMa),
    'depth-age': classify(age, height, shelfBreak, 'depth-age', depthAgeFit, maxAgeMa),
    'nearest-age': classify(age, height, shelfBreak, 'nearest-age', depthAgeFit, maxAgeMa),
  } satisfies Record<CrustModelId, Float32Array>

  console.log(`[build-data] building icosphere (subdivision ${CONFIG.subdivision})`)
  const mesh = buildIcosphere(CONFIG.subdivision)
  const vertexCount = mesh.positions.length / 3
  const faceCount = mesh.indices.length / 3
  console.log(`  ${vertexCount} vertices, ${faceCount} faces`)

  const faceArea = computeFaceAreas(mesh.positions, mesh.indices)

  const assumptions: Record<CrustModelId, string> = {
    permanent:
      'Every undated cell is permanent continental crust. Upper bound on past radius.',
    'depth-age':
      'Undated cells in deep water are oceanic; their age is read off the ' +
      'depth-age relation fitted to the dated cells. Undated shallow cells are continental.',
    'nearest-age':
      'Undated cells in deep water are oceanic and inherit the age of the ' +
      'nearest dated cell. Lower bound on past radius.',
  }

  // What the crust was, not what it is. ECM1 says a fifth of the shell is
  // thinner than unextended continental crust, which means it was pulled out to
  // get that way and covered less ground before it was: the area budget the
  // radius comes from has to count it at the size it had then, not now.
  const crust = sampleCrust(mesh)
  const thinning = unstretching(
    crust.thickness,
    sampleFaceAges(mesh, ageFields[CONFIG.solvedModel], age),
    crust.rigidity,
    faceCount,
    mesh.indices,
    crust.type,
  )

  const crustModels: CrustModel[] = (Object.keys(ageFields) as CrustModelId[]).map((id) => ({
    id,
    label: id,
    assumption: assumptions[id],
    radiusKm: radiusCurve(
      sampleCrustAge(mesh, ageFields[id], age, true).faces, faceArea, thinning,
    ),
  }))
  // The solved variant goes first so the app can treat it as the default.
  crustModels.sort((a, b) =>
    a.id === CONFIG.solvedModel ? -1 : b.id === CONFIG.solvedModel ? 1 : 0,
  )

  const solvedFaceAges = sampleFaceAges(mesh, ageFields[CONFIG.solvedModel], age)
  const solvedVertexAges = sampleVertexAges(mesh, ageFields[CONFIG.solvedModel], age)
  const crustAge = sampleCrustAge(mesh, ageFields[CONFIG.solvedModel], age)

  for (const model of crustModels) {
    const last = model.radiusKm[model.radiusKm.length - 1]
    console.log(
      `  ${model.id.padEnd(12)} R(${CONFIG.endTimeMa} Ma) = ${last.toFixed(0)} km ` +
        `(${((100 * last) / R0_KM).toFixed(1)}% of today)`,
    )
  }

  // The mesh-derived area budget against the same measurement taken at full
  // 8192x4096 raster resolution, which catches a triangulation too coarse to
  // hold the budget -- but is not a score, and was read as one.
  //
  // The two are not measuring the same thing. The mesh curve counts a stretched
  // margin at the size it had before it was stretched, because that is what the
  // radius has to be sized for; the reference counts today's ground as it
  // stands. That correction ramps in over each margin's own rifting, so the gap
  // between the curves grows with time whether the mesh is fine enough or not,
  // and most of what this number reports at 200 Ma is that correction rather
  // than the triangulation. Watch it for a jump, not for its value.
  const meshCurve = crustModels.find((m) => m.id === 'permanent')!.radiusKm
  let worst = 0
  for (let t = 0; t < meshCurve.length; t++) {
    worst = Math.max(worst, Math.abs(meshCurve[t] - referenceRadiusKm[t]) / referenceRadiusKm[t])
  }
  console.log(
    `  mesh vs full-resolution radius curve: max deviation ${(100 * worst).toFixed(2)}% `
      + '(mostly the un-stretching, which the reference does not model)',
  )

  // The mesh is no longer cut into plates. It closes up instead: when the crust
  // under a triangle has not been made yet the triangle goes, and what moves
  // together is whatever the surviving crust holds together. A fixed set of
  // plates cannot say that North America is one piece for a hundred and fifty
  // million years and then two when the Gulf of Mexico shuts, and that is the
  // sort of thing the reconstruction has to be free to find. See
  // tools/lib/dynamic-mesh.ts.
  // The islands of strong crust that hold their shape, worked out here so the
  // solver and the viewer are looking at the same ones.
  const islands = findIslands(mesh.indices, crust.rigidity, faceArea, faceCount, vertexCount)

  // The shell as one piece. An earlier pipeline cut it into fragments along its
  // weak crust and handed the solver fracture constraints to hold them together;
  // this solver closes the mesh up instead and threw on any cut mesh it was
  // given, so the cutting had been unreachable for a while. `cutPairs` stays in
  // mesh.bin as an empty array to keep the file's shape.
  const shell = {
    positions: Float32Array.from(mesh.positions),
    indices: Uint32Array.from(mesh.indices),
    faceFragment: new Uint16Array(faceCount),
    vertexFragment: Uint16Array.from(islands.vertexIsland, (id) => id + 1),
    origin: Uint32Array.from({ length: vertexCount }, (_, v) => v),
    cutPairs: new Uint32Array(0),
    fragmentCount: 1,
  }

  // --- what the crust is made of, at a tenth of a degree ------------------
  //
  // ECM1 says what kind of crust a square degree is; the gravity gradient says
  // what has happened inside it. See tools/lib/structure.ts.
  const structure = sampleGravityStructure(shell, crust.type)

  // --- the stretch marks -------------------------------------------------
  //
  // Which piece of crust was once against which, read out of the same age grid
  // that drives the whole model. See tools/lib/flowlines.ts.
  console.log('[build-data] tracing fracture zones')
  // Traced on the age map at its own resolution, not on the working grid the
  // rest of the pipeline uses. The source is 8192x4096, five kilometres to the
  // pixel; the working grid is a quarter of that in each direction, and every
  // bend in a fracture zone narrower than twenty kilometres was being thrown
  // away before the walk started. The rest of the pipeline still reads the
  // downsampled grid -- an area budget does not care about five-kilometre
  // detail, and a walk along a lineament does.
  const ageMa = ageFull.data as Float32Array
  // The gravity grid's own idea of which way the lineaments run, mixed into the
  // age gradient at every step. See tools/lib/structure.ts for the instrument
  // and CONFIG.structureWeight for how far it is trusted.
  // Two lineament fields at two scales, because one cannot do both jobs. The
  // blurred one says which way the lines run; the sharp one says where they
  // are. See the crest options in tools/lib/flowlines.ts for why.
  const vgg = CONFIG.structureWeight > 0 || CONFIG.crestPull > 0
    ? readGrid(readFileSync(resolve(ROOT, 'data-src/vgg.grid')))
    : undefined
  const lines = vgg && CONFIG.structureWeight > 0
    ? lineaments(vgg, R0_KM, CONFIG.structureWindowKm, CONFIG.structureSmoothKm)
    : undefined
  // Detected whether or not anything steers by them, because they are worth
  // looking at: the viewer paints them on the crust so that a reader can put
  // them beside the traced paths and see for themselves whether the two agree.
  // One field for both jobs now, the sharp one. It used to walk along the
  // blurred field on the reasoning that the sharp axis is too noisy to follow
  // for hundreds of kilometres and that following it would destroy the very
  // continuity being tested. Reasoned rather than measured, and wrong: swept
  // over four scales, taking the bearing from the sharp field brings a curve's
  // angle against the line a reader can see from a median 25 degrees to 18,
  // and 27 curves a reader marked as wrong from 27 degrees to 19, while the
  // curves stay just as long -- 709 of them at a median 559 km against 679 at
  // 569. Smoothing a bearing over a hundred kilometres cuts the corner of
  // everything that bends inside that distance, which is what the reader saw:
  // "the line I can see is more curved". See tools/measure-zones.ts, which
  // sweeps it with GUIDE_WINDOW and GUIDE_SMOOTH.
  const sharpLines = vgg
    ? lineaments(vgg, R0_KM, CONFIG.crestWindowKm, CONFIG.crestSmoothKm)
    : undefined
  const detected = vgg && lines && sharpLines
    ? fractureZones(
        sharpLines,
        sharpLines, ageMa, ageFull.width, ageFull.height, R0_KM,
        {
          alignmentGate: CONFIG.alignmentGate,
          axisBowlMa: CONFIG.axisBowlMa,
          axisAgeMa: CONFIG.axisAgeMa,
          strengthQuantile: CONFIG.strengthQuantile,
          minLengthKm: CONFIG.minZoneLengthKm,
        },
      )
    : undefined
  const zones = detected?.zones
  if (zones && detected) {
    console.log(
      `[build-data] ${detected.curves.length} fracture zones linked from the gravity grid, ` +
        `median ${curveLengthKm(detected.curves, zones)} km long -- still what the flow lines ` +
        `follow, though no longer what the viewer draws`,
    )
  }

  // --- the grooves --------------------------------------------------------
  //
  // What the viewer draws as fracture zones, and what a reader has been
  // judging window by window: the light band with a dark centre line, kept
  // where it runs along the spreading direction or its neighbours' grain,
  // never on continental crust, carried through where the trough fades.
  //
  // It replaces the old detector in the picture and not yet in the model. The
  // flow lines and therefore the pairs still follow `zones` above, because
  // changing what the solver is pulled by is a separate step with its own
  // score to answer for, and mixing the two would leave neither measurable.
  const grooves = traceGrooves(
    structure.fabricCells, structure.gravity,
    ageMa, ageFull.width, ageFull.height, height, shelfBreak,
  )
  {
    const raster = grooveRaster(
      grooves.grooves, structure.gravity.width, structure.gravity.height,
    )
    // Three channels: how strong the line is, and which groove it belongs to
    // split over the other two. A reader points at a fracture zone and the
    // viewer has to know which one they meant, so the identity travels in the
    // picture rather than beside it.
    const pixels = new Uint8Array(raster.strength.length * 4)
    let lit = 0
    for (let i = 0; i < raster.strength.length; i++) {
      pixels[i * 4] = raster.strength[i]
      pixels[i * 4 + 1] = raster.curve[i] & 0xff
      pixels[i * 4 + 2] = raster.curve[i] >> 8
      pixels[i * 4 + 3] = 255
      if (raster.strength[i]) lit++
    }
    const png = new PNG({
      width: structure.gravity.width, height: structure.gravity.height, colorType: 2,
    })
    png.data.set(pixels)
    const encoded = PNG.sync.write(png)
    writeFileSync(resolve(OUT, 'zones.png'), encoded)
    console.log(
      `[build-data] wrote public/data/zones.png -- grooves on `
        + `${((100 * lit) / raster.strength.length).toFixed(1)}% of the grid's cells `
        + `(${(encoded.length / 1e6).toFixed(1)} MB)`,
    )
  }

  const crest = CONFIG.crestPull > 0 ? zones : undefined

  // The direction field the walk follows, fitted through every detected
  // fracture zone at once and to the age grid everywhere else. See
  // tools/lib/flowfield.ts for why this replaces steering step by step.
  /**
   * The anchors the travelled-direction field is fitted through.
   *
   * This is the one seam where a detector reaches the model rather than the
   * picture: the field says which way the crust went everywhere, following it
   * gives the flow lines, the flow lines give the conjugate pairs, and half of
   * those pull the solver. So whichever detector feeds this decides which way
   * the mesh moves.
   *
   * The grooves feed it now. GROOVE_FLOW=0 puts the old lineaments back, which
   * is how the two are compared: one number decides it, the median distance
   * between the held-back pairs, and it is measured on pairs the solver never
   * saw either way.
   */
  const anchors = CONFIG.grooveFlow
    ? (() => {
      const long = grooves.grooves.filter(
        (groove) => readKm(groove) >= CONFIG.anchorMinReadKm,
      )
      const { kept } = trimAgainst(long, grooves.spreading, CONFIG.anchorMaxOffDeg)
      const field = grooveLineaments(
        kept, structure.gravity.width, structure.gravity.height,
      )
      let lit = 0
      for (const value of field.ridgeness) if (value > 0) lit++
      console.log(
        `[build-data] ${kept.length} of ${grooves.grooves.length} grooves anchor the flow `
          + `field -- ${CONFIG.anchorMinReadKm} km of read line and within `
          + `${CONFIG.anchorMaxOffDeg} degrees of the spreading direction -- `
          + `on ${((100 * lit) / field.ridgeness.length).toFixed(2)}% of the grid's cells`,
      )
      return field
    })()
    : zones
  const field = CONFIG.useFlowField && anchors && vgg
    ? flowField(anchors, ageMa, ageFull.width, ageFull.height, vgg, R0_KM,
        { passes: CONFIG.flowPasses, anchorWeight: CONFIG.flowAnchorWeight })
    : undefined
  if (field) {
    let confidence = 0
    for (const c of field.confidence) confidence += c
    console.log(
      `[build-data] flow field ${field.width}x${field.height}, ` +
        `mean confidence ${(confidence / field.confidence.length).toFixed(2)}`,
    )
  }
  const traced = traceFlowLines(
    ageMa,
    ageFull.width,
    ageFull.height,
    {
      seedSpacingKm: CONFIG.seedSpacingKm,
      lineaments: lines,
      structureWeight: CONFIG.structureWeight,
      structureFloor: CONFIG.structureFloor,
      structureFull: CONFIG.structureFull,
      structureMaxDeg: CONFIG.structureMaxDeg,
      field,
      crest,
      crestPull: CONFIG.crestPull,
      crestReachKm: CONFIG.crestReachKm,
      crestMaxShiftKm: CONFIG.crestMaxShiftKm,
    },
  )
  console.log(
    `  ${traced.tracks.length} tracks from ${traced.seeds} ridge seeds; ` +
      Object.entries(traced.rejected).map(([why, n]) => `${n} ${why}`).join(', '),
  )
  const snapToFace = faceSnapper(shell.positions, shell.indices, vertexCount)
  const frameAges = Array.from(
    { length: Math.floor(CONFIG.endTimeMa / CONFIG.frameStepMa) + 1 },
    (_, i) => i * CONFIG.frameStepMa,
  )
  const conjugates = conjugatePairs(
    traced.tracks, frameAges, snapToFace, CONFIG.conjugateToleranceMa, CONFIG.pairSpacingKm,
  )
  /**
   * What other spacings would have given, so the knob is chosen and not guessed.
   *
   * Cheap next to the tracing that produced the paths, and the two numbers it
   * decides between pull against each other: a wide spacing evens the oceans
   * out and leaves too few pairs to score on, a narrow one keeps the count and
   * lets whichever ocean kept both flanks carry the answer.
   */
  if (Number(process.env.PAIR_SWEEP ?? 0) > 0) {
    console.log('  spacing   pairs   Atlantic  Indian  Pacific  Southern')
    for (const spacingKm of [0, 100, 150, 200, 300, 400]) {
      const set = conjugatePairs(
        traced.tracks, frameAges, snapToFace, CONFIG.conjugateToleranceMa, spacingKm,
      ).pairs
      const basins = new Map<string, number>()
      for (const pair of set) {
        const place = (point: { v: number[]; w: number[] }) => {
          let x = 0
          let y = 0
          let z = 0
          for (let k = 0; k < 3; k++) {
            const v = point.v[k] * 3
            x += mesh.positions[v] * point.w[k]
            y += mesh.positions[v + 1] * point.w[k]
            z += mesh.positions[v + 2] * point.w[k]
          }
          const l = Math.hypot(x, y, z) || 1
          const [u, w] = directionToUv(x / l, y / l, z / l)
          return { lon: (u - 0.5) * 360, lat: (w - 0.5) * 180 }
        }
        const a = place(pair.a)
        const b = place(pair.b)
        const lon = (a.lon + b.lon) / 2
        const lat = (a.lat + b.lat) / 2
        const basin = lat < -60
          ? 'Southern'
          : lon > 20 && lon < 147
            ? 'Indian'
            : lon >= 147 || lon < -70 ? 'Pacific' : 'Atlantic'
        basins.set(basin, (basins.get(basin) ?? 0) + 1)
      }
      const share = (name: string) =>
        `${((100 * (basins.get(name) ?? 0)) / (set.length || 1)).toFixed(0)}%`.padStart(8)
      console.log(
        `  ${String(spacingKm).padStart(7)}   ${String(set.length).padStart(5)}   `
          + `${share('Atlantic')}${share('Indian')}${share('Pacific')}${share('Southern')}`,
      )
    }
  }

  /**
   * Throw away the pairs whose join does not run along the spreading direction.
   *
   * These are the mispairings along strike: same age at both ends, both ends on
   * sea floor, wrong partner. They survive every check that only looks at age,
   * they are 11.4% of what the tracer produces, and they land in *both* halves
   * of the score -- the half that pulls the crust and the half held back to
   * judge it -- so nothing measured inside the model can catch them. See
   * tools/lib/age-gradient.ts for the test and what says it is real.
   *
   * The reader who asked for this put it exactly right: the pairs come off the
   * flow lines, the flow lines come off fracture-zone detection, and the
   * detection is not good enough yet to be trusted blind. This does not fix the
   * detection. It drops what the detection demonstrably got wrong.
   */
  {
    /**
     * The age, averaged over a disc, which is the field whose gradient is the
     * spreading direction.
     *
     * Read cell by cell this filter had the defect it exists to catch. A
     * fracture zone offsets the isochrons, so a gradient taken on one reads
     * the offset -- square to the zone -- and the filter then threw out the
     * pairs that straddle a fracture zone, which are the pairs whose partners
     * are least in doubt. See overDisc.
     */
    const atDirection = overDisc((x: number, y: number, z: number) => {
      const [column, row] = directionToPixel(x, y, z, ageFull.width, ageFull.height)
      return ageMa[row * ageFull.width + column]
    }, CONFIG.spreadingDiscKm)
    const place = (point: { v: number[]; w: number[] }) => {
      let x = 0
      let y = 0
      let z = 0
      for (let k = 0; k < 3; k++) {
        const v = point.v[k] * 3
        x += mesh.positions[v] * point.w[k]
        y += mesh.positions[v + 1] * point.w[k]
        z += mesh.positions[v + 2] * point.w[k]
      }
      const l = Math.hypot(x, y, z) || 1
      return [x / l, y / l, z / l] as const
    }
    const before = conjugates.pairs.length
    const kept = conjugates.pairs.filter((pair) => {
      const off = obliquityDeg(atDirection, place(pair.a), place(pair.b))
      // Unreadable is kept: a gradient that cannot be measured is not evidence
      // against a pair, and dropping those would quietly prefer slow ridges.
      return off === null || off <= CONFIG.maxPairObliquityDeg
    })
    conjugates.pairs.length = 0
    conjugates.pairs.push(...kept)
    conjugates.rejected[
      `the join runs more than ${CONFIG.maxPairObliquityDeg} degrees off the spreading direction`
    ] = before - kept.length
  }
  console.log(
    `  ${conjugates.pairs.length} conjugate pairs at the frame ages; ` +
      Object.entries(conjugates.rejected).map(([why, n]) => `${n} ${why}`).join(', '),
  )
  // Every pair is kept, because every pair is a check. Only a sample of the
  // tracks is written, because they are there to be looked at: a globe with
  // five hundred lines on it is a globe you cannot see.
  const stride = Math.max(1, Math.round(traced.tracks.length / CONFIG.drawnTracks))
  const drawn = traced.tracks.filter((_, i) => i % stride === 0)
  const offsets: number[] = [0]
  const ridge: number[] = []
  const pointVerts: number[] = []
  const pointWeights: number[] = []
  const pointAge: number[] = []
  const fromRidge: number[] = []
  // Every step of the walk, at the step the walk took. These used to be snapped
  // to the nearest mesh vertex and then thinned to one point per 150 km,
  // because consecutive steps landed on the same vertex or the one beside it
  // and the line came out as a staircase with the mesh's period rather than the
  // fracture zone's. Held inside the triangle instead, a point is where the
  // walk actually was, so there is nothing to thin and no spacing to choose.
  let dropped = 0
  for (const track of drawn) {
    const start = offsets[offsets.length - 1]
    let ridgeAt = start
    track.points.forEach((p, i) => {
      const at = snapToFace(p.x, p.y, p.z)
      if (!at) {
        dropped++
        return
      }
      if (i === track.ridge) ridgeAt = pointAge.length
      pointVerts.push(...at.v)
      pointWeights.push(...at.w)
      pointAge.push(p.ageMa)
      fromRidge.push(p.fromRidgeKm)
    })
    ridge.push(ridgeAt)
    offsets.push(pointAge.length)
  }
  if (dropped) console.log(`  ${dropped} path points fell outside every triangle and were dropped`)
  writeFileSync(
    resolve(OUT, 'tracks.bin'),
    Buffer.from(writeTracks({
      offsets: Uint32Array.from(offsets),
      ridge: Uint32Array.from(ridge),
      pointVerts: Uint32Array.from(pointVerts),
      pointWeights: Float32Array.from(pointWeights),
      ageMa: Float32Array.from(pointAge),
      fromRidgeKm: Float32Array.from(fromRidge),
      pairAVerts: Uint32Array.from(conjugates.pairs.flatMap((p) => p.a.v)),
      pairAWeights: Float32Array.from(conjugates.pairs.flatMap((p) => p.a.w)),
      pairBVerts: Uint32Array.from(conjugates.pairs.flatMap((p) => p.b.v)),
      pairBWeights: Float32Array.from(conjugates.pairs.flatMap((p) => p.b.w)),
      pairAgeMa: Float32Array.from(conjugates.pairs, (p) => p.ageMa),
      pairTrack: Uint32Array.from(conjugates.pairs, (p) => p.track),
    })),
  )
  console.log(
    `  wrote ${drawn.length} tracks -- ${pointAge.length} points on their own paths -- ` +
      'for drawing, and every pair for measuring',
  )

  writeMesh(resolve(OUT, 'mesh.bin'), shell, solvedFaceAges, solvedVertexAges, crust, structure)
  writeFileSync(
    resolve(OUT, 'crust-age.bin'),
    Buffer.concat([
      Buffer.from(new Uint32Array([faceCount, AGE_SAMPLES]).buffer),
      Buffer.from(crustAge.edges.buffer),
      Buffer.from(crustAge.faces.buffer),
    ]),
  )
  console.log(
    `[build-data] wrote public/data/crust-age.bin, ${AGE_SAMPLES} age samples along every edge `
      + `and over every triangle (${
        ((8 + crustAge.edges.byteLength + crustAge.faces.byteLength) / 1e6).toFixed(1)} MB)`,
  )

  const meta: Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'> = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        file: 'data-src/agegrid.nc',
        note: 'Sea-floor age grid (Muller et al. 2019 Tectonics v2.0, present day), '
          + '0.1 degrees, float Ma, NaN over land',
      },
      { file: 'public/textures/height-map.jpg', note: 'Topography/bathymetry, used to classify undated cells and to date them' },
      { file: 'data-src/ecm1.bin', note: 'ECM1 crustal model (Mooney et al. 2023), 1x1 degree crustal type and thickness' },
      { file: 'data-src/vgg.grid', note: 'Vertical gravity gradient (Sandwell et al.), 3600x1800, Eotvos, land and sea' },
      { file: 'public/textures/color-map.jpg', note: 'Surface colour, rides along with the crust' },
    ],
    r0Km: R0_KM,
    subdivision: CONFIG.subdivision,
    // The cut mesh, not the icosphere it started as. Splitting the shell into
    // fragments duplicates every vertex on a fracture, and everything
    // downstream -- the solver's frames, the viewer's buffers -- is sized by
    // this number. Leaving the icosphere's count here left the viewer reading
    // the frames with too short a stride: the duplicated vertices had no
    // position at all and the shell tore open along the cuts.
    vertexCount: shell.positions.length / 3,
    faceCount,
    maxAgeMa,
    depthAgeFit,
    crustModels,
    solvedModel: CONFIG.solvedModel,
    crustalFabric: structure.fabric,
    // In the raster's own order, because the raster carries each groove's index
    // and a reader clicking a line in the viewer is answered from this list.
    fractureZones: vgg
      ? grooveSummaries(grooves.grooves, vgg, ageMa, ageFull.width, ageFull.height)
      : [],
    radiusStepMa: CONFIG.radiusStepMa,
    referenceRadiusKm,
    frameStepMa: CONFIG.frameStepMa,
    endTimeMa: CONFIG.endTimeMa,
    conjugateToleranceMa: CONFIG.conjugateToleranceMa,
  }
  mkdirSync(STAGE, { recursive: true })
  writeFileSync(resolve(STAGE, 'meta.partial.json'), JSON.stringify(meta, null, 2))
  console.log('[build-data] wrote public/data/mesh.bin, tracks.bin and .stage/meta.partial.json')
}

/**
 * Radius curve straight off the full-resolution raster, independent of the
 * mesh. The solver uses the mesh-derived curve so that its area budget balances
 * exactly, but this one is the honest measurement to report.
 */
function referenceCurve(age: Raster, maxAgeMa: number): number[] {
  // Twentieths of a million years, which is finer than the grid's own spacing
  // can distinguish and two hundred times finer than the picture this replaces.
  const step = 0.05
  const bins = new Float64Array(Math.ceil(maxAgeMa / step) + 2)
  let permanent = 0
  let total = 0
  for (let y = 0; y < age.height; y++) {
    const w = age.rowWeight(y)
    for (let x = 0; x < age.width; x++) {
      const value = age.at(x, y)
      total += w
      // No age at all is crust that never goes, which is what the reference is
      // for: the upper bound, every undated cell counted as permanent.
      if (Number.isNaN(value)) permanent += w
      else bins[Math.min(bins.length - 1, Math.round(value / step))] += w
    }
  }
  const curve: number[] = []
  for (let t = 0; t <= CONFIG.endTimeMa; t += CONFIG.radiusStepMa) {
    let older = permanent
    for (let b = Math.ceil(t / step); b < bins.length; b++) older += bins[b]
    curve.push(R0_KM * Math.sqrt(older / total))
  }
  return curve
}

/**
 * Least-squares fit of height-map grey against sqrt(age) over cells that are
 * both dated and in deep water.
 *
 * This is the half-space cooling relation (ocean floor subsides as the square
 * root of its age) used in reverse: rather than assuming published constants
 * for a lossy JPEG of unknown scaling, we let the data that *is* present
 * calibrate the relation, and then read ages off it where the magnetic record
 * has holes. The r2 reported alongside says how much that inference is worth.
 */
function fitDepthAge(age: Raster, height: Raster, shelfBreak: number) {
  let n = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let y = 0; y < age.height; y++) {
    for (let x = 0; x < age.width; x++) {
      const a = age.at(x, y)
      const h = height.at(x, y)
      if (Number.isNaN(a) || h >= shelfBreak) continue
      const rootAge = Math.sqrt(a)
      n++
      sx += rootAge
      sy += h
      sxx += rootAge * rootAge
      sxy += rootAge * h
      syy += h * h
    }
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  const intercept = (sy - slope * sx) / n
  const r = (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  return { slope, intercept, r2: r * r, sampleCount: n }
}

type Fit = ReturnType<typeof fitDepthAge>

/** Turn the raw grey grid into an age-in-Ma grid under one set of assumptions. */
function classify(
  age: Raster,
  height: Raster,
  shelfBreak: number,
  model: CrustModelId,
  fit: Fit,
  maxAgeMa: number,
): Float32Array {
  const out = new Float32Array(age.width * age.height)
  const undatedDeep: number[] = []

  for (let y = 0; y < age.height; y++) {
    for (let x = 0; x < age.width; x++) {
      const i = y * age.width + x
      const a = age.at(x, y)
      if (!Number.isNaN(a)) {
        out[i] = a
        continue
      }
      const deep = height.at(x, y) < shelfBreak
      if (!deep || model === 'permanent') {
        out[i] = PERMANENT_MA
      } else if (model === 'depth-age') {
        const inferred = ((height.at(x, y) - fit.intercept) / fit.slope) ** 2
        out[i] = Math.min(maxAgeMa, Math.max(0, inferred))
      } else {
        out[i] = -1 // filled by the nearest-dated sweep below
        undatedDeep.push(i)
      }
    }
  }

  if (model === 'nearest-age') fillFromNearestDated(out, age, undatedDeep)
  return out
}

/** Breadth-first flood from the dated cells into the undated deep-water holes. */
function fillFromNearestDated(out: Float32Array, age: Raster, holes: number[]) {
  const { width, height } = age
  const queue: number[] = []
  for (const i of holes) {
    const x = i % width
    const y = (i / width) | 0
    for (const [nx, ny] of neighbours(x, y, width, height)) {
      if (out[ny * width + nx] >= 0) {
        queue.push(i)
        break
      }
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    if (out[i] >= 0) continue
    const x = i % width
    const y = (i / width) | 0
    let sum = 0
    let count = 0
    const empty: number[] = []
    for (const [nx, ny] of neighbours(x, y, width, height)) {
      const j = ny * width + nx
      if (out[j] >= 0 && out[j] < PERMANENT_MA) {
        sum += out[j]
        count++
      } else if (out[j] < 0) empty.push(j)
    }
    out[i] = count > 0 ? sum / count : 0
    for (const j of empty) queue.push(j)
  }
  for (const i of holes) if (out[i] < 0) out[i] = 0
}

function* neighbours(x: number, y: number, width: number, height: number) {
  if (y > 0) yield [x, y - 1] as const
  if (y < height - 1) yield [x, y + 1] as const
  yield [(x + width - 1) % width, y] as const
  yield [(x + 1) % width, y] as const
}

/**
 * How much of every edge and every triangle is crust that still exists, read
 * off the age grid rather than guessed from the corners.
 *
 * **The problem.** The solver takes one-million-year steps. At a half spreading
 * rate of 33 km/Myr a step un-makes a strip about 33 km wide either side of
 * every ridge, against a mesh 129 km across -- a quarter of an edge. So almost
 * no edge is wholly younger than the moment and almost no triangle is, and a
 * fold that can only take what is wholly gone takes nearly nothing: everything
 * it cannot take has to be absorbed as deformation instead. That is the model
 * spending twelve to twenty-six percent of the shell on squeezing against a
 * budget of about one.
 *
 * Reading the age at the corners does not fix it, and the reason is worth
 * stating. Age is distance from a spreading axis times rate -- that is what an
 * axis *is* -- so walking across one the age falls to zero and rises again: a
 * **V**, with its minimum in the middle of the edge. An edge that straddles a
 * ridge has both ends old while the crust between them is new, and a straight
 * line between two old corners never dips. Per corner or per face, the strip is
 * invisible.
 *
 * **What this does instead.** It walks. Sixteen points along every edge and
 * sixteen over every triangle, each one a lookup in the age grid, kept sorted.
 * The solver's question -- how much of this edge exists at 30 Ma? -- becomes
 * counting how many of the sixteen are older than 30, which assumes nothing at
 * all about the shape of the age field and resolves 8 km on a 129 km edge
 * instead of the whole of it. The quantisation moves off the triangulation and
 * onto the data, where it belongs.
 *
 * **Where it goes.** Its own file, not mesh.bin: the viewer has no use for it
 * and it must not go on the wire. Ten megabytes on disk, nothing downloaded.
 */
/**
 * The sixteen equal-area pieces of a triangle, as barycentric weights.
 *
 * A 4 x 4 subdivision: ten sub-triangles pointing the same way as the parent
 * and six pointing the other, each a sixteenth of it, and the sample sits at
 * each one's centroid. Equal area matters -- an uneven lattice would weight
 * part of the triangle twice and the count would stop meaning a share of it.
 */
const FACE_WEIGHTS: [number, number, number][] = (() => {
  const n = 4
  const out: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; i + j < n; j++) {
      const u = (i + 1 / 3) / n
      const v = (j + 1 / 3) / n
      out.push([u, v, 1 - u - v])
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; i + j < n - 1; j++) {
      const u = (i + 2 / 3) / n
      const v = (j + 2 / 3) / n
      out.push([u, v, 1 - u - v])
    }
  }
  return out
})()

function sampleCrustAge(
  mesh: { positions: Float64Array; indices: Uint32Array },
  field: Float32Array,
  grid: Raster,
  /** Skip the edges, which only the solver wants; see `radiusCurve`. */
  facesOnly = false,
): { edges: Uint16Array; faces: Uint16Array } {
  const faceCount = mesh.indices.length / 3
  const edges = new Uint16Array(facesOnly ? 0 : faceCount * 3 * AGE_SAMPLES)
  const faces = new Uint16Array(faceCount * AGE_SAMPLES)
  const lookup = (x: number, y: number, z: number) => {
    const length = Math.hypot(x, y, z)
    const [column, row] = directionToPixel(
      x / length, y / length, z / length, grid.width, grid.height,
    )
    return field[row * grid.width + column]
  }
  const encode = (age: number) => encodeAge(age, PERMANENT_MA)
  const scratch = new Uint16Array(AGE_SAMPLES)
  const put = (into: Uint16Array, at: number) => {
    // Insertion sort: sixteen values, already nearly monotone along an edge
    // because the age field is smooth, so this touches almost nothing.
    for (let k = 1; k < AGE_SAMPLES; k++) {
      const value = scratch[k]
      let m = k - 1
      while (m >= 0 && scratch[m] > value) { scratch[m + 1] = scratch[m]; m-- }
      scratch[m + 1] = value
    }
    into.set(scratch, at)
  }

  const p = mesh.positions
  for (let f = 0; f < faceCount; f++) {
    const a = mesh.indices[f * 3] * 3
    const b = mesh.indices[f * 3 + 1] * 3
    const c = mesh.indices[f * 3 + 2] * 3
    const corner = [a, b, c]
    for (let k = 0; facesOnly ? false : k < 3; k++) {
      const from = corner[k]
      const to = corner[(k + 1) % 3]
      for (let i = 0; i < AGE_SAMPLES; i++) {
        // Mid-cell rather than end to end: the ends are shared with the
        // neighbouring edges and would be counted twice over the shell.
        const w = (i + 0.5) / AGE_SAMPLES
        scratch[i] = encode(lookup(
          p[from] + (p[to] - p[from]) * w,
          p[from + 1] + (p[to + 1] - p[from + 1]) * w,
          p[from + 2] + (p[to + 2] - p[from + 2]) * w,
        ))
      }
      put(edges, (f * 3 + k) * AGE_SAMPLES)
    }
    for (let i = 0; i < AGE_SAMPLES; i++) {
      const [u, v, w] = FACE_WEIGHTS[i]
      scratch[i] = encode(lookup(
        p[a] * u + p[b] * v + p[c] * w,
        p[a + 1] * u + p[b + 1] * v + p[c + 1] * w,
        p[a + 2] * u + p[b + 2] * v + p[c + 2] * w,
      ))
    }
    put(faces, f * AGE_SAMPLES)
  }
  return { edges, faces }
}

/**
 * The age of the crust at each vertex, taken where the vertex is.
 *
 * The fold needs this and never had it. A triangle sinks because part of it has
 * not erupted yet, and which part is decided at its corners -- so what the
 * solver has to know is the age *at a point*, not the age of the faces around
 * it. It made do with the youngest of the adjacent faces, which counts any
 * point next to young crust as young, and that removed about twice the crust
 * the radius curve allows.
 *
 * The sample is exactly that: one lookup at the vertex's own direction, no
 * vote. There is nothing to vote over -- a point is one point, and the vote in
 * `sampleFaceAges` exists to stop one stray pixel deciding for a whole
 * triangle, which cannot happen here because one pixel is all a vertex has any
 * claim to. At subdivision 6 the mesh is 129 km across and the grid five, so a
 * vertex takes the age of the pixel it stands on and the quantisation moves
 * from the triangulation to the data.
 *
 * The permanent-crust sentinel comes straight through, and means what it says:
 * this point never goes anywhere.
 */
function sampleVertexAges(
  mesh: { positions: Float64Array },
  field: Float32Array,
  grid: Raster,
): Float32Array {
  const vertexCount = mesh.positions.length / 3
  const out = new Float32Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) {
    const [column, row] = directionToPixel(
      mesh.positions[v * 3],
      mesh.positions[v * 3 + 1],
      mesh.positions[v * 3 + 2],
      grid.width,
      grid.height,
    )
    out[v] = field[row * grid.width + column]
  }
  return out
}

/**
 * Age of each triangle, decided by a vote over its three corners and its
 * centroid. Voting rather than a single centroid sample keeps a stray pixel
 * from punching a fake continent into the middle of an ocean basin.
 *
 * The permanent-crust sentinel cannot take part in an average -- doing so turns
 * any half-continental triangle into a 500-million-year-old one -- so it is
 * counted instead: a triangle is continental when at least half its samples
 * are. Ties go to continental crust, which keeps total continental area near
 * the independently known ~41% of the globe.
 */
function sampleFaceAges(
  mesh: { positions: Float64Array; indices: Uint32Array },
  field: Float32Array,
  grid: Raster,
): Float32Array {
  const faceCount = mesh.indices.length / 3
  const out = new Float32Array(faceCount)
  const lookup = (x: number, y: number, z: number) => {
    const [column, row] = directionToPixel(x, y, z, grid.width, grid.height)
    return field[row * grid.width + column]
  }

  const samples = new Float64Array(4)
  for (let f = 0; f < faceCount; f++) {
    let cx = 0
    let cy = 0
    let cz = 0
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[f * 3 + k] * 3
      const x = mesh.positions[v]
      const y = mesh.positions[v + 1]
      const z = mesh.positions[v + 2]
      cx += x
      cy += y
      cz += z
      samples[k] = lookup(x, y, z)
    }
    const length = Math.hypot(cx, cy, cz)
    samples[3] = lookup(cx / length, cy / length, cz / length)
    const finite = Array.from(samples).filter((s) => s < PERMANENT_MA).sort((a, b) => a - b)
    out[f] =
      finite.length <= 2
        ? PERMANENT_MA
        : (finite[(finite.length - 1) >> 1] + finite[finite.length >> 1]) / 2
  }
  return out
}

/**
 * Read each triangle's crustal type and thickness out of ECM1, and turn the
 * type into a strength.
 *
 * This replaces a heuristic that inferred strength from geodesic distance to
 * the nearest continental margin. That worked for isthmuses and shelves but got
 * mountain belts exactly backwards: it called Tibet, the Andes and the Himalaya
 * as rigid as the Canadian Shield, when they are the most deformable crust on
 * the planet. An orogen is thick and hot; a shield is thinner and cold. Only a
 * classification can tell them apart, and ECM1 provides one.
 */
function sampleCrust(mesh: { positions: Float64Array; indices: Uint32Array }) {
  const raw = readFileSync(resolve(ROOT, 'data-src/ecm1.bin'))
  const [width, height] = new Uint32Array(raw.buffer, raw.byteOffset, 2)
  const thicknessGrid = new Float32Array(raw.buffer, raw.byteOffset + 8, width * height)
  const typeGrid = new Uint8Array(raw.buffer, raw.byteOffset + 8 + width * height * 4, width * height)

  const faceCount = mesh.indices.length / 3
  const rigidity = new Float32Array(faceCount)
  const type = new Uint8Array(faceCount)
  const thickness = new Float32Array(faceCount)

  const cellAt = (x: number, y: number, z: number) => {
    const [column, row] = directionToPixel(x, y, z, width, height)
    return row * width + column
  }

  const votes = new Map<number, number>()
  for (let f = 0; f < faceCount; f++) {
    votes.clear()
    let cx = 0, cy = 0, cz = 0
    let thicknessSum = 0
    const cells: number[] = []
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[f * 3 + k] * 3
      cx += mesh.positions[v]; cy += mesh.positions[v + 1]; cz += mesh.positions[v + 2]
      cells.push(cellAt(mesh.positions[v], mesh.positions[v + 1], mesh.positions[v + 2]))
    }
    const length = Math.hypot(cx, cy, cz) || 1
    cells.push(cellAt(cx / length, cy / length, cz / length))

    // A triangle is a degree across and a cell is a degree wide, so it can
    // straddle several; take the type most of its corners agree on.
    for (const cell of cells) {
      votes.set(typeGrid[cell], (votes.get(typeGrid[cell]) ?? 0) + 1)
      thicknessSum += thicknessGrid[cell]
    }
    let best = 0
    let bestCount = -1
    for (const [candidate, count] of votes) {
      if (count > bestCount) {
        bestCount = count
        best = candidate
      }
    }
    type[f] = best
    thickness[f] = thicknessSum / cells.length
    rigidity[f] = CRUST_RIGIDITY[CRUST_TYPES[best]]
  }

  const share = new Map<string, number>()
  for (let f = 0; f < faceCount; f++) {
    const name = CRUST_TYPES[type[f]]
    share.set(name, (share.get(name) ?? 0) + 1)
  }
  console.log('  crustal types by triangle count:')
  for (const [name, n] of [...share].sort((a, b) => b[1] - a[1])) {
    console.log(
      `    ${name}  ${((100 * n) / faceCount).toFixed(1).padStart(5)}%  ` +
        `rigidity ${CRUST_RIGIDITY[name as keyof typeof CRUST_RIGIDITY].toFixed(2)}`,
    )
  }
  /**
   * The same grid as a picture, for the viewer to read per pixel.
   *
   * The crustal-class view used to come off a vertex attribute, and a reader
   * spotted what that does: the classes arrived as hexagons rather than as
   * anything in the data. Two faults, both in the same place. A triangle's
   * class is a vote of its corners and is per *triangle*, but a shared-vertex
   * mesh can only carry one value per *point*, so `src/data.ts` gave each point
   * the class of the weakest triangle around it and the shader's `flat` then
   * handed that to every triangle in its star -- so the picture was a vertex
   * star, and weak crust bled outwards by one everywhere it touched strong.
   *
   * Read as a raster it is the data's own cells and nothing else, and it rides
   * along with the crust like the surface map does, because both are sampled by
   * the rock's present-day direction. What it cannot do is be smoother than
   * ECM1: at one degree the cells are 111 km and the mesh is 129, so this
   * sharpens the boundaries onto the data and stops there. There is no finer
   * truth available to draw.
   *
   * Red is the class index, green the thickness in half-kilometres. The
   * thickness is a magnitude and the class is a name, which is why the shader
   * filters them differently.
   */
  const pixels = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = typeGrid[i]
    pixels[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(thicknessGrid[i] * 2)))
    pixels[i * 4 + 3] = 255
  }
  const png = new PNG({ width, height, colorType: 2 })
  png.data.set(pixels)
  const encoded = PNG.sync.write(png)
  writeFileSync(resolve(OUT, 'crust.png'), encoded)
  console.log(
    `[build-data] wrote public/data/crust.png, ${width}x${height} -- ECM1's own cells, `
      + `class and thickness (${(encoded.length / 1e3).toFixed(0)} kB)`,
  )

  return { rigidity, type, thickness }
}

/**
 * The gravity gradient and its roughness at every vertex of the shell.
 *
 * Sampled per vertex rather than per triangle because that is how it will be
 * used: the viewer interpolates vertex attributes across a face, and a solver
 * that decides how far a point may move needs the number at the point. The disc
 * is half the mesh spacing, so each vertex reads its own neighbourhood and the
 * field is carried at the resolution the mesh can hold rather than at the
 * grid's, which is ten times finer than any triangle here.
 */
function sampleGravityStructure(shell: Shell, crustType: Uint8Array) {
  const grid = readGrid(readFileSync(resolve(ROOT, 'data-src/vgg.grid')))

  // The picture, at the grid's own resolution rather than the mesh's. It is
  // painted on the crust like any other surface map, so it deforms with the
  // reconstruction while keeping every one of its eleven-kilometre cells --
  // where the per-vertex figures below, at a hundred and twelve kilometres
  // apart, keep a little over half of what the field says.
  const raster = fabricRaster(grid, R0_KM)
  // Written lossy, and deliberately. The exact field is the per-vertex array
  // below, which is what anything computing on it reads; this is the picture,
  // already quantised to a byte on a logarithmic scale, and the difference a
  // quality-90 JPEG makes to that byte is under a level. What it buys is the
  // difference between 3.6 MB and the 17.7 MB the same raster costs as a PNG:
  // a gradient taken cell by cell is noisy at the cell, and lossless coding
  // spends most of its bits on that noise rather than on the lineaments.
  const pixels = new Uint8Array(grid.width * grid.height * 4)
  for (let i = 0; i < raster.length; i++) {
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = raster[i]
    pixels[i * 4 + 3] = 255
  }
  const encoded = jpeg.encode(
    { data: pixels, width: grid.width, height: grid.height }, FABRIC_QUALITY,
  ).data
  writeFileSync(resolve(OUT, 'fabric.jpg'), encoded)
  console.log(
    `[build-data] wrote public/data/fabric.jpg, ${grid.width}x${grid.height} ` +
      `(${(encoded.length / 1e6).toFixed(1)} MB)`,
  )

  const vertexCount = shell.positions.length / 3
  // Mesh spacing: an icosphere of this many vertices covers 4*pi*R^2, so each
  // vertex owns about that much of it, and the spacing is the width of that
  // patch. Half of it is the disc that does not overlap its neighbours much.
  const spacingKm = Math.sqrt((4 * Math.PI * R0_KM * R0_KM) / vertexCount)
  const structure = sampleStructure(grid, shell.positions, vertexCount, spacingKm / 2, R0_KM)
  const guessed = fillGaps(structure.value, shell.indices)
  fillGaps(structure.roughness, shell.indices)

  const sorted = Float64Array.from(structure.roughness).sort()
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  console.log(
    `[build-data] ${grid.units} over ${grid.width}x${grid.height} cells, ` +
      `disc ${(spacingKm / 2).toFixed(0)} km:`,
  )
  console.log(
    `  roughness per 100 km: median ${at(0.5).toFixed(0)}, ` +
      `p90 ${at(0.9).toFixed(0)}, p99 ${at(0.99).toFixed(0)} ${grid.units.split(' ')[0]}`,
  )
  console.log(
    `  ${guessed} of ${vertexCount} vertices (${((100 * guessed) / vertexCount).toFixed(1)}%) ` +
      'sit beyond the altimetry and took their neighbours\' value',
  )

  // Whether this says anything ECM1 does not. If every crustal type came back
  // with the same roughness the grid would be decoration; the point of printing
  // it is that a shield and an orogen have to come out far apart, and that the
  // spread *within* a type is what the classification cannot see.
  const byType: number[][] = CRUST_TYPES.map(() => [])
  for (let f = 0; f < crustType.length; f++) {
    for (let k = 0; k < 3; k++) byType[crustType[f]].push(structure.roughness[shell.indices[f * 3 + k]])
  }
  const fabric = CRUST_TYPES.map((name, i) => ({
    type: name as string,
    median: quantile(byType[i], 0.5),
    low: quantile(byType[i], 0.1),
    high: quantile(byType[i], 0.9),
  }))
    .filter((_, i) => byType[i].length > 100)
    .sort((a, b) => a.median - b.median)
  console.log('  roughness by crustal type (median, and the tenth and ninetieth within it):')
  for (const row of fabric) {
    console.log(
      `    ${row.type}  ${row.median.toFixed(0).padStart(4)}  ` +
        `[${row.low.toFixed(0)} - ${row.high.toFixed(0)}]`,
    )
  }
  return { ...structure, fabric, fabricCells: raster, gravity: grid }
}

/**
 * Grooves over the whole globe, found the way a reader finds one.
 *
 * The flat test pictures that this rule was built and argued out on live in
 * tools/draw-grooves.ts, and this is the same pipeline over every cell: read
 * the light-band-with-a-dark-centre profile, keep what runs along either the
 * spreading direction or its neighbours' grain, throw away what sits on
 * continental crust, and carry each line through the stretches where the trough
 * fades. See tools/lib/grooves.ts for each of those and what was tried first.
 *
 * Continental cells are not measured at all rather than measured and dropped,
 * which is most of what makes a whole-globe pass affordable: a groove is a
 * record of two pieces of sea floor moving apart, and continental crust did
 * not come out of a ridge, so a line found there was never going to be kept.
 */
function traceGrooves(
  fabricCells: Uint8Array,
  gravity: { width: number; height: number },
  ageMa: Float32Array, ageWidth: number, ageHeight: number,
  height: Raster, shelfBreak: number,
) {
  const fabric = {
    width: gravity.width,
    height: gravity.height,
    at: (column: number, row: number) => fabricCells[row * gravity.width + column],
  }
  const placeOf = (column: number, row: number) => ({
    lon: ((column + 0.5) / gravity.width) * 360 - 180,
    lat: 90 - ((row + 0.5) / gravity.height) * 180,
  })
  const RADIANS = Math.PI / 180
  /** The project's own line between continental and oceanic: the shelf break. */
  const ashore = (lon: number, lat: number) => {
    const [x, y, z] = lonLatToDirection(lon * RADIANS, lat * RADIANS)
    const [column, row] = directionToPixel(x, y, z, height.width, height.height)
    return height.at(column, row) > shelfBreak
  }
  const regional = overDisc((x: number, y: number, z: number) => {
    const [column, row] = directionToPixel(x, y, z, ageWidth, ageHeight)
    return ageMa[row * ageWidth + column]
  }, CONFIG.spreadingDiscKm)
  const spreading = (at: { lon: number; lat: number }) => {
    const [x, y, z] = lonLatToDirection(at.lon * RADIANS, at.lat * RADIANS)
    const direction = spreadingDirection(regional, x, y, z)
    if (!direction) return null
    const l = Math.hypot(x, y, z) || 1
    const ux = x / l
    const uy = y / l
    const uz = z / l
    let nx = -uy * ux
    let ny = 1 - uy * uy
    let nz = -uy * uz
    const nl = Math.hypot(nx, ny, nz)
    if (nl < 1e-6) return null
    nx /= nl
    ny /= nl
    nz /= nl
    const ex = ny * uz - nz * uy
    const ey = nz * ux - nx * uz
    const ez = nx * uy - ny * ux
    const north = direction[0] * nx + direction[1] * ny + direction[2] * nz
    const east = direction[0] * ex + direction[1] * ey + direction[2] * ez
    return (((Math.atan2(east, north) / RADIANS) % 180) + 180) % 180
  }

  const started = Date.now()
  const field = grooveField(
    fabric,
    { lonFrom: -180, lonTo: 180, latFrom: -90, latTo: 90 },
    {
      scoutQuantile: CONFIG.grooveScoutQuantile,
      skip: (column: number, row: number) => {
        const at = placeOf(column, row)
        return ashore(at.lon, at.lat)
      },
    },
  )
  const found = walkGrooves(fabric, field, {}).filter((groove) => {
    const at = axisOf(groove).at
    return !ashore(at.lon, at.lat)
  })
  const { kept, dropped } = trimEither(
    found, [spreading, grainReference(found)], CONFIG.grooveSwingDeg,
  )
  const grooves = linkGrooves(kept, {}, dropped)
  const readTotalKm = grooves.reduce((sum, g) => sum + readKm(g), 0)
  console.log(
    `[build-data] ${found.length} groove segments off the fabric, ${kept.length} kept, `
      + `linked into ${grooves.length} lines of `
      + `${grooves.reduce((sum, g) => sum + g.lengthKm, 0).toFixed(0)} km `
      + `(${readTotalKm.toFixed(0)} km of it read, the rest carried through) `
      + `in ${((Date.now() - started) / 1000).toFixed(0)}s`,
  )
  // The spreading reference travels with them: whatever decides which grooves
  // may anchor the flow field has to measure the same direction this did.
  return { grooves, spreading }
}

/**
 * One line per groove, for the viewer to list.
 *
 * Where it is and how long, so a reader can recognise what they clicked, plus
 * the two numbers that say what *kind* of line it might be. A reader who spent
 * an evening on the old detector's output came back with "most of these are
 * seamounts, some are ridges", which is the kind of thing no picture settles --
 * three different things make a narrow line in a gravity grid:
 *
 *   a fracture zone  a step in the sea floor that runs for hundreds of
 *                    kilometres. Walk it and the gravity barely changes.
 *   a seamount chain separate volcanoes built on crust that was already there.
 *                    The same walk climbs and falls between every one of them,
 *                    so `swingE` is large.
 *   a ridge axis     crust is made there, so the age is at a minimum on the
 *                    line and rises on both sides: `bowlMa` is positive.
 *
 * Neither number is a verdict. They are here so that a reader's judgement --
 * "that one is a seamount" -- can be checked against something measured, and a
 * cut chosen against real labels instead of against a story.
 */
function grooveSummaries(
  grooves: Groove[],
  vgg: Grid,
  ageMa: Float32Array, ageWidth: number, ageHeight: number,
): Meta['fractureZones'] {
  const RADIANS = Math.PI / 180
  const ageAt = (lon: number, lat: number) => {
    const [x, y, z] = lonLatToDirection(lon * RADIANS, lat * RADIANS)
    const [column, row] = directionToPixel(x, y, z, ageWidth, ageHeight)
    return ageMa[row * ageWidth + column]
  }
  const gravityAt = (lon: number, lat: number) => {
    const [x, y, z] = lonLatToDirection(lon * RADIANS, lat * RADIANS)
    const [column, row] = directionToPixel(x, y, z, vgg.width, vgg.height)
    return gridValue(vgg, column, row)
  }
  return grooves.map((groove) => {
    const on = groove.points.filter((point: { measured: boolean }) => point.measured)
    const read = on.length ? on : groove.points
    const middle = read[Math.floor(read.length / 2)]

    const ages: number[] = []
    const gravity: number[] = []
    const bowls: number[] = []
    for (let i = 0; i < read.length; i++) {
      const age = ageAt(read[i].lon, read[i].lat)
      if (!Number.isNaN(age)) ages.push(age)
      const value = gravityAt(read[i].lon, read[i].lat)
      if (Number.isFinite(value)) gravity.push(value)
      // Sixty kilometres either side, square to the line, to see whether the
      // age dips onto it -- which is what a ridge axis does and a fracture
      // zone does not.
      if (i && !Number.isNaN(age)) {
        const along = Math.atan2(
          (read[i].lon - read[i - 1].lon) * Math.cos(read[i].lat * RADIANS),
          read[i].lat - read[i - 1].lat,
        )
        const acrossLat = (60 / 111.19) * Math.cos(along + Math.PI / 2)
        const acrossLon = (60 / 111.19) * Math.sin(along + Math.PI / 2)
          / Math.max(0.05, Math.cos(read[i].lat * RADIANS))
        const plus = ageAt(read[i].lon + acrossLon, read[i].lat + acrossLat)
        const minus = ageAt(read[i].lon - acrossLon, read[i].lat - acrossLat)
        if (!Number.isNaN(plus) && !Number.isNaN(minus)) bowls.push((plus + minus) / 2 - age)
      }
    }
    return {
      lengthKm: Math.round(groove.lengthKm),
      lon: Math.round(middle.lon * 10) / 10,
      lat: Math.round(middle.lat * 10) / 10,
      ageMa: ages.length ? Math.round(quantile(ages, 0.5) * 10) / 10 : null,
      swingE: gravity.length > 4
        ? Math.round((quantile(gravity, 0.9) - quantile(gravity, 0.1)) * 10) / 10
        : 0,
      bowlMa: bowls.length ? Math.round(quantile(bowls, 0.5) * 10) / 10 : 0,
    }
  })
}

function curveLengthKm(
  curves: number[][], zones: { width: number; height: number },
): string {
  const lengths = curves.map((curve) => {
    let km = 0
    for (let i = 1; i < curve.length; i++) {
      const a = curve[i - 1]
      const b = curve[i]
      const lat = (row: number) => (0.5 - (row + 0.5) / zones.height) * Math.PI
      const lon = (col: number) => ((col + 0.5) / zones.width - 0.5) * 2 * Math.PI
      const dir = (at: number) => {
        const c = Math.cos(lat(Math.floor(at / zones.width)))
        return [
          c * Math.cos(lon(at % zones.width)),
          Math.sin(lat(Math.floor(at / zones.width))),
          -c * Math.sin(lon(at % zones.width)),
        ]
      }
      const [ax, ay, az] = dir(a)
      const [bx, by, bz] = dir(b)
      km += Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz))) * R0_KM
    }
    return km
  }).sort((x, y) => x - y)
  return (lengths[lengths.length >> 1] ?? 0).toFixed(0)
}

function quantile(values: number[], q: number): number {
  const sorted = Float64Array.from(values).sort()
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}




function computeFaceAreas(positions: Float64Array, indices: Uint32Array): Float64Array {
  const out = new Float64Array(indices.length / 3)
  for (let f = 0; f < out.length; f++) {
    const a = indices[f * 3] * 3
    const b = indices[f * 3 + 1] * 3
    const c = indices[f * 3 + 2] * 3
    out[f] = sphericalTriangleArea(
      positions[a], positions[a + 1], positions[a + 2],
      positions[b], positions[b + 1], positions[b + 2],
      positions[c], positions[c + 1], positions[c + 2],
    )
  }
  return out
}

/**
 * R(t) = R0 * sqrt(surviving area / 4pi).
 *
 * Crust is weighted by the same fade the solver uses, squared because area goes
 * as length squared. Using the identical weighting in the budget and in the
 * constraints is what lets the reconstruction close: the shell is asked to
 * cover exactly as much sphere as there is crust to cover it with.
 */
/**
 * How big the Earth was, from how much crust there still is.
 *
 * `shares` is the sampled surviving fraction of each triangle -- sixteen
 * lookups in the age grid, counted -- and it replaces what used to be here: one
 * median age per triangle, faded over a fixed time constant with a floor under
 * it, which is `crustScale`. That was an approximation of this, and a biased
 * one: a triangle a ridge runs through has a median age of its own that says
 * nothing about the strip in the middle of it, and the fade meant crust the
 * grid says is gone was still counted for tens of millions of years.
 *
 * It cost about one and a half percent of the radius, and the way that showed
 * up is worth recording, because it did not look like a radius problem. The
 * solver asks each triangle for its sampled surviving area; the sphere it has
 * to tile came from this function. The two disagreed by 7.5 of 494 million
 * km2, so the crust could not reach round the Earth it was given and had to be
 * stretched to cover it -- and the stretch was read as the model demanding
 * deformation, which is the one number the whole reconstruction is judged on.
 * The bias was in the ruler.
 */
function radiusCurve(
  shares: Uint16Array,
  faceArea: Float64Array,
  thinning: { stretch: Float32Array; riftMa: Float32Array },
): number[] {
  const faceCount = faceArea.length
  const curve: number[] = []
  for (let t = 0; t <= CONFIG.endTimeMa; t += CONFIG.radiusStepMa) {
    const moment = momentOf(t)
    let solidAngle = 0
    for (let f = 0; f < faceCount; f++) {
      const share = olderShare(shares, f * AGE_SAMPLES, moment)
      // A margin that has been pulled out to half its thickness covered half
      // the ground before it was, so at the time it had not yet been stretched
      // the area budget must count it small. Leaving this out was asking the
      // reconstruction to fit today's stretched margins onto a sphere sized for
      // crust that was never stretched, and it showed up exactly where it
      // would: the crust came out 4.6% larger in area than it should be, on a
      // planet that was getting smaller.
      // Crust whose rifting cannot be dated -- nothing near it in the age
      // grid -- is left alone rather than un-stretched blindly. Treating an
      // unknown rift age as "already finished" applied the whole correction at
      // t=0 and moved today's radius off 6371, which is the one value in this
      // model that is not up for discussion.
      const rift = thinning.riftMa[f]
      const pulled = 1 + (thinning.stretch[f] - 1) * (rift > 0 ? Math.min(1, t / rift) : 0)
      solidAngle += (faceArea[f] * share) / pulled
    }
    curve.push(R0_KM * Math.sqrt(solidAngle / (4 * Math.PI)))
  }
  return curve
}

/**
 * The shell as mesh.bin carries it. `cutPairs` is always empty now; it stays in
 * the format so the file's layout does not change under readers of it.
 */
interface Shell {
  positions: Float32Array
  indices: Uint32Array
  faceFragment: Uint16Array
  vertexFragment: Uint16Array
  origin: Uint32Array
  cutPairs: Uint32Array
  fragmentCount: number
}

function writeMesh(
  path: string,
  shell: Shell,
  faceAges: Float32Array,
  vertexAges: Float32Array,
  crust: { rigidity: Float32Array; type: Uint8Array; thickness: Float32Array },
  structure: { value: Float32Array; roughness: Float32Array },
) {
  const header = new Uint32Array([
    shell.positions.length / 3,
    shell.indices.length / 3,
    shell.fragmentCount,
    shell.cutPairs.length / 2,
  ])
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(header.buffer),
      Buffer.from(shell.positions.buffer),
      Buffer.from(shell.indices.buffer),
      Buffer.from(faceAges.buffer),
      Buffer.from(crust.rigidity.buffer),
      Buffer.from(crust.thickness.buffer),
      Buffer.from(structure.value.buffer),
      Buffer.from(structure.roughness.buffer),
      // Four-byte arrays first: a Uint32Array cannot start on an odd offset,
      // and the byte-wide sections below would push it off alignment.
      Buffer.from(shell.origin.buffer),
      Buffer.from(shell.cutPairs.buffer),
      Buffer.from(shell.faceFragment.buffer),
      Buffer.from(shell.vertexFragment.buffer),
      Buffer.from(crust.type.buffer),
      // The per-vertex ages go last so that every reader written against the
      // older layout still parses: they walk the file forwards and stop, and
      // the sections above are all four-byte multiples, so this lands aligned.
      Buffer.from(vertexAges.buffer),
    ]),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
