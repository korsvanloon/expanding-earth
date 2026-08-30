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
  FIT_TARGETS,
  PERMANENT_MA,
  REGIONS,
  crustScale,
  sampleCurve,
  type FrameDiagnostics,
  type Meta,
} from '../shared/model.js'
import { CRATON_RIGIDITY, WEAK_RIGIDITY } from '../shared/crust.js'
import { directionToUv } from '../shared/sphere.js'

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
  /** How hard conjugate margins are pulled back together, per sweep. */
  seamGain: Number(process.env.SEAM_GAIN ?? 0.35),
  /**
   * How far a front may travel into vanished crust before it stops looking for
   * a partner, in mesh steps of about 110 km.
   *
   * Spreading has to be reversed a strip at a time. Let the fronts run without
   * limit and at 200 Ma they cross the entire Pacific in one go, where the line
   * on which they collide is no longer a ridge but an artefact of the shape of
   * the hole -- which had North America and Eurasia pulling each other to
   * opposite sides of the planet. Keeping the reach local pairs each margin
   * with the crust that was actually against it, and the closure accumulates
   * over the steps instead of being guessed in one leap.
   */
  seamReach: Number(process.env.SEAM_REACH ?? 6),
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
  ) as Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'>

  const buffer = readFileSync(resolve(OUT, 'mesh.bin'))
  const [vertexCount, faceCount, fragmentCount] = new Uint32Array(buffer.buffer, buffer.byteOffset, 3)
  let offset = buffer.byteOffset + 12
  const dirs = new Float32Array(buffer.buffer, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(buffer.buffer, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(buffer.buffer, offset, faceCount)
  offset += faceCount * 4
  const rigidity = new Float32Array(buffer.buffer, offset, faceCount)
  offset += faceCount * 4
  offset += faceCount * 4 // thickness, used by the viewer
  const origin = new Uint32Array(buffer.buffer, offset, vertexCount)
  offset += vertexCount * 4
  offset += faceCount // crustal type, used by the viewer
  offset += faceCount // per-face fragment, used by the viewer
  const vertexFragment = new Uint8Array(buffer.buffer, offset, vertexCount)
  console.log(`[solve] ${vertexCount} vertices, ${faceCount} faces, ${fragmentCount} fragments`)

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

  /**
   * How hard each edge resists being changed, taken as the weaker of the two
   * triangles it separates. Weakest-wins on purpose: a thin neck between two
   * cratons should give way rather than drag them along with it.
   */
  const edgeRigidity = new Float64Array(edgeCount)
  for (let e = 0; e < edgeCount; e++) {
    const a = edgeFaces[e * 2]
    const b = edgeFaces[e * 2 + 1]
    edgeRigidity[e] = b < 0 ? rigidity[a] : Math.min(rigidity[a], rigidity[b])
  }

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
  const reference = new Float64Array(pos)
  const alive = new Uint8Array(vertexCount)

  // Present-day area of every triangle: the area that piece of crust has, and
  // therefore keeps.
  const restArea = new Float64Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    restArea[f] =
      solidAngle(dirs, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3) * r0 * r0
  }

  const adjacency = buildVertexAdjacency(indices, vertexCount)
  // A second adjacency over the uncut mesh, so conjugate margins can still be
  // found across a fracture that the cut has separated.
  const originalIndices = Uint32Array.from(indices, (v) => origin[v])
  const originalCount = origin.reduce((m, v) => Math.max(m, v), 0) + 1
  const uncut = buildVertexAdjacency(originalIndices, originalCount)
  // The mesh arrives already cut along its weak crust, so every vertex belongs
  // to exactly one fragment and a whole fragment can be snapped rigid without
  // tearing anything -- the flaw that sank two earlier attempts at this.
  const plates = { count: fragmentCount, interior: new Int32Array(vertexFragment) }
  const vertexBlock = new Int32Array(vertexFragment)

  const vertexAge = new Float32Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (faceAges[f] > vertexAge[v]) vertexAge[v] = faceAges[f]
    }
  }
  const frames: Int16Array[] = []
  const strains: Uint8Array[] = []
  const diagnostics: FrameDiagnostics[] = []

  // Which vertices make up each named region, for the scorecard.
  const regionVertices = new Map<string, number[]>()
  for (const region of REGIONS) {
    const list: number[] = []
    for (let v = 0; v < vertexCount; v++) {
      if (vertexAge[v] < PERMANENT_MA) continue
      const [u, w] = directionToUv(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2])
      const lon = (u - 0.5) * 360
      const lat = (w - 0.5) * 180
      if (lat >= region.latMin && lat <= region.latMax && lon >= region.lonMin && lon <= region.lonMax) {
        list.push(v)
      }
    }
    regionVertices.set(region.id, list)
  }
  const separation = new Map<string, number[]>()

  const record = (t: number) => {
    const centre = (id: string) => {
      let x = 0, y = 0, z = 0
      for (const v of regionVertices.get(id) ?? []) {
        const length = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
        x += pos[v * 3] / length; y += pos[v * 3 + 1] / length; z += pos[v * 3 + 2] / length
      }
      const length = Math.hypot(x, y, z) || 1
      return [x / length, y / length, z / length] as const
    }
    for (const target of FIT_TARGETS) {
      const a = centre(target.a)
      const b = centre(target.b)
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
      const key = `${target.a}|${target.b}`
      separation.set(key, [...(separation.get(key) ?? []), Math.acos(dot) * radiusAt(t)])
    }

    frames.push(quantise(pos, vertexCount))
    strains.push(
      perVertexStrain(
        faceStrain(pos, indices, restArea, faceCount), indices, restArea, faceCount, vertexCount,
      ),
    )
    diagnostics.push({
      timeMa: t,
      radiusKm: radiusAt(t),
      ...coverage(pos, indices, faceAges, faceCount, t),
      ...strainStats(
        faceStrain(pos, indices, restArea, faceCount), faceAges, restArea, faceCount, t, rigidity,
      ),
      reliefKm: relief(pos, vertexCount, radiusAt(t)),
      blockCount: plates.count,
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
    // Which crust exists at this moment.
    alive.fill(0)
    for (let f = 0; f < faceCount; f++) {
      if (faceAges[f] < t) continue
      alive[indices[f * 3]] = 1
      alive[indices[f * 3 + 1]] = 1
      alive[indices[f * 3 + 2]] = 1
    }

    const seams = findSeams(
      indices, origin, originalCount, faceCount, vertexCount, faceAges, t, vertexBlock, uncut,
    )
    dilateBlocks(pos, vertexBlock, plates.count, rPrev, rNext, vertexCount, alive)
    // The craton interiors are rigid, so remember the shape they are allowed to
    // keep; everything the relaxation does to them afterwards is undone except
    // the part a rotation could have produced.
    reference.set(pos)

    for (let sweep = 0; sweep < CONFIG.sweeps; sweep++) {
      const forward = sweep % 2 === 0
      for (let k = 0; k < edgeCount; k++) {
        const e = forward ? k : edgeCount - 1 - k
        const existing = edgeAge[e] >= t
        const stiffness = edgeFault[e]
          ? CONFIG.faultStiffness
          : existing
            ? edgeRigidity[e]
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
      closeSeams(pos, seams, vertexBlock, plates.count, vertexCount, CONFIG.seamGain)
      keepFragmentsRigid(pos, reference, plates.interior, alive, plates.count, vertexCount)
    }
    // The frame is recorded on the sphere, so finish there.
    relaxToSphere(pos, vertexCount, rNext, 1)

    settleUnborn(pos, alive, adjacency, vertexCount, rNext)
    removeNetRotation(pos, previous, vertexCount, shrink)

    if (t % meta.frameStepMa === 0) {
      record(t)
      const d = diagnostics[diagnostics.length - 1]
      console.log(
        `  ${String(t).padStart(3)} Ma  R=${d.radiusKm.toFixed(0)} km  ` +
          `blocks=${String(d.blockCount).padStart(3)}  ` +
          `unclosed=${(100 * d.gapFraction).toFixed(2)}%  ` +
          `folded=${(100 * d.overlapFraction).toFixed(2)}%  ` +
          `strain craton=${(100 * d.cratonStrain).toFixed(1)}% weak=${(100 * d.weakStrain).toFixed(1)}%` +
            ` all=${(100 * d.medianStrain).toFixed(1)}%`,
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
  // Which plate each vertex belongs to, so the viewer can show the mosaic the
  // solver actually used rather than a redrawing of it.
  writeFileSync(resolve(OUT, 'plates.bin'), Buffer.from(Uint8Array.from(vertexBlock, (p) => p + 1)))
  writeFileSync(
    resolve(OUT, 'meta.json'),
    JSON.stringify({
      ...meta,
      frameCount: frames.length,
      diagnostics,
      fixedRadiusDiagnostics,
      scorecard: FIT_TARGETS.map((target) => ({
        ...target,
        separationKm: separation.get(`${target.a}|${target.b}`) ?? [],
      })),
    } satisfies Meta),
  )
  console.log('[solve] fit scorecard, centre to centre:')
  for (const target of FIT_TARGETS) {
    const km = separation.get(`${target.a}|${target.b}`) ?? []
    const step = meta.frameStepMa
    const atJoin = km[Math.min(km.length - 1, Math.round(target.joinedByMa / step))]
    console.log(
      `  ${(target.a + ' - ' + target.b).padEnd(30)} ` +
        `now ${km[0].toFixed(0).padStart(6)} km   ` +
        `at ${String(target.joinedByMa).padStart(3)} Ma ${atJoin.toFixed(0).padStart(6)} km` +
        `   (should be touching)`,
    )
  }
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
 * Find conjugate margins: pairs of points on two different plates that were in
 * contact before the ocean between them existed.
 *
 * This is the reverse of sea-floor spreading, and it is what actually moves
 * continents. Crust of a given age on one flank of a ridge was made at the same
 * instant, in the same place, as crust of that age on the other flank; remove
 * everything younger and the two margins must meet again. The pairing falls out
 * of a race: fronts start from every margin that borders vanished crust and
 * spread into it, and where two fronts collide is the extinct ridge, with the
 * two margins they set out from being the pair that has to come back together.
 *
 * The earlier solver tried to do this by letting the vanished crust contract as
 * a spring mesh. That cannot work at this scale -- closing the Atlantic means
 * collapsing a third of the planet's surface through a fixed triangulation, so
 * the triangles invert and jam long before the job is done, and the pull stalls
 * at about half the distance. Here the vanished crust is used only as a graph
 * to find who belongs against whom, never as something that has to physically
 * shrink.
 */
function findSeams(
  indices: Uint32Array,
  origin: Uint32Array,
  originalCount: number,
  faceCount: number,
  vertexCount: number,
  faceAges: Float32Array,
  t: number,
  vertexPlate: Int32Array,
  adjacency: { offsets: Uint32Array; neighbours: Uint32Array },
) {
  // Fronts travel over the uncut mesh but remember which cut copy they set out
  // from, so the pairs they find name the vertices the solver actually moves.
  const alive = new Uint8Array(originalCount)
  const touchesGone = new Uint8Array(originalCount)
  const copyOf = new Int32Array(originalCount).fill(-1)
  for (let f = 0; f < faceCount; f++) {
    const gone = faceAges[f] < t
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      const o = origin[v]
      if (gone) touchesGone[o] = 1
      else {
        alive[o] = 1
        copyOf[o] = v
      }
    }
  }

  const source = new Int32Array(originalCount).fill(-1)
  const plate = new Int32Array(originalCount).fill(-1)
  const depth = new Int32Array(originalCount)
  const queue: number[] = []
  for (let o = 0; o < originalCount; o++) {
    if (!alive[o] || !touchesGone[o] || copyOf[o] < 0) continue
    source[o] = copyOf[o]
    plate[o] = vertexPlate[copyOf[o]]
    queue.push(o)
  }

  const { offsets, neighbours } = adjacency
  const pairs: number[] = []
  // One pairing per margin point. Without this the fronts across a wide ocean
  // meet along a whole front rather than at a line, and the set of pairs grows
  // until it exhausts memory.
  const paired = new Uint8Array(vertexCount)
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]
    for (let k = offsets[v]; k < offsets[v + 1]; k++) {
      const n = neighbours[k]
      if (source[n] === -1) {
        // Only crust that no longer exists conducts a front, and only so far.
        if (alive[n] || depth[v] >= CONFIG.seamReach) continue
        source[n] = source[v]
        plate[n] = plate[v]
        depth[n] = depth[v] + 1
        queue.push(n)
      } else if (plate[n] !== plate[v] && plate[n] >= 0 && plate[v] >= 0) {
        const a = source[v]
        const b = source[n]
        if (paired[a] || paired[b]) continue
        paired[a] = 1
        paired[b] = 1
        pairs.push(a, b)
      }
    }
  }
  return new Uint32Array(pairs)
}

/**
 * Draw conjugate margins back together, moving whole plates rather than
 * stretching them. Each pair asks its two points to meet in the middle; those
 * requests are collapsed into the single rotation per plate that best satisfies
 * them, so a continent is dragged across an ocean without being pulled out of
 * shape on the way.
 */
function closeSeams(
  pos: Float64Array,
  seams: Uint32Array,
  vertexPlate: Int32Array,
  plateCount: number,
  vertexCount: number,
  gain: number,
) {
  if (!seams.length || plateCount === 0) return
  const m = new Float64Array(plateCount * 6)
  const v = new Float64Array(plateCount * 3)
  const trace = new Float64Array(plateCount)
  const size = new Float64Array(plateCount)

  const add = (i: number, dx: number, dy: number, dz: number) => {
    const p = vertexPlate[i]
    if (p < 0) return
    const qx = pos[i * 3], qy = pos[i * 3 + 1], qz = pos[i * 3 + 2]
    const q2 = qx * qx + qy * qy + qz * qz
    const o = p * 6
    m[o] += q2 - qx * qx; m[o + 1] += q2 - qy * qy; m[o + 2] += q2 - qz * qz
    m[o + 3] -= qx * qy; m[o + 4] -= qx * qz; m[o + 5] -= qy * qz
    v[p * 3] += qy * dz - qz * dy
    v[p * 3 + 1] += qz * dx - qx * dz
    v[p * 3 + 2] += qx * dy - qy * dx
    trace[p] += q2
    size[p]++
  }

  for (let s = 0; s < seams.length; s += 2) {
    const a = seams[s], b = seams[s + 1]
    const dx = (pos[b * 3] - pos[a * 3]) * 0.5
    const dy = (pos[b * 3 + 1] - pos[a * 3 + 1]) * 0.5
    const dz = (pos[b * 3 + 2] - pos[a * 3 + 2]) * 0.5
    add(a, dx, dy, dz)
    add(b, -dx, -dy, -dz)
  }

  for (let p = 0; p < plateCount; p++) {
    if (size[p] === 0) continue
    const ridge = 1e-3 * (trace[p] / size[p])
    const o = p * 6
    const omega = solve3(
      [m[o] + ridge, m[o + 3], m[o + 4], m[o + 3], m[o + 1] + ridge, m[o + 5],
       m[o + 4], m[o + 5], m[o + 2] + ridge],
      [v[p * 3], v[p * 3 + 1], v[p * 3 + 2]],
    )
    if (!omega) continue
    const angle = Math.hypot(...omega)
    // Cap the step so one badly conditioned plate cannot fling itself away.
    const scale = (angle > 0.03 ? 0.03 / angle : 1) * gain
    v[p * 3] = omega[0] * scale
    v[p * 3 + 1] = omega[1] * scale
    v[p * 3 + 2] = omega[2] * scale
  }

  for (let i = 0; i < vertexCount; i++) {
    const p = vertexPlate[i]
    if (p < 0 || size[p] === 0) continue
    const wx = v[p * 3], wy = v[p * 3 + 1], wz = v[p * 3 + 2]
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
    pos[i * 3] = x + wy * z - wz * y
    pos[i * 3 + 1] = y + wz * x - wx * z
    pos[i * 3 + 2] = z + wx * y - wy * x
  }
}

/**
 * Undo whatever the relaxation did to a fragment, keeping only the part a rigid
 * rotation could have done. Crust moves; it does not stretch.
 *
 * This is safe now only because the mesh was cut first: a vertex belongs to one
 * fragment and no triangle spans a fracture, so no snap can pull the mesh apart
 * in two directions at once. What used to show up as internal strain now shows
 * up between fragments, as sliding and overlap, which is what thrust faulting
 * is. The rotation is a few small-angle least-squares steps, which is plenty:
 * the motion in one time step is far under a degree.
 */
function keepFragmentsRigid(
  pos: Float64Array,
  reference: Float64Array,
  interior: Int32Array,
  alive: Uint8Array,
  count: number,
  vertexCount: number,
) {
  if (count === 0) return
  const rotation = new Float64Array(count * 9)
  for (let c = 0; c < count; c++) {
    rotation[c * 9] = 1
    rotation[c * 9 + 4] = 1
    rotation[c * 9 + 8] = 1
  }

  for (let pass = 0; pass < 3; pass++) {
    const m = new Float64Array(count * 6)
    const v = new Float64Array(count * 3)
    for (let i = 0; i < vertexCount; i++) {
      const c = interior[i]
      if (c < 0 || !alive[i]) continue
      const r = c * 9
      const rx = reference[i * 3], ry = reference[i * 3 + 1], rz = reference[i * 3 + 2]
      const qx = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
      const qy = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
      const qz = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
      const dx = pos[i * 3] - qx, dy = pos[i * 3 + 1] - qy, dz = pos[i * 3 + 2] - qz
      const q2 = qx * qx + qy * qy + qz * qz
      const o = c * 6
      m[o] += q2 - qx * qx; m[o + 1] += q2 - qy * qy; m[o + 2] += q2 - qz * qz
      m[o + 3] -= qx * qy; m[o + 4] -= qx * qz; m[o + 5] -= qy * qz
      v[c * 3] += qy * dz - qz * dy
      v[c * 3 + 1] += qz * dx - qx * dz
      v[c * 3 + 2] += qx * dy - qy * dx
    }
    for (let c = 0; c < count; c++) {
      const o = c * 6
      const omega = solve3(
        [m[o], m[o + 3], m[o + 4], m[o + 3], m[o + 1], m[o + 5], m[o + 4], m[o + 5], m[o + 2]],
        [v[c * 3], v[c * 3 + 1], v[c * 3 + 2]],
      )
      if (!omega) continue
      const angle = Math.hypot(...omega)
      if (angle < 1e-12 || angle > 0.5) continue
      compose(rotation, c * 9, omega[0] / angle, omega[1] / angle, omega[2] / angle, angle)
    }
  }

  for (let i = 0; i < vertexCount; i++) {
    const c = interior[i]
    // Crust that does not exist yet is not held rigid; it collapses into the
    // gap and is placed by smoothing, so a fragment is never asked to carry
    // sea floor that had not been made.
    if (c < 0 || !alive[i]) continue
    const r = c * 9
    const rx = reference[i * 3], ry = reference[i * 3 + 1], rz = reference[i * 3 + 2]
    pos[i * 3] = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
    pos[i * 3 + 1] = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
    pos[i * 3 + 2] = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
  }
}

/** Pre-multiply the 3x3 rotation at `offset` by a Rodrigues rotation. */
function compose(
  out: Float64Array, offset: number,
  ax: number, ay: number, az: number, angle: number,
) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = 1 - c
  const r = [
    c + ax * ax * k, ax * ay * k - az * s, ax * az * k + ay * s,
    ay * ax * k + az * s, c + ay * ay * k, ay * az * k - ax * s,
    az * ax * k - ay * s, az * ay * k + ax * s, c + az * az * k,
  ]
  const m = out.slice(offset, offset + 9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[offset + i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j]
    }
  }
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
  alive: Uint8Array,
) {
  if (blockCount === 0) return
  const cx = new Float64Array(blockCount)
  const cy = new Float64Array(blockCount)
  const cz = new Float64Array(blockCount)
  const count = new Float64Array(blockCount)

  for (let i = 0; i < vertexCount; i++) {
    const b = vertexBlock[i]
    if (b < 0 || !alive[i]) continue
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
    if (b < 0 || !usable[b] || !alive[i]) continue
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
  alive: Uint8Array,
  adjacency: { offsets: Uint32Array; neighbours: Uint32Array },
  vertexCount: number,
  r: number,
) {
  const { offsets, neighbours } = adjacency
  for (let pass = 0; pass < CONFIG.unbornSmoothing; pass++) {
    for (let i = 0; i < vertexCount; i++) {
      if (alive[i]) continue
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

/** RMS departure from the sphere: how far the model has to buckle the crust. */
function relief(pos: Float64Array, vertexCount: number, r: number) {
  let sum = 0
  for (let i = 0; i < vertexCount; i++) {
    const d = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) - r
    sum += d * d
  }
  return Math.sqrt(sum / vertexCount)
}

/**
 * Linear strain per triangle, from how much its area has changed.
 *
 * Measuring edge lengths instead invites a checkerboard: relaxation on a
 * triangle mesh happily settles into a state where alternate edges are long and
 * short, which averages out to nothing real but shows up as a dense speckle and
 * inflates every strain statistic. Area is blind to that mode, and area change
 * is the more meaningful quantity anyway -- it is what tells you whether the
 * model is asking the crust to be squeezed or pulled apart.
 */
function faceStrain(
  pos: Float64Array, indices: Uint32Array, restArea: Float64Array, faceCount: number,
) {
  const out = new Float32Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    const a = indices[f * 3] * 3
    const b = indices[f * 3 + 1] * 3
    const c = indices[f * 3 + 2] * 3
    const radius = Math.hypot(pos[a], pos[a + 1], pos[a + 2]) || 1
    const area = solidAngle(pos, a, b, c) * radius * radius
    out[f] = Math.sqrt(area / restArea[f]) - 1
  }
  return out
}

function strainStats(
  strain: Float32Array, faceAges: Float32Array, restArea: Float64Array, faceCount: number,
  t: number, rigidity: Float32Array,
) {
  let square = 0
  let signed = 0
  let weight = 0
  const magnitudes: { value: number; weight: number }[] = []
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] < t) continue
    const w = restArea[f]
    square += strain[f] * strain[f] * w
    signed += strain[f] * w
    weight += w
    magnitudes.push({ value: Math.abs(strain[f]), weight: w })
  }
  if (weight === 0) {
    return { rmsStrain: 0, meanStrain: 0, medianStrain: 0, p90Strain: 0, cratonStrain: 0, weakStrain: 0 }
  }
  magnitudes.sort((a, b) => a.value - b.value)
  const quantile = (q: number) => {
    let seen = 0
    for (const m of magnitudes) {
      seen += m.weight
      if (seen >= weight * q) return m.value
    }
    return magnitudes[magnitudes.length - 1].value
  }
  return {
    rmsStrain: Math.sqrt(square / weight),
    meanStrain: signed / weight,
    // The RMS is dominated by a thin fringe of badly distorted cells along
    // ridges and faults. The median says what the crust away from them is
    // actually asked to do, which is the number worth judging the model by.
    medianStrain: quantile(0.5),
    p90Strain: quantile(0.9),
    // Split by strength, because where the deformation goes matters as much as
    // how much there is. Thick cratons must stay near zero; thin necks, shelves
    // and island arcs are where it belongs.
    cratonStrain: median(byClass(f => rigidity[f] >= CRATON_RIGIDITY)),
    weakStrain: median(byClass(f => rigidity[f] < WEAK_RIGIDITY)),
  }

  function byClass(test: (f: number) => boolean) {
    const out: number[] = []
    for (let f = 0; f < faceCount; f++) if (faceAges[f] >= t && test(f)) out.push(Math.abs(strain[f]))
    return out
  }
  function median(values: number[]) {
    if (!values.length) return 0
    values.sort((a, b) => a - b)
    return values[values.length >> 1]
  }
}

/** Area-weighted average of the surrounding triangles' strain, per vertex. */
function perVertexStrain(
  strain: Float32Array, indices: Uint32Array, restArea: Float64Array,
  faceCount: number, vertexCount: number,
) {
  const sum = new Float64Array(vertexCount)
  const weight = new Float64Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    const w = restArea[f]
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      sum[v] += strain[f] * w
      weight[v] += w
    }
  }
  // Quantised to a byte over +/-20% strain, well beyond what real crust
  // survives, so the interesting range keeps plenty of resolution.
  const out = new Uint8Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    const value = weight[i] > 0 ? sum[i] / weight[i] : 0
    out[i] = Math.round(Math.min(255, Math.max(0, (value / 0.2) * 127 + 128)))
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

function solidAngle(pos: ArrayLike<number>, a: number, b: number, c: number) {
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
