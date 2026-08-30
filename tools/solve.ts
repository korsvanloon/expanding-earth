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

/**
 * Resolution of the bucket queue that orders the seam fronts by age. One bucket
 * per third of a million years is finer than the age grid can resolve.
 */
const AGE_BUCKETS = 1024

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
   * How many partners one margin point may be paired with in a step.
   *
   * Not unlimited: across a wide ocean every point on one flank can see a great
   * many on the other, and taking them all buries the one crossing that matters
   * under a cloud of near-duplicates. A small budget lets a margin hold on to
   * more than the single best partner without that.
   */
  seamPairsPerPoint: Number(process.env.SEAM_PAIRS ?? 1),
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
  /**
   * The least a fragment holds on to any of its crust, however weak.
   *
   * Rigidity alone runs down to 0.05 for ridge basalt, and crust held that
   * loosely does not merely crumple, it folds back over itself: a seventh of
   * the shell ended up on top of another part of it. A floor keeps the weakest
   * crust deformable without letting it stop being a surface.
   */
  holdFloor: Number(process.env.HOLD_FLOOR ?? 0.3),
  /** How long sea floor takes to cool into something a plate can carry, Myr. */
  coolMa: Number(process.env.COOL_MA ?? 25),
  /** The most a piece of continental crust is believed to have been stretched. */
  maxStretch: Number(process.env.MAX_STRETCH ?? 2.5),
  /** Stop early; for convergence experiments. */
  endMa: Number(process.env.END_MA ?? 0) || undefined,
}

