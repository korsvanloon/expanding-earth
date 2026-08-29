/**
 * Stage 2: reconstruct where the crust was, by simulation rather than by
 * hand-authored keyframes.
 *
 * We integrate backwards from today, the only moment we actually know. The
 * shell is a single closed triangulation the whole way; nothing is ever added
 * or deleted. What changes is how big each piece of it is allowed to be:
 *
 *   - crust that already existed at time t keeps its present-day size, because
 *     rock does not stretch;
 *   - crust that did not exist yet is un-created, its rest length faded to
 *     nothing over TAU_MA;
 *   - the sphere it all sits on shrinks to R(t), which is not a free parameter
 *     but follows from the area budget.
 *
 * Run backwards this closes the mid-ocean ridges like zips and drags the
 * continents together. Run forwards it is sea-floor spreading. Nothing in here
 * knows what a plate is: the blocks that move as units are simply whatever
 * stays connected once the young crust is gone, so the plate boundaries fall
 * out of the magnetic anomaly pattern rather than being drawn by hand.
 *
 * The residual that relaxation cannot remove is not numerical noise, it is
 * Gauss's Theorema Egregium. A curved shell cannot be laid on a sphere of
 * different curvature without deforming, so rigid crust on a smaller Earth must
 * take up tangential compression, the way paper wrinkles when wrapped onto a
 * smaller ball. The solver measures that instead of hiding it.
 *
 * Relaxation is Gauss-Seidel rather than Jacobi on purpose. Jacobi moves
 * information one edge per sweep, so a continent would need hundreds of sweeps
 * to notice a ridge opening on its far side; applying each correction
 * immediately lets a single sweep carry it across the whole mesh.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PERMANENT_MA,
  crustScale,
  sampleCurve,
  type FrameDiagnostics,
  type Meta,
} from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')

const CONFIG = {
  /** Integration step, Myr. Small enough that each step is a small nudge. */
  stepMa: 1,
  /** Gauss-Seidel sweeps per step. */
  sweeps: Number(process.env.SWEEPS ?? 40),
  /**
   * Crust that does not exist yet pulls, but never pushes.
   *
   * The pull is what actually moves the continents: an ocean that has not
   * opened yet draws its two margins together across however many cells of
   * vanished sea floor lie between them, which is the only thing that can close
   * an Atlantic. Letting it push as well is what wrecked earlier versions of
   * this solver -- it welded the blocks either side into one rigid sheet, and a
   * sheet that large cannot change its curvature without absurd strain, which
   * is why they reported 20%. Tension-only transmits the drift without ever
   * transmitting rigidity.
   */
  unbornStiffness: Number(process.env.UNBORN_K ?? 0.6),
  /** Smoothing passes that settle not-yet-created crust into the leftover gap. */
  unbornSmoothing: Number(process.env.SMOOTH ?? 30),
  /**
   * How hard each vertex is pulled back onto the sphere of radius R(t).
   *
   * Deliberately soft. A piece of the present-day sphere cannot lie on a
   * smaller sphere isometrically -- their Gaussian curvatures differ -- so
   * pinning every vertex exactly onto R(t) leaves the crust no way to take up
   * the mismatch except by straining in-plane. Letting it ride slightly off the
   * sphere lets rigid blocks meet at an angle instead, the way the gores of a
   * globe do, and the leftover radial deviation is itself a prediction: it is
   * where the model demands the crust buckled.
   */
  radialStiffness: Number(process.env.RADIAL_K ?? 0.35),
  /**
   * An age jump this large between neighbouring sea floor is not a gradient, it
   * is a cut: fracture zones and transform faults show up in the age grid as
   * sharp discontinuities. Treating them as faults the crust may slide along
   * lets the shell break into realistic blocks instead of behaving as one
   * welded sheet, and it finds those boundaries from the data rather than from
   * a hand-drawn plate map.
   */
  faultThresholdMa: Number(process.env.FAULT_MA ?? 20),
  faultStiffness: Number(process.env.FAULT_K ?? 0.05),
  /** Stop early; for convergence experiments. */
  endMa: Number(process.env.END_MA ?? 0) || undefined,
}

