/**
 * Where the bare sky is, and whose margin it is against.
 *
 * The coverage figure says *how much* of the sphere no surviving crust covers.
 * It has never said *where*, and a reader looking at 40 Ma could: enormous gaps
 * off South America. Three guesses at the cause were made and measured before
 * anyone thought to ask the data that question.
 *
 * A first attempt at this was abandoned mid-run because it named each miss by
 * walking every vertex -- a hundred and seventeen million comparisons a frame,
 * with the grid buckets that make it constant-time already sitting in
 * lib/coverage.ts. It uses them now: the crust's own points are bucketed by
 * two-degree cell once per frame, and a miss looks in its own cell and then
 * outwards until it finds one.
 *
 * The misses are then joined into blobs over the same grid, so the answer is
 * "one hole of four million square kilometres between South America and
 * Antarctica" rather than a percentage.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERMANENT_MA, REGIONS, sampleCurve, type Meta } from '../shared/model.js'
import { readChannel, readFrames } from '../shared/frames.js'
import { readTopology, applyTopology } from '../shared/topology.js'
import { bucketFace, cellBuckets, cellOf, inside, probeCells, probeDirections } from './lib/coverage.js'
import { directionToUv } from '../shared/sphere.js'
import { R0_KM } from '../shared/model.js'

/**
 * The solid angle a triangle covers, seen from the centre.
 *
 * Van Oosterom and Strackee, which needs no trigonometry beyond one arctangent
 * and stays accurate for the slivers a closing ridge leaves behind.
 */
function solid(
  pos: ArrayLike<number>, a: number, b: number, c: number,
): number {
  const la = Math.hypot(pos[a], pos[a + 1], pos[a + 2]) || 1
  const lb = Math.hypot(pos[b], pos[b + 1], pos[b + 2]) || 1
  const lc = Math.hypot(pos[c], pos[c + 1], pos[c + 2]) || 1
  const ax = pos[a] / la, ay = pos[a + 1] / la, az = pos[a + 2] / la
  const bx = pos[b] / lb, by = pos[b + 1] / lb, bz = pos[b + 2] / lb
  const cx = pos[c] / lc, cy = pos[c + 1] / lc, cz = pos[c + 2] / lc
  const num = Math.abs(ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx))
  const den = 1 + (ax * bx + ay * by + az * bz)
    + (bx * cx + by * cy + bz * cz) + (cx * ax + cy * ay + cz * az)
  return 2 * Math.atan2(num, den)
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')

/** The grid lib/coverage.ts buckets by; kept in step with it by hand. */
const ROWS = 90
const COLS = 180

