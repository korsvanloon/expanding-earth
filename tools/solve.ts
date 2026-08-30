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
import { DynamicMesh, collapseVanished, retriangulate } from './lib/dynamic-mesh.js'
import { unstretching } from './lib/unstretching.js'

import { buildIcosphere } from './lib/icosphere.js'

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
  /**
   * How much of a plate's move in a step comes from shutting its oceans rather
   * than from following the spreading field.
   *
   * The field says which way the crust travels; the conjugate margins say what
   * it has to end up against. Both are needed -- the field alone drives motion
   * but never closes anything, and margins alone close beautifully while turning
   * the continent one way and then back.
   */
  seamShare: Number(process.env.SEAM_SHARE ?? 0.7),
  /**
   * How wide a band of isochrons the spreading field is read from, Myr.
   *
   * The field describes how fast the crust at a given isochron was moving when
   * it formed, so what matters at time t is the crust around age t -- the
   * margin that is disappearing. Reading it across a band rather than a line
   * gives the fit enough points to pin a rotation down.
   */
  flowWindowMa: Number(process.env.FLOW_WINDOW ?? 14),
  /** Set to 0 to turn the spreading field off, for comparison. */
  flowGain: Number(process.env.FLOW_GAIN ?? 1),
  /**
   * How much of the previous step's rotation a plate keeps.
   *
   * Plates hold an Euler pole for tens of millions of years; nothing in the
   * mantle turns one round and back again in a single step. Carrying the pole
   * forward is both what the rock does and what makes the motion readable,
   * and it is what moves a fragment through the moments when its own ocean
   * floor has nothing left to say.
   */
  poleMemory: Number(process.env.POLE_MEMORY ?? 0.5),
  /**
   * Crust at least this strong does not fault. Sea floor is 0.60 and thinned
   * margins 0.18, so those redraw; platform is 0.90 and shield 1.00, so a
   * craton has to carry the deformation rather than forget it.
   */
  breaksBelow: Number(process.env.BREAKS_BELOW ?? 0.65),
  /**
   * How closely two points have to agree, in kilometres per million years,
   * before the same rotation is taken to explain both. The Earth's plates are
   * rigid to about this.
   */
  plateTolerance: Number(process.env.PLATE_TOL ?? 4),
  /** Fewer points than this and it is not a plate, it is a boundary. */
  smallestPlate: Number(process.env.SMALLEST_PLATE ?? 60),
  /** How hard an island is pulled back to its own shape, per sweep. */
  islandHold: Number(process.env.ISLAND_HOLD ?? 0.35),
  /** How many rounds of redrawing slivers per step. */
  flipPasses: Number(process.env.FLIP_PASSES ?? 4),
  /** Smoothing passes over the age field before differentiating it. */
  flowSmoothing: Number(process.env.FLOW_SMOOTH ?? 6),
  /** The fastest half-spreading rate believed, km/Myr. */
  maxRate: Number(process.env.MAX_RATE ?? 200),
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
  const [vertexCount, faceCount, , cutPairCount] =
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
  offset += vertexCount * 4 // origin, which an uncut mesh does not need
  offset += faceCount * 2 // per-face fragment
  const vertexIsland = new Uint16Array(buffer.buffer, offset, vertexCount)
  console.log(`[solve] ${vertexCount} vertices, ${faceCount} faces`)
  if (cutPairCount) throw new Error('this solver closes the mesh up; it wants an uncut one')

  const radius = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  const radiusAt = (t: number) => sampleCurve(radius, t, meta.radiusStepMa)
  const r0 = meta.r0Km

  const mesh = new DynamicMesh(vertexCount, faceCount, indices)
  const adjacency = buildVertexAdjacency(indices, vertexCount)

  /**
   * The size and shape each triangle has today, kept per triangle rather than
   * per edge on purpose. A collapse renames the corners of the triangles around
   * it -- the crust between two points is the crust it always was, it has just
   * lost the point that used to sit in the middle -- so a rest length stored
   * against the triangle survives the renaming without any bookkeeping.
   */
  const restEdge = new Float64Array(faceCount * 3)
  const restArea = new Float64Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[f * 3 + k] * 3
      const b = indices[f * 3 + ((k + 1) % 3)] * 3
      restEdge[f * 3 + k] =
        r0 * Math.hypot(dirs[a] - dirs[b], dirs[a + 1] - dirs[b + 1], dirs[a + 2] - dirs[b + 2])
    }
    restArea[f] =
      solidAngle(dirs, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3) * r0 * r0
  }

  const pos = new Float64Array(vertexCount * 3)
  for (let i = 0; i < vertexCount * 3; i++) pos[i] = dirs[i] * r0
  const previous = new Float64Array(pos)
  /** Where each island's crust would sit if it had kept its shape exactly. */
  const rest = new Float64Array(pos)

  // Read from the mesh rather than worked out again, so the picture and the
  // physics cannot drift apart.
  const islands = {
    vertexIsland: Int32Array.from(vertexIsland, (id) => id - 1),
    count: vertexIsland.reduce((m, id) => Math.max(m, id), 0),
  }
  console.log(`[solve] ${islands.count} islands of strong crust hold their shape`)

  /**
   * How hard it is to change a triangle's size, as against its shape.
   *
   * These are two different questions and the model had been answering both
   * with the same number. A mountain belt bends easily -- that is what a
   * mountain belt is, crust that folded -- but it does not stretch: it is the
   * thickest crust on the planet, forty-five kilometres and more, piled up by
   * being shortened. Giving it the strength of an orogen, 0.20, let it be
   * pulled out like toffee, which is the opposite of what it did.
   *
   * Thickness is the honest measure of how much rock there is in the way, so
   * resistance to stretching is read from ECM1's thickness where that says more
   * than the crustal type does. Sea floor is seven kilometres thick and takes
   * the type's answer; a forty-kilometre orogen takes its own.
   */
  const stretchResist = new Float64Array(faceCount)
  {
    const intact: number[] = []
    for (let f = 0; f < faceCount; f++) if (rigidity[f] >= 0.9) intact.push(thickness[f])
    intact.sort((a, b) => a - b)
    const reference = intact.length ? intact[Math.floor(intact.length / 2)] : 40
    let stiffened = 0
    for (let f = 0; f < faceCount; f++) {
      const byThickness = Math.min(1, thickness[f] / reference)
      stretchResist[f] = Math.max(rigidity[f], byThickness)
      if (stretchResist[f] > rigidity[f] + 0.05) stiffened++
    }
    console.log(
      `[solve] ${((100 * stiffened) / faceCount).toFixed(0)}% of the shell resists stretching ` +
        `more than its crustal type alone would say, on the strength of how thick it is`,
    )
  }

  const vertexAge = new Float32Array(vertexCount)
  const vertexRigidity = new Float64Array(vertexCount)
  {
    const share = new Float64Array(vertexCount)
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const v = indices[f * 3 + k]
        if (faceAges[f] > vertexAge[v]) vertexAge[v] = faceAges[f]
        vertexRigidity[v] += rigidity[f]
        share[v]++
      }
    }
    for (let v = 0; v < vertexCount; v++) if (share[v]) vertexRigidity[v] /= share[v]
  }

  const identity = Uint32Array.from({ length: vertexCount }, (_, v) => v)
  const flow = spreadingField(dirs, identity, vertexCount, vertexAge, adjacency, vertexCount, r0)
  /**
   * What each point was doing last step.
   *
   * Nothing here is a plate, so there is no Euler pole to carry forward; the
   * memory lives on the points themselves. It does the same job -- crust that
   * was moving one way keeps moving that way unless the data says otherwise --
   * and it is what carries a continent through the long stretches where the
   * ocean beside it has closed and there is nothing left to read.
   */
  const drift = new Float64Array(vertexCount * 3)

  const { stretch, riftMa } = unstretching(
    thickness, faceAges, rigidity, faceCount, indices,
  )
  const stretchAt = (f: number, t: number) =>
    1 + (stretch[f] - 1) * (riftMa[f] > 0 ? Math.min(1, t / riftMa[f]) : 0)
  const restAreaNow = new Float64Array(faceCount)

  // A fixed set of directions to ask "is there any crust here?" of.
  const probes = Float64Array.from(buildIcosphere(5).positions)
  const probeCells = new Uint32Array(probes.length / 3)
  for (let p = 0; p < probeCells.length; p++) {
    const lat = Math.asin(Math.min(1, Math.max(-1, probes[p * 3 + 1])))
    const lon = Math.atan2(probes[p * 3 + 2], probes[p * 3])
    const row = Math.min(89, Math.floor(((lat + Math.PI / 2) / Math.PI) * 90))
    const col = Math.min(179, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * 180))
    probeCells[p] = row * 180 + col
  }
  const cellFaces: number[][] = Array.from({ length: 90 * 180 }, () => [])

  const frames: Int16Array[] = []
  const strains: Uint8Array[] = []
  const plates: Uint8Array[] = []
  /** Where everything was at the previous recorded frame, to read plates from. */
  const atLastFrame = new Float64Array(pos)
  let plateReport = { count: 0, biggest: [] as number[] }
  const diagnostics: FrameDiagnostics[] = []

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

  const track = new Map<string, { first: number[]; last: number[]; walked: number }>()
  const regionCentre = (id: string) => {
    let x = 0, y = 0, z = 0
    for (const v of regionVertices.get(id) ?? []) {
      const s = mesh.survivor(v) * 3
      const length = Math.hypot(pos[s], pos[s + 1], pos[s + 2]) || 1
      x += pos[s] / length; y += pos[s + 1] / length; z += pos[s + 2] / length
    }
    const length = Math.hypot(x, y, z) || 1
    return [x / length, y / length, z / length]
  }
  const followRegions = (radiusKm: number) => {
    for (const region of REGIONS) {
      const centre = regionCentre(region.id)
      const seen = track.get(region.id)
      if (!seen) {
        track.set(region.id, { first: centre, last: centre, walked: 0 })
        continue
      }
      const dot = Math.min(1, Math.max(-1,
        seen.last[0] * centre[0] + seen.last[1] * centre[1] + seen.last[2] * centre[2]))
      seen.walked += Math.acos(dot) * radiusKm
      seen.last = centre
    }
  }

  /** Give every collapsed point the place of the point that swallowed it. */
  const settleCollapsed = () => {
    for (let v = 0; v < vertexCount; v++) {
      if (mesh.vertexAlive[v]) continue
      const s = mesh.survivor(v) * 3
      pos[v * 3] = pos[s]
      pos[v * 3 + 1] = pos[s + 1]
      pos[v * 3 + 2] = pos[s + 2]
    }
  }

  const record = (t: number) => {
    const closest = (a: string, b: string) => {
      const one = regionVertices.get(a) ?? []
      const two = regionVertices.get(b) ?? []
      let best = -1
      for (let i = 0; i < one.length; i += 4) {
        const p = mesh.survivor(one[i]) * 3
        const pl = Math.hypot(pos[p], pos[p + 1], pos[p + 2]) || 1
        const px = pos[p] / pl, py = pos[p + 1] / pl, pz = pos[p + 2] / pl
        for (let j = 0; j < two.length; j += 4) {
          const q = mesh.survivor(two[j]) * 3
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

    const found = findPlates(
      pos, atLastFrame, mesh, Math.max(meta.frameStepMa, 1), vertexCount,
      plates[plates.length - 1],
    )
    plates.push(found.ids)
    plateReport = { count: found.count, biggest: found.biggest }
    atLastFrame.set(pos)

    for (let f = 0; f < faceCount; f++) restAreaNow[f] = restArea[f] / stretchAt(f, t)
    const strain = faceStrain(pos, mesh.faceVerts, restAreaNow, faceCount, mesh.faceAlive)
    frames.push(quantise(pos, vertexCount))
    strains.push(
      perVertexStrain(strain, mesh.faceVerts, restAreaNow, faceCount, vertexCount, mesh.faceAlive),
    )
    diagnostics.push({
      timeMa: t,
      radiusKm: radiusAt(t),
      ...tiling(pos, mesh, faceCount, probes, probeCells, cellFaces),
      ...strainStats(strain, faceAges, restAreaNow, faceCount, t, rigidity, mesh.faceAlive),
      reliefKm: relief(pos, vertexCount, radiusAt(t)),
      blockCount: plateReport.count,
    })
  }

  record(0)
  followRegions(radiusAt(0))
  const started = Date.now()

  const endTimeMa = CONFIG.endMa ?? meta.endTimeMa
  let refusedTotal = 0
  let flippedTotal = 0
  for (let t = CONFIG.stepMa; t <= endTimeMa; t += CONFIG.stepMa) {
    const rPrev = radiusAt(t - CONFIG.stepMa)
    const rNext = radiusAt(t)
    previous.set(pos)

    const shrink = rNext / rPrev
    for (let i = 0; i < vertexCount * 3; i++) pos[i] *= shrink

    // Un-make the crust that had not been made yet.
    const closed = collapseVanished(mesh, faceAges, pos, t)
    refusedTotal += closed.refused
    settleCollapsed()

    dilateIslands(
      pos, islands.vertexIsland, islands.count, vertexCount, mesh.vertexAlive, rPrev, rNext,
    )
    driveByField(pos, mesh, flow, drift, vertexAge, t, CONFIG.stepMa)
    // The shape an island is held to is the one it has right now, before the
    // relaxation starts pushing it about. Everything the sweeps do to it after
    // this is undone except the part a rotation could have produced.
    rest.set(pos)

    for (let f = 0; f < faceCount; f++) restAreaNow[f] = restArea[f] / stretchAt(f, t)

    for (let sweep = 0; sweep < CONFIG.sweeps; sweep++) {
      const forward = sweep % 2 === 0
      for (let n = 0; n < faceCount; n++) {
        const f = forward ? n : faceCount - 1 - n
        if (!mesh.faceAlive[f]) continue
        const stiffness = stretchResist[f]
        if (stiffness === 0) continue
        const pull = Math.sqrt(stretchAt(f, t))
        for (let k = 0; k < 3; k++) {
          const i = mesh.faceVerts[f * 3 + k] * 3
          const j = mesh.faceVerts[f * 3 + ((k + 1) % 3)] * 3
          const target = restEdge[f * 3 + k] / pull
          const dx = pos[i] - pos[j]
          const dy = pos[i + 1] - pos[j + 1]
          const dz = pos[i + 2] - pos[j + 2]
          const length = Math.hypot(dx, dy, dz)
          if (length < 1e-9) continue
          const c = (0.5 * stiffness * (length - target)) / length
          const cx = dx * c, cy = dy * c, cz = dz * c
          pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz
          pos[j] += cx; pos[j + 1] += cy; pos[j + 2] += cz
        }
      }
      relaxToSphere(pos, vertexCount, rNext, CONFIG.radialStiffness)
      holdIslands(pos, rest, islands.vertexIsland, islands.count, vertexCount, mesh.vertexAlive)
    }
    relaxToSphere(pos, vertexCount, rNext, 1)
    // Redraw whatever the move has left as slivers, then settle again: a
    // triangulation that has stopped describing the crust well is one nudge
    // from turning inside out.
    flippedTotal += retriangulate(
      mesh, pos, restEdge, CONFIG.flipPasses, rigidity, CONFIG.breaksBelow,
    )
    settleCollapsed()
    removeNetRotation(pos, previous, vertexCount, shrink)
    settleCollapsed()
    followRegions(rNext)

    if (t % meta.frameStepMa === 0) {
      record(t)
      const d = diagnostics[diagnostics.length - 1]
      console.log(
        `  ${String(t).padStart(3)} Ma  R=${d.radiusKm.toFixed(0)} km  ` +
          `points=${String(mesh.liveVertices).padStart(5)}  ` +
          `bare=${(100 * d.gapFraction).toFixed(2)}%  ` +
          `doubled=${(100 * d.overlapFraction).toFixed(2)}%  ` +
          `strain craton=${(100 * d.cratonStrain).toFixed(1)}% weak=${(100 * d.weakStrain).toFixed(1)}%  ` +
          `plates=${String(plateReport.count).padStart(3)}` +
          ` (biggest ${plateReport.biggest.slice(0, 3).map((x) => `${(100 * x).toFixed(0)}%`).join(' ')})`,
      )
    }
  }
  console.log(
    `[solve] ${((Date.now() - started) / 1000).toFixed(1)}s; ` +
      `${vertexCount - mesh.liveVertices} of ${vertexCount} points closed away, ` +
      `${refusedTotal} collapses refused to keep the surface whole, ` +
      `${flippedTotal} edges redrawn`,
  )
  if (mesh.eulerCharacteristic() !== 2) {
    throw new Error('the mesh stopped being a sphere; every area measured here would be a lie')
  }

  const fixedRadiusDiagnostics: FrameDiagnostics[] = diagnostics.map((d) => ({
    ...d,
    radiusKm: r0,
    gapFraction: 1 - (d.radiusKm / r0) ** 2,
    overlapFraction: 0,
    rmsStrain: 0,
  }))

  const frameBuffer = Buffer.concat(frames.map((f) => Buffer.from(f.buffer)))
  const strainBuffer = Buffer.concat(strains.map((s) => Buffer.from(s.buffer)))
  // The first frame has no interval behind it to read a velocity from, so it
  // borrows the plates of the second rather than claiming there were none.
  if (plates.length > 1) {
    plates[0] = plates[1]
    diagnostics[0].blockCount = diagnostics[1].blockCount
  }
  const plateBuffer = Buffer.concat(plates.map((p) => Buffer.from(p.buffer)))
  writeFileSync(resolve(OUT, 'frames.bin'), frameBuffer)
  writeFileSync(resolve(OUT, 'strain.bin'), strainBuffer)
  writeFileSync(resolve(OUT, 'plates.bin'), plateBuffer)
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
  console.log('[solve] how straight each continent walked (1.0 is a single smooth move):')
  for (const region of REGIONS) {
    const seen = track.get(region.id)
    if (!seen) continue
    const dot = Math.min(1, Math.max(-1,
      seen.first[0] * seen.last[0] + seen.first[1] * seen.last[1] + seen.first[2] * seen.last[2]))
    const net = Math.acos(dot) * radiusAt(endTimeMa)
    console.log(
      `  ${region.label.padEnd(18)} walked ${seen.walked.toFixed(0).padStart(6)} km ` +
        `to get ${net.toFixed(0).padStart(5)} km   ` +
        `${net > 1 ? `x${(seen.walked / net).toFixed(1)}` : '(went nowhere)'}`,
    )
  }
  console.log(
    `[solve] wrote ${frames.length} frames ` +
      `(${(frameBuffer.byteLength / 1e6).toFixed(1)} MB + ${(strainBuffer.byteLength / 1e6).toFixed(1)} MB)`,
  )
}


/**
 * Move each island onto the smaller sphere without shrinking the rock.
 *
 * The step begins by scaling everything by the ratio of the two radii, which
 * moves the whole shell onto the new sphere but also makes every piece of it
 * that much smaller -- and rock does not do that. For sea floor it hardly
 * matters, since the springs pull it back within a sweep or two; for an island
 * held to its own shape it matters entirely, because the shape it is held to is
 * the squashed one and the squashing is then frozen in for good. Craton strain
 * doubled the first time the islands went in, for this reason alone.
 *
 * So each island is opened back out about its own centre: every point keeps its
 * distance along the surface from the middle of the island, measured in
 * kilometres rather than in degrees. On a smaller sphere the same kilometres
 * subtend a wider angle, which is exactly the picture -- a rigid cap laid on a
 * tighter ball has to reach further round it.
 */
function dilateIslands(
  pos: Float64Array,
  island: Int32Array,
  count: number,
  vertexCount: number,
  alive: Uint8Array,
  rPrev: number,
  rNext: number,
) {
  if (count === 0 || rNext <= 0) return
  const centre = new Float64Array(count * 3)
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0 || !alive[i]) continue
    const length = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1
    centre[c * 3] += pos[i * 3] / length
    centre[c * 3 + 1] += pos[i * 3 + 1] / length
    centre[c * 3 + 2] += pos[i * 3 + 2] / length
  }
  for (let c = 0; c < count; c++) {
    const length = Math.hypot(centre[c * 3], centre[c * 3 + 1], centre[c * 3 + 2]) || 1
    centre[c * 3] /= length; centre[c * 3 + 1] /= length; centre[c * 3 + 2] /= length
  }
  const grow = rPrev / rNext
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0 || !alive[i]) continue
    const length = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1
    const ux = pos[i * 3] / length, uy = pos[i * 3 + 1] / length, uz = pos[i * 3 + 2] / length
    const cx = centre[c * 3], cy = centre[c * 3 + 1], cz = centre[c * 3 + 2]
    const dot = Math.min(1, Math.max(-1, ux * cx + uy * cy + uz * cz))
    const angle = Math.acos(dot)
    if (angle < 1e-9) continue
    const wanted = Math.min(Math.PI * 0.9, angle * grow)
    // Slide out along the same bearing from the island's centre.
    const tx = ux - cx * dot, ty = uy - cy * dot, tz = uz - cz * dot
    const tl = Math.hypot(tx, ty, tz) || 1
    const sin = Math.sin(wanted)
    const cos = Math.cos(wanted)
    pos[i * 3] = (cx * cos + (tx / tl) * sin) * rNext
    pos[i * 3 + 1] = (cy * cos + (ty / tl) * sin) * rNext
    pos[i * 3 + 2] = (cz * cos + (tz / tl) * sin) * rNext
  }
}

