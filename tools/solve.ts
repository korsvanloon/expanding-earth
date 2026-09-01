/**
 * Stage 2: reconstruct where the crust was, by simulation rather than by
 * hand-authored keyframes.
 *
 * We integrate backwards from today, the only moment we actually know. Each
 * one-million-year step does three things:
 *
 *   - crust that had not been made yet is taken out of the mesh, by collapsing
 *     its edges: the two triangles along an edge go and its ends become one
 *     point. Run forwards that is a ridge splitting a point in two and making
 *     sea floor between the halves, which is what a ridge does;
 *   - the surviving crust is carried along the spreading field, read off the
 *     age gradient at the isochron that is disappearing;
 *   - the sphere it all sits on shrinks to R(t), which is not a free parameter
 *     but follows from the area budget.
 *
 * Then the springs are relaxed, so the ocean closes like a zip and drags the
 * continents together. Nothing in here knows what a plate is: the blocks that
 * move as units are whatever still moves as one, read back out of the motion
 * afterwards.
 *
 * What is NOT here, because the comments used to say it was. There is no
 * tension-only spring across crust that does not exist yet, and no pairing of
 * conjugate margins: both were tried, and the mesh collapsing the dead crust
 * outright does the same job without them. Nor is there any rule that cuts the
 * shell where the age field steps -- the only thing that lets one piece slide
 * past another is a redrawn triangle edge, and only in crust weak enough to
 * fault. The reasoning that made the earlier version work is still worth
 * keeping: letting vanished crust push as well as pull welded the blocks either
 * side into one rigid sheet, and a sheet that large cannot change its curvature
 * without absurd strain, which is why those runs reported 20% everywhere.
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
  sampleCurve,
  type FrameDiagnostics,
  type Meta,
} from '../shared/model.js'
import { CRATON_RIGIDITY, WEAK_RIGIDITY } from '../shared/crust.js'
import { type TopologyDelta, topologyDelta, writeTopology } from '../shared/topology.js'
import { directionToUv, length3 } from '../shared/sphere.js'
import { DynamicMesh, collapseVanished, retriangulate } from './lib/dynamic-mesh.js'
import { cellBuckets, coverage, probeCells, probeDirections } from './lib/coverage.js'
import { distortion, shapePairs } from './lib/shape.js'
import { conjugateFit } from './lib/flowlines.js'
import { pairPulls as pairIsHeldIn, readTracks } from '../shared/tracks.js'
import { unstretching } from './lib/unstretching.js'

import { buildIcosphere } from './lib/icosphere.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')

/**
 * How near two margins have to be to count as in contact, km.
 *
 * A triangle is about a degree across, so a hundred kilometres is roughly one
 * of them and this is two: below that a mesh at this resolution cannot say
 * whether two coastlines are touching or merely adjacent. Not a tolerance
 * chosen to flatter the fit -- raising it would inflate every figure at once,
 * which is why it is stated here rather than tuned per pair.
 */
const CONTACT_KM = Number(process.env.CONTACT_KM ?? 200)

const CONFIG = {
  /** Integration step, Myr. Small enough that each step is a small nudge. */
  stepMa: 1,
  /** Gauss-Seidel sweeps per step. */
  sweeps: Number(process.env.SWEEPS ?? 40),
  /**
   * How wide a band of isochrons the spreading field is read from, Myr.
   *
   * The field describes how fast the crust at a given isochron was moving when
   * it formed, so what matters at time t is the crust around age t -- the
   * margin that is disappearing. Reading it across a band rather than a line
   * gives the fit enough points to pin a rotation down.
   */
  flowWindowMa: Number(process.env.FLOW_WINDOW ?? 14),
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
  /**
   * How much of its proper size a triangle must keep, wound the right way,
   * before the orientation barrier stops pushing. A barrier, not a shape: the
   * springs decide what a triangle looks like, this only decides which side of
   * the shell it lies on. Low enough that badly sheared sea floor can still be
   * squashed nearly flat, high enough to stay clear of zero, where the
   * gradient that pushes a fold back out has vanished along with the area.
   */
  foldMargin: Number(process.env.FOLD_MARGIN ?? 0.08),
  /** How many rounds of redrawing slivers per step. */
  flipPasses: Number(process.env.FLIP_PASSES ?? 6),
  /** Smoothing passes over the age field before differentiating it. */
  flowSmoothing: Number(process.env.FLOW_SMOOTH ?? 6),
  /** The fastest half-spreading rate believed, km/Myr. */
  maxRate: Number(process.env.MAX_RATE ?? 200),
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
  /**
   * How hard a conjugate pair pulls its two halves together, per sweep.
   *
   * Modest on purpose. The pairs are read off the age grid by a tracer, and a
   * tracer that is wrong somewhere would otherwise drag the crust there with
   * the full authority of a measurement. At this stiffness a pair nudges and
   * the springs argue back, so what survives is what many pairs and the age
   * grid agree on.
   */
  conjugateStiffness: 0.15,
  /**
   * How hard a traced fracture zone is held to being smooth, and how much of a
   * corner it is allowed before anything happens.
   *
   * A fracture zone is a path one piece of crust actually took, so it bends
   * over hundreds of kilometres and never corners: the tracer enforces no more
   * than six degrees per forty-kilometre step, and a drawn track is smooth today
   * by construction. Measured through the reconstruction it is not. By 60 Ma
   * 8.9% of the turns along the surviving tracks are over thirty degrees and the
   * 99th percentile is 145 -- the crust doubling back on itself at the scale of
   * one step, which nothing on the sea floor does. The tracer did not put those
   * corners there; the solver did. See tools/measure-tracks.ts.
   *
   * So this is not a drawing fix. A kink in a material line is a kink in the
   * crust, and this is a claim about the crust: whatever else the reconstruction
   * does, it may not fold a fracture zone at forty kilometres.
   *
   * The allowance is twice what the tracer permits, so ordinary bending and the
   * mesh's own noise cost nothing and only real corners are pushed on.
   */
  trackStiffness: Number(process.env.TRACK_K ?? 0),
  trackTurnDeg: 12,
  radialStiffness: Number(process.env.RADIAL_K ?? 0.35),
  /** Stop early; for convergence experiments. */
  endMa: Number(process.env.END_MA ?? 0) || undefined,
}