function main() {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'meta.json'), 'utf8')) as Meta
  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const [vertexCount, faceCount] = new Uint32Array(mesh.buffer, mesh.byteOffset, 4)
  let off = mesh.byteOffset + 16
  const dirs = new Float32Array(mesh.buffer, off, vertexCount * 3)
  off += vertexCount * 12
  const indices = new Uint32Array(mesh.buffer, off, faceCount * 3)
  off += faceCount * 12
  const faceAges = new Float32Array(mesh.buffer, off, faceCount)

  const read = (name: string) => {
    const f = readFileSync(resolve(DATA, name))
    return f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer
  }
  const frames = readFrames(read('frames.bin'), vertexCount)
  // Through readChannel, not raw. sink.bin is stored as differences between
  // frames, so reading the bytes straight gives nearly all zeros -- every
  // point at the centre of the Earth, every triangle spanning ninety degrees,
  // and every one of them bucketed into all sixteen thousand grid cells. That
  // is not a slow measurement, it is a hung one.
  const sink = meta.folded ? readChannel(read('sink.bin'), vertexCount) : null
  const topology = readTopology(read('topology.bin'), faceCount)

  /** Which region each present-day point sits in, for naming a hole's edges. */
  const regionOf = new Int32Array(vertexCount).fill(-1)
  for (let v = 0; v < vertexCount; v++) {
    const [u, w] = directionToUv(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2])
    const lat = (w - 0.5) * 180
    const lon = (u - 0.5) * 360
    for (let i = 0; i < REGIONS.length; i++) {
      const b = REGIONS[i]
      if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) {
        regionOf[v] = i
        break
      }
    }
  }

  const radius = meta.crustModels.find((m) => m.id === meta.solvedModel)!.radiusKm
  const probes = probeDirections(Number(process.env.PROBES ?? 60000))
  const probeCount = probes.length / 3
  const cells = probeCells(probes)
  const buckets = cellBuckets()
  const working = new Int32Array(faceCount * 3)
  const live = new Uint32Array(faceCount * 3)
  const pos = new Float64Array(vertexCount * 3)
  const alive = new Uint8Array(faceCount)
  const unit = [0, 0, 0]
  const boundary: number[] = []
  const times = (process.env.AT ?? '20,40,80,120,160,200').split(',').map(Number)

  for (const timeMa of times) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    applyTopology(indices, topology, frame, working, live)
    const r = sampleCurve(radius, timeMa, meta.radiusStepMa)
    const base = frame * vertexCount * 3
    for (let v = 0; v < vertexCount; v++) {
      const deep = sink ? sink[frame * vertexCount + v] / 255 : 1
      for (let c = 0; c < 3; c++) pos[v * 3 + c] = (frames[base + v * 3 + c] / 32767) * deep
    }
    // Crust that exists here, on the triangulation this frame draws.
    for (let f = 0; f < faceCount; f++) {
      alive[f] = working[f * 3] >= 0 && faceAges[f] >= timeMa ? 1 : 0
    }
    const shell = { faceVerts: indices, faceAlive: alive }
    for (const list of buckets) list.length = 0
    for (let f = 0; f < faceCount; f++) if (alive[f]) bucketFace(pos, shell, f, buckets)

    // The crust's own points, bucketed the same way, for naming a miss.
    const nearby: number[][] = Array.from({ length: ROWS * COLS }, () => [])
    const isCrust = new Uint8Array(vertexCount)
    for (let f = 0; f < faceCount; f++) {
      if (!alive[f]) continue
      for (let k = 0; k < 3; k++) isCrust[indices[f * 3 + k]] = 1
    }
    for (let v = 0; v < vertexCount; v++) {
      if (!isCrust[v]) continue
      const l = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
      nearby[cellOf(pos[v * 3] / l, pos[v * 3 + 1] / l, pos[v * 3 + 2] / l)].push(v)
    }

    const missCells = new Map<number, number>()
    let missed = 0
    const named = new Map<string, number>()
    for (let p = 0; p < probeCount; p++) {
      const dx = probes[p * 3], dy = probes[p * 3 + 1], dz = probes[p * 3 + 2]
      let hit = false
      for (const f of buckets[cells[p]]) {
        const a = indices[f * 3] * 3, b = indices[f * 3 + 1] * 3, c = indices[f * 3 + 2] * 3
        if (inside(pos, a, b, c, dx, dy, dz, unit, boundary)) { hit = true; break }
      }
      if (hit) continue
      missed++
      missCells.set(cells[p], (missCells.get(cells[p]) ?? 0) + 1)
      // The nearest piece of crust that does exist, looked for outwards from
      // the miss's own cell rather than over the whole mesh.
      const row = Math.floor(cells[p] / COLS)
      const col = cells[p] % COLS
      let best = -1
      let bestDot = -2
      for (let ring = 0; ring <= 12 && best < 0; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
          const rr = row + dr
          if (rr < 0 || rr >= ROWS) continue
          for (let dc = -ring; dc <= ring; dc++) {
            if (ring > 0 && Math.abs(dr) !== ring && Math.abs(dc) !== ring) continue
            const cc = ((col + dc) % COLS + COLS) % COLS
            for (const v of nearby[rr * COLS + cc]) {
              const l = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
              const dot = (pos[v * 3] * dx + pos[v * 3 + 1] * dy + pos[v * 3 + 2] * dz) / l
              if (dot > bestDot) { bestDot = dot; best = v }
            }
          }
        }
      }
      const id = best >= 0 && regionOf[best] >= 0 ? REGIONS[regionOf[best]].label : 'open ocean'
      named.set(id, (named.get(id) ?? 0) + 1)
    }

    // Join the missing cells into holes, four-connected over the grid.
    const seen = new Set<number>()
    const holes: { probes: number; cells: number[] }[] = []
    for (const cell of missCells.keys()) {
      if (seen.has(cell)) continue
      const stack = [cell]
      seen.add(cell)
      const group: number[] = []
      let count = 0
      while (stack.length) {
        const at = stack.pop()!
        group.push(at)
        count += missCells.get(at) ?? 0
        const row = Math.floor(at / COLS)
        const col = at % COLS
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = row + dr
          if (rr < 0 || rr >= ROWS) continue
          const next = rr * COLS + ((col + dc) % COLS + COLS) % COLS
          if (!missCells.has(next) || seen.has(next)) continue
          seen.add(next)
          stack.push(next)
        }
      }
      holes.push({ probes: count, cells: group })
    }
    holes.sort((a, b) => b.probes - a.probes)

    // Where the area went.
    //
    // A reader looking at 43 Ma with the mesh on saw land crushed to a line --
    // a bright seam off Alaska, another through the Caribbean -- and asked
    // whether the crust being squeezed came to about the same as the gaps.
    // If it does, the two are one failure: the model is paying for a closure
    // it cannot make by flattening continent somewhere else.
    //
    // Rest area here is the triangle's area on today's Earth. The solver also
    // un-stretches rifted margins, which asks about a percent less of the
    // globe than this does, so the squeeze below is very slightly overstated.
    let squeezedLand = 0
    let squeezedSea = 0
    let stretched = 0
    let restTotal = 0
    let nowTotal = 0
    // How flat the flattest land gets, which is a different question from how
    // much area is lost in total: a broad eleven percent squeeze over every
    // continent and a few triangles crushed to a line come to the same
    // millions of square kilometres and look nothing alike. The bright seams a
    // reader can see are these.
    let landArea = 0
    let flatHalf = 0
    let flatFifth = 0
    let worstLand = 1
    for (let f = 0; f < faceCount; f++) {
      if (!alive[f]) continue
      const a3 = indices[f * 3] * 3, b3 = indices[f * 3 + 1] * 3, c3 = indices[f * 3 + 2] * 3
      const rest = solid(dirs, a3, b3, c3) * R0_KM * R0_KM
      const now = solid(pos, a3, b3, c3) * r * r
      restTotal += rest
      nowTotal += now
      if (faceAges[f] >= PERMANENT_MA) {
        landArea += rest
        const kept = rest > 0 ? now / rest : 1
        if (kept < 0.5) flatHalf += rest
        if (kept < 0.2) flatFifth += rest
        if (kept < worstLand) worstLand = kept
      }
      if (now < rest) {
        if (faceAges[f] >= PERMANENT_MA) squeezedLand += rest - now
        else squeezedSea += rest - now
      } else stretched += now - rest
    }

    const sphere = 4 * Math.PI * r * r
    const area = (n: number) => (n / probeCount) * sphere / 1e6
    console.log(
      `\n${timeMa} Ma  R=${r.toFixed(0)} km  ${(100 * missed / probeCount).toFixed(2)}% bare `
      + `= ${area(missed).toFixed(1)} million km2 in ${holes.length} hole(s)`,
    )
    console.log(
      '   against: '
      + [...named].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, n]) => `${k} ${(100 * n / missed).toFixed(0)}%`).join(', '),
    )
    console.log(
      `   area: crust wants ${(restTotal / 1e6).toFixed(1)} Mkm2, covers `
      + `${(nowTotal / 1e6).toFixed(1)}; squeezed out of continent `
      + `${(squeezedLand / 1e6).toFixed(1)}, out of sea floor `
      + `${(squeezedSea / 1e6).toFixed(1)}, stretched back in `
      + `${(stretched / 1e6).toFixed(1)}; bare ${area(missed).toFixed(1)}`,
    )
    console.log(
      `   land: ${(100 * flatHalf / (landArea || 1)).toFixed(2)}% of continent is under half `
      + `its own area, ${(100 * flatFifth / (landArea || 1)).toFixed(2)}% under a fifth; `
      + `the flattest triangle keeps ${(100 * worstLand).toFixed(1)}%`,
    )
    for (const hole of holes.slice(0, 5)) {
      // Where it is, as the mean direction of its cells, in the frame the
      // frames are stored in -- so read it against the globe, not a map.
      let x = 0, y = 0, z = 0
      for (const cell of hole.cells) {
        const row = Math.floor(cell / COLS) + 0.5
        const col = (cell % COLS) + 0.5
        const lat = (row / ROWS - 0.5) * Math.PI
        const lon = (col / COLS - 0.5) * 2 * Math.PI
        x += Math.cos(lat) * Math.cos(lon)
        y += Math.sin(lat)
        z += Math.cos(lat) * Math.sin(lon)
      }
      const l = Math.hypot(x, y, z) || 1
      const [u, w] = directionToUv(x / l, y / l, z / l)
      console.log(
        `     ${area(hole.probes).toFixed(1).padStart(6)} Mkm2  `
        + `${hole.cells.length} cells  centred ${((w - 0.5) * 180).toFixed(0)}, `
        + `${((u - 0.5) * 360).toFixed(0)}`,
      )
    }
  }
}

main()