/**
 * Pull each island back towards the shape it is supposed to have kept.
 *
 * The best rigid placement of its rest shape, fitted over the points that still
 * exist, then a pull towards that placement. Not all the way: a cap of the
 * present-day sphere cannot be laid on a smaller one without deforming, and how
 * much is set by Gauss rather than by anything we can choose, so an island that
 * insists absolutely would simply tear its surroundings instead.
 */
function holdIslands(
  pos: Float64Array,
  rest: Float64Array,
  island: Int32Array,
  count: number,
  vertexCount: number,
  alive: Uint8Array,
) {
  if (count === 0) return
  const rotation = new Float64Array(count * 9)
  for (let c = 0; c < count; c++) {
    rotation[c * 9] = 1; rotation[c * 9 + 4] = 1; rotation[c * 9 + 8] = 1
  }
  for (let pass = 0; pass < 3; pass++) {
    const m = new Float64Array(count * 6)
    const v = new Float64Array(count * 3)
    for (let i = 0; i < vertexCount; i++) {
      const c = island[i]
      if (c < 0 || !alive[i]) continue
      const r = c * 9
      const rx = rest[i * 3], ry = rest[i * 3 + 1], rz = rest[i * 3 + 2]
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

  const hold = CONFIG.islandHold
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0 || !alive[i]) continue
    const r = c * 9
    const rx = rest[i * 3], ry = rest[i * 3 + 1], rz = rest[i * 3 + 2]
    const qx = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
    const qy = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
    const qz = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
    pos[i * 3] += hold * (qx - pos[i * 3])
    pos[i * 3 + 1] += hold * (qy - pos[i * 3 + 1])
    pos[i * 3 + 2] += hold * (qz - pos[i * 3 + 2])
  }
}

