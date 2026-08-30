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
import { CORE_TYPES, CRUST_RIGIDITY, CRUST_TYPES, type CrustType } from '../shared/crust.js'
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
  subdivision: 6,
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
  /**
   * Fragments larger than this across are cut down further.
   *
   * A rigid piece cannot lie on a sphere of different curvature, and the misfit
   * grows with the square of its size: at 200 Ma a 1500 km piece is out by
   * 1.4%, a 2500 km piece by 3.9%, a 5000 km piece by 15.6%. Cutting the shell
   * only along its weak crust leaves pieces far bigger than that, so the extra
   * cuts here are a discretisation of deformation the crust would otherwise
   * have to take up continuously -- the gores a globe maker cuts, not faults
   * anyone has mapped. They follow weak crust wherever there is any.
   */
  /**
   * The smallest patch of strong crust that gets to be a fragment of its own,
   * as a fraction of the sphere. About a hundred thousand square kilometres --
   * low enough to admit Madagascar, Cuba, Iceland and the Canadian islands.
   *
   * Nothing sets an upper size. Real blocks are wildly unequal: Africa and
   * North America are single slabs thousands of kilometres across, and what
   * comes off them are chips. An earlier version cut every fragment down to a
   * uniform 1200 km, which made a mosaic of same-sized tiles no continent could
   * be recognised in. Where a fragment ends should follow from where the crust
   * is weak, and from nothing else.
   */
  minCoreFraction: Number(process.env.CORE_FRAC ?? 0.00003),
  /** How steeply weak crust repels a fragment boundary; see splitIntoFragments. */
  breakBias: Number(process.env.BREAK_BIAS ?? 2),
  endTimeMa: 200,
  radiusStepMa: 1,
  frameStepMa: 5,
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

  const crustModels: CrustModel[] = (Object.keys(ageFields) as CrustModelId[]).map((id) => {
    const faceAges = sampleFaceAges(mesh, ageFields[id], age)
    return {
      id,
      label: id,
      assumption: assumptions[id],
      radiusKm: radiusCurve(faceAges, faceArea),
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

  const crust = sampleCrust(mesh)
  const split = splitIntoFragments(mesh, crust.type, crust.rigidity, solvedFaceAges, faceArea)

  mkdirSync(OUT, { recursive: true })
  writeMesh(resolve(OUT, 'mesh.bin'), split, solvedFaceAges, crust)

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
    vertexCount: split.positions.length / 3,
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
  console.log('[build-data] wrote public/data/mesh.bin and meta.partial.json')
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
 * Cut the shell into fragments along its weak crust, and give each fragment its
 * own copy of the vertices it shares with its neighbours.
 *
 * This is the orange-peel picture made literal. A peel put back on a smaller
 * orange does not stretch; it cracks where it is thin and the pieces ride over
 * one another. Up to now the mesh was a single fixed triangulation, so the only
 * way it could take up the change in curvature was by deforming -- 25% of
 * compression in places, and triangles drawn out into needles that smear the
 * land across them. Once the vertices are duplicated, no triangle spans a
 * fracture: fragments are free to slide past and over each other, and what used
 * to be strain becomes overlap, which is what thrust faulting is.
 *
 * A fragment is unthinned continental crust plus the sea floor nearest to it.
 * Thinned margins, island arcs and stretched crust are left out of the cores on
 * purpose, so Panama, the Bering shelf, the Sinai and the Indonesian arcs fall
 * on fracture lines rather than welding continents together.
 */
function splitIntoFragments(
  mesh: { positions: Float64Array; indices: Uint32Array },
  crustType: Uint8Array,
  rigidity: Float32Array,
  faceAges: Float32Array,
  faceArea: Float64Array,
) {
  const faceCount = mesh.indices.length / 3
  const vertexCount = mesh.positions.length / 3
  const coreTypes = new Set<CrustType>(CORE_TYPES)

  const neighbours = buildFaceAdjacency(mesh.indices, faceCount)
  const isCore = new Uint8Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    isCore[f] = coreTypes.has(CRUST_TYPES[crustType[f]] as CrustType) ? 1 : 0
  }

  const parent = new Int32Array(faceCount)
  for (let f = 0; f < faceCount; f++) parent[f] = f
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  for (let f = 0; f < faceCount; f++) {
    if (!isCore[f]) continue
    for (const n of neighbours[f]) {
      if (!isCore[n]) continue
      const a = find(f)
      const b = find(n)
      if (a !== b) parent[a] = b
    }
  }

  // A continent is worth being a fragment; a stray triangle is not. Set low
  // enough to admit the chips -- Madagascar, Cuba, Iceland, the Canadian
  // islands -- because those are exactly the pieces that break off a big block
  // and have to travel on their own.
  const MIN_CORE_AREA = CONFIG.minCoreFraction * 4 * Math.PI
  const coreArea = new Map<number, number>()
  for (let f = 0; f < faceCount; f++) {
    if (isCore[f]) coreArea.set(find(f), (coreArea.get(find(f)) ?? 0) + faceArea[f])
  }
  const fragmentId = new Map<number, number>()
  for (const [root, area] of [...coreArea].sort((a, b) => b[1] - a[1])) {
    if (area >= MIN_CORE_AREA) fragmentId.set(root, fragmentId.size)
  }

  // Everything else joins the nearest core across the mesh. Distance is
  // divided by strength, so a front runs cheaply through a craton and stalls in
  // weak crust, which puts the boundaries where the shell would actually break.
  const faceFragment = new Int32Array(faceCount).fill(-1)
  const distance = new Float64Array(faceCount).fill(Infinity)
  const centre = (f: number) => {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[f * 3 + k] * 3
      x += mesh.positions[v]; y += mesh.positions[v + 1]; z += mesh.positions[v + 2]
    }
    const length = Math.hypot(x, y, z) || 1
    return [x / length, y / length, z / length] as const
  }
  const centres = Array.from({ length: faceCount }, (_, f) => centre(f))
  const arc = (a: number, b: number) =>
    Math.acos(
      Math.min(1, Math.max(-1,
        centres[a][0] * centres[b][0] + centres[a][1] * centres[b][1] + centres[a][2] * centres[b][2])),
    )
  // Distance divided by strength, and steeply: a front runs almost free
  // through a craton and all but stops in a thinned margin, so the boundary
  // between two fragments settles on the weakest crust available rather than
  // halfway between their cores. At the first power the strength barely had a
  // vote and boundaries came out straight across the middle of the Atlantic and
  // clean through northern South America. Squared, they follow the belts the
  // crustal strength map draws round every continent, and every join on the
  // scorecard closes to within sixty kilometres instead of within three
  // hundred. Cubed is sharper still and costs more coverage than it buys.
  const cost = (a: number, b: number) => arc(a, b) / Math.max(rigidity[b], 0.05) ** CONFIG.breakBias
  const frontier: [number, number][] = []
  for (let f = 0; f < faceCount; f++) {
    const id = isCore[f] ? fragmentId.get(find(f)) : undefined
    if (id === undefined) continue
    faceFragment[f] = id
    distance[f] = 0
    frontier.push([0, f])
  }
  while (frontier.length) {
    const [d, f] = frontier.shift()!
    if (d > distance[f]) continue
    for (const n of neighbours[f]) {
      const next = d + cost(f, n)
      if (next >= distance[n]) continue
      distance[n] = next
      faceFragment[n] = faceFragment[f]
      let i = frontier.length
      while (i > 0 && frontier[i - 1][0] > next) i--
      frontier.splice(i, 0, [next, n])
    }
  }

  const count = fragmentId.size

  // Duplicate every vertex that more than one fragment uses.
  const copyOf = new Map<number, number>()
  const origin: number[] = []
  const indices = new Uint32Array(faceCount * 3)
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[f * 3 + k]
      const key = v * 4096 + faceFragment[f]
      let copy = copyOf.get(key)
      if (copy === undefined) {
        copy = origin.length
        origin.push(v)
        copyOf.set(key, copy)
      }
      indices[f * 3 + k] = copy
    }
  }

  // Every fracture is closed until it opens. Cutting the mesh removed the
  // shared vertices that held neighbouring fragments together, and nothing
  // replaced them, so the shell fell apart into loose shards; these pairs put
  // the join back as a constraint the solver can release exactly where the
  // crust between the two sides no longer exists.
  const copiesOf = new Map<number, number[]>()
  origin.forEach((v, copy) => {
    const list = copiesOf.get(v)
    if (list) list.push(copy)
    else copiesOf.set(v, [copy])
  })
  const cutPairs: number[] = []
  for (const copies of copiesOf.values()) {
    for (let i = 1; i < copies.length; i++) cutPairs.push(copies[i - 1], copies[i])
  }

  const positions = new Float32Array(origin.length * 3)
  const vertexFragment = new Uint16Array(origin.length)
  for (let i = 0; i < origin.length; i++) {
    positions[i * 3] = mesh.positions[origin[i] * 3]
    positions[i * 3 + 1] = mesh.positions[origin[i] * 3 + 1]
    positions[i * 3 + 2] = mesh.positions[origin[i] * 3 + 2]
  }
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) vertexFragment[indices[f * 3 + k]] = faceFragment[f]
  }

  void faceAges
  // What the pieces actually came out as, largest first: a reconstruction made
  // of one-size blocks is a reconstruction of nothing in particular.
  const areaOf = new Float64Array(count)
  for (let f = 0; f < faceCount; f++) if (faceFragment[f] >= 0) areaOf[faceFragment[f]] += faceArea[f]
  const across = [...areaOf]
    .sort((a, b) => b - a)
    .map((a) => Math.round(2 * R0_KM * Math.asin(Math.sqrt(a / (4 * Math.PI)))))
  console.log(
    `  fragment size across, km: ${across.slice(0, 12).join(' ')}` +
      `${across.length > 12 ? ` ... ${across[across.length - 1]}` : ''}`,
  )
  console.log(
    `  ${count} fragments; mesh grew from ${vertexCount} to ${origin.length} vertices, ` +
      `joined by ${cutPairs.length / 2} fracture constraints`,
  )
  return {
    positions,
    indices,
    faceFragment: Uint16Array.from(faceFragment),
    vertexFragment,
    // Which vertex of the uncut mesh each copy came from. Cutting disconnects
    // the two sides of every ocean, so anything that needs to know what used to
    // lie against what -- finding conjugate margins, above all -- has to work
    // through the original connectivity rather than the cut one.
    origin: Uint32Array.from(origin),
    cutPairs: Uint32Array.from(cutPairs),
    fragmentCount: count,
  }
}


