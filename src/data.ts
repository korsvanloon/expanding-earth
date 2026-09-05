import { R0_KM, sampleCurve, type Meta } from '@shared/model'
import {
  type TopologyDelta, applyTopology, readTopology,
} from '@shared/topology'
import type { InlineData } from '@/assets'
import { asset, inlineData } from '@/assets'
import { readTracks, type Tracks } from '@shared/tracks'
import { readChannel, readFrames } from '@shared/frames'

export interface Dataset {
  meta: Meta
  /**
   * Where the rest of this run's files are, or null if there are none to
   * fetch.
   *
   * The strain and the plate map arrive later, when something asks for them,
   * and they have to come from the same run as the frames -- a published run
   * keeps its own immutable folder in the store (see src/runs.ts), and the
   * explorer's run was solved in the browser and has no folder at all. The
   * empty string is this site's own data folder.
   */
  layerBase: string | null
  /**
   * Vertices in the cut mesh, read from mesh.bin rather than taken from the
   * metadata. The mesh file is the authority on its own shape: cutting the
   * shell into fragments duplicates vertices, so a count computed anywhere
   * earlier is a count of a different mesh.
   */
  vertexCount: number
  /** Present-day unit direction per vertex; the crust's identity, never moves. */
  dirs: Float32Array
  indices: Uint32Array
  /** When each vertex's crust came into existence, Ma. */
  vertexAge: Float32Array
  /** Reconstructed unit directions: frameCount x vertexCount x 3, quantised. */
  frames: Int16Array
  /**
   * Per-vertex strain, one byte per vertex per frame, once it has arrived.
   *
   * Fetched only when something wants it, because only the strain view mode
   * does and it is a megabyte over the wire. Until then the strain attribute
   * is filled with zeros, which the other five modes never read; when it lands
   * the buffers are re-sampled. Same reasoning as the fabric and zone rasters
   * in src/scene/Globe.tsx, which were already lazy for the same reason.
   */
  strain: Uint8Array | null
  /**
   * Which plate each vertex belonged to, one byte per vertex per frame.
   *
   * Measured rather than assumed, and different at every frame: a plate here is
   * a patch of the Earth whose points turned out to be moving as one rigid
   * body, found by fitting rotations to the answer. Nothing was declared a
   * plate before the run. See findPlates in tools/solve.ts.
   */
  plates: Uint8Array | null
  /** Which island of strong crust each vertex belongs to; 0 for none. */
  islands: Uint16Array
  /**
   * How the triangulation changes from one frame to the next.
   *
   * The mesh redraws itself as it goes: a collapse renames the corners of
   * every triangle round the point it swallows, and a flip swaps a diagonal.
   * mesh.bin holds the triangulation as it is today, which is where playback
   * ends, so every frame before it needs its own -- delivered as the change
   * since the frame before, since only a few thousand triangles move each time.
   */
  topology: TopologyDelta[]
  /**
   * The fracture zones, and the pairs of points that were once one point.
   *
   * Held as mesh vertex indices, so drawing a track at any time is reading
   * those vertices' positions in that frame -- the lines deform with the crust
   * because they *are* the crust. See shared/tracks.ts.
   */
  tracks?: Tracks
  /** How strongly the crust at each vertex resists deformation. */
  rigidity: Float32Array
  /** Crustal thickness in km at each vertex, from ECM1. */
  thickness: Float32Array
  /** Crustal type index at each vertex; see shared/crust.ts CRUST_TYPES. */
  crustType: Uint8Array
  /**
   * The vertical gravity gradient at each vertex, Eotvos, and how fast it
   * changes nearby, Eotvos per 100 km.
   *
   * The second is the useful one. It is a map of how worked the crust is --
   * flat over a platform, violent over an orogen or a fracture zone -- at a
   * tenth of a degree over land and sea alike, where the crustal classification
   * this model has been using is one name per square degree. See
   * tools/lib/structure.ts.
   */
  gravity: Float32Array
  gravityRoughness: Float32Array
  /**
   * How far inside the shell each point sits, per frame: 255 on the surface, 0
   * at the centre, one byte a point.
   *
   * Null unless the run folded its un-erupted crust inwards instead of
   * collapsing it away (tools/lib/fold.ts). The frames themselves carry unit
   * directions and nothing else, which is what makes them small; this is the
   * one radial thing the reconstruction has to say, so it travels beside them.
   */
  sink: Uint8Array | null
  radiusKm: number[]
}