function main() {
  const meta = JSON.parse(
    readFileSync(resolve(OUT, 'meta.partial.json'), 'utf8'),
  ) as Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount'>

  const buffer = readFileSync(resolve(OUT, 'mesh.bin'))
  const [vertexCount, faceCount] = new Uint32Array(buffer.buffer, buffer.byteOffset, 2)
  let offset = buffer.byteOffset + 8
  const dirs = new Float32Array(buffer.buffer, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(buffer.buffer, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(buffer.buffer, offset, faceCount)
  console.log(`[solve] ${vertexCount} vertices, ${faceCount} faces`)

  const radius = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  const radiusAt = (t: number) => sampleCurve(radius, t, meta.radiusStepMa)
  const r0 = meta.r0Km

  const { edges, edgeAge, edgeFault, edgeFaces, edgeCount } = buildEdges(
    indices, vertexCount, faceCount, faceAges,
  )
  let faultCount = 0
  for (let e = 0; e < edgeCount; e++) faultCount += edgeFault[e]
  console.log(
    `[solve] ${edgeCount} edges, ${faultCount} of them across an age discontinuity ` +
      `(>${CONFIG.faultThresholdMa} Ma)`,
  )

  /** The size each piece of crust has today, which is the size it keeps. */
  const rest = new Float64Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) {
    const a = edges[e * 2] * 3
    const b = edges[e * 2 + 1] * 3
    rest[e] =
      r0 * Math.hypot(dirs[a] - dirs[b], dirs[a + 1] - dirs[b + 1], dirs[a + 2] - dirs[b + 2])
  }

  const pos = new Float64Array(vertexCount * 3)
  for (let i = 0; i < vertexCount * 3; i++) pos[i] = dirs[i] * r0
  const previous = new Float64Array(pos)

  const adjacency = buildVertexAdjacency(indices, vertexCount)
  const vertexBlock = new Int32Array(vertexCount)
  const frames: Int16Array[] = []
  const strains: Uint8Array[] = []
  const diagnostics: FrameDiagnostics[] = []

  const record = (t: number) => {
    frames.push(quantise(pos, vertexCount))
    strains.push(perVertexStrain(pos, edges, edgeAge, rest, edgeCount, vertexCount, t))
    diagnostics.push({
      timeMa: t,
      radiusKm: radiusAt(t),
      ...coverage(pos, indices, faceAges, faceCount, t),
      ...strainStats(pos, edges, edgeAge, rest, edgeCount, t),
      reliefKm: relief(pos, vertexCount, radiusAt(t)),
      blockCount: labelBlocks(
        indices, faceAges, faceCount, vertexCount,
        edges, edgeFault, edgeFaces, edgeCount, t, vertexBlock,
      ),
    })
  }

  record(0)
  const started = Date.now()

  const endTimeMa = CONFIG.endMa ?? meta.endTimeMa
  for (let t = CONFIG.stepMa; t <= endTimeMa; t += CONFIG.stepMa) {
    const rPrev = radiusAt(t - CONFIG.stepMa)
    const rNext = radiusAt(t)
    previous.set(pos)

    // Shrink the whole shell, then let every surviving block reclaim its own
    // size on the smaller sphere. Relaxation cleans up what is left.
    const shrink = rNext / rPrev
    for (let i = 0; i < vertexCount * 3; i++) pos[i] *= shrink
    const blocks = labelBlocks(
      indices, faceAges, faceCount, vertexCount,
      edges, edgeFault, edgeFaces, edgeCount, t, vertexBlock,
    )
    dilateBlocks(pos, vertexBlock, blocks, rPrev, rNext, vertexCount)

    for (let sweep = 0; sweep < CONFIG.sweeps; sweep++) {
      const forward = sweep % 2 === 0
      for (let k = 0; k < edgeCount; k++) {
        const e = forward ? k : edgeCount - 1 - k
        const existing = edgeAge[e] >= t
        const stiffness = edgeFault[e]
          ? CONFIG.faultStiffness
          : existing
            ? 1
            : CONFIG.unbornStiffness
        if (stiffness === 0) continue
        const target = rest[e] * crustScale(edgeAge[e], t)
        const i = edges[e * 2] * 3
        const j = edges[e * 2 + 1] * 3
        const dx = pos[i] - pos[j]
        const dy = pos[i + 1] - pos[j + 1]
        const dz = pos[i + 2] - pos[j + 2]
        const length = Math.hypot(dx, dy, dz)
        if (length < 1e-9) continue
        // Vanished crust and faults are tension-only: they may draw their two
        // sides together, never hold them apart.
        if (!existing && length < target) continue
        const c = (0.5 * stiffness * (length - target)) / length
        const cx = dx * c
        const cy = dy * c
        const cz = dz * c
        pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz
        pos[j] += cx; pos[j + 1] += cy; pos[j + 2] += cz
      }
      relaxToSphere(pos, vertexCount, rNext, CONFIG.radialStiffness)
    }
    // The frame is recorded on the sphere, so finish there.
    relaxToSphere(pos, vertexCount, rNext, 1)

    settleUnborn(pos, vertexBlock, adjacency, vertexCount, rNext)
    removeNetRotation(pos, previous, vertexCount, shrink)

    if (t % meta.frameStepMa === 0) {
      record(t)
      const d = diagnostics[diagnostics.length - 1]
      console.log(
        `  ${String(t).padStart(3)} Ma  R=${d.radiusKm.toFixed(0)} km  ` +
          `blocks=${String(d.blockCount).padStart(3)}  ` +
          `unclosed=${(100 * d.gapFraction).toFixed(2)}%  ` +
          `folded=${(100 * d.overlapFraction).toFixed(2)}%  ` +
          `strain med=${(100 * d.medianStrain).toFixed(1)}% p90=${(100 * d.p90Strain).toFixed(1)}%`,
      )
    }
  }
  console.log(`[solve] ${((Date.now() - started) / 1000).toFixed(1)}s`)

  // The non-expanding control needs no simulation. Hold the radius at R0 and
  // the crust surviving to time t simply cannot cover the sphere; the shortfall
  // is exactly the area a fixed-size Earth has to account for by destroying
  // crust at subduction zones. It is the subduction budget, stated as area.
  const fixedRadiusDiagnostics: FrameDiagnostics[] = diagnostics.map((d) => ({
    ...d,
    radiusKm: r0,
    gapFraction: 1 - (d.radiusKm / r0) ** 2,
    overlapFraction: 0,
    rmsStrain: 0,
  }))

  const frameBuffer = Buffer.concat(frames.map((f) => Buffer.from(f.buffer)))
  const strainBuffer = Buffer.concat(strains.map((s) => Buffer.from(s.buffer)))
  writeFileSync(resolve(OUT, 'frames.bin'), frameBuffer)
  writeFileSync(resolve(OUT, 'strain.bin'), strainBuffer)
  writeFileSync(
    resolve(OUT, 'meta.json'),
    JSON.stringify({ ...meta, frameCount: frames.length, diagnostics, fixedRadiusDiagnostics } satisfies Meta),
  )
  console.log(
    `[solve] wrote ${frames.length} frames ` +
      `(${(frameBuffer.byteLength / 1e6).toFixed(1)} MB + ${(strainBuffer.byteLength / 1e6).toFixed(1)} MB)`,
  )
}

// --- topology --------------------------------------------------------------

/**
 * Unique edges, each tagged with the age of the youngest moment at which it
 * still exists -- the oldest of its adjoining triangles, since the edge
 * survives as long as either does.
 */
function buildEdges(
  indices: Uint32Array,
  vertexCount: number,
  faceCount: number,
  faceAges: Float32Array,
) {
  const map = new Map<number, number>()
  const list: number[] = []
  const ages: number[] = []
  const other: number[] = []
  const faces: number[] = []
  const add = (a: number, b: number, face: number) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = lo * vertexCount + hi
    const existing = map.get(key)
    if (existing !== undefined) {
      other[existing] = faceAges[face]
      ages[existing] = Math.max(ages[existing], faceAges[face])
      faces[existing * 2 + 1] = face
      return
    }
    map.set(key, list.length / 2)
    list.push(lo, hi)
    ages.push(faceAges[face])
    other.push(faceAges[face])
    faces.push(face, -1)
  }
  for (let f = 0; f < faceCount; f++) {
    add(indices[f * 3], indices[f * 3 + 1], f)
    add(indices[f * 3 + 1], indices[f * 3 + 2], f)
    add(indices[f * 3 + 2], indices[f * 3], f)
  }

  // A fault is a sharp step in the age of neighbouring sea floor. Continental
  // crust is left out of the comparison: a passive margin such as the Brazilian
  // coast puts undated continent against 120 Ma ocean, which is a huge apparent
  // step but not a plate boundary at all -- the two ride together.
  const fault = new Uint8Array(list.length / 2)
  for (let e = 0; e < fault.length; e++) {
    const a = ages[e]
    const b = other[e]
    if (a >= PERMANENT_MA || b >= PERMANENT_MA) continue
    if (Math.abs(a - b) > CONFIG.faultThresholdMa) fault[e] = 1
  }

  return {
    edges: new Uint32Array(list),
    edgeAge: new Float64Array(ages),
    edgeFault: fault,
    edgeFaces: new Int32Array(faces),
    edgeCount: list.length / 2,
  }
}