function main() {
  const meta = JSON.parse(
    readFileSync(resolve(OUT, 'meta.partial.json'), 'utf8'),
  ) as Omit<Meta, 'diagnostics' | 'fixedRadiusDiagnostics' | 'frameCount' | 'scorecard'>

  const trackFile = readFileSync(resolve(OUT, 'tracks.bin'))
  const tracks = readTracks(
    trackFile.buffer.slice(trackFile.byteOffset, trackFile.byteOffset + trackFile.byteLength),
  )
  console.log(
    `[solve] ${tracks.pairAgeMa.length} conjugate pairs off ${tracks.ridge.length} drawn ` +
      'fracture-zone tracks; see tools/lib/flowlines.ts',
  )

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
  // The gravity gradient and its roughness, per vertex. Read by the viewer as
  // the crustal fabric; nothing in the solve depends on them yet.
  offset += vertexCount * 8
  offset += vertexCount * 4 // origin, which an uncut mesh does not need
  offset += faceCount * 2 // per-face fragment
  const vertexIsland = new Uint16Array(buffer.buffer, offset, vertexCount)
  const crustType = new Uint8Array(buffer.buffer, offset + vertexCount * 2, faceCount)
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
        r0 * length3(dirs[a] - dirs[b], dirs[a + 1] - dirs[b + 1], dirs[a + 2] - dirs[b + 2])
    }
    restArea[f] =
      solidAngle(dirs, indices[f * 3] * 3, indices[f * 3 + 1] * 3, indices[f * 3 + 2] * 3) * r0 * r0
  }

  const pos = new Float64Array(vertexCount * 3)
  for (let i = 0; i < vertexCount * 3; i++) pos[i] = dirs[i] * r0
  const previous = new Float64Array(pos)
  // Read from the mesh rather than worked out again, so the picture and the
  // physics cannot drift apart.
  const islands = {
    vertexIsland: Int32Array.from(vertexIsland, (id) => id - 1),
    count: vertexIsland.reduce((m, id) => Math.max(m, id), 0),
  }
  console.log(`[solve] ${islands.count} islands of strong crust hold their shape`)
  const shape = islandShape(dirs, islands.vertexIsland, islands.count, vertexCount, r0)
  /**
   * The pairs whose distance the islands are supposed to keep.
   *
   * Sampled from the islands rather than from the lat/lon regions because an
   * island is a claim this model makes -- shields hold their shape -- while a
   * region is a box on a map, and half of what a box measures is Madagascar
   * genuinely leaving Africa. See tools/lib/shape.ts.
   */
  const heldPairs = shapePairs(dirs, islands.vertexIsland, islands.count, vertexCount, r0)
  console.log(
    `[solve] ${heldPairs.a.length} pairs of points watched for the shape of their island`,
  )
  const islandFacing = new Float64Array(islands.count * 9)
  for (let c = 0; c < islands.count; c++) {
    islandFacing[c * 9] = 1; islandFacing[c * 9 + 4] = 1; islandFacing[c * 9 + 8] = 1
  }

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

  /**
   * The conjugate pairs, split into the ones that pull and the ones that judge.
   *
   * Until now these only judged: they reached conjugateFit and nothing else, so
   * every change to how they were traced moved the yardstick and left the
   * reconstruction byte for byte identical. Feeding them in is the change that
   * makes them matter -- and it destroys them as a test unless some are kept
   * back, because a pair the solver was told to close is no evidence that it
   * closed.
   *
   * Split by track, not by pair. Two pairs five million years apart on the same
   * walk are nearly the same claim, so splitting pair by pair would put a
   * near-copy of every constraint into the test set and score the model on what
   * it had been told.
   */
  const pairPulls = new Uint8Array(tracks.pairAgeMa.length)
  const pairRestKm = new Float64Array(tracks.pairAgeMa.length)
  {
    const place = (verts: Uint32Array, weights: Float32Array, i: number) => {
      let x = 0, y = 0, z = 0
      for (let k = 0; k < 3; k++) {
        const v = verts[i * 3 + k] * 3
        const w = weights[i * 3 + k]
        x += w * dirs[v]; y += w * dirs[v + 1]; z += w * dirs[v + 2]
      }
      const l = length3(x, y, z) || 1
      return [x / l, y / l, z / l]
    }
    let pulling = 0
    for (let i = 0; i < tracks.pairAgeMa.length; i++) {
      if (pairIsHeldIn(tracks, i)) { pairPulls[i] = 1; pulling++ }
      const a = place(tracks.pairAVerts, tracks.pairAWeights, i)
      const b = place(tracks.pairBVerts, tracks.pairBWeights, i)
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
      pairRestKm[i] = Math.acos(dot) * r0
    }
    console.log(
      `[solve] ${pulling} conjugate pairs pull on the crust, ` +
        `${tracks.pairAgeMa.length - pulling} are held back to score it`,
    )
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
    thickness, faceAges, rigidity, faceCount, indices, crustType,
  )
  const stretchAt = (f: number, t: number) =>
    1 + (stretch[f] - 1) * (riftMa[f] > 0 ? Math.min(1, t / riftMa[f]) : 0)
  let warnedBoundary = false
  const restAreaNow = new Float64Array(faceCount)
  /** What each of the three edges of a face should measure at the current step. */
  const edgeTarget = new Float64Array(faceCount * 3)

  // A fixed set of directions to ask "is there any crust here?" of. Not the
  // mesh's own vertices, which is what they used to be; see tools/lib/coverage.ts.
  const probes = probeDirections(Number(process.env.PROBES ?? 100000))
  const cells = probeCells(probes)
  const buckets = cellBuckets()

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
  /**
   * The seaward edge of each continent: a point of permanent crust with a
   * neighbour that is not permanent.
   *
   * The regions themselves are lat/lon rectangles intersected with continental
   * crust, so their outlines are part coastline and part box edge. Asking which
   * points have oceanic neighbours gets the coastline alone, which is the thing
   * a fit is a fit between.
   */
  const regionMargin = new Map<string, number[]>()
  for (const region of REGIONS) {
    const margin: number[] = []
    for (const v of regionVertices.get(region.id) ?? []) {
      for (let k = adjacency.offsets[v]; k < adjacency.offsets[v + 1]; k++) {
        if (vertexAge[adjacency.neighbours[k]] < PERMANENT_MA) {
          margin.push(v)
          break
        }
      }
    }
    regionMargin.set(region.id, margin)
  }
  console.log(
    `[solve] margins: ${REGIONS.map((r) => `${r.id} ${regionMargin.get(r.id)?.length ?? 0}`).join(', ')}`,
  )

  const separation = new Map<string, number[]>()
  const matched = new Map<string, number[]>()

  const track = new Map<string, { first: number[]; last: number[]; walked: number }>()
  const regionCentre = (id: string) => {
    let x = 0, y = 0, z = 0
    for (const v of regionVertices.get(id) ?? []) {
      const s = mesh.survivor(v) * 3
      const length = length3(pos[s], pos[s + 1], pos[s + 2]) || 1
      x += pos[s] / length; y += pos[s + 1] / length; z += pos[s + 2] / length
    }
    const length = length3(x, y, z) || 1
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

  /**
   * The triangulation as the frames have recorded it so far. Collapses and
   * flips move it away from mesh.bin's index array from the first step, so the
   * connectivity has to travel with the frames or the viewer draws a mesh that
   * stopped being true two hundred million years ago. See shared/topology.ts.
   */
  const drawnTopology = Uint16Array.from(indices)
  const topologyDeltas: TopologyDelta[] = []
  const recordTopology = () =>
    topologyDeltas.push(
      topologyDelta(drawnTopology, mesh.drawnVerts, faceCount, mesh.faceAlive),
    )

  const record = (t: number) => {
    const closest = (a: string, b: string) => {
      const one = regionVertices.get(a) ?? []
      const two = regionVertices.get(b) ?? []
      let best = -1
      for (let i = 0; i < one.length; i += 4) {
        const p = mesh.survivor(one[i]) * 3
        const pl = length3(pos[p], pos[p + 1], pos[p + 2]) || 1
        const px = pos[p] / pl, py = pos[p + 1] / pl, pz = pos[p + 2] / pl
        for (let j = 0; j < two.length; j += 4) {
          const q = mesh.survivor(two[j]) * 3
          const ql = length3(pos[q], pos[q + 1], pos[q + 2]) || 1
          const dot = px * (pos[q] / ql) + py * (pos[q + 1] / ql) + pz * (pos[q + 2] / ql)
          if (dot > best) best = dot
        }
      }
      return Math.acos(Math.min(1, Math.max(-1, best))) * radiusAt(t)
    }
    /**
     * How much of the shorter margin lies against the other one.
     *
     * Measured from the shorter of the two on purpose: the question for India
     * against Africa is whether India's western margin lies along Africa, not
     * whether most of Africa's coastline lies along India, which it never could.
     * Points are counted rather than arc length measured -- a geodesic mesh
     * spaces them near evenly, and collapse thins them without favouring one
     * stretch of coast over another.
     */
    const matchedShare = (a: string, b: string) => {
      const here = (regionMargin.get(a) ?? []).length <= (regionMargin.get(b) ?? []).length ? a : b
      const there = here === a ? b : a
      const mine = regionMargin.get(here) ?? []
      const theirs = regionMargin.get(there) ?? []
      if (!mine.length || !theirs.length) return 0
      const r = radiusAt(t)
      // A margin closer than this cannot be resolved by a mesh whose triangles
      // are about a degree across, so anything nearer counts as in contact.
      const touching = Math.cos(CONTACT_KM / r)
      const seen = new Set<number>()
      let count = 0
      let close = 0
      for (const v of mine) {
        const p = mesh.survivor(v)
        if (seen.has(p)) continue
        seen.add(p)
        count++
        const i = p * 3
        const pl = length3(pos[i], pos[i + 1], pos[i + 2]) || 1
        const px = pos[i] / pl, py = pos[i + 1] / pl, pz = pos[i + 2] / pl
        for (const w of theirs) {
          const q = mesh.survivor(w) * 3
          const ql = length3(pos[q], pos[q + 1], pos[q + 2]) || 1
          if (px * (pos[q] / ql) + py * (pos[q + 1] / ql) + pz * (pos[q + 2] / ql) >= touching) {
            close++
            break
          }
        }
      }
      return count ? close / count : 0
    }
    for (const target of FIT_TARGETS) {
      const key = `${target.a}|${target.b}`
      separation.set(key, [...(separation.get(key) ?? []), closest(target.a, target.b)])
      matched.set(key, [...(matched.get(key) ?? []), matchedShare(target.a, target.b)])
    }

    const found = findPlates(
      pos, atLastFrame, mesh, Math.max(meta.frameStepMa, 1), vertexCount,
      plates[plates.length - 1],
    )
    for (let v = 0; v < vertexCount; v++) {
      if (!mesh.vertexAlive[v]) found.ids[v] = found.ids[mesh.survivor(v)]
    }
    plates.push(found.ids)
    plateReport = { count: found.count, biggest: found.biggest }
    const speed = medianSpeed(
      pos, atLastFrame, mesh, radiusAt(t), Math.max(meta.frameStepMa, 1), vertexCount,
    )
    atLastFrame.set(pos)

    for (let f = 0; f < faceCount; f++) restAreaNow[f] = restArea[f] / stretchAt(f, t)
    const strain = faceStrain(pos, mesh.faceVerts, restAreaNow, faceCount, mesh.faceAlive)
    frames.push(quantise(pos, vertexCount))
    recordTopology()
    // Per-vertex readings are computed on the solver's names, so a point that
    // has been merged away holds nothing -- and the drawn triangulation still
    // uses those names, because that is how it keeps track of whose crust each
    // triangle is. Hand each of them its survivor's reading, the same way
    // settleCollapsed hands them its position.
    const vertexStrain = perVertexStrain(
      strain, mesh.faceVerts, restAreaNow, faceCount, vertexCount, mesh.faceAlive,
    )
    for (let v = 0; v < vertexCount; v++) {
      if (!mesh.vertexAlive[v]) vertexStrain[v] = vertexStrain[mesh.survivor(v)]
    }
    strains.push(vertexStrain)
    const held = distortion(heldPairs, pos, radiusAt(t))
    const tiled = coverage(pos, mesh, faceCount, probes, cells, buckets)
    // Should be impossible; said out loud rather than trusted, because when the
    // probes did sit on the mesh this went wrong in total silence.
    if (tiled.boundaryHits > 0 && !warnedBoundary) {
      warnedBoundary = true
      console.log(
        `[solve] WARNING: ${tiled.boundaryHits} probes landed exactly on a triangle edge at ` +
          `${t} Ma; the coverage figures are not reliable. See tools/lib/coverage.ts.`,
      )
    }
    diagnostics.push({
      timeMa: t,
      radiusKm: radiusAt(t),
      ...tiled,
      ...foldedShare(pos, mesh.faceVerts, mesh.faceAlive, restAreaNow, faceCount),
      ...strainStats(strain, faceAges, restAreaNow, faceCount, t, rigidity, mesh.faceAlive),
      reliefKm: relief(pos, vertexCount, radiusAt(t)),
      blockCount: plateReport.count,
      biggestBlockShare: plateReport.biggest[0] ?? 0,
      // The crust the grid took away arriving here, per Myr: the forcing. Zero
      // at the first frame because no time has passed; it borrows the second
      // below, as the plates do.
      forcingFraction: t > 0
        ? ((radiusAt(t - meta.frameStepMa) / r0) ** 2 - (radiusAt(t) / r0) ** 2)
          / meta.frameStepMa
        : 0,
      medianSpeedKmMyr: speed,
      islandDistortion: held.islandDistortion,
      worstIslandDistortion: held.worstIslandDistortion,
      ...conjugateFit(
        {
          aVerts: tracks.pairAVerts,
          aWeights: tracks.pairAWeights,
          bVerts: tracks.pairBVerts,
          bWeights: tracks.pairBWeights,
          ageMa: tracks.pairAgeMa,
        },
        t, pos, radiusAt(t), CONTACT_KM, (v) => mesh.survivor(v),
        (i) => !pairPulls[i],
      ),
    })
  }

  record(0)
  followRegions(radiusAt(0))
  const started = Date.now()

  /**
   * Pull the pairs that were once one point towards being one point again.
   *
   * The claim a conjugate pair makes is about one instant: at the age its crust
   * erupted, these two places were the same place. Everything between then and
   * now it says nothing about -- so the target closes linearly from where they
   * sit today to nothing at that age, and the stiffness does the opposite,
   * near zero at the present and full at formation. Most of the pull therefore
   * lands where the claim is real, and the straight-line guess in between is
   * barely enforced.
   *
   * It runs after the edge springs and before the fold guard and the sphere, so
   * a pull that would turn a triangle inside out is caught in the same sweep
   * that made it.
   *
   * Each end is a point inside a triangle, so the correction is handed to its
   * three corners in proportion to their weights: pulling the point pulls the
   * crust it is part of, which is the whole idea. A vertex the mesh has already
   * collapsed follows its survivor.
   */
  const closeConjugates = (pos: Float64Array, t: number, radius: number) => {
    if (CONFIG.conjugateStiffness <= 0) return
    for (let i = 0; i < tracks.pairAgeMa.length; i++) {
      if (!pairPulls[i]) continue
      const age = tracks.pairAgeMa[i]
      if (age <= 0 || t > age) continue
      const remaining = (age - t) / age
      const stiffness = CONFIG.conjugateStiffness * (1 - remaining)
      if (stiffness <= 0) continue
      const targetKm = pairRestKm[i] * remaining

      const place = (verts: Uint32Array, weights: Float32Array) => {
        let x = 0, y = 0, z = 0
        for (let k = 0; k < 3; k++) {
          const v = mesh.survivor(verts[i * 3 + k]) * 3
          const w = weights[i * 3 + k]
          x += w * pos[v]; y += w * pos[v + 1]; z += w * pos[v + 2]
        }
        return [x, y, z]
      }
      const a = place(tracks.pairAVerts, tracks.pairAWeights)
      const b = place(tracks.pairBVerts, tracks.pairBWeights)
      const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
      const chord = length3(dx, dy, dz)
      if (chord < 1e-9) continue
      // Both distances as chords of the same sphere, so the comparison does not
      // mix a great-circle target with a straight-line reading.
      const targetChord = 2 * radius * Math.sin(Math.min(Math.PI, targetKm / radius) / 2)
      const move = (0.5 * stiffness * (chord - targetChord)) / chord
      const mx = dx * move, my = dy * move, mz = dz * move

      const push = (verts: Uint32Array, weights: Float32Array, sign: number) => {
        // Spread over the corners by weight, and divide by the sum of the
        // squared weights so that the point itself moves by the amount asked
        // for however the weights happen to fall.
        let share = 0
        for (let k = 0; k < 3; k++) share += weights[i * 3 + k] * weights[i * 3 + k]
        if (share < 1e-9) return
        for (let k = 0; k < 3; k++) {
          const v = mesh.survivor(verts[i * 3 + k]) * 3
          const w = (weights[i * 3 + k] / share) * sign
          pos[v] += mx * w; pos[v + 1] += my * w; pos[v + 2] += mz * w
        }
      }
      push(tracks.pairAVerts, tracks.pairAWeights, -1)
      push(tracks.pairBVerts, tracks.pairBWeights, 1)
    }
  }

  /**
   * Which drawn tracks are held smooth, and which are left alone to say whether
   * it worked.
   *
   * The same split the conjugate pairs use, and for the same reason: a track the
   * solver was told to keep smooth is no evidence that the crust stayed smooth.
   * pairPulls is decided by the track's own number, so the two constraints agree
   * about which half of the evidence is being spent and which is being kept.
   */
  const trackPulls = new Uint8Array(Math.max(0, tracks.offsets.length - 1))
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const t = tracks.pairTrack[i]
    if (t < trackPulls.length && pairPulls[i]) trackPulls[t] = 1
  }
  {
    let held = 0
    for (const v of trackPulls) if (v) held++
    console.log(
      `[solve] ${held} of ${trackPulls.length} drawn tracks are held smooth, `
        + `${trackPulls.length - held} left free to score it`,
    )
  }

  /**
   * Refuse to let a traced fracture zone corner.
   *
   * Three consecutive points of one track are a piece of crust forty kilometres
   * long either side of a middle point. If the turn there is past the allowance,
   * the middle is pulled towards the midpoint of its neighbours and they are
   * pushed the other way by half each, so the correction moves no crust on
   * average and cannot walk the whole line sideways.
   *
   * Only where the crust exists: a point on sea floor younger than the frame has
   * been collapsed out of the mesh, so its corners have been merged into their
   * neighbours and the turn through it is not a reading of anything. Measuring
   * those was the first version of the diagnostic and it reported a quarter of
   * every track reversing on itself at 13 Ma, which was a measurement of the
   * collapse and not of the crust.
   *
   * Like the pairs, each point is a place inside a triangle, so its correction
   * is handed to the three corners in proportion to their weights.
   */
  const straightenTracks = (pos: Float64Array, t: number) => {
    if (CONFIG.trackStiffness <= 0) return
    const allowance = Math.cos((CONFIG.trackTurnDeg * Math.PI) / 180)
    const place = (i: number) => {
      let x = 0, y = 0, z = 0
      for (let k = 0; k < 3; k++) {
        const v = mesh.survivor(tracks.pointVerts[i * 3 + k]) * 3
        const w = tracks.pointWeights[i * 3 + k]
        x += w * pos[v]; y += w * pos[v + 1]; z += w * pos[v + 2]
      }
      return [x, y, z] as const
    }
    /** Hand a correction to the three corners the point is mixed from. */
    const push = (i: number, cx: number, cy: number, cz: number) => {
      let share = 0
      for (let k = 0; k < 3; k++) {
        const w = tracks.pointWeights[i * 3 + k]
        share += w * w
      }
      if (share < 1e-9) return
      for (let k = 0; k < 3; k++) {
        const v = mesh.survivor(tracks.pointVerts[i * 3 + k]) * 3
        const w = tracks.pointWeights[i * 3 + k] / share
        pos[v] += cx * w; pos[v + 1] += cy * w; pos[v + 2] += cz * w
      }
    }
    for (let track = 0; track + 1 < tracks.offsets.length; track++) {
      if (!trackPulls[track]) continue
      const from = tracks.offsets[track]
      const to = tracks.offsets[track + 1]
      for (let i = from + 1; i + 1 < to; i++) {
        // Adjacent in the walk and all three still crust. A gap where the sea
        // floor has gone is not a corner, so nothing bridges one.
        if (tracks.ageMa[i - 1] < t || tracks.ageMa[i] < t || tracks.ageMa[i + 1] < t) continue
        const a = place(i - 1)
        const b = place(i)
        const c = place(i + 1)
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
        const vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2]
        const ul = length3(ux, uy, uz)
        const vl = length3(vx, vy, vz)
        if (ul < 1e-9 || vl < 1e-9) continue
        const cos = (ux * vx + uy * vy + uz * vz) / (ul * vl)
        if (cos >= allowance) continue
        // How far past the allowance, ramped so a corner just over it is barely
        // touched and a reversal gets the full stiffness.
        const excess = Math.min(1, (allowance - cos) / (allowance + 1))
        const w = CONFIG.trackStiffness * excess
        const dx = b[0] - 0.5 * (a[0] + c[0])
        const dy = b[1] - 0.5 * (a[1] + c[1])
        const dz = b[2] - 0.5 * (a[2] + c[2])
        push(i, -w * dx, -w * dy, -w * dz)
        push(i - 1, 0.5 * w * dx, 0.5 * w * dy, 0.5 * w * dz)
        push(i + 1, 0.5 * w * dx, 0.5 * w * dy, 0.5 * w * dz)
      }
    }
  }

  const endTimeMa = CONFIG.endMa ?? meta.endTimeMa
  let refusedTotal = 0
  let flippedTotal = 0
  let easedTotal = 0
  let foldedNow = 0
  for (let t = CONFIG.stepMa; t <= endTimeMa; t += CONFIG.stepMa) {
    const rPrev = radiusAt(t - CONFIG.stepMa)
    const rNext = radiusAt(t)
    previous.set(pos)

    const shrink = rNext / rPrev
    for (let i = 0; i < vertexCount * 3; i++) pos[i] *= shrink

    // Un-make the crust that had not been made yet.
    const closed = collapseVanished(mesh, faceAges, pos, t, restEdge)
    refusedTotal += closed.refused
    easedTotal += closed.eased
    settleCollapsed()

    driveByField(pos, mesh, flow, drift, vertexAge, t, CONFIG.stepMa)

    // What each edge is asked to measure, worked out once for the step rather
    // than once per sweep. Neither the rest lengths nor how far the crust has
    // been let out change while the sweeps run, so forty sweeps were asking the
    // same question forty times: a million square roots a step, and four
    // million divisions, for a hundred thousand distinct answers.
    for (let f = 0; f < faceCount; f++) {
      const stretched = stretchAt(f, t)
      restAreaNow[f] = restArea[f] / stretched
      const pull = Math.sqrt(stretched)
      edgeTarget[f * 3] = restEdge[f * 3] / pull
      edgeTarget[f * 3 + 1] = restEdge[f * 3 + 1] / pull
      edgeTarget[f * 3 + 2] = restEdge[f * 3 + 2] / pull
    }

    for (let sweep = 0; sweep < CONFIG.sweeps; sweep++) {
      const forward = sweep % 2 === 0
      for (let n = 0; n < faceCount; n++) {
        const f = forward ? n : faceCount - 1 - n
        if (!mesh.faceAlive[f]) continue
        const stiffness = stretchResist[f]
        if (stiffness === 0) continue
        for (let k = 0; k < 3; k++) {
          const i = mesh.faceVerts[f * 3 + k] * 3
          const j = mesh.faceVerts[f * 3 + ((k + 1) % 3)] * 3
          const target = edgeTarget[f * 3 + k]
          const dx = pos[i] - pos[j]
          const dy = pos[i + 1] - pos[j + 1]
          const dz = pos[i + 2] - pos[j + 2]
          const length = length3(dx, dy, dz)
          if (length < 1e-9) continue
          const c = (0.5 * stiffness * (length - target)) / length
          const cx = dx * c, cy = dy * c, cz = dz * c
          pos[i] -= cx; pos[i + 1] -= cy; pos[i + 2] -= cz
          pos[j] += cx; pos[j + 1] += cy; pos[j + 2] += cz
        }
      }
      closeConjugates(pos, t, rNext)
      straightenTracks(pos, t)
      unfold(
        pos, mesh.faceVerts, mesh.faceAlive, restAreaNow, faceCount, rNext,
        CONFIG.foldMargin,
      )
      relaxToSphere(pos, vertexCount, rNext, CONFIG.radialStiffness)
      holdIslands(
        pos, dirs, shape, islands.vertexIsland, islands.count, vertexCount, mesh.vertexAlive,
        rNext, islandFacing,
      )
    }
    relaxToSphere(pos, vertexCount, rNext, 1)
    foldedNow = unfold(
      pos, mesh.faceVerts, mesh.faceAlive, restAreaNow, faceCount, rNext, CONFIG.foldMargin,
    )
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
          `folded=${(100 * d.foldFraction).toFixed(2)}%  ` +
          `strain craton=${(100 * d.cratonStrain).toFixed(1)}% weak=${(100 * d.weakStrain).toFixed(1)}%  ` +
          `pairs=${String(d.conjugateCount).padStart(3)}` +
          ` med=${d.conjugateMedianKm.toFixed(0).padStart(4)}km` +
          ` hit=${(100 * d.conjugateMatched).toFixed(0).padStart(3)}%  ` +
          `plates=${String(plateReport.count).padStart(3)}` +
          ` (biggest ${plateReport.biggest.slice(0, 3).map((x) => `${(100 * x).toFixed(0)}%`).join(' ')})`,
      )
    }
  }
  console.log(
    `[solve] ${((Date.now() - started) / 1000).toFixed(1)}s; ` +
      `${foldedNow} triangles still being pushed back out at the last step, ` +
      `${vertexCount - mesh.liveVertices} of ${vertexCount} points closed away, ` +
      `${refusedTotal} collapses refused to keep the surface whole, ` +
      `${easedTotal} edges redrawn inside dying crust to let the closure carry on, ` +
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
    diagnostics[0].biggestBlockShare = diagnostics[1].biggestBlockShare
    diagnostics[0].forcingFraction = diagnostics[1].forcingFraction
    diagnostics[0].medianSpeedKmMyr = diagnostics[1].medianSpeedKmMyr
  }
  const plateBuffer = Buffer.concat(plates.map((p) => Buffer.from(p.buffer)))
  const topologyBuffer = Buffer.from(writeTopology(topologyDeltas))
  writeFileSync(resolve(OUT, 'topology.bin'), topologyBuffer)
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
        matchedFraction: matched.get(`${target.a}|${target.b}`) ?? [],
      })),
    } satisfies Meta),
  )
  // Both numbers, because they disagree and the disagreement is the point: the
  // closest approach can read zero on a pair that has only brushed at a corner,
  // which is what a fit measured as a distance rather than as a length of margin
  // has always been able to hide.
  console.log('[solve] fit scorecard:')
  for (const target of FIT_TARGETS) {
    const km = separation.get(`${target.a}|${target.b}`) ?? []
    const share = matched.get(`${target.a}|${target.b}`) ?? []
    const step = meta.frameStepMa
    // A watched pair has no time it should have met; read it at the end.
    const watched = target.joinedByMa === 0
    const when = watched ? endTimeMa : target.joinedByMa
    const i = Math.min(km.length - 1, Math.round(when / step))
    console.log(
      `  ${(target.a + ' - ' + target.b).padEnd(30)} ` +
        `at ${String(when).padStart(3)} Ma:  ${km[i].toFixed(0).padStart(5)} km apart,  ` +
        `${(100 * (share[i] ?? 0)).toFixed(0).padStart(3)}% of the shorter margin in contact  ` +
        `(best ${(100 * Math.max(...share)).toFixed(0)}% at ${share.indexOf(Math.max(...share)) * step} Ma)` +
        `${watched ? '   [watched, not scored]' : ''}`,
    )
  }
  console.log('[solve] where each continent ended up, against where it sits today:')
  for (const region of REGIONS) {
    const seen = track.get(region.id)
    if (!seen) continue
    const place = (p: number[]) => {
      const [u, w] = directionToUv(p[0], p[1], p[2])
      return [(w - 0.5) * 180, (u - 0.5) * 360] as const
    }
    const [lat0, lon0] = place(seen.first)
    const [lat1, lon1] = place(seen.last)
    console.log(
      `  ${region.label.padEnd(18)} ${lat0.toFixed(0).padStart(4)} deg  ${lon0.toFixed(0).padStart(5)} deg ` +
        `  ->  ${lat1.toFixed(0).padStart(4)} deg  ${lon1.toFixed(0).padStart(5)} deg `,
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
  if (mesh.drawnMisses) {
    console.log(
      `[solve] WARNING: ${mesh.drawnMisses} flips could not be named in the drawn `
        + 'triangulation, so some triangles are painted from the wrong crust. '
        + 'See drawnVerts in tools/lib/dynamic-mesh.ts.',
    )
  }
  console.log(
    `[solve] connectivity changed on ` +
      `${topologyDeltas.reduce((n, d) => n + d.faces.length, 0)} triangle-frames, ` +
      `${(topologyBuffer.length / 1e6).toFixed(1)} MB\n` +
    `[solve] wrote ${frames.length} frames ` +
      `(${(frameBuffer.byteLength / 1e6).toFixed(1)} MB + ${(strainBuffer.byteLength / 1e6).toFixed(1)} MB)`,
  )
}


/**
 * What each island's shape actually is, measured once.
 *
 * For every point: how far it lies from the middle of its island, in
 * kilometres along the surface, and which way. Those two numbers are the
 * island's shape, and they are what must not change.
 */
function islandShape(
  dirs: Float32Array, island: Int32Array, count: number, vertexCount: number, r0: number,
) {
  const centre = new Float64Array(count * 3)
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0) continue
    for (let k = 0; k < 3; k++) centre[c * 3 + k] += dirs[i * 3 + k]
  }
  for (let c = 0; c < count; c++) {
    const length = length3(centre[c * 3], centre[c * 3 + 1], centre[c * 3 + 2]) || 1
    for (let k = 0; k < 3; k++) centre[c * 3 + k] /= length
  }
  const arcKm = new Float64Array(vertexCount)
  const bearing = new Float64Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0) continue
    const cx = centre[c * 3], cy = centre[c * 3 + 1], cz = centre[c * 3 + 2]
    const dot = Math.min(1, Math.max(-1, dirs[i * 3] * cx + dirs[i * 3 + 1] * cy + dirs[i * 3 + 2] * cz))
    arcKm[i] = Math.acos(dot) * r0
    const tx = dirs[i * 3] - cx * dot, ty = dirs[i * 3 + 1] - cy * dot, tz = dirs[i * 3 + 2] - cz * dot
    const tl = length3(tx, ty, tz) || 1
    bearing[i * 3] = tx / tl; bearing[i * 3 + 1] = ty / tl; bearing[i * 3 + 2] = tz / tl
  }
  return { centre, arcKm, bearing }
}