/**
 * Walk the deltas up to `frame` and write the triangles that exist there.
 *
 * Wrapped rather than used directly so the viewer names the dataset it is
 * reading; the format itself lives in shared/topology.ts.
 */
export function buildIndex(
  data: Dataset, frame: number, working: Int32Array, out: Uint32Array,
): number {
  return applyTopology(data.indices, data.topology, frame, working, out)
}

/**
 * How far the load has got, and what is being waited for.
 *
 * The note is for the reader rather than the code: megabytes while they are
 * arriving, then what the wait turned into once they have.
 */
export type LoadProgress = (share: number, note: string) => void

export async function loadDataset(
  /**
   * Where the run's files are, or the empty string for this site's own data
   * folder. Runs published to the store each have their own; see src/runs.ts.
   */
  base = '',
  onProgress?: LoadProgress,
  /**
   * How big each file is unpacked, where that is known.
   *
   * A published run is stored gzipped and the browser unpacks it on the way
   * in, so the length the server declares counts different bytes than the ones
   * that arrive. The index knows the real sizes; without them the loader falls
   * back to the declared lengths, which is right for this site's own folder.
   */
  sizes?: Record<string, number>,
): Promise<Dataset> {
  const inline = inlineData()
  const parts = inline ? await inline : await fetchDataset(base, onProgress, sizes)
  // Unpacking sixteen megabytes of typed arrays holds the main thread for
  // long enough to be seen, and a loader that freezes on its last frame reads
  // as a page that has died. One turn of the event loop lets the note paint
  // before the work that it is about starts.
  onProgress?.(1, 'unpacking')
  await new Promise((wake) => setTimeout(wake))
  return buildDataset(parts, base)
}

/**
 * The same unpacking, over buffers from anywhere.
 *
 * Split out because the viewer now has a second run to draw: the explorer
 * solves a coarser mesh in a worker and hands back the same set of buffers,
 * and a second way of turning them into a dataset would be a second thing to
 * keep right. See src/explore.ts.
 */