/**
 * Split the surviving crust into the blocks that move as units.
 *
 * Two neighbouring triangles belong to the same block when both still exist and
 * the edge between them is not a fault. Nothing here is told what a plate is:
 * ridges disconnect blocks because the crust between them has not been created
 * yet, and fracture zones disconnect them because the age field steps across
 * them. The plate boundaries are read off the magnetic anomaly pattern.
 */
function labelBlocks(
  indices: Uint32Array,
  faceAges: Float32Array,
  faceCount: number,
  vertexCount: number,
  edges: Uint32Array,
  edgeFault: Uint8Array,
  edgeFaces: Int32Array,
  edgeCount: number,
  t: number,
  vertexBlock: Int32Array,
) {
  const parent = new Int32Array(faceCount)
  for (let f = 0; f < faceCount; f++) parent[f] = f
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]]
    return x
  }
  for (let e = 0; e < edgeCount; e++) {
    if (edgeFault[e]) continue
    const fa = edgeFaces[e * 2]
    const fb = edgeFaces[e * 2 + 1]
    if (fb < 0 || faceAges[fa] < t || faceAges[fb] < t) continue
    const ra = find(fa)
    const rb = find(fb)
    if (ra !== rb) parent[ra] = rb
  }
  const ids = new Map<number, number>()
  vertexBlock.fill(-1)
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] < t) continue
    const root = find(f)
    let id = ids.get(root)
    if (id === undefined) {
      id = ids.size
      ids.set(root, id)
    }
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (vertexBlock[v] < 0) vertexBlock[v] = id
    }
  }
  void edges
  return ids.size
}