function main() {
  const meta = JSON.parse(
    readFileSync(resolve(OUT, 'meta.partial.json'), 'utf8'),
  ) as Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'>

  const buffer = readFileSync(resolve(OUT, 'mesh.bin'))
  const [vertexCount, faceCount, fragmentCount, cutPairCount] =
    new Uint32Array(buffer.buffer, buffer.byteOffset, 4)
  let offset = buffer.byteOffset + 16
  const dirs = new Float32Array(buffer.buffer, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(buffer.buffer, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(buffer.buffer, offset, faceCount)
  offset += faceCount * 4
  const rigidity = new Float32Array(buffer.buffer, offset, faceCount)
  offset += faceCount * 4
  const thickness = new Float32Array(buffer.buffer, offset, faceCount)
  offset += faceCount * 4
  const origin = new Uint32Array(buffer.buffer, offset, vertexCount)
  offset += vertexCount * 4
  const cutPairs = new Uint32Array(buffer.buffer, offset, cutPairCount * 2)
  offset += cutPairCount * 8
  offset += faceCount * 2 // per-face fragment, used by the viewer
  const vertexFragment = new Uint16Array(buffer.buffer, offset, vertexCount)
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

  const { stretch, riftMa } = unstretching(
    thickness, faceAges, rigidity, faceCount, edges, edgeFaces, edgeCount,
  )
  /** Rest area at the moment being solved, shrunk where the crust was stretched. */
  const restAreaNow = new Float64Array(faceCount)
  const stretchAt = (f: number, t: number) =>
    1 + (stretch[f] - 1) * Math.min(1, riftMa[f] > 0 ? t / riftMa[f] : 1)

  const adjacency = buildVertexAdjacency(indices, vertexCount)
  // A second adjacency over the uncut mesh, so conjugate margins can still be
  // found across a fracture that the cut has separated.
  const originalIndices = Uint32Array.from(indices, (v) => origin[v])
  const originalCount = origin.reduce((m, v) => Math.max(m, v), 0) + 1
  const uncut = buildVertexAdjacency(originalIndices, originalCount)
  // The age each vertex of the uncut mesh carries, which is what orders the
  // seam fronts. The oldest triangle touching it, to match how `alive` is
  // decided: a vertex survives as long as any of its crust does.
  const uncutAge = new Float32Array(originalCount)
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const o = origin[indices[f * 3 + k]]
      if (faceAges[f] > uncutAge[o]) uncutAge[o] = faceAges[f]
    }
  }
  // The mesh arrives already cut along its weak crust, so every vertex belongs
  // to exactly one fragment and a whole fragment can be snapped rigid without
  // tearing anything -- the flaw that sank two earlier attempts at this.
  const plates = { count: fragmentCount, interior: new Int32Array(vertexFragment) }
  const vertexBlock = new Int32Array(vertexFragment)

  // Per-vertex crustal strength, averaged from the triangles around it. A
  // vertex is a point on a continuum, not a triangle, so the mean is the honest
  // reading; taking the weakest would make every shield edge floppy.
  const vertexRigidity = new Float64Array(vertexCount)
  {
    const share = new Float64Array(vertexCount)
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const v = indices[f * 3 + k]
        vertexRigidity[v] += rigidity[f]
        share[v]++
      }
    }
    for (let v = 0; v < vertexCount; v++) if (share[v]) vertexRigidity[v] /= share[v]
  }

  const vertexAge = new Float32Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (faceAges[f] > vertexAge[v]) vertexAge[v] = faceAges[f]
    }
  }
  /**
   * How firmly each vertex is held to its fragment at the moment being solved.
   *
   * Strength of the crust, and how long it has had to cool. Sea floor that
   * erupted at a ridge a million years ago is hot and thin and is not something
   * a craton carries about rigidly; give it a few tens of millions of years and
   * it is plate. Without this a continent-sized fragment was welded to the
   * whole apron of ocean floor around it, so an eight-thousand-kilometre sheet
   * had to stay rigid across a sphere two thirds the size, and a fifth of the
   * planet was left unaccounted for. What has to hold its shape is the crust
   * that is old and strong; the rest is free to be pushed around, which is what
   * it does.
   */
  const hold = new Float64Array(vertexCount)
  let seamReport = { count: 0, meanKm: 0 }
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
    // Closest approach, not centre to centre. Two continents that have just met
    // still have their centres thousands of kilometres apart -- more than half
    // the radius of the globe they are sitting on -- so a centre distance
    // falling towards zero does not mean they have joined, it means one has
    // been driven over the other. That is what the earlier runs were rewarded
    // for, and what South America was doing to Africa.
    const closest = (a: string, b: string) => {
      const one = regionVertices.get(a) ?? []
      const two = regionVertices.get(b) ?? []
      let best = -1
      // Every fourth vertex: the regions are thousands of points across and
      // the answer moves by metres, not kilometres, for the ones left out.
      for (let i = 0; i < one.length; i += 4) {
        const p = one[i] * 3
        const pl = Math.hypot(pos[p], pos[p + 1], pos[p + 2]) || 1
        const px = pos[p] / pl, py = pos[p + 1] / pl, pz = pos[p + 2] / pl
        for (let j = 0; j < two.length; j += 4) {
          const q = two[j] * 3
          const ql = Math.hypot(pos[q], pos[q + 1], pos[q + 2]) || 1
          const dot = px * (pos[q] / ql) + py * (pos[q + 1] / ql) + pz * (pos[q + 2] / ql)
          if (dot > best) best = dot
        }
      }
      return Math.acos(Math.min(1, Math.max(-1, best))) * radiusAt(t)
    }
    for (const target of FIT_TARGETS) {
      const key = `${target.a}|${target.b}`
      separation.set(key, [...(separation.get(key) ?? []), closest(target.a, target.b)])
    }

    frames.push(quantise(pos, vertexCount))
    strains.push(
      perVertexStrain(
        faceStrain(pos, indices, restAreaNow, faceCount), indices, restAreaNow, faceCount,
        vertexCount,
      ),
    )
    diagnostics.push({
      timeMa: t,
      radiusKm: radiusAt(t),
      ...coverage(pos, indices, faceAges, faceCount, t),
      ...strainStats(
        faceStrain(pos, indices, restAreaNow, faceCount), faceAges, restAreaNow, faceCount, t,
        rigidity,
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

    for (let i = 0; i < vertexCount; i++) {
      const cooled = Math.min(1, Math.max(0, (vertexAge[i] - t) / CONFIG.coolMa))
      hold[i] = CONFIG.holdFloor + (1 - CONFIG.holdFloor) * vertexRigidity[i] * cooled
    }

    for (let f = 0; f < faceCount; f++) restAreaNow[f] = restArea[f] / stretchAt(f, t)

    const seams = findSeams(
      indices, origin, originalCount, faceCount, vertexCount, faceAges, t, vertexBlock, uncut,
      uncutAge, meta.maxAgeMa,
    )
    seamReport = { count: seams.length / 2, meanKm: meanSeamGap(pos, seams) }
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
        // Thinned crust is thinned because it was pulled out, so run backwards
        // it has to come back in. A margin at 20 km of crust that was 40 km
        // before it rifted covered half the ground it does now, and the model
        // says so by shrinking what it is asking the crust to measure up to.
        const a0 = edgeFaces[e * 2]
        const b0 = edgeFaces[e * 2 + 1]
        const pull = b0 < 0 ? stretchAt(a0, t) : 0.5 * (stretchAt(a0, t) + stretchAt(b0, t))
        const target = (rest[e] * crustScale(edgeAge[e], t)) / Math.sqrt(pull)
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
      closeFractures(pos, cutPairs, cutPairCount, alive)
      closeSeams(pos, seams, vertexBlock, plates.count, vertexCount, CONFIG.seamGain)
      keepFragmentsRigid(
        pos, reference, plates.interior, alive, plates.count, vertexCount, hold,
      )
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
          `strain craton=${(100 * d.cratonStrain).toFixed(1)}% weak=${(100 * d.weakStrain).toFixed(1)}%  ` +
          `seams=${String(seamReport.count).padStart(5)} at ${seamReport.meanKm.toFixed(0).padStart(4)} km`,
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
  console.log('[solve] fit scorecard, closest approach:')
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
 * Hold the two sides of a fracture together wherever the crust there still
 * exists.
 *
 * Cutting the shell into fragments is what lets them slide and ride over each
 * other, but it also removes every constraint that used to hold neighbours in
 * contact. Without this the pieces simply drift apart and the globe comes out
 * as a scatter of shards. A fracture is closed until the crust across it is
 * gone, at which point one side stops being alive and the join releases on its
 * own -- which is exactly when a rift opens.
 */
function closeFractures(
  pos: Float64Array,
  pairs: Uint32Array,
  pairCount: number,
  alive: Uint8Array,
) {
  for (let p = 0; p < pairCount; p++) {
    const a = pairs[p * 2]
    const b = pairs[p * 2 + 1]
    if (!alive[a] || !alive[b]) continue
    const ax = a * 3
    const bx = b * 3
    const mx = (pos[ax] + pos[bx]) * 0.5
    const my = (pos[ax + 1] + pos[bx + 1]) * 0.5
    const mz = (pos[ax + 2] + pos[bx + 2]) * 0.5
    pos[ax] = mx; pos[ax + 1] = my; pos[ax + 2] = mz
    pos[bx] = mx; pos[bx + 1] = my; pos[bx + 2] = mz
  }
}

/**
 * Find conjugate margins: pairs of points on two different plates that were in
 * contact before the ocean between them existed.
 *
 * This is the reverse of sea-floor spreading, and it is what actually moves
 * continents. Crust of a given age on one flank of a ridge was made at the same
 * instant, in the same place, as crust of that age on the other flank; remove
 * everything younger and the two margins must meet again.
 *
 * The pairing follows the isochrons. Fronts start from every margin that
 * borders vanished crust and eat their way in, but they are ordered by the age
 * of the crust they are eating rather than by how many triangles they have
 * crossed: the whole world's fronts advance through the age-100 crust, then the
 * age-99, and so on down. Two fronts therefore collide on the youngest crust
 * between them, which is the extinct ridge itself, and the margins they set out
 * from are the pair that has to come back together.
 *
 * The version before this raced the fronts by triangle count and had to cap
 * their reach, because over a wide ocean the line where equal-distance fronts
 * meet is the middle of the hole rather than the ridge -- shaped by the coast,
 * not by the spreading. That cap is what stopped the Pacific from ever closing.
 * The mesh never changes, so the number of triangles between two conjugate
 * margins keeps growing as more crust between them vanishes, however close
 * together the reconstruction has actually pulled them; past about thirty
 * million years no front could still reach its partner and the largest ocean on
 * the planet was left to open into a hole. Racing by age needs no cap: the age
 * field says where the ridge is regardless of how much of it has gone.
 *
 * Each front carries the youngest crust it has had to pass through, and takes
 * the route that stays in the oldest crust it can -- the bottleneck path. That
 * is the walk straight down the flank, since going round the end of a ridge
 * means dipping through the young crust at its tip.
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
  /** Age of the oldest crust touching each vertex of the uncut mesh. */
  uncutAge: Float32Array,
  maxAgeMa: number,
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

  // A bucket queue over age. Ages are bounded and we only ever need them in
  // order, so this is a priority queue that costs nothing per operation.
  const buckets: number[][] = Array.from({ length: AGE_BUCKETS }, () => [])
  const bucketOf = (age: number) =>
    Math.min(AGE_BUCKETS - 1, Math.max(0, Math.round((age / maxAgeMa) * (AGE_BUCKETS - 1))))

  /** The youngest crust the front reaching this vertex has had to pass through. */
  const key = new Float32Array(originalCount).fill(-1)
  const source = new Int32Array(originalCount).fill(-1)
  const plate = new Int32Array(originalCount).fill(-1)
  const steps = new Int32Array(originalCount)
  const settled = new Uint8Array(originalCount)

  for (let o = 0; o < originalCount; o++) {
    if (!alive[o] || !touchesGone[o] || copyOf[o] < 0) continue
    key[o] = t
    source[o] = copyOf[o]
    plate[o] = vertexPlate[copyOf[o]]
    buckets[bucketOf(t)].push(o)
  }

  const { offsets, neighbours } = adjacency
  // Every collision, to be sorted afterwards. A margin point may only be paired
  // once -- without that the fronts across a wide ocean meet along a whole
  // front rather than at a line -- and the nearest crossing is the one it
  // should get, so the choice cannot be made in the order collisions happen.
  const hitA: number[] = []
  const hitB: number[] = []
  const hitSteps: number[] = []
  const hitAge: number[] = []

  for (let b = AGE_BUCKETS - 1; b >= 0; b--) {
    const bucket = buckets[b]
    for (let h = 0; h < bucket.length; h++) {
      const v = bucket[h]
      if (settled[v]) continue
      settled[v] = 1
      for (let k = offsets[v]; k < offsets[v + 1]; k++) {
        const n = neighbours[k]
        // Only crust that no longer exists conducts a front.
        if (alive[n]) continue
        if (source[n] >= 0 && source[n] !== source[v] && plate[n] !== plate[v] && plate[n] >= 0) {
          hitA.push(source[v])
          hitB.push(source[n])
          hitSteps.push(steps[v] + steps[n])
          hitAge.push(Math.min(key[v], key[n]))
        }
        const candidate = Math.min(key[v], uncutAge[n])
        if (candidate > key[n]) {
          key[n] = candidate
          source[n] = source[v]
          plate[n] = plate[v]
          steps[n] = steps[v] + 1
          buckets[Math.min(b, bucketOf(candidate))].push(n)
        }
      }
    }
    bucket.length = 0
  }

  // Deepest crossing first. How far the two fronts had to descend before they
  // met is what tells a ridge from a crack: a real conjugate pair is separated
  // by everything that ever erupted between them, so its fronts run all the way
  // down to the ridge axis, while two fragments that happen to sit either side
  // of a sliver of vanished crust meet almost at once, barely below the age
  // they set out from. Taking the nearest crossing first instead spends the
  // margin points of a wide ocean on those cracks -- each point may be paired
  // only once -- and the Atlantic stops closing.
  const order = hitAge
    .map((_, i) => i)
    .sort((x, y) => hitAge[x] - hitAge[y] || hitSteps[x] - hitSteps[y])
  const budget = CONFIG.seamPairsPerPoint
  const used = new Uint8Array(vertexCount)
  const pairs: number[] = []
  for (const i of order) {
    const a = hitA[i]
    const b = hitB[i]
    if (used[a] >= budget || used[b] >= budget) continue
    used[a]++
    used[b]++
    pairs.push(a, b)
  }
  return new Uint32Array(pairs)
}

/**
 * How much each piece of continental crust was stretched to reach its present
 * thickness, and when that happened.
 *
 * Continental crust is about forty kilometres thick where nothing has happened
 * to it. The places ECM1 reads as thin -- the passive margins, the extended
 * crust behind them -- are thin because they were pulled out during rifting,
 * and crust conserves its volume: a margin now twenty kilometres thick covered
 * half the ground before it was stretched. Run backwards, it has to gather
 * itself back up.
 *
 * Which is also why those places show as weak on the strength map. They are not
 * weak by accident and then stretched; they are thin because they were
 * stretched, and thin is what weak means here. The reconstruction was treating
 * them as rigid pieces of their present size, so the crust it had to fit onto
 * the smaller Earth was several percent larger than the crust that actually
 * existed.
 *
 * When it happened is set by the ocean next door: a margin was pulled apart as
 * the sea floor beside it began to open, so the age of the nearest sea floor is
 * when to have finished putting it back.
 */
function unstretching(
  thickness: Float32Array,
  faceAges: Float32Array,
  rigidity: Float32Array,
  faceCount: number,
  edges: Uint32Array,
  edgeFaces: Int32Array,
  edgeCount: number,
) {
  // Unextended continental crust, read off the model rather than assumed: the
  // median thickness of the shields and platforms, which are the crust nothing
  // has pulled on.
  const intact: number[] = []
  for (let f = 0; f < faceCount; f++) if (rigidity[f] >= 0.9) intact.push(thickness[f])
  intact.sort((a, b) => a - b)
  const reference = intact.length ? intact[Math.floor(intact.length / 2)] : 40

  const stretch = new Float32Array(faceCount).fill(1)
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] < PERMANENT_MA || thickness[f] <= 0) continue
    // Capped: past about two and a half the crust is no longer a stretched
    // continent but the start of an ocean, and ECM1's thinnest cells are as
    // likely to be the grid being a degree across as they are to be real.
    stretch[f] = Math.min(CONFIG.maxStretch, Math.max(1, reference / thickness[f]))
  }

  // When the sea floor beside it opened, spread inland over the face graph.
  const riftMa = new Float32Array(faceCount).fill(-1)
  const queue: number[] = []
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] >= PERMANENT_MA) continue
    riftMa[f] = faceAges[f]
    queue.push(f)
  }
  // Oldest sea floor first, so an inland margin takes the age of the ocean it
  // actually rifted from rather than of whatever water is nearest.
  queue.sort((a, b) => faceAges[b] - faceAges[a])

  // The face graph, taken from the edge list, which already knows which two
  // triangles each edge separates.
  const neighbourOf: number[][] = Array.from({ length: faceCount }, () => [])
  for (let e = 0; e < edgeCount; e++) {
    const a = edgeFaces[e * 2]
    const b = edgeFaces[e * 2 + 1]
    if (a >= 0 && b >= 0) {
      neighbourOf[a].push(b)
      neighbourOf[b].push(a)
    }
  }
  void edges
  for (let head = 0; head < queue.length; head++) {
    const f = queue[head]
    for (const n of neighbourOf[f]) {
      if (riftMa[n] >= 0) continue
      riftMa[n] = riftMa[f]
      queue.push(n)
    }
  }
  for (let f = 0; f < faceCount; f++) if (riftMa[f] < 0) riftMa[f] = 0

  let thinned = 0
  for (let f = 0; f < faceCount; f++) if (stretch[f] > 1.05) thinned++
  console.log(
    `[solve] unextended continental crust ${reference.toFixed(0)} km; ` +
      `${((100 * thinned) / faceCount).toFixed(1)}% of the shell reads as stretched`,
  )
  return { stretch, riftMa }
}