/**
 * Read the plates back out of the motion.
 *
 * This is the last thing in the model that used to be assumed and is now
 * measured. A plate is not a region of a particular kind of crust, nor a piece
 * of a mosaic drawn before the run started: it is a patch of the Earth whose
 * points are all moving as one rigid body, and whether a patch is one of those
 * is a question about the answer, not about the question.
 *
 * So: give every point its velocity over the last interval, pick an unclaimed
 * one, fit the rotation that best explains it and its neighbours, and let the
 * region grow outwards over every point the same rotation explains to within a
 * few kilometres per million years -- which is about as rigidly as the Earth's
 * plates actually behave. Where it stops is a plate boundary, found rather than
 * drawn.
 *
 * They are found again at every frame, and they are free to differ. That is the
 * point of doing it this way round: North America comes back as one plate for a
 * long stretch and then as two when the Gulf of Mexico shuts against South
 * America, and no fixed set of plates can say that.
 */
function findPlates(
  pos: Float64Array,
  before: Float64Array,
  mesh: DynamicMesh,
  dtMa: number,
  vertexCount: number,
  previousIds: Uint8Array | undefined,
) {
  // Only the motion across the surface counts. Everything also moves outwards
  // as the Earth grows -- eighty-odd kilometres between frames, more than the
  // plates themselves travel -- and a rotation cannot explain a radial move at
  // all, so leaving it in makes every point look like its own plate.
  const velocity = new Float64Array(vertexCount * 3)
  const here = new Float64Array(vertexCount * 3)
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v]) continue
    const now = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
    const then = Math.hypot(before[v * 3], before[v * 3 + 1], before[v * 3 + 2]) || 1
    for (let c = 0; c < 3; c++) {
      const u = pos[v * 3 + c] / now
      here[v * 3 + c] = u * now
      velocity[v * 3 + c] = ((u - before[v * 3 + c] / then) * now) / dtMa
    }
  }
  void here

  const claimed = new Int32Array(vertexCount).fill(-1)
  const ring = new Set<number>()
  const region: number[] = []
  const queue: number[] = []
  const sizes: number[] = []
  const tolerance = CONFIG.plateTolerance

  const fit = (members: number[]) => {
    const m = new Float64Array(6)
    const rhs = new Float64Array(3)
    for (const v of members) {
      const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2]
      const vx = velocity[v * 3], vy = velocity[v * 3 + 1], vz = velocity[v * 3 + 2]
      const p2 = px * px + py * py + pz * pz
      m[0] += p2 - px * px; m[1] += p2 - py * py; m[2] += p2 - pz * pz
      m[3] -= px * py; m[4] -= px * pz; m[5] -= py * pz
      rhs[0] += py * vz - pz * vy
      rhs[1] += pz * vx - px * vz
      rhs[2] += px * vy - py * vx
    }
    return solve3(
      [m[0], m[3], m[4], m[3], m[1], m[5], m[4], m[5], m[2]],
      [rhs[0], rhs[1], rhs[2]],
    )
  }
  const residual = (omega: [number, number, number], v: number) => {
    const px = pos[v * 3], py = pos[v * 3 + 1], pz = pos[v * 3 + 2]
    const rx = omega[1] * pz - omega[2] * py
    const ry = omega[2] * px - omega[0] * pz
    const rz = omega[0] * py - omega[1] * px
    return Math.hypot(
      velocity[v * 3] - rx, velocity[v * 3 + 1] - ry, velocity[v * 3 + 2] - rz,
    )
  }

  /**
   * Start from the calmest ground and work outwards.
   *
   * A region grown from a seed takes its rotation from wherever it began, so
   * beginning on a plate boundary -- where two rotations meet and neither
   * explains the neighbourhood -- splits a plate into the pieces the seeding
   * happened to visit first. Points whose neighbours are all doing the same
   * thing are plate interiors, and starting there finds a plate whole, and
   * finds the same one again at the next frame.
   */
  const calm = new Float64Array(vertexCount).fill(Infinity)
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v]) continue
    mesh.ring(v, ring)
    let spread = 0
    let n = 0
    for (const u of ring) {
      if (!mesh.vertexAlive[u]) continue
      spread += Math.hypot(
        velocity[u * 3] - velocity[v * 3],
        velocity[u * 3 + 1] - velocity[v * 3 + 1],
        velocity[u * 3 + 2] - velocity[v * 3 + 2],
      )
      n++
    }
    calm[v] = n ? spread / n : Infinity
  }
  const order = Array.from({ length: vertexCount }, (_, v) => v)
    .filter((v) => mesh.vertexAlive[v])
    .sort((a, b) => calm[a] - calm[b])

  let count = 0
  for (const seed of order) {
    if (claimed[seed] >= 0) continue
    region.length = 0
    queue.length = 0
    region.push(seed)
    claimed[seed] = count
    // A single point cannot pin a rotation down; start from its neighbourhood.
    mesh.ring(seed, ring)
    for (const n of ring) {
      if (!mesh.vertexAlive[n] || claimed[n] >= 0) continue
      claimed[n] = count
      region.push(n)
    }
    let omega = fit(region)
    if (!omega) {
      for (const v of region) claimed[v] = count
      sizes.push(region.length)
      count++
      continue
    }
    queue.push(...region)
    let sinceFit = 0
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]
      mesh.ring(u, ring)
      for (const n of ring) {
        if (!mesh.vertexAlive[n] || claimed[n] >= 0) continue
        if (residual(omega, n) > tolerance) continue
        claimed[n] = count
        region.push(n)
        queue.push(n)
        // Refit now and then, so a plate that turns out to be turning about a
        // different pole than its first few points suggested can still be found
        // whole rather than in pieces.
        if (++sinceFit >= 250) {
          sinceFit = 0
          omega = fit(region) ?? omega
        }
      }
    }
    sizes.push(region.length)
    count++
  }

  // Anything too small to be a plate takes the label most of its neighbours
  // carry, so the map is plates and boundaries rather than confetti.
  const smallest = CONFIG.smallestPlate
  const label = new Int32Array(claimed)
  for (let pass = 0; pass < 4; pass++) {
    let moved = 0
    for (let v = 0; v < vertexCount; v++) {
      if (!mesh.vertexAlive[v] || label[v] < 0 || sizes[label[v]] >= smallest) continue
      const votes = new Map<number, number>()
      mesh.ring(v, ring)
      for (const n of ring) {
        if (!mesh.vertexAlive[n] || label[n] < 0 || label[n] === label[v]) continue
        votes.set(label[n], (votes.get(label[n]) ?? 0) + 1)
      }
      let best = -1
      let bestVotes = 0
      for (const [id, n] of votes) if (n > bestVotes) { bestVotes = n; best = id }
      if (best >= 0) {
        label[v] = best
        moved++
      }
    }
    if (!moved) break
  }

  // Renumber largest first, so the same colour means the same size of thing.
  const finalSizes = new Map<number, number>()
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v] || label[v] < 0) continue
    finalSizes.set(label[v], (finalSizes.get(label[v]) ?? 0) + 1)
  }
  const ranked = [...finalSizes].sort((a, b) => b[1] - a[1])

  /**
   * A plate keeps the number it had last time.
   *
   * The plates are found again from scratch at every frame, which is the point
   * -- they are allowed to differ -- but numbering them afresh each time made
   * the whole map change colour on every step, and a thing that changes colour
   * looks like a thing that changed. Largest first is a stable enough ordering
   * for the big plates and hopeless for the rest, so each new plate instead
   * claims the number carried by most of the ground it covers, biggest first,
   * and only a genuinely new plate gets a number nobody was using.
   */
  const renumber = new Map<number, number>()
  const taken = new Set<number>()
  for (const [id] of ranked) {
    const votes = new Map<number, number>()
    for (let v = 0; v < vertexCount; v++) {
      if (label[v] !== id || !previousIds || previousIds[v] === 0) continue
      votes.set(previousIds[v], (votes.get(previousIds[v]) ?? 0) + 1)
    }
    let inherited = 0
    let most = 0
    for (const [was, n] of votes) if (n > most && !taken.has(was)) { most = n; inherited = was }
    if (!inherited) {
      for (let candidate = 1; candidate <= 254; candidate++) {
        if (!taken.has(candidate)) { inherited = candidate; break }
      }
    }
    if (!inherited) inherited = 255
    taken.add(inherited)
    renumber.set(id, inherited)
  }
  const out = new Uint8Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v] || label[v] < 0) continue
    out[v] = renumber.get(label[v]) ?? 255
  }
  const live = mesh.liveVertices || 1
  return {
    ids: out,
    count: ranked.filter(([, n]) => n >= smallest).length,
    biggest: ranked.slice(0, 5).map(([, n]) => n / live),
  }
}