/**
 * Grow each block's angular extent by exactly the factor that keeps its
 * geodesic size while the sphere under it shrinks: arc length R*theta is held
 * fixed, so theta scales by R_prev/R_next about the block's own centroid.
 *
 * Relaxation alone cannot supply this. Going back from 60 Ma, roughly a third
 * of the Earth's surface -- most of the Pacific -- has to disappear, and a
 * fixed triangulation asked to collapse a region that size just jams. The
 * dilation states the bulk answer directly, in closed form and in O(n), and
 * leaves relaxation only the residual.
 */
function dilateBlocks(
  pos: Float64Array,
  vertexBlock: Int32Array,
  blockCount: number,
  rPrev: number,
  rNext: number,
  vertexCount: number,
) {
  if (blockCount === 0) return
  const cx = new Float64Array(blockCount)
  const cy = new Float64Array(blockCount)
  const cz = new Float64Array(blockCount)
  const count = new Float64Array(blockCount)

  for (let i = 0; i < vertexCount; i++) {
    const b = vertexBlock[i]
    if (b < 0) continue
    const length = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1
    cx[b] += pos[i * 3] / length
    cy[b] += pos[i * 3 + 1] / length
    cz[b] += pos[i * 3 + 2] / length
    count[b]++
  }

  const factor = rPrev / rNext
  const usable = new Uint8Array(blockCount)
  for (let b = 0; b < blockCount; b++) {
    const length = Math.hypot(cx[b], cy[b], cz[b])
    // A centroid that nearly cancels means the block wraps the sphere and has
    // no direction to expand away from; it takes the compression instead.
    usable[b] = length / Math.max(count[b], 1) > 0.05 ? 1 : 0
    if (length > 1e-9) {
      cx[b] /= length
      cy[b] /= length
      cz[b] /= length
    }
  }

  for (let i = 0; i < vertexCount; i++) {
    const b = vertexBlock[i]
    if (b < 0 || !usable[b]) continue
    const length = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1
    const ux = pos[i * 3] / length
    const uy = pos[i * 3 + 1] / length
    const uz = pos[i * 3 + 2] / length
    const dot = Math.max(-1, Math.min(1, ux * cx[b] + uy * cy[b] + uz * cz[b]))
    const theta = Math.acos(dot)
    const sin = Math.sin(theta)
    if (theta < 1e-6 || sin < 1e-9) continue
    const target = Math.min(theta * factor, Math.PI * 0.995)
    const tx = (ux - cx[b] * dot) / sin
    const ty = (uy - cy[b] * dot) / sin
    const tz = (uz - cz[b] * dot) / sin
    const ct = Math.cos(target)
    const st = Math.sin(target)
    pos[i * 3] = (cx[b] * ct + tx * st) * rNext
    pos[i * 3 + 1] = (cy[b] * ct + ty * st) * rNext
    pos[i * 3 + 2] = (cz[b] * ct + tz * st) * rNext
  }
}