/**
 * Put each island back where its own shape says it should be.
 *
 * The version before this fitted the best rigid placement of the island's
 * present-day shape and pulled towards that, which cannot work: a cap of the
 * present-day sphere does not lie on a smaller one at all, so the target was
 * always slightly off the surface and the projection back onto it undid the
 * hold. Shields were still deforming by five percent.
 *
 * Rebuilt from the shape instead. Only the island's placement is fitted -- one
 * rotation, three numbers -- and then every point is put at its own distance
 * from the middle, in kilometres, along its own bearing. Distances outwards
 * from the centre come out exactly right. What is left over is the tangential
 * stretch of laying a flat disc on a ball, which is Gauss's and not ours, and
 * it is spread evenly instead of piling up at one edge.
 */
function holdIslands(
  pos: Float64Array,
  dirs: Float32Array,
  shape: ReturnType<typeof islandShape>,
  island: Int32Array,
  count: number,
  vertexCount: number,
  alive: Uint8Array,
  radiusKm: number,
  /** The island's orientation carried forward between steps. */
  carried: Float64Array,
) {
  if (count === 0) return
  // Where the island is pointing now, refined from where it was pointing last
  // step rather than worked out afresh from today's map.
  //
  // The fit walks in small angles and refuses a step beyond about thirty
  // degrees, which is right for refining and useless for starting: an island
  // that has turned further than that since the present day gets no fit at all,
  // the rotation stays the identity, and the hold then drags it back towards
  // where it sits today. That is a spring tying every continent to its modern
  // position, and it showed: Africa walked two thousand four hundred kilometres
  // to end up twenty-one from where it started.
  const rotation = carried
  for (let pass = 0; pass < 3; pass++) {
    const m = new Float64Array(count * 6)
    const v = new Float64Array(count * 3)
    for (let i = 0; i < vertexCount; i++) {
      const c = island[i]
      if (c < 0 || !alive[i]) continue
      const r = c * 9
      const rx = dirs[i * 3], ry = dirs[i * 3 + 1], rz = dirs[i * 3 + 2]
      const qx = rotation[r] * rx + rotation[r + 1] * ry + rotation[r + 2] * rz
      const qy = rotation[r + 3] * rx + rotation[r + 4] * ry + rotation[r + 5] * rz
      const qz = rotation[r + 6] * rx + rotation[r + 7] * ry + rotation[r + 8] * rz
      const length = length3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) || 1
      const dx = pos[i * 3] / length - qx
      const dy = pos[i * 3 + 1] / length - qy
      const dz = pos[i * 3 + 2] / length - qz
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
      const angle = length3(omega[0], omega[1], omega[2])
      if (angle < 1e-12 || angle > 0.5) continue
      compose(rotation, c * 9, omega[0] / angle, omega[1] / angle, omega[2] / angle, angle)
    }
  }

  const hold = CONFIG.islandHold
  for (let i = 0; i < vertexCount; i++) {
    const c = island[i]
    if (c < 0 || !alive[i]) continue
    const r = c * 9
    const cx0 = shape.centre[c * 3], cy0 = shape.centre[c * 3 + 1], cz0 = shape.centre[c * 3 + 2]
    const bx0 = shape.bearing[i * 3], by0 = shape.bearing[i * 3 + 1], bz0 = shape.bearing[i * 3 + 2]
    const cx = rotation[r] * cx0 + rotation[r + 1] * cy0 + rotation[r + 2] * cz0
    const cy = rotation[r + 3] * cx0 + rotation[r + 4] * cy0 + rotation[r + 5] * cz0
    const cz = rotation[r + 6] * cx0 + rotation[r + 7] * cy0 + rotation[r + 8] * cz0
    const bx = rotation[r] * bx0 + rotation[r + 1] * by0 + rotation[r + 2] * bz0
    const by = rotation[r + 3] * bx0 + rotation[r + 4] * by0 + rotation[r + 5] * bz0
    const bz = rotation[r + 6] * bx0 + rotation[r + 7] * by0 + rotation[r + 8] * bz0
    // Same kilometres from the middle, which on a smaller sphere is a wider
    // angle: a rigid cap laid on a tighter ball reaches further round it.
    const theta = Math.min(Math.PI * 0.9, shape.arcKm[i] / radiusKm)
    const sin = Math.sin(theta), cos = Math.cos(theta)
    const tx = (cx * cos + bx * sin) * radiusKm
    const ty = (cy * cos + by * sin) * radiusKm
    const tz = (cz * cos + bz * sin) * radiusKm
    pos[i * 3] += hold * (tx - pos[i * 3])
    pos[i * 3 + 1] += hold * (ty - pos[i * 3 + 1])
    pos[i * 3 + 2] += hold * (tz - pos[i * 3 + 2])
  }
}

