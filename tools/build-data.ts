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
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Raster, SEA, areaQuantile, downsample, loadRaster, loadSeaMask } from './lib/raster.js'
import { buildIcosphere, sphericalTriangleArea } from './lib/icosphere.js'
import { directionToPixel } from '../shared/sphere.js'
import {
  PERMANENT_MA,
  R0_KM,
  RIGIDITY,
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

  // Land or sea comes off the colour map, not the height map: see loadSeaMask.
  const sea = downsample(
    loadSeaMask(resolve(TEXTURES, 'blue-marble-map.jpg')),
    CONFIG.gridWidth, CONFIG.gridHeight, -1,
  )
  const rigidity = computeRigidity(mesh, solvedFaceAges, sea)

  mkdirSync(OUT, { recursive: true })
  writeMesh(resolve(OUT, 'mesh.bin'), mesh.positions, mesh.indices, solvedFaceAges, rigidity)

  const meta: Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'> = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      { file: 'public/textures/age-map.png', note: 'Seafloor age grid, 8192x4096, grey 0-254 = 0-280 Ma, white = undated' },
      { file: 'public/textures/height-map.jpg', note: 'Topography/bathymetry, used to classify undated cells and to date them' },
      { file: 'public/textures/color-map.jpg', note: 'Surface colour, rides along with the crust' },
    ],
    r0Km: R0_KM,
    subdivision: CONFIG.subdivision,
    vertexCount,
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
 * Strength of each triangle of crust, from its distance to the nearest
 * continental margin and whether it stands above sea level.
 *
 * The distance is measured across the mesh itself rather than on the raster, so
 * it is a real geodesic distance in kilometres and does not stretch towards the
 * poles the way an equirectangular grid does.
 *
 * Continental crust that is under water is weakened on top of that. Broad
 * shallow platforms -- the Bering, Sunda, Barents and North Sea shelves -- are
 * stretched continental crust, and they are exactly the bridges that would
 * otherwise weld whole continents together.
 */
function computeRigidity(
  mesh: { positions: Float64Array; indices: Uint32Array },
  faceAges: Float32Array,
  sea: Raster,
): Float32Array {
  const faceCount = mesh.indices.length / 3
  const centroids = new Float64Array(faceCount * 3)
  for (let f = 0; f < faceCount; f++) {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 3; k++) {
      const v = mesh.indices[f * 3 + k] * 3
      x += mesh.positions[v]; y += mesh.positions[v + 1]; z += mesh.positions[v + 2]
    }
    const length = Math.hypot(x, y, z) || 1
    centroids[f * 3] = x / length
    centroids[f * 3 + 1] = y / length
    centroids[f * 3 + 2] = z / length
  }

  const neighbours = buildFaceAdjacency(mesh.indices, faceCount)
  const continental = (f: number) => faceAges[f] >= PERMANENT_MA

  // Multi-source Dijkstra outward from every triangle that touches the
  // continent-ocean boundary, on both sides of it.
  const distance = new Float64Array(faceCount).fill(Infinity)
  const heap: [number, number][] = []
  for (let f = 0; f < faceCount; f++) {
    for (const n of neighbours[f]) {
      if (continental(f) !== continental(n)) {
        distance[f] = 0
        heap.push([0, f])
        break
      }
    }
  }
  const arcKm = (a: number, b: number) => {
    const dot =
      centroids[a * 3] * centroids[b * 3] +
      centroids[a * 3 + 1] * centroids[b * 3 + 1] +
      centroids[a * 3 + 2] * centroids[b * 3 + 2]
    return R0_KM * Math.acos(Math.min(1, Math.max(-1, dot)))
  }
  heap.sort((p, q) => p[0] - q[0])
  while (heap.length) {
    const [d, f] = heap.shift()!
    if (d > distance[f]) continue
    for (const n of neighbours[f]) {
      const next = d + arcKm(f, n)
      if (next < distance[n]) {
        distance[n] = next
        // Insertion into a nearly sorted list; the frontier stays small.
        let i = heap.length
        while (i > 0 && heap[i - 1][0] > next) i--
        heap.splice(i, 0, [next, n])
      }
    }
  }

  const rigidity = new Float32Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    if (!continental(f)) {
      rigidity[f] = RIGIDITY.oceanic
      continue
    }
    const t = Math.min(1, distance[f] / RIGIDITY.cratonKm)
    let value = t * t * (3 - 2 * t) // smoothstep: soft near the margin
    const submerged =
      sea.atDirection(centroids[f * 3], centroids[f * 3 + 1], centroids[f * 3 + 2]) === SEA
    if (submerged) value *= RIGIDITY.submergedFactor
    rigidity[f] = Math.max(RIGIDITY.floor, value)
  }

  const cratonFaces = rigidity.reduce((n, r) => n + (r >= RIGIDITY.cratonThreshold ? 1 : 0), 0)
  const weakFaces = rigidity.reduce((n, r) => n + (r < 0.2 ? 1 : 0), 0)
  console.log(
    `  rigidity: ${((100 * cratonFaces) / faceCount).toFixed(1)}% craton core, ` +
      `${((100 * weakFaces) / faceCount).toFixed(1)}% weak crust`,
  )
  return rigidity
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
  positions: Float64Array,
  indices: Uint32Array,
  faceAges: Float32Array,
  rigidity: Float32Array,
) {
  const dirs = Float32Array.from(positions)
  const header = new Uint32Array([positions.length / 3, indices.length / 3])
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(header.buffer),
      Buffer.from(dirs.buffer),
      Buffer.from(indices.buffer),
      Buffer.from(faceAges.buffer),
      Buffer.from(rigidity.buffer),
    ]),
  )
}

main()