/**
 * Push every point along the spreading field, and let it remember.
 *
 * There are no plates here to fit a rotation to, and there should not be: what
 * moves together is whatever the surviving crust holds together, which changes
 * as the crust does. So the field acts on the points directly and the springs
 * carry it inland -- rigid crust arrives as one piece because it is rigid, not
 * because it was declared a plate.
 *
 * Read at the isochrons disappearing now, since that is the margin the ocean is
 * closing at this moment; crust deep inside a plate records the rate at the time
 * it formed, which is a different question. Each point keeps most of what it was
 * doing last step, which is what turns a sequence of independent nudges into a
 * motion, and what keeps a continent going once its own sea floor has run out.
 */
function driveByField(
  pos: Float64Array,
  mesh: DynamicMesh,
  flow: Float64Array,
  drift: Float64Array,
  vertexAge: Float32Array,
  t: number,
  dt: number,
) {
  const memory = CONFIG.poleMemory
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (!mesh.vertexAlive[v]) continue
    const age = vertexAge[v]
    const reading = age < PERMANENT_MA && age >= t && age <= t + CONFIG.flowWindowMa
    const i = v * 3
    if (reading) {
      // The field is a direction on today's Earth; carry it round with the
      // crust by turning it the way the crust itself has turned.
      const dx = flow[i] * dt, dy = flow[i + 1] * dt, dz = flow[i + 2] * dt
      drift[i] = memory * drift[i] + (1 - memory) * dx
      drift[i + 1] = memory * drift[i + 1] + (1 - memory) * dy
      drift[i + 2] = memory * drift[i + 2] + (1 - memory) * dz
    } else {
      drift[i] *= memory
      drift[i + 1] *= memory
      drift[i + 2] *= memory
    }
    pos[i] += drift[i]
    pos[i + 1] += drift[i + 1]
    pos[i + 2] += drift[i + 2]
  }
}