/**
 * How fast the crust is moving across the surface, km/Myr, at the median point.
 *
 * The number the block count has to be read against. Blocks are patches that
 * one rotation explains to within a few km/Myr, so when the crust slows below
 * that the finder cannot tell a rigid shell from a still one and reports a
 * single block turning at nearly nothing. That is what the run does past
 * 180 Ma, where the sea floor -- and so the forcing -- has run out.
 *
 * Radial motion is left out for the same reason findPlates leaves it out: the
 * sphere itself grows by eighty-odd kilometres between frames, more than the
 * continents travel, and none of that is crust moving over crust.
 */
function medianSpeed(
  pos: Float64Array,
  before: Float64Array,
  mesh: DynamicMesh,
  radiusKm: number,
  dtMa: number,
  vertexCount: number,
) {
  const speeds: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v]) continue
    const i = v * 3
    const now = length3(pos[i], pos[i + 1], pos[i + 2]) || 1
    const then = length3(before[i], before[i + 1], before[i + 2]) || 1
    const dot = Math.min(1, Math.max(-1,
      (pos[i] * before[i] + pos[i + 1] * before[i + 1] + pos[i + 2] * before[i + 2])
        / (now * then)))
    speeds.push((Math.acos(dot) * radiusKm) / dtMa)
  }
  if (!speeds.length) return 0
  speeds.sort((a, b) => a - b)
  return speeds[speeds.length >> 1]
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
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v]) continue
    const now = length3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
    const then = length3(before[v * 3], before[v * 3 + 1], before[v * 3 + 2]) || 1
    for (let c = 0; c < 3; c++) {
      const u = pos[v * 3 + c] / now
      velocity[v * 3 + c] = ((u - before[v * 3 + c] / then) * now) / dtMa
    }
  }

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
    return length3(
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
      spread += length3(
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
    const e1n = length3(e1[0], e1[1], e1[2]) || 1
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
/**
 * Push any triangle that has turned inside out back the right way round.
 *
 * The face springs only know edge lengths, and a triangle has exactly the same
 * three edge lengths as its own mirror image -- so folding one through an edge
 * costs the springs nothing, and once it is folded there is no force anywhere
 * in the model that unfolds it. That is a ratchet, and it was running: by
 * 200 Ma an eighth of the shell was lying inside out, and it never healed at
 * any step. A folded patch also cannot pass motion on, so the crust that
 * should have travelled piled up against it instead -- which is why the mesh
 * managed to be torn open across the South Atlantic and stacked twenty deep a
 * few hundred kilometres away at the same time.
 *
 * The measure is the signed volume of the tetrahedron from the centre of the
 * Earth out to the triangle, positive exactly when the corners still wind the
 * way the icosphere wound them. A triangle of area A sitting on a sphere of
 * radius r spans six times a volume of 2*A*r, so asking for a small fraction
 * of that keeps the barrier clear of zero, where a barrier is no use: at zero
 * the triangle is already flat and the gradient that would push it back has
 * gone with it.
 */
/**
 * How much of the live crust is lying inside out, by area.
 *
 * The sign of the tetrahedron from the centre of the Earth to the triangle,
 * which is what the area measure elsewhere throws away: solidAngle takes the
 * absolute value of its numerator, so a folded triangle reports a perfectly
 * healthy positive area and every strain figure in the run believed it.
 */
function foldedShare(
  pos: Float64Array, faceVerts: Int32Array, alive: Uint8Array,
  restAreaNow: Float64Array, faceCount: number,
) {
  let folded = 0
  let total = 0
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f]) continue
    const a = faceVerts[f * 3] * 3
    const b = faceVerts[f * 3 + 1] * 3
    const c = faceVerts[f * 3 + 2] * 3
    const gax = pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]
    const gay = pos[b + 2] * pos[c] - pos[b] * pos[c + 2]
    const gaz = pos[b] * pos[c + 1] - pos[b + 1] * pos[c]
    total += restAreaNow[f]
    if (pos[a] * gax + pos[a + 1] * gay + pos[a + 2] * gaz < 0) folded += restAreaNow[f]
  }
  return { foldFraction: total > 0 ? folded / total : 0 }
}

