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
import { Raster, areaQuantile, downsample, loadRaster } from './lib/raster.js'
import { buildIcosphere, sphericalTriangleArea } from './lib/icosphere.js'
import { directionToPixel } from '../shared/sphere.js'
import { CRUST_RIGIDITY, CRUST_TYPES } from '../shared/crust.js'
import { readGrid } from './lib/grid.js'
import {
  fabricRaster, fillGaps, fractureZones, lineaments, sampleStructure, zoneRaster,
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
  crustScale,
  type CrustModel,
  type CrustModelId,
  type Meta,
} from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TEXTURES = resolve(ROOT, 'public/textures')
const OUT = resolve(ROOT, 'public/data')

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
   * Grey 254 of age-map.png sits in the Herodotus Basin of the eastern
   * Mediterranean, which is the oldest oceanic crust on Earth at ~280 Ma. That
   * single identifiable landmark calibrates the whole grey ramp.
   */
  maxAgeMa: 280,
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
  crestPull: 0,
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
  strengthQuantile: 0.5,
  minZoneLengthKm: 400,
  crestReachKm: 60,
  crestMaxShiftKm: 8,
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
  /** How many tracks the viewer is given to draw. A picture, not the dataset. */
  drawnTracks: 60,
  /**
   * Which classification the solver actually runs on. The depth-age fit only
   * reaches r2 ~ 0.18 against this particular height map, so interpolating ages
   * from genuinely dated neighbours is the more defensible default; depth-age
   * stays in the ensemble as a cross-check.
   */
  solvedModel: 'nearest-age' as CrustModelId,
}

const NODATA = 255

function main() {
  // Before anything is written, not beside the first thing that writes.
  // public/data is generated and so is not in the repository, which means it is
  // absent on a fresh checkout -- and a build step that made the directory on
  // its way past worked here and failed in CI the moment something else wrote
  // first.
  mkdirSync(OUT, { recursive: true })
  console.log('[build-data] loading rasters')
  const ageFull = loadRaster(resolve(TEXTURES, 'age-map.png'))
  console.log(`  age-map.png       ${ageFull.width}x${ageFull.height}`)
  const referenceRadiusKm = referenceCurve(ageFull)

  const age = downsample(ageFull, CONFIG.gridWidth, CONFIG.gridHeight, NODATA)
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
    permanent: classify(age, height, shelfBreak, 'permanent', depthAgeFit),
    'depth-age': classify(age, height, shelfBreak, 'depth-age', depthAgeFit),
    'nearest-age': classify(age, height, shelfBreak, 'nearest-age', depthAgeFit),
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

  const crustModels: CrustModel[] = (Object.keys(ageFields) as CrustModelId[]).map((id) => {
    const faceAges = sampleFaceAges(mesh, ageFields[id], age)
    return {
      id,
      label: id,
      assumption: assumptions[id],
      radiusKm: radiusCurve(faceAges, faceArea, thinning),
    }
  })
  // The solved variant goes first so the app can treat it as the default.
  crustModels.sort((a, b) =>
    a.id === CONFIG.solvedModel ? -1 : b.id === CONFIG.solvedModel ? 1 : 0,
  )

  const solvedFaceAges = sampleFaceAges(mesh, ageFields[CONFIG.solvedModel], age)

  for (const model of crustModels) {
    const last = model.radiusKm[model.radiusKm.length - 1]
    console.log(
      `  ${model.id.padEnd(12)} R(${CONFIG.endTimeMa} Ma) = ${last.toFixed(0)} km ` +
        `(${((100 * last) / R0_KM).toFixed(1)}% of today)`,
    )
  }

  // Independent cross-check: the mesh-derived area budget against the same
  // measurement taken at full 8192x4096 raster resolution. A large gap here
  // would mean the triangulation is too coarse to hold the area budget.
  const meshCurve = crustModels.find((m) => m.id === 'permanent')!.radiusKm
  let worst = 0
  for (let t = 0; t < meshCurve.length; t++) {
    worst = Math.max(worst, Math.abs(meshCurve[t] - referenceRadiusKm[t]) / referenceRadiusKm[t])
  }
  console.log(`  mesh vs full-resolution radius curve: max deviation ${(100 * worst).toFixed(2)}%`)

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
  const ageMa = new Float32Array(ageFull.width * ageFull.height)
  for (let i = 0; i < ageMa.length; i++) {
    ageMa[i] = ageFull.data[i] === NODATA ? NaN : (ageFull.data[i] / 255) * CONFIG.maxAgeMa
  }
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
  const detected = vgg && lines
    ? fractureZones(
        lineaments(vgg, R0_KM, CONFIG.crestWindowKm, CONFIG.crestSmoothKm),
        lines, ageMa, ageFull.width, ageFull.height, R0_KM,
        {
          alignmentGate: CONFIG.alignmentGate,
          strengthQuantile: CONFIG.strengthQuantile,
          minLengthKm: CONFIG.minZoneLengthKm,
        },
      )
    : undefined
  const zones = detected?.zones
  if (zones && detected) {
    console.log(
      `[build-data] ${detected.curves.length} fracture zones linked from the gravity grid, ` +
        `median ${curveLengthKm(detected.curves, zones)} km long`,
    )
    const raster = zoneRaster(zones)
    const pixels = new Uint8Array(zones.width * zones.height * 4)
    let lit = 0
    for (let i = 0; i < raster.length; i++) {
      pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = raster[i]
      pixels[i * 4 + 3] = 255
      if (raster[i]) lit++
    }
    const png = new PNG({ width: zones.width, height: zones.height, colorType: 0 })
    png.data.set(pixels)
    const encoded = PNG.sync.write(png)
    writeFileSync(resolve(OUT, 'zones.png'), encoded)
    console.log(
      `[build-data] wrote public/data/zones.png -- fracture zones on ` +
        `${((100 * lit) / raster.length).toFixed(1)}% of the grid's cells ` +
        `(${(encoded.length / 1e6).toFixed(1)} MB)`,
    )
  }
  const crest = CONFIG.crestPull > 0 ? zones : undefined

  // The direction field the walk follows, fitted through every detected
  // fracture zone at once and to the age grid everywhere else. See
  // tools/lib/flowfield.ts for why this replaces steering step by step.
  const field = zones && vgg
    ? flowField(zones, ageMa, ageFull.width, ageFull.height, vgg, R0_KM,
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
  const conjugates = conjugatePairs(traced.tracks, frameAges, snapToFace, CONFIG.conjugateToleranceMa)
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
    })),
  )
  console.log(
    `  wrote ${drawn.length} tracks -- ${pointAge.length} points on their own paths -- ` +
      'for drawing, and every pair for measuring',
  )

  writeMesh(resolve(OUT, 'mesh.bin'), shell, solvedFaceAges, crust, structure)

  const meta: Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'> = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      { file: 'public/textures/age-map.png', note: 'Seafloor age grid, 8192x4096, grey 0-254 = 0-280 Ma, white = undated' },
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
    maxAgeMa: CONFIG.maxAgeMa,
    depthAgeFit,
    crustModels,
    solvedModel: CONFIG.solvedModel,
    crustalFabric: structure.fabric,
    radiusStepMa: CONFIG.radiusStepMa,
    referenceRadiusKm,
    frameStepMa: CONFIG.frameStepMa,
    endTimeMa: CONFIG.endTimeMa,
    conjugateToleranceMa: CONFIG.conjugateToleranceMa,
  }
  writeFileSync(resolve(OUT, 'meta.partial.json'), JSON.stringify(meta, null, 2))
  console.log('[build-data] wrote public/data/mesh.bin, tracks.bin and meta.partial.json')
}