/** Flat adjacency list (offsets + neighbours) for vertex smoothing. */
function buildVertexAdjacency(indices: Uint32Array, vertexCount: number) {
  const sets: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>())
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2]
    sets[a].add(b); sets[a].add(c)
    sets[b].add(a); sets[b].add(c)
    sets[c].add(a); sets[c].add(b)
  }
  const offsets = new Uint32Array(vertexCount + 1)
  for (let i = 0; i < vertexCount; i++) offsets[i + 1] = offsets[i] + sets[i].size
  const neighbours = new Uint32Array(offsets[vertexCount])
  let k = 0
  for (let i = 0; i < vertexCount; i++) for (const n of sets[i]) neighbours[k++] = n
  return { offsets, neighbours }
}

/**
 * Place crust that does not exist yet by repeatedly averaging it towards its
 * neighbours, with the surviving blocks held fixed. It settles into whatever
 * room the blocks have left, which is precisely the point: the area it still
 * occupies is the surface the reconstruction failed to account for. Played
 * forwards, this is new sea floor spreading out of a ridge.
 */
function settleUnborn(
  pos: Float64Array,
  vertexBlock: Int32Array,
  adjacency: { offsets: Uint32Array; neighbours: Uint32Array },
  vertexCount: number,
  r: number,
) {
  const { offsets, neighbours } = adjacency
  for (let pass = 0; pass < CONFIG.unbornSmoothing; pass++) {
    for (let i = 0; i < vertexCount; i++) {
      if (vertexBlock[i] >= 0) continue
      let x = 0, y = 0, z = 0
      for (let k = offsets[i]; k < offsets[i + 1]; k++) {
        const j = neighbours[k]
        x += pos[j * 3]; y += pos[j * 3 + 1]; z += pos[j * 3 + 2]
      }
      const length = Math.hypot(x, y, z)
      if (length < 1e-9) continue
      pos[i * 3] = (x / length) * r
      pos[i * 3 + 1] = (y / length) * r
      pos[i * 3 + 2] = (z / length) * r
    }
  }
}