/**
 * Does the surviving crust cover the sphere it is supposed to?
 *
 * This is the whole reconstruction in one number now. The crust that exists at
 * time t has a known area and the sphere it has to lie on has a known area, and
 * the radius curve was derived from exactly that equality -- so if the model is
 * working they match, and any shortfall is crust the reconstruction could not
 * get to fit. There is no longer any such thing as area occupied by crust that
 * does not exist: that crust has been closed away rather than crumpled into a
 * corner, which is what the old gap figure was really measuring.
 */
function tiling(
  pos: Float64Array, mesh: DynamicMesh, faceCount: number, probes: Float64Array,
  cells: Uint32Array, cellFaces: number[][],
) {
  // Which triangles could possibly cover which part of the sky. A triangle is
  // about a degree across to start with and a few degrees once its neighbours
  // have closed away, so a two-degree grid keeps a handful in each cell.
  for (const list of cellFaces) list.length = 0
  const cellOf = (x: number, y: number, z: number) => {
    const length = Math.hypot(x, y, z) || 1
    const lat = Math.asin(Math.min(1, Math.max(-1, y / length)))
    const lon = Math.atan2(z / length, x / length)
    const row = Math.min(GRID_ROWS - 1, Math.floor(((lat + Math.PI / 2) / Math.PI) * GRID_ROWS))
    const col = Math.min(GRID_COLS - 1, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * GRID_COLS))
    return [row, col] as const
  }
  for (let f = 0; f < faceCount; f++) {
    if (!mesh.faceAlive[f]) continue
    let rowLo = GRID_ROWS, rowHi = -1
    let colLo = GRID_COLS, colHi = -1
    for (let k = 0; k < 3; k++) {
      const v = mesh.faceVerts[f * 3 + k] * 3
      const [row, col] = cellOf(pos[v], pos[v + 1], pos[v + 2])
      rowLo = Math.min(rowLo, row); rowHi = Math.max(rowHi, row)
      colLo = Math.min(colLo, col); colHi = Math.max(colHi, col)
    }
    // A triangle straddling the date line, or one wrapped round a pole, has a
    // meaningless column range; give it the whole row rather than losing it.
    const wraps = colHi - colLo > GRID_COLS / 2 || rowLo === 0 || rowHi === GRID_ROWS - 1
    for (let row = Math.max(0, rowLo - 1); row <= Math.min(GRID_ROWS - 1, rowHi + 1); row++) {
      if (wraps) {
        for (let col = 0; col < GRID_COLS; col++) cellFaces[row * GRID_COLS + col].push(f)
      } else {
        for (let col = Math.max(0, colLo - 1); col <= Math.min(GRID_COLS - 1, colHi + 1); col++) {
          cellFaces[row * GRID_COLS + col].push(f)
        }
      }
    }
  }

  const probeCount = probes.length / 3
  let covered = 0
  let doubled = 0
  const unit = [0, 0, 0]
  for (let p = 0; p < probeCount; p++) {
    const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
    let hits = 0
    for (const f of cellFaces[cells[p]]) {
      const a = mesh.faceVerts[f * 3] * 3
      const b = mesh.faceVerts[f * 3 + 1] * 3
      const c = mesh.faceVerts[f * 3 + 2] * 3
      if (inside(pos, a, b, c, dx, dy, dz, unit)) hits++
    }
    if (hits > 0) covered++
    if (hits > 1) doubled++
  }
  return {
    // What is actually asked of the model: does the crust that existed then
    // cover the sphere it had to lie on? Summing the triangles' areas does not
    // answer that -- a sheet folded over itself somewhere and short somewhere
    // else adds up to exactly the right total while covering neither. This
    // counts the sky directly, and it is the number to judge the model by.
    gapFraction: 1 - covered / probeCount,
    overlapFraction: doubled / probeCount,
  }
}