function unfold(
  pos: Float64Array,
  faceVerts: Int32Array,
  alive: Uint8Array,
  restAreaNow: Float64Array,
  faceCount: number,
  r: number,
  margin: number,
) {
  let caught = 0
  for (let f = 0; f < faceCount; f++) {
    if (!alive[f]) continue
    const a = faceVerts[f * 3] * 3
    const b = faceVerts[f * 3 + 1] * 3
    const c = faceVerts[f * 3 + 2] * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    // The determinant and its gradients at once: d(det)/da is b x c, and the
    // other two follow by rotating the three corners.
    const gax = by * cz - bz * cy, gay = bz * cx - bx * cz, gaz = bx * cy - by * cx
    const det = ax * gax + ay * gay + az * gaz
    const want = 2 * margin * restAreaNow[f] * r
    if (det >= want) continue
    const gbx = cy * az - cz * ay, gby = cz * ax - cx * az, gbz = cx * ay - cy * ax
    const gcx = ay * bz - az * by, gcy = az * bx - ax * bz, gcz = ax * by - ay * bx
    const norm =
      gax * gax + gay * gay + gaz * gaz +
      gbx * gbx + gby * gby + gbz * gbz +
      gcx * gcx + gcy * gcy + gcz * gcz
    if (norm < 1e-12) continue
    // One Newton step on the constraint, shared between the three corners in
    // proportion to how much each one can shift it. Deeply folded ground needs
    // several, which it gets: this runs once per sweep.
    const l = (want - det) / norm
    pos[a] += l * gax; pos[a + 1] += l * gay; pos[a + 2] += l * gaz
    pos[b] += l * gbx; pos[b + 1] += l * gby; pos[b + 2] += l * gbz
    pos[c] += l * gcx; pos[c + 1] += l * gcy; pos[c + 2] += l * gcz
    caught++
  }
  return caught
}

function relaxToSphere(pos: Float64Array, vertexCount: number, r: number, stiffness: number) {
  for (let i = 0; i < vertexCount; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const length = length3(x, y, z)
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
  const angle = length3(omega[0], omega[1], omega[2])
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
    const length = length3(x, y, z) || 1
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
    const d = length3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]) - r
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
    const radius = length3(pos[a], pos[a + 1], pos[a + 2]) || 1
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
    const length = length3(pos[i], pos[i + 1], pos[i + 2]) || 1
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