/**
 * Radius curve straight off the full-resolution raster, independent of the
 * mesh. The solver uses the mesh-derived curve so that its area budget balances
 * exactly, but this one is the honest measurement to report.
 */
function referenceCurve(age: Raster): number[] {
  const area = new Float64Array(256)
  let total = 0
  for (let y = 0; y < age.height; y++) {
    const w = age.rowWeight(y)
    for (let x = 0; x < age.width; x++) {
      area[age.at(x, y)] += w
      total += w
    }
  }
  const curve: number[] = []
  for (let t = 0; t <= CONFIG.endTimeMa; t += CONFIG.radiusStepMa) {
    const grey = (t / CONFIG.maxAgeMa) * 255
    let older = 0
    for (let g = 0; g < 256; g++) if (g >= grey) older += area[g]
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
      if (a === NODATA || h >= shelfBreak) continue
      const rootAge = Math.sqrt((a / 255) * CONFIG.maxAgeMa)
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
): Float32Array {
  const out = new Float32Array(age.width * age.height)
  const undatedDeep: number[] = []

  for (let y = 0; y < age.height; y++) {
    for (let x = 0; x < age.width; x++) {
      const i = y * age.width + x
      const a = age.at(x, y)
      if (a !== NODATA) {
        out[i] = (a / 255) * CONFIG.maxAgeMa
        continue
      }
      const deep = height.at(x, y) < shelfBreak
      if (!deep || model === 'permanent') {
        out[i] = PERMANENT_MA
      } else if (model === 'depth-age') {
        const inferred = ((height.at(x, y) - fit.intercept) / fit.slope) ** 2
        out[i] = Math.min(CONFIG.maxAgeMa, Math.max(0, inferred))
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
  return { ...structure, fabric }
}

/** The median length of a set of linked curves, km, for the build log. */
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
function radiusCurve(
  faceAges: Float32Array,
  faceArea: Float64Array,
  thinning: { stretch: Float32Array; riftMa: Float32Array },
): number[] {
  const curve: number[] = []
  for (let t = 0; t <= CONFIG.endTimeMa; t += CONFIG.radiusStepMa) {
    let solidAngle = 0
    for (let f = 0; f < faceAges.length; f++) {
      const scale = crustScale(faceAges[f], t)
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
      solidAngle += (faceArea[f] * scale * scale) / pulled
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
    ]),
  )
}

main()