export function buildDataset(
  { meta, mesh, frames, strain, plates, topology, tracks, sink }: InlineData,
  /** See Dataset.layerBase; null for a run that was solved in the browser. */
  layerBase: string | null = '',
): Dataset {

  const [vertexCount, faceCount, , cutPairCount] = new Uint32Array(mesh, 0, 4)
  let offset = 16
  const dirs = new Float32Array(mesh, offset, vertexCount * 3)
  offset += vertexCount * 3 * 4
  const indices = new Uint32Array(mesh, offset, faceCount * 3)
  offset += faceCount * 3 * 4
  const faceAges = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  const rigidity = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  const faceThickness = new Float32Array(mesh, offset, faceCount)
  offset += faceCount * 4
  // Already per vertex: the gravity grid is ten times finer than a triangle, so
  // it was sampled at the points rather than averaged over the faces.
  const gravityFabric = new Float32Array(mesh, offset, vertexCount)
  offset += vertexCount * 4
  const gravityRoughness = new Float32Array(mesh, offset, vertexCount)
  offset += vertexCount * 4
  offset += vertexCount * 4 // origin vertex, needed only by the solver
  offset += cutPairCount * 8 // fracture constraints, needed only by the solver
  offset += faceCount * 2 // per-face fragment, unused
  // Which island of strong crust each vertex belongs to, 0 for none. These are
  // an input to the reconstruction rather than a reading of it: the shields,
  // platforms and stable basins that are held to their own shape while
  // everything between them is free.
  const vertexIsland = new Uint16Array(mesh, offset, vertexCount)
  offset += vertexCount * 2
  const faceCrustType = new Uint8Array(mesh, offset, faceCount)

  // A vertex exists as long as any triangle around it does, so it takes the
  // oldest age of its neighbours. Interpolating this across a triangle gives a
  // soft edge where new crust appears, which reads better than a hard sawtooth.
  const vertexAge = new Float32Array(vertexCount)
  const vertexRigidity = new Float32Array(vertexCount)
  const vertexThickness = new Float32Array(vertexCount)
  // A vertex takes the weakest crust it touches: a fault runs through the weak
  // side of a contact, not the strong one.
  const vertexType = new Uint8Array(vertexCount)
  const weakest = new Float32Array(vertexCount).fill(Infinity)
  const share = new Float32Array(vertexCount)
  for (let f = 0; f < faceCount; f++) {
    const age = faceAges[f]
    for (let k = 0; k < 3; k++) {
      const v = indices[f * 3 + k]
      if (age > vertexAge[v]) vertexAge[v] = age
      vertexRigidity[v] += rigidity[f]
      vertexThickness[v] += faceThickness[f]
      if (rigidity[f] < weakest[v]) {
        weakest[v] = rigidity[f]
        vertexType[v] = faceCrustType[f]
      }
      share[v]++
    }
  }
  for (let v = 0; v < vertexCount; v++) {
    if (!share[v]) continue
    vertexRigidity[v] /= share[v]
    vertexThickness[v] /= share[v]
  }

  return {
    meta,
    vertexCount,
    dirs,
    indices,
    vertexAge,
    frames: readFrames(frames, vertexCount),
    strain: strain ? new Uint8Array(strain) : null,
    plates: plates ? new Uint8Array(plates) : null,
    islands: vertexIsland,
    topology: readTopology(topology, faceCount),
    rigidity: vertexRigidity,
    thickness: vertexThickness,
    crustType: vertexType,
    gravity: gravityFabric,
    gravityRoughness,
    layerBase,
    sink: sink ? readChannel(sink, vertexCount) : null,
    tracks: tracks ? readTracks(tracks) : undefined,
    radiusKm: meta.crustModels[0].radiusKm,
  }
}

/**
 * Roughly what share of the download each file is, at subdivision 6.
 *
 * These decide how fast the bar moves while a file is on its way, nothing
 * else: the moment the server declares a length that file's own share is
 * measured rather than guessed. A stale guess costs a bar that hurries in one
 * place and dawdles in another, never a wrong answer.
 */
const SHARES: Record<string, number> = {
  'data/meta.json': 0.9,
  'data/mesh.bin': 3.4,
  'data/frames.bin': 10,
  'data/topology.bin': 0.2,
  'data/tracks.bin': 1.4,
  'data/sink.bin': 1.7,
}

/**
 * The download, counted as it arrives.
 *
 * Sixteen megabytes have to be in hand before the first frame can be drawn,
 * two thirds of it frames.bin, so a loader that counted files would sit still
 * through most of the wait. Each response is read chunk by chunk instead, and
 * a file's share of the bar advances with its own bytes against the length the
 * server declared. Servers that declare none -- or that declare a compressed
 * length, which counts different bytes than the stream hands back -- fall back
 * to that file's weight arriving whole when it lands.
 */
