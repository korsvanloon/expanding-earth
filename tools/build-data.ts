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
import { Raster, areaQuantile, downsample, loadRaster } from './lib/raster.js'
import { buildIcosphere, sphericalTriangleArea } from './lib/icosphere.js'
import { directionToPixel } from '../shared/sphere.js'
import { CRUST_RIGIDITY, CRUST_TYPES } from '../shared/crust.js'
import { subdivision } from './lib/resolution.js'
import { unstretching } from './lib/unstretching.js'
import { findIslands } from './lib/islands.js'
import { conjugatePairs, smoothAges, traceFlowLines, vertexSnapper } from './lib/flowlines.js'
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
  /** Smoothing passes over the age grid before its gradient is walked. */
  flowSmoothing: 4,
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

  // --- the stretch marks -------------------------------------------------
  //
  // Which piece of crust was once against which, read out of the same age grid
  // that drives the whole model. See tools/lib/flowlines.ts.
  mkdirSync(OUT, { recursive: true })
  console.log('[build-data] tracing fracture zones')
  const ageMa = new Float64Array(age.width * age.height)
  for (let i = 0; i < ageMa.length; i++) {
    ageMa[i] = age.data[i] === NODATA ? NaN : (age.data[i] / 255) * CONFIG.maxAgeMa
  }
  const traced = traceFlowLines(
    smoothAges(ageMa, age.width, age.height, CONFIG.flowSmoothing),
    age.width,
    age.height,
    { seedSpacingKm: CONFIG.seedSpacingKm },
  )
  console.log(
    `  ${traced.tracks.length} tracks from ${traced.seeds} ridge seeds; ` +
      Object.entries(traced.rejected).map(([why, n]) => `${n} ${why}`).join(', '),
  )
  const snap = vertexSnapper(shell.positions, vertexCount)
  const frameAges = Array.from(
    { length: Math.floor(CONFIG.endTimeMa / CONFIG.frameStepMa) + 1 },
    (_, i) => i * CONFIG.frameStepMa,
  )
  const conjugates = conjugatePairs(traced.tracks, frameAges, snap, CONFIG.conjugateToleranceMa)
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
  const vertex: number[] = []
  const pointAge: number[] = []
  const fromRidge: number[] = []
  // Thinned before they are written. A path steps forty kilometres and the mesh
  // it is drawn on has points forty-seven apart, so consecutive path points
  // land on the same vertex or the one beside it and the line comes out as a
  // staircase -- the mesh's sawtooth, not the fracture zone's shape. Keeping
  // only points a few mesh spacings apart draws the path the walk actually
  // took. The pairs are unaffected: they carry their own snapped ends.
  const drawSpacingKm = 150
  for (const track of drawn) {
    const start = offsets[offsets.length - 1]
    let ridgeAt = start
    let lastKept = -Infinity
    let lastVertex = -1
    track.points.forEach((p, i) => {
      const signed = i < track.ridge ? -p.fromRidgeKm : p.fromRidgeKm
      const forced = i === track.ridge || i === 0 || i === track.points.length - 1
      const v = snap(p.x, p.y, p.z)
      if (!forced && (v === lastVertex || Math.abs(signed - lastKept) < drawSpacingKm)) return
      if (i === track.ridge) ridgeAt = vertex.length
      lastKept = signed
      lastVertex = v
      vertex.push(v)
      pointAge.push(p.ageMa)
      fromRidge.push(p.fromRidgeKm)
    })
    ridge.push(ridgeAt)
    offsets.push(vertex.length)
  }
  writeFileSync(
    resolve(OUT, 'tracks.bin'),
    Buffer.from(writeTracks({
      offsets: Uint32Array.from(offsets),
      ridge: Uint32Array.from(ridge),
      vertex: Uint32Array.from(vertex),
      ageMa: Float32Array.from(pointAge),
      fromRidgeKm: Float32Array.from(fromRidge),
      pairA: Uint32Array.from(conjugates.pairs, (p) => p.a),
      pairB: Uint32Array.from(conjugates.pairs, (p) => p.b),
      pairAgeMa: Float32Array.from(conjugates.pairs, (p) => p.ageMa),
    })),
  )
  console.log(`  wrote ${drawn.length} tracks for drawing and every pair for measuring`)

  writeMesh(resolve(OUT, 'mesh.bin'), shell, solvedFaceAges, crust)

  const meta: Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'> = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      { file: 'public/textures/age-map.png', note: 'Seafloor age grid, 8192x4096, grey 0-254 = 0-280 Ma, white = undated' },
      { file: 'public/textures/height-map.jpg', note: 'Topography/bathymetry, used to classify undated cells and to date them' },
      { file: 'data-src/ecm1.bin', note: 'ECM1 crustal model (Mooney et al. 2023), 1x1 degree crustal type and thickness' },
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
    radiusStepMa: CONFIG.radiusStepMa,
    referenceRadiusKm,
    frameStepMa: CONFIG.frameStepMa,
    endTimeMa: CONFIG.endTimeMa,
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