function buildFaceAdjacency(indices: Uint32Array, faceCount: number): number[][] {
  const edges = new Map<number, number[]>()
  const vertexCount = indices.reduce((m, v) => Math.max(m, v), 0) + 1
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k]
      const b = indices[f * 3 + ((k + 1) % 3)]
      const key = Math.min(a, b) * vertexCount + Math.max(a, b)
      const found = edges.get(key)
      if (found) found.push(f)
      else edges.set(key, [f])
    }
  }
  const out: number[][] = Array.from({ length: faceCount }, () => [])
  for (const faces of edges.values()) {
    if (faces.length !== 2) continue
    out[faces[0]].push(faces[1])
    out[faces[1]].push(faces[0])
  }
  return out
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
function radiusCurve(faceAges: Float32Array, faceArea: Float64Array): number[] {
  const curve: number[] = []
  for (let t = 0; t <= CONFIG.endTimeMa; t += CONFIG.radiusStepMa) {
    let solidAngle = 0
    for (let f = 0; f < faceAges.length; f++) {
      const scale = crustScale(faceAges[f], t)
      solidAngle += faceArea[f] * scale * scale
    }
    curve.push(R0_KM * Math.sqrt(solidAngle / (4 * Math.PI)))
  }
  return curve
}

function writeMesh(
  path: string,
  split: ReturnType<typeof splitIntoFragments>,
  faceAges: Float32Array,
  crust: { rigidity: Float32Array; type: Uint8Array; thickness: Float32Array },
) {
  const header = new Uint32Array([
    split.positions.length / 3,
    split.indices.length / 3,
    split.fragmentCount,
    split.cutPairs.length / 2,
  ])
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(header.buffer),
      Buffer.from(split.positions.buffer),
      Buffer.from(split.indices.buffer),
      Buffer.from(faceAges.buffer),
      Buffer.from(crust.rigidity.buffer),
      Buffer.from(crust.thickness.buffer),
      // Four-byte arrays first: a Uint32Array cannot start on an odd offset,
      // and the byte-wide sections below would push it off alignment.
      Buffer.from(split.origin.buffer),
      Buffer.from(split.cutPairs.buffer),
      Buffer.from(split.faceFragment.buffer),
      Buffer.from(split.vertexFragment.buffer),
      Buffer.from(crust.type.buffer),
    ]),
  )
}

main()