/** How far apart the paired margins still are, averaged, as a progress report. */
function meanSeamGap(pos: Float64Array, seams: Uint32Array) {
  if (!seams.length) return 0
  let total = 0
  for (let i = 0; i < seams.length; i += 2) {
    const a = seams[i] * 3
    const b = seams[i + 1] * 3
    total += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
  }
  return total / (seams.length / 2)
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
  /** How rigidly each vertex holds its place in the fragment, 0 to 1. */
  strength: Float64Array,
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
      // The craton decides where the fragment points. A stretched margin that
      // has been dragged out of place should not be allowed to swing the whole
      // block round after it.
      const w = strength[i]
      const r = c * 9
      const rx = reference[i * 3], ry = reference[i * 3 + 1], rz = reference[i * 3 + 2]
      const qx = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
      const qy = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
      const qz = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
      const dx = pos[i * 3] - qx, dy = pos[i * 3 + 1] - qy, dz = pos[i * 3 + 2] - qz
      const q2 = qx * qx + qy * qy + qz * qz
      const o = c * 6
      m[o] += w * (q2 - qx * qx); m[o + 1] += w * (q2 - qy * qy); m[o + 2] += w * (q2 - qz * qz)
      m[o + 3] -= w * qx * qy; m[o + 4] -= w * qx * qz; m[o + 5] -= w * qy * qz
      v[c * 3] += w * (qy * dz - qz * dy)
      v[c * 3 + 1] += w * (qz * dx - qx * dz)
      v[c * 3 + 2] += w * (qx * dy - qy * dx)
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
    // Pulled back towards where the block says it should be, by as much as the
    // crust there is stiff enough to insist on. A shield goes all the way; a
    // stretched margin or an island arc hardly moves and keeps whatever the
    // relaxation did to it.
    //
    // This is what lets a fragment be the size of Africa. A rigid cap of the
    // present-day sphere cannot be laid on a sphere two thirds the size --
    // Gauss says so, and the misfit grows as the square of the piece -- so
    // holding a five-thousand-kilometre block perfectly rigid tore a fifth of
    // the planet open. Letting the mismatch go into the weak crust is not a
    // fudge but the claim the model is making: as the Earth grows, a big slab
    // has to flex, and it flexes where it is thin.
    const w = strength[i]
    const r = c * 9
    const rx = reference[i * 3], ry = reference[i * 3 + 1], rz = reference[i * 3 + 2]
    const qx = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
    const qy = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
    const qz = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
    pos[i * 3] += w * (qx - pos[i * 3])
    pos[i * 3 + 1] += w * (qy - pos[i * 3 + 1])
    pos[i * 3 + 2] += w * (qz - pos[i * 3 + 2])
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
    const exists = faceAges[f] >= t
    if (!exists) {
      unborn += area
      continue
    }
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    // Only crust that exists can be folded over crust that exists. A triangle
    // of vanished sea floor turning inside out as it crumples into the gap is
    // not the model laying rock on top of rock -- it is the gap closing, and
    // counting it as overlap said the reconstruction was failing at exactly the
    // moments it was succeeding.
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