// --- numerics --------------------------------------------------------------

/** Move every vertex a fraction `stiffness` of the way onto the sphere. */
function relaxToSphere(pos: Float64Array, vertexCount: number, r: number, stiffness: number) {
  for (let i = 0; i < vertexCount; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const length = Math.hypot(x, y, z)
    if (length < 1e-12) continue
    const s = 1 + stiffness * (r / length - 1)
    pos[i * 3] = x * s
    pos[i * 3 + 1] = y * s
    pos[i * 3 + 2] = z * s
  }
}

/**
 * Strip the rigid rotation of the whole shell relative to the previous step, so
 * the reconstruction does not slowly spin. Same no-net-rotation convention
 * plate tectonics uses to pin its reference frame.
 */
function removeNetRotation(
  pos: Float64Array,
  previous: Float64Array,
  vertexCount: number,
  shrink: number,
) {
  let axx = 0, ayy = 0, azz = 0, axy = 0, axz = 0, ayz = 0
  let bx = 0, by = 0, bz = 0
  for (let i = 0; i < vertexCount; i++) {
    const qx = previous[i * 3] * shrink
    const qy = previous[i * 3 + 1] * shrink
    const qz = previous[i * 3 + 2] * shrink
    const dx = pos[i * 3] - qx
    const dy = pos[i * 3 + 1] - qy
    const dz = pos[i * 3 + 2] - qz
    const q2 = qx * qx + qy * qy + qz * qz
    axx += q2 - qx * qx; ayy += q2 - qy * qy; azz += q2 - qz * qz
    axy -= qx * qy; axz -= qx * qz; ayz -= qy * qz
    bx += qy * dz - qz * dy
    by += qz * dx - qx * dz
    bz += qx * dy - qy * dx
  }
  const omega = solve3([axx, axy, axz, axy, ayy, ayz, axz, ayz, azz], [bx, by, bz])
  if (!omega) return
  const angle = Math.hypot(...omega)
  if (angle < 1e-12 || angle > 0.5) return
  const [ax, ay, az] = omega.map((v) => v / angle)
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  for (let i = 0; i < vertexCount; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    const dot = ax * x + ay * y + az * z
    pos[i * 3] = x * c + (ay * z - az * y) * s + ax * dot * (1 - c)
    pos[i * 3 + 1] = y * c + (az * x - ax * z) * s + ay * dot * (1 - c)
    pos[i * 3 + 2] = z * c + (ax * y - ay * x) * s + az * dot * (1 - c)
  }
}

function solve3(m: number[], v: number[]): [number, number, number] | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-6) return null
  const inv = 1 / det
  return [
    inv * ((e * i - f * h) * v[0] + (c * h - b * i) * v[1] + (b * f - c * e) * v[2]),
    inv * ((f * g - d * i) * v[0] + (a * i - c * g) * v[1] + (c * d - a * f) * v[2]),
    inv * ((d * h - e * g) * v[0] + (b * g - a * h) * v[1] + (a * e - b * d) * v[2]),
  ]
}

function quantise(pos: Float64Array, vertexCount: number) {
  const out = new Int16Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    const length = Math.hypot(x, y, z) || 1
    out[i * 3] = Math.round((x / length) * 32767)
    out[i * 3 + 1] = Math.round((y / length) * 32767)
    out[i * 3 + 2] = Math.round((z / length) * 32767)
  }
  return out
}

// --- diagnostics -----------------------------------------------------------