const GRID_ROWS = 90
const GRID_COLS = 180

/** Whether a direction falls inside a spherical triangle, either way up. */
function inside(
  pos: Float64Array, a: number, b: number, c: number,
  dx: number, dy: number, dz: number, unit: number[],
) {
  let sign = 0
  for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
    unit[0] = pos[i + 1] * pos[j + 2] - pos[i + 2] * pos[j + 1]
    unit[1] = pos[i + 2] * pos[j] - pos[i] * pos[j + 2]
    unit[2] = pos[i] * pos[j + 1] - pos[i + 1] * pos[j]
    const side = unit[0] * dx + unit[1] * dy + unit[2] * dz
    if (side === 0) continue
    const s = side > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (sign !== s) return false
  }
  return sign !== 0
}


// --- topology --------------------------------------------------------------







/**
 * The spreading velocity field, read off the age grid.
 *
 * Lines of equal age on the sea floor are old positions of a ridge, so the
 * gradient of age points straight across them: along the direction that crust
 * actually travelled. That is the same direction the fracture zones scratch
 * into the bathymetry -- the stretch marks you can see on any bathymetric map,
 * running at right angles to the ridges for thousands of kilometres.
 *
 * The speed comes out of the same derivative. If age rises by one million years
 * over twenty-nine kilometres then twenty-nine kilometres of crust were made per
 * million years, so the half-spreading rate is one over the gradient. Across the
 * whole grid that gives a median of 29 km/Myr, with the slow Atlantic ridges
 * near 10 and the East Pacific Rise near 90, which is what ships measure. There
 * is nothing to fit: the field is a derivative of data we already had.
 *
 * Run backwards, a piece of sea floor travels down this gradient towards the
 * ridge it erupted from, at that rate. So `flow` is `-grad(age) / |grad(age)|^2`
 * -- pointing towards younger crust, with the length of the half rate, in
 * kilometres per million years.
 *
 * A fracture zone is a step in the age field, and the gradient of a step points
 * across the step, which is along the ridge rather than across it -- exactly
 * wrong. The field is smoothed over a few hundred kilometres first, which keeps
 * the trend of the isochrons and drops the steps.
 */
