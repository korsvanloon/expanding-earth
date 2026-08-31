import { describe, expect, it } from 'vitest'
import { buildIcosphere, sphericalTriangleArea } from '../tools/lib/icosphere'
import { DynamicMesh, collapseVanished, retriangulate } from '../tools/lib/dynamic-mesh'
import {
  applyTopology, readTopology, topologyDelta, writeTopology,
} from '../shared/topology'
import { crustScale, sampleCurve, MIN_SCALE, TAU_MA } from '../shared/model'
import { directionToUv, lonLatToDirection } from '../shared/sphere'
import { loadRaster } from '../tools/lib/raster'
import { resolve } from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'

describe('icosphere', () => {
  it('has the Euler-characteristic vertex count at each subdivision', () => {
    // A geodesic sphere has 10 * 4^n + 2 vertices. Getting fewer means midpoints
    // were shared that should not have been; getting more means the midpoint
    // cache missed, which is the bug that made an early version place vertices
    // at the wrong positions.
    for (let n = 0; n <= 4; n++) {
      const { positions, indices } = buildIcosphere(n)
      expect(positions.length / 3).toBe(10 * 4 ** n + 2)
      expect(indices.length / 3).toBe(20 * 4 ** n)
    }
  })

  it('puts every vertex on the unit sphere', () => {
    const { positions } = buildIcosphere(3)
    for (let i = 0; i < positions.length; i += 3) {
      expect(Math.hypot(positions[i], positions[i + 1], positions[i + 2])).toBeCloseTo(1, 12)
    }
  })

  it('tiles the whole sphere, so the area budget is trustworthy', () => {
    const { positions, indices } = buildIcosphere(4)
    let total = 0
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f] * 3
      const b = indices[f + 1] * 3
      const c = indices[f + 2] * 3
      total += sphericalTriangleArea(
        positions[a], positions[a + 1], positions[a + 2],
        positions[b], positions[b + 1], positions[b + 2],
        positions[c], positions[c + 1], positions[c + 2],
      )
    }
    expect(total).toBeCloseTo(4 * Math.PI, 6)
  })
})

describe('crustScale', () => {
  it('keeps crust at full size while it exists', () => {
    expect(crustScale(50, 0)).toBe(1)
    expect(crustScale(50, 50)).toBe(1)
  })

  it('fades crust out over TAU_MA once it is un-created', () => {
    expect(crustScale(50, 50 + TAU_MA / 2)).toBeCloseTo(0.5, 10)
    expect(crustScale(50, 50 + TAU_MA)).toBe(MIN_SCALE)
    expect(crustScale(50, 200)).toBe(MIN_SCALE)
  })
})

describe('sampleCurve', () => {
  const curve = [10, 20, 30]

  it('interpolates between samples', () => {
    expect(sampleCurve(curve, 0, 1)).toBe(10)
    expect(sampleCurve(curve, 0.5, 1)).toBe(15)
    expect(sampleCurve(curve, 2, 1)).toBe(30)
  })

  it('clamps outside the sampled range rather than extrapolating', () => {
    expect(sampleCurve(curve, -5, 1)).toBe(10)
    expect(sampleCurve(curve, 99, 1)).toBe(30)
  })
})