function strainStats(
  pos: Float64Array, edges: Uint32Array, edgeAge: Float64Array,
  rest: Float64Array, edgeCount: number, t: number,
) {
  let square = 0
  let signed = 0
  let weight = 0
  const magnitudes: number[] = []
  for (let e = 0; e < edgeCount; e++) {
    if (edgeAge[e] < t) continue
    const i = edges[e * 2] * 3
    const j = edges[e * 2 + 1] * 3
    const length = Math.hypot(pos[i] - pos[j], pos[i + 1] - pos[j + 1], pos[i + 2] - pos[j + 2])
    const strain = length / rest[e] - 1
    square += strain * strain * rest[e]
    signed += strain * rest[e]
    weight += rest[e]
    magnitudes.push(Math.abs(strain))
  }
  if (weight === 0) return { rmsStrain: 0, meanStrain: 0, medianStrain: 0, p90Strain: 0 }
  magnitudes.sort((a, b) => a - b)
  return {
    rmsStrain: Math.sqrt(square / weight),
    meanStrain: signed / weight,
    // The RMS is dominated by a thin fringe of badly distorted cells along
    // ridges and faults. The median says what the crust away from them is
    // actually asked to do, which is the number worth judging the model by.
    medianStrain: magnitudes[magnitudes.length >> 1],
    p90Strain: magnitudes[Math.floor(magnitudes.length * 0.9)],
  }
}

/** RMS departure from the sphere: how far the model has to buckle the crust. */
function relief(pos: Float64Array, vertexCount: number, r: number) {
  let sum = 0
  for (let i = 0; i < vertexCount; i++) {
    const d = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) - r
    sum += d * d
  }
  return Math.sqrt(sum / vertexCount)
}

function perVertexStrain(
  pos: Float64Array, edges: Uint32Array, edgeAge: Float64Array,
  rest: Float64Array, edgeCount: number, vertexCount: number, t: number,
) {
  const sum = new Float64Array(vertexCount)
  const count = new Float64Array(vertexCount)
  for (let e = 0; e < edgeCount; e++) {
    if (edgeAge[e] < t) continue
    const i = edges[e * 2]
    const j = edges[e * 2 + 1]
    const a = i * 3
    const b = j * 3
    const length = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
    const strain = length / rest[e] - 1
    sum[i] += strain; count[i]++
    sum[j] += strain; count[j]++
  }
  // Quantised to a byte over +/-20% strain, well beyond what real crust
  // survives, so the interesting range keeps plenty of resolution.
  const out = new Uint8Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    const strain = count[i] > 0 ? sum[i] / count[i] : 0
    out[i] = Math.round(Math.min(255, Math.max(0, (strain / 0.2) * 127 + 128)))
  }
  return out
}

/**
 * Two honest failure measures.
 *
 * `gapFraction` is how much of the sphere is still taken up by crust that did
 * not exist yet -- surface the reconstruction has failed to account for. It
 * should go to zero, and whatever remains is the model's error, reported rather
 * than hidden.
 *
 * `overlapFraction` is the area of triangles the solver has folded through
 * themselves, detected by their winding flipping relative to the outward
 * normal. Folds mean crust has been driven through crust.
 */
function coverage(
  pos: Float64Array, indices: Uint32Array, faceAges: Float32Array, faceCount: number, t: number,
) {
  let unborn = 0
  let folded = 0
  let total = 0
  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3] * 3
    const b = indices[f * 3 + 1] * 3
    const c = indices[f * 3 + 2] * 3
    const area = solidAngle(pos, a, b, c)
    total += area
    if (faceAges[f] < t) unborn += area
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    if (nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2] < 0) folded += area
  }
  return { gapFraction: unborn / total, overlapFraction: folded / total }
}

function solidAngle(pos: Float64Array, a: number, b: number, c: number) {
  const n = (i: number) => {
    const length = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1
    return [pos[i] / length, pos[i + 1] / length, pos[i + 2] / length] as const
  }
  const [ax, ay, az] = n(a)
  const [bx, by, bz] = n(b)
  const [cx, cy, cz] = n(c)
  const numerator = Math.abs(
    ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx),
  )
  const denominator =
    1 + (ax * bx + ay * by + az * bz) + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az)
  return 2 * Math.atan2(numerator, denominator)
}

main()