function counted(
  base: string, paths: string[], onProgress?: LoadProgress, sizes?: Record<string, number>,
) {
  const expected = new Map<string, number>()
  const got = new Map<string, number>()
  const whole = new Set<string>()
  const weight = (path: string) => SHARES[path] ?? 1
  const total = () => paths.reduce((sum, path) => sum + weight(path), 0)

  const report = () => {
    if (!onProgress) return
    let done = 0
    let bytes = 0
    let wanted = 0
    // Only worth naming a total once every file has said how big it is;
    // before that a total would be a total of the ones that have answered.
    let allDeclared = true
    for (const path of paths) {
      const size = got.get(path) ?? 0
      const length = expected.get(path) ?? (whole.has(path) ? size : 0)
      bytes += size
      wanted += length
      if (length === 0 && !whole.has(path)) allDeclared = false
      done += weight(path) * (whole.has(path) ? 1 : length > 0 ? Math.min(1, size / length) : 0)
    }
    const far = `${(bytes / 1e6).toFixed(1)}`
    onProgress(
      Math.min(0.99, done / total()),
      allDeclared ? `${far} of ${(wanted / 1e6).toFixed(1)} MB` : `${far} MB`,
    )
  }

  /** Marks a file as needing no fetching at all, so the bar does not wait on it. */
  const skip = (path: string) => { whole.add(path); report() }

  const read = async (path: string, optional = false) => {
    // A published run's folder is immutable, so its files need no fingerprint
    // on the end and want the plain path; this site's own folder is rewritten
    // in place by every build and needs one. See src/runs.ts.
    const response = await fetch(base ? `${base}/${path.replace('data/', '')}` : asset(path))
    if (!response.ok) {
      if (optional) { skip(path); return undefined }
      throw new Error(`${path} is not there (${response.status})`)
    }
    // What the index says, where it says anything: a gzipped file arrives
    // unpacked and the declared length counts the packed bytes, so believing
    // the header would run the bar past its own end.
    const known = sizes?.[path.replace('data/', '')]
    const declared = known ?? Number(response.headers.get('content-length') ?? 0)
    if (declared > 0) expected.set(path, declared)
    const body = response.body
    if (!body) {
      const all = await response.arrayBuffer()
      got.set(path, all.byteLength)
      skip(path)
      return all
    }
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
      got.set(path, size)
      report()
    }
    const all = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) { all.set(chunk, at); at += chunk.length }
    skip(path)
    return all.buffer
  }
  return { read, skip }
}

async function fetchDataset(
  base: string, onProgress?: LoadProgress, sizes?: Record<string, number>,
): Promise<InlineData> {
  // Everything the globe cannot be drawn without, and nothing else. The strain
  // and the plate map belong to one view mode and one right-click, and between
  // them they were a third of the wait.
  const wanted = [
    'data/meta.json', 'data/mesh.bin', 'data/frames.bin',
    'data/topology.bin', 'data/tracks.bin', 'data/sink.bin',
  ]
  const { read, skip } = counted(base, wanted, onProgress, sizes)
  // All five asked for at once; the metadata is only awaited first because the
  // sixth file depends on what it says.
  const text = read('data/meta.json')
  const rest = [
    read('data/mesh.bin'),
    read('data/frames.bin'),
    read('data/topology.bin'),
    read('data/tracks.bin', true),
  ] as const
  const meta = JSON.parse(new TextDecoder().decode(await text!)) as Meta
  // The sink is part of the geometry, so it has to be in hand before the first
  // frame is drawn rather than fetched behind it -- but it is only asked for
  // when the run that produced this data folded, which the metadata has just
  // told us. Started here rather than after the rest have landed, so that it
  // arrives alongside them and the loader learns its length early.
  const sinking = meta.folded ? read('data/sink.bin', true) : undefined
  if (!sinking) skip('data/sink.bin')
  const [mesh, frames, topology, tracks] = await Promise.all(rest)
  return { meta, mesh: mesh!, frames: frames!, topology: topology!, tracks, sink: await sinking }
}

/**
 * Fetch one of the per-frame byte maps that only one part of the viewer wants.
 *
 * Resolves to null if it cannot be had, because neither of them is worth a
 * broken globe: without the strain the strain mode is flat, and without the
 * plate map a right-click says nothing about blocks.
 */