function spreadingField(
  dirs: Float32Array,
  origin: Uint32Array,
  originalCount: number,
  uncutAge: Float32Array,
  adjacency: { offsets: Uint32Array; neighbours: Uint32Array },
  vertexCount: number,
  r0: number,
) {
  // Positions and ages on the uncut mesh, so the gradient at a fracture is
  // taken across the crust rather than stopping at the cut.
  const unit = new Float64Array(originalCount * 3)
  for (let v = 0; v < vertexCount; v++) {
    const o = origin[v]
    unit[o * 3] = dirs[v * 3]
    unit[o * 3 + 1] = dirs[v * 3 + 1]
    unit[o * 3 + 2] = dirs[v * 3 + 2]
  }

  const { offsets, neighbours } = adjacency
  let age = new Float64Array(originalCount)
  for (let o = 0; o < originalCount; o++) {
    age[o] = uncutAge[o] >= PERMANENT_MA ? NaN : uncutAge[o]
  }
  let next = new Float64Array(originalCount)
  for (let pass = 0; pass < CONFIG.flowSmoothing; pass++) {
    for (let o = 0; o < originalCount; o++) {
      if (Number.isNaN(age[o])) {
        next[o] = NaN
        continue
      }
      let sum = age[o]
      let n = 1
      for (let k = offsets[o]; k < offsets[o + 1]; k++) {
        const a = age[neighbours[k]]
        if (Number.isNaN(a)) continue
        sum += a
        n++
      }
      next[o] = sum / n
    }
    const swap = age
    age = next
    next = swap
  }

  const field = new Float64Array(vertexCount * 3)
  let counted = 0
  const rates: number[] = []
  for (let o = 0; o < originalCount; o++) {
    if (Number.isNaN(age[o])) continue
    const nx = unit[o * 3], ny = unit[o * 3 + 1], nz = unit[o * 3 + 2]
    // Any two directions in the tangent plane will do; take the one that avoids
    // the pole of the cross product.
    const helper = Math.abs(ny) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    let e1 = [
      ny * helper[2] - nz * helper[1],
      nz * helper[0] - nx * helper[2],
      nx * helper[1] - ny * helper[0],
    ]
    const e1n = Math.hypot(e1[0], e1[1], e1[2]) || 1
    e1 = [e1[0] / e1n, e1[1] / e1n, e1[2] / e1n]
    const e2 = [
      ny * e1[2] - nz * e1[1],
      nz * e1[0] - nx * e1[2],
      nx * e1[1] - ny * e1[0],
    ]

    // Least squares fit of a plane through the neighbouring ages.
    let axx = 0, axy = 0, ayy = 0, bx = 0, by = 0, samples = 0
    for (let k = offsets[o]; k < offsets[o + 1]; k++) {
      const u = neighbours[k]
      if (Number.isNaN(age[u])) continue
      const dx = (unit[u * 3] - nx) * r0
      const dy = (unit[u * 3 + 1] - ny) * r0
      const dz = (unit[u * 3 + 2] - nz) * r0
      const x = dx * e1[0] + dy * e1[1] + dz * e1[2]
      const y = dx * e2[0] + dy * e2[1] + dz * e2[2]
      const d = age[u] - age[o]
      axx += x * x; axy += x * y; ayy += y * y
      bx += x * d; by += y * d
      samples++
    }
    if (samples < 3) continue
    const det = axx * ayy - axy * axy
    if (Math.abs(det) < 1e-9) continue
    const gx = (ayy * bx - axy * by) / det
    const gy = (axx * by - axy * bx) / det
    const g2 = gx * gx + gy * gy
    if (g2 < 1e-12) continue
    const rate = 1 / Math.sqrt(g2)
    if (!Number.isFinite(rate) || rate > CONFIG.maxRate) continue
    rates.push(rate)
    // Down the gradient, at the half rate.
    const fx = -(gx * e1[0] + gy * e2[0]) / g2
    const fy = -(gx * e1[1] + gy * e2[1]) / g2
    const fz = -(gx * e1[2] + gy * e2[2]) / g2
    field[o * 3] = fx
    field[o * 3 + 1] = fy
    field[o * 3 + 2] = fz
    counted++
  }

  // Hand each cut copy the field of the vertex it came from.
  const out = new Float64Array(vertexCount * 3)
  for (let v = 0; v < vertexCount; v++) {
    const o = origin[v]
    out[v * 3] = field[o * 3]
    out[v * 3 + 1] = field[o * 3 + 1]
    out[v * 3 + 2] = field[o * 3 + 2]
  }
  rates.sort((a, b) => a - b)
  console.log(
    `[solve] spreading field over ${((100 * counted) / originalCount).toFixed(0)}% of the mesh; ` +
      `half rate median ${rates[Math.floor(rates.length / 2)].toFixed(0)} km/Myr ` +
      `(10th ${rates[Math.floor(rates.length * 0.1)].toFixed(0)}, ` +
      `90th ${rates[Math.floor(rates.length * 0.9)].toFixed(0)})`,
  )
  return out
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
  pos: Float64Array, indices: Int32Array, restArea: Float64Array, faceCount: number,
  alive: Uint8Array,
) {
  const out = new Float32Array(faceCount)
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f]) continue
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
  t: number, rigidity: Float32Array, alive: Uint8Array,
) {
  let square = 0
  let signed = 0
  let weight = 0
  const magnitudes: { value: number; weight: number }[] = []
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f] || faceAges[f] < t) continue
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
    for (let f = 0; f < faceCount; f++) {
      if (alive[f] && faceAges[f] >= t && test(f)) out.push(Math.abs(strain[f]))
    }
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
  strain: Float32Array, indices: Int32Array, restArea: Float64Array,
  faceCount: number, vertexCount: number, alive: Uint8Array,
) {
  const sum = new Float64Array(vertexCount)
  const weight = new Float64Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f]) continue
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