describe('sphere mapping', () => {
  it('round-trips longitude and latitude through a direction', () => {
    for (const [lon, lat] of [[0, 0], [1.2, 0.4], [-2.5, -0.9], [3.0, 1.4]]) {
      const [x, y, z] = lonLatToDirection(lon, lat)
      const [u, v] = directionToUv(x, y, z)
      expect(((u - 0.5) * 2 * Math.PI + 3 * Math.PI) % (2 * Math.PI)).toBeCloseTo(
        (lon + 3 * Math.PI) % (2 * Math.PI),
        10,
      )
      expect((v - 0.5) * Math.PI).toBeCloseTo(lat, 10)
    }
  })

  it('puts the north pole at the top of the map', () => {
    expect(directionToUv(0, 1, 0)[1]).toBeCloseTo(1, 12)
    expect(directionToUv(0, -1, 0)[1]).toBeCloseTo(0, 12)
  })

  it('runs east to the right when the globe is seen from outside', () => {
    // A mirrored mapping is perfectly self-consistent -- the pipeline and the
    // shader agree, every continent lands on continental crust -- and the only
    // symptom is that the world is inside out. This pins the handedness down.
    const lat = 0.3
    const lon = 1.1
    const here = lonLatToDirection(lon, lat)
    const east = lonLatToDirection(lon + 1e-4, lat)
    const toEast = east.map((v, i) => v - here[i])

    // Screen-right for a camera outside the sphere looking at this point, north up.
    const up: [number, number, number] = [0, 1, 0]
    const forward = here.map((v) => -v)
    const right = [
      forward[1] * up[2] - forward[2] * up[1],
      forward[2] * up[0] - forward[0] * up[2],
      forward[0] * up[1] - forward[1] * up[0],
    ]
    const alignment = right.reduce((sum, v, i) => sum + v * toEast[i], 0)
    expect(alignment).toBeGreaterThan(0)
  })

  it('finds real geography where it belongs in the age grid', () => {
    // End-to-end against the actual dataset. The landmarks are chosen so that
    // their mirror images are the opposite kind of crust -- central Australia
    // reflects into the South Pacific, the Amazon into the Indian Ocean -- so a
    // flipped mapping fails here rather than quietly agreeing with itself.
    // (Much of the world is no good for this: reflect India and you land on
    // Cuba, reflect the Sahara and you land in Mauritania.)
    const age = loadRaster(resolve(import.meta.dirname, '../public/textures/age-map.png'))
    const at = (latDeg: number, lonDeg: number) =>
      age.atDirection(...lonLatToDirection((lonDeg * Math.PI) / 180, (latDeg * Math.PI) / 180))

    expect(at(-25, 133)).toBe(255) // central Australia, continental
    expect(at(-25, -133)).toBeLessThan(255) // its mirror, the South Pacific
    expect(at(-10, -55)).toBe(255) // Amazon basin, continental
    expect(at(-10, 55)).toBeLessThan(255) // its mirror, the Indian Ocean
    expect(at(-80, 0)).toBe(255) // Antarctica, so north and south are not swapped
    expect(at(0, -25)).toBeLessThan(20) // Mid-Atlantic Ridge, young crust
  })
})

describe('the built dataset', () => {
  // The mesh file is the authority on its own shape, and everything the viewer
  // reads is sized by it: the frames are frameCount x vertexCount x 3, the
  // strain frameCount x vertexCount. Cutting the shell into fragments
  // duplicates vertices along every fracture, so a vertex count taken before
  // the cut describes a different mesh -- and reading the frames with that
  // stride tore the globe open along the cuts and scrambled it further back in
  // time. These three files have to agree or nothing downstream can be right.
  const data = resolve(import.meta.dirname, '../public/data')
  const present = existsSync(resolve(data, 'mesh.bin'))

  it.runIf(present)('is internally consistent about how many vertices it has', () => {
    const mesh = readFileSync(resolve(data, 'mesh.bin'))
    const meta = JSON.parse(readFileSync(resolve(data, 'meta.json'), 'utf8'))
    const vertexCount = mesh.readUInt32LE(0)
    const faceCount = mesh.readUInt32LE(4)

    expect(meta.vertexCount).toBe(vertexCount)
    expect(meta.faceCount).toBe(faceCount)
    expect(statSync(resolve(data, 'frames.bin')).size).toBe(meta.frameCount * vertexCount * 3 * 2)
    expect(statSync(resolve(data, 'strain.bin')).size).toBe(meta.frameCount * vertexCount)
  })
})