export async function fetchLayer(
  base: string, name: 'strain' | 'plates',
): Promise<Uint8Array | null> {
  try {
    const response = await fetch(base ? `${base}/${name}.bin` : asset(`data/${name}.bin`))
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

export const radiusAt = (data: Dataset, timeMa: number) =>
  sampleCurve(data.radiusKm, timeMa, data.meta.radiusStepMa)

/**
 * Write the reconstruction at `timeMa` into the render buffers.
 *
 * Keyframes are 5 Myr apart, so we interpolate. Directions are normalised after
 * mixing rather than mixed as points: on a sphere the straight line between two
 * positions cuts under the surface, and over a 5 Myr step that shows up as a
 * visible dent. Radius is applied afterwards, scaled so that today's Earth is
 * one unit and the growth is what you see.
 */
export function sampleFrame(
  data: Dataset,
  timeMa: number,
  positions: Float32Array,
  strain: Float32Array,
  /** Per-frame 3x3 rotations that hold one continent still; see src/frames.ts. */
  reference?: Float32Array,
) {
  const { meta, frames, vertexCount } = data
  const x = Math.min(Math.max(timeMa / meta.frameStepMa, 0), meta.frameCount - 1)
  const i0 = Math.min(Math.floor(x), meta.frameCount - 1)
  const i1 = Math.min(i0 + 1, meta.frameCount - 1)
  const f = x - i0
  const radius = radiusAt(data, timeMa) / R0_KM

  const a = i0 * vertexCount * 3
  const b = i1 * vertexCount * 3
  const sa = i0 * vertexCount
  const sb = i1 * vertexCount
  const k = 1 / 32767

  for (let i = 0; i < vertexCount; i++) {
    const j = i * 3
    const ax = frames[a + j] * k, ay = frames[a + j + 1] * k, az = frames[a + j + 2] * k
    const bx = frames[b + j] * k, by = frames[b + j + 1] * k, bz = frames[b + j + 2] * k
    // Each keyframe is rotated into the reference frame before they are mixed;
    // rotating the blend instead would swing the globe on the way through.
    let pax = ax, pay = ay, paz = az, pbx = bx, pby = by, pbz = bz
    if (reference) {
      const ra = i0 * 9
      const rb = i1 * 9
      pax = reference[ra] * ax + reference[ra + 1] * ay + reference[ra + 2] * az
      pay = reference[ra + 3] * ax + reference[ra + 4] * ay + reference[ra + 5] * az
      paz = reference[ra + 6] * ax + reference[ra + 7] * ay + reference[ra + 8] * az
      pbx = reference[rb] * bx + reference[rb + 1] * by + reference[rb + 2] * bz
      pby = reference[rb + 3] * bx + reference[rb + 4] * by + reference[rb + 5] * bz
      pbz = reference[rb + 6] * bx + reference[rb + 7] * by + reference[rb + 8] * bz
    }
    const vx = pax + (pbx - pax) * f
    const vy = pay + (pby - pay) * f
    const vz = paz + (pbz - paz) * f
    const length = Math.hypot(vx, vy, vz) || 1
    // Crust that had not erupted yet hangs inside the shell rather than being
    // deleted, so a point is a direction times however much of the radius it
    // has left. Blended between keyframes like everything else; the two are
    // never more than a step apart, so a straight blend of the depths is right.
    const deep = data.sink
      ? (data.sink[sa + i] + (data.sink[sb + i] - data.sink[sa + i]) * f) / 255
      : 1
    const s = (radius * deep) / length
    positions[j] = vx * s
    positions[j + 1] = vy * s
    positions[j + 2] = vz * s
    if (!data.strain) {
      strain[i] = 0
      continue
    }
    const s0 = data.strain[sa + i]
    const s1 = data.strain[sb + i]
    strain[i] = ((s0 + (s1 - s0) * f) / 127.5 - 1) * 0.2
  }
}