describe('the collapsing mesh', () => {
  // Dynamic topology is the nasty kind of code: a collapse that pinches the
  // surface leaves something that still looks like a mesh and quietly makes
  // every area the diagnostics measure meaningless. These pin down the two
  // things that must never stop being true.
  const build = (subdivision: number) => {
    const { positions, indices } = buildIcosphere(subdivision)
    const mesh = new DynamicMesh(positions.length / 3, indices.length / 3, indices)
    return { mesh, pos: Float64Array.from(positions) }
  }

  it('is a sphere before anything is collapsed', () => {
    const { mesh } = build(3)
    expect(mesh.eulerCharacteristic()).toBe(2)
  })

  // The flip test used to ask whether two points were already joined by
  // building the whole ring of one of them and looking in it, which allocated a
  // set of six entries a hundred thousand times a pass. `adjacent` answers the
  // same question by scanning, and the run is only unchanged if it answers it
  // identically -- including for the pairs that are not joined, which is most
  // of them.
  it('answers adjacency exactly as the ring does', () => {
    const { mesh } = build(2)
    const ring = new Set<number>()
    for (let u = 0; u < mesh.vertexCount; u++) {
      mesh.ring(u, ring)
      for (let v = 0; v < mesh.vertexCount; v++) {
        expect(mesh.adjacent(u, v)).toBe(ring.has(v))
      }
    }
    // A point is in no one's ring, its own included, so this is not vacuous.
    expect(ring.size).toBeGreaterThan(0)
    expect(mesh.adjacent(0, 0)).toBe(false)
  })

  it('finds the corner of a triangle that an edge does not name', () => {
    const { mesh } = build(2)
    for (let f = 0; f < mesh.faceCount; f++) {
      const [a, b, c] = [0, 1, 2].map((k) => mesh.faceVerts[f * 3 + k])
      expect(mesh.cornerOpposite(f, a, b)).toBe(c)
      expect(mesh.cornerOpposite(f, b, c)).toBe(a)
      expect(mesh.cornerOpposite(f, c, a)).toBe(b)
      // A triangle has no fourth corner to offer.
      expect(mesh.cornerOpposite(f, a, -1)).toBe(b)
    }
  })

  it('stays a sphere however much is collapsed away', () => {
    const { mesh, pos } = build(3)
    const faceCount = mesh.faceCount
    // Ages that make a band of the sphere vanish first, the way a ridge does.
    const age = new Float32Array(faceCount)
    for (let f = 0; f < faceCount; f++) {
      let y = 0
      for (let k = 0; k < 3; k++) y += pos[mesh.faceVerts[f * 3 + k] * 3 + 1]
      age[f] = Math.abs(y / 3) * 200
    }
    for (const t of [20, 60, 100, 140, 180]) {
      collapseVanished(mesh, age, pos, t, restOf(mesh, pos))
      expect(mesh.eulerCharacteristic()).toBe(2)
      expect(mesh.liveFaces).toBe(2 * mesh.liveVertices - 4)
    }
    expect(mesh.liveVertices).toBeLessThan(mesh.vertexCount)
  })

  it('never loses crust that still exists', () => {
    const { mesh, pos } = build(3)
    const age = new Float32Array(mesh.faceCount)
    for (let f = 0; f < mesh.faceCount; f++) age[f] = f % 3 === 0 ? 1e9 : 10
    collapseVanished(mesh, age, pos, 100, restOf(mesh, pos))
    for (let f = 0; f < mesh.faceCount; f++) {
      if (age[f] >= 1e9) expect(mesh.faceAlive[f]).toBe(1)
    }
  })

  it('leads every collapsed vertex to a survivor', () => {
    const { mesh, pos } = build(2)
    const age = new Float32Array(mesh.faceCount).fill(10)
    collapseVanished(mesh, age, pos, 100, restOf(mesh, pos))
    for (let v = 0; v < mesh.vertexCount; v++) {
      expect(mesh.vertexAlive[mesh.survivor(v)]).toBe(1)
    }
  })
})

/** Present edge lengths as rest lengths, which is what they are at t = 0. */
function restOf(mesh: DynamicMesh, pos: Float64Array) {
  const rest = new Float64Array(mesh.faceCount * 3)
  for (let f = 0; f < mesh.faceCount; f++) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.faceVerts[f * 3 + k] * 3
      const b = mesh.faceVerts[f * 3 + ((k + 1) % 3)] * 3
      rest[f * 3 + k] = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
    }
  }
  return rest
}

describe('redrawing edges', () => {
  it('keeps the mesh a sphere and never loses a triangle', () => {
    const { positions, indices } = buildIcosphere(3)
    const mesh = new DynamicMesh(positions.length / 3, indices.length / 3, indices)
    const pos = Float64Array.from(positions)
    const faceCount = mesh.faceCount
    const restEdge = new Float64Array(faceCount * 3)
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const a = indices[f * 3 + k] * 3
        const b = indices[f * 3 + ((k + 1) % 3)] * 3
        restEdge[f * 3 + k] = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
      }
    }
    // Squash one hemisphere sideways, which is what leaves slivers behind.
    for (let v = 0; v < mesh.vertexCount; v++) {
      if (pos[v * 3 + 1] < 0) continue
      pos[v * 3] *= 0.35
      const length = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) || 1
      for (let c = 0; c < 3; c++) pos[v * 3 + c] /= length
    }
    const flipped = retriangulate(mesh, pos, restEdge, 6)
    expect(flipped).toBeGreaterThan(0)
    expect(mesh.eulerCharacteristic()).toBe(2)
    expect(mesh.liveFaces).toBe(indices.length / 3)
    // No triangle may be left with a repeated corner.
    for (let f = 0; f < faceCount; f++) {
      const [a, b, c] = [mesh.faceVerts[f * 3], mesh.faceVerts[f * 3 + 1], mesh.faceVerts[f * 3 + 2]]
      expect(new Set([a, b, c]).size).toBe(3)
    }
  })
})

describe('carrying the triangulation with the frames', () => {
  /**
   * The bug this guards against is not subtle once you can see it, and it was
   * invisible for a long time: the solver's mesh redraws itself as it runs, and
   * the viewer was reading the index array written before the run started. A
   * stale mixture of two triangulations is not a triangulation, and it showed
   * up as folded crust and as single triangles stretched across the Pacific.
   */
  it('replays to exactly the triangulation the solver had', () => {
    const { positions, indices } = buildIcosphere(3)
    const pos = new Float64Array(positions)
    const mesh = new DynamicMesh(positions.length / 3, indices.length / 3, indices)
    const rest = restOf(mesh, pos)
    const age = new Float32Array(mesh.faceCount)
    for (let f = 0; f < mesh.faceCount; f++) {
      let y = 0
      for (let k = 0; k < 3; k++) y += pos[mesh.faceVerts[f * 3 + k] * 3 + 1]
      age[f] = Math.abs(y / 3) * 200
    }

    const drawn = Uint16Array.from(indices)
    const deltas = []
    const frames: { verts: Int32Array; alive: Uint8Array }[] = []
    for (const t of [0, 40, 80, 120, 160, 200]) {
      collapseVanished(mesh, age, pos, t, rest)
      retriangulate(mesh, pos, rest, 3)
      deltas.push(topologyDelta(drawn, mesh.faceVerts, mesh.faceCount, mesh.faceAlive))
      frames.push({ verts: Int32Array.from(mesh.faceVerts), alive: Uint8Array.from(mesh.faceAlive) })
    }

    // Round-tripped through the file format, not just held in memory: the
    // encoding is where a per-face index silently becomes a per-vertex one.
    const bytes = writeTopology(deltas)
    const reread = readTopology(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      mesh.faceCount,
    )
    expect(reread.length).toBe(deltas.length)

    const working = new Int32Array(indices.length)
    const out = new Uint32Array(indices.length)
    for (const [i, frame] of frames.entries()) {
      const count = applyTopology(indices, reread, i, working, out)
      const wanted: number[] = []
      for (let f = 0; f < mesh.faceCount; f++) {
        if (!frame.alive[f]) continue
        wanted.push(frame.verts[f * 3], frame.verts[f * 3 + 1], frame.verts[f * 3 + 2])
      }
      expect(count).toBe(wanted.length)
      expect([...out.subarray(0, count)]).toEqual(wanted)
    }
  })

  it('draws a closed surface at every frame it replays', () => {
    const { positions, indices } = buildIcosphere(3)
    const pos = new Float64Array(positions)
    const mesh = new DynamicMesh(positions.length / 3, indices.length / 3, indices)
    const rest = restOf(mesh, pos)
    const age = new Float32Array(mesh.faceCount)
    for (let f = 0; f < mesh.faceCount; f++) age[f] = (f % 40) * 5

    const drawn = Uint16Array.from(indices)
    const deltas = []
    for (const t of [0, 50, 100, 150, 200]) {
      collapseVanished(mesh, age, pos, t, rest)
      deltas.push(topologyDelta(drawn, mesh.faceVerts, mesh.faceCount, mesh.faceAlive))
    }
    const working = new Int32Array(indices.length)
    const out = new Uint32Array(indices.length)
    for (let i = 0; i < deltas.length; i++) {
      const count = applyTopology(indices, deltas, i, working, out)
      // Every triangle drawn has three different corners, and every edge is
      // shared by exactly two of them. That is what makes it a surface, and it
      // is exactly what the stale index array stopped being.
      const edges = new Map<number, number>()
      for (let k = 0; k < count; k += 3) {
        const v = [out[k], out[k + 1], out[k + 2]]
        expect(new Set(v).size).toBe(3)
        for (let e = 0; e < 3; e++) {
          const a = Math.min(v[e], v[(e + 1) % 3])
          const b = Math.max(v[e], v[(e + 1) % 3])
          const key = a * mesh.vertexCount + b
          edges.set(key, (edges.get(key) ?? 0) + 1)
        }
      }
      for (const shared of edges.values()) expect(shared).toBe(2)
      const faces = count / 3
      const points = new Set(out.subarray(0, count)).size
      expect(points - edges.size + faces).toBe(2)
    }
  })
})

describe('the topology format', () => {
  it('refuses a mesh with more points than its indices can name', () => {
    const was = new Uint16Array(3)
    const now = [0, 1, 70000]
    expect(() => topologyDelta(was, now, 1, Uint8Array.of(1))).toThrow(/more than/)
  })
})
