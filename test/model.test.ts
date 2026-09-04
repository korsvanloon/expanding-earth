import { describe, expect, it } from 'vitest'
import { buildIcosphere, sphericalTriangleArea } from '../tools/lib/icosphere'
import { DynamicMesh, collapseVanished, retriangulate } from '../tools/lib/dynamic-mesh'
import {
  applyTopology, readTopology, topologyDelta, writeTopology,
} from '../shared/topology'
import { sampleCurve, PERMANENT_MA, type Meta } from '../shared/model'
import { blocksIn, fillBlocks, runBlocks } from '../tools/lib/docs'
import { loadAgeGrid } from '../tools/lib/agegrid'
import { cellBuckets, coverage, probeCells, probeDirections } from '../tools/lib/coverage'
import { newContactScratch, separateIslands } from '../tools/lib/contact'
import { distortion, shapePairs } from '../tools/lib/shape'
import {
  conjugateFit, conjugatePairs, faceSnapper, traceFlowLines, vertexSnapper,
} from '../tools/lib/flowlines'
import { SEAM_FULL_KM, SEAM_START_KM, measureSeams, seamReach } from '../shared/seams'
import { SURFACE_MAPS } from '../shared/maps'
import { VIEW_MODES, remembered } from '../src/store'
import { readTracks, writeTracks } from '../shared/tracks'
import { readChannel, readFrames, writeChannel, writeFrames } from '../shared/frames'
import { markCrust, measureFold, newFoldScratch, pullInward } from '../tools/lib/fold'
import { directionToUv, lonLatToDirection } from '../shared/sphere'
import { flowAt, flowField } from '../tools/lib/flowfield'
import { Raster } from '../tools/lib/raster'
import { StepKind, ageSteps, stepAnchors } from '../tools/lib/age-steps'
import { grooveField, walkGrooves } from '../tools/lib/grooves'
import { axisDiff, bearingDeg } from '../tools/lib/bearing'
import jpeg from 'jpeg-js'
import { GRID_GAP, readGrid, writeGrid, type Grid } from '../tools/lib/grid'
import {
  crestOffsetKm, fillGaps, fractureZones, lineamentAt, lineaments, linkCurves, sampleStructure,
  zoneRaster,
} from '../tools/lib/structure'
import { R0_KM } from '../shared/model'
import { dirname, resolve } from 'node:path'
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

  it('finds real geography where it belongs in the age grid', async () => {
    // End-to-end against the actual dataset. The landmarks are chosen so that
    // their mirror images are the opposite kind of crust -- central Australia
    // reflects into the South Pacific, the Amazon into the Indian Ocean -- so a
    // flipped mapping fails here rather than quietly agreeing with itself.
    // (Much of the world is no good for this: reflect India and you land on
    // Cuba, reflect the Sahara and you land in Mauritania.)
    //
    // Against the netCDF, which is where a flip would now do the damage. GMT
    // counts rows from the south pole up and this project counts from the north
    // pole down, so the loader turns the grid over -- and while the age grid was
    // a PNG this test was watching a file the model had stopped reading.
    const age = await loadAgeGrid(resolve(import.meta.dirname, '../data-src/agegrid.nc'))
    const at = (latDeg: number, lonDeg: number) =>
      age.atDirection(...lonLatToDirection((lonDeg * Math.PI) / 180, (latDeg * Math.PI) / 180))

    expect(at(-25, 133)).toBeNaN() // central Australia, continental
    expect(at(-25, -133)).not.toBeNaN() // its mirror, the South Pacific
    expect(at(-10, -55)).toBeNaN() // Amazon basin, continental
    expect(at(-10, 55)).not.toBeNaN() // its mirror, the Indian Ocean
    expect(at(-80, 0)).toBeNaN() // Antarctica, so north and south are not swapped
    expect(at(0, -25)).toBeLessThan(20) // Mid-Atlantic Ridge, young crust
  })
})

describe('measuring coverage', () => {
  // The measure this whole model is judged by, and until now it could not be
  // tested because it lived inside the solver. It reported 0.00% uncovered at
  // every frame of every run -- taken for the crust tiling perfectly -- while
  // reporting 1.84% covered twice at the present day, where an untouched
  // icosphere must be exactly 0. Both came from the same cause: every probe
  // direction was a vertex of the mesh.
  const shell = (subdivision: number) => {
    const { positions, indices } = buildIcosphere(subdivision)
    const mesh = new DynamicMesh(positions.length / 3, indices.length / 3, indices)
    return { mesh, pos: Float64Array.from(positions, (v) => v * 6371) }
  }
  const measure = (mesh: DynamicMesh, pos: Float64Array, count = 20000) => {
    const probes = probeDirections(count)
    return coverage(pos, mesh, mesh.faceCount, probes, probeCells(probes), cellBuckets())
  }

  it('keeps its probes off the mesh entirely', () => {
    // The bug in one assertion. A probe on a vertex sits in two of the three
    // edge planes of every triangle around it, so the inside test decides on a
    // single edge and answers with whatever a rounding error says.
    const { positions } = buildIcosphere(6)
    const seen = new Set<string>()
    const key = (x: number, y: number, z: number) =>
      `${x.toFixed(9)},${y.toFixed(9)},${z.toFixed(9)}`
    for (let i = 0; i < positions.length; i += 3) {
      seen.add(key(positions[i], positions[i + 1], positions[i + 2]))
    }
    const probes = probeDirections(20000)
    let onAVertex = 0
    for (let p = 0; p < probes.length; p += 3) {
      if (seen.has(key(probes[p], probes[p + 1], probes[p + 2]))) onAVertex++
    }
    expect(onAVertex).toBe(0)
    // And the old probe set, for the record: every last one of them.
    const old = buildIcosphere(5).positions
    let wereOnAVertex = 0
    for (let p = 0; p < old.length; p += 3) {
      if (seen.has(key(old[p], old[p + 1], old[p + 2]))) wereOnAVertex++
    }
    expect(wereOnAVertex).toBe(old.length / 3)
  })

  it('reports a perfect tiling as perfect, at every resolution', () => {
    for (const subdivision of [2, 3, 4, 5]) {
      const { mesh, pos } = shell(subdivision)
      const { gapFraction, overlapFraction, boundaryHits } = measure(mesh, pos)
      expect(gapFraction, `subdivision ${subdivision} left sky bare`).toBe(0)
      expect(overlapFraction, `subdivision ${subdivision} covered sky twice`).toBe(0)
      expect(boundaryHits, `subdivision ${subdivision} had probes on an edge`).toBe(0)
    }
  })

  it('sees a hole the size of the hole', () => {
    const { mesh, pos } = shell(4)
    // Take out one triangle of 5120. Its share of the sphere is 1/5120, and a
    // measure that cannot see a missing triangle cannot see a missing ocean.
    mesh.faceAlive[1234] = 0
    const { gapFraction, overlapFraction } = measure(mesh, pos, 200000)
    expect(gapFraction).toBeGreaterThan(0.5 / mesh.faceCount)
    expect(gapFraction).toBeLessThan(2 / mesh.faceCount)
    expect(overlapFraction).toBe(0)
  })

  it('sees crust lying on crust', () => {
    const { mesh, pos } = shell(4)
    // A real fold, not a flattening: reflect one corner across the great circle
    // through the other two, so the triangle lands on top of the neighbour it
    // shares that edge with. Nothing has been removed, so this is the case the
    // overlap figure exists for -- and the case that reading it off summed
    // areas would miss entirely, since the areas still add up.
    const a = mesh.faceVerts[1234 * 3]
    const b = mesh.faceVerts[1234 * 3 + 1]
    const c = mesh.faceVerts[1234 * 3 + 2]
    const nx = pos[b * 3 + 1] * pos[c * 3 + 2] - pos[b * 3 + 2] * pos[c * 3 + 1]
    const ny = pos[b * 3 + 2] * pos[c * 3] - pos[b * 3] * pos[c * 3 + 2]
    const nz = pos[b * 3] * pos[c * 3 + 1] - pos[b * 3 + 1] * pos[c * 3]
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
    const [ux, uy, uz] = [nx / length, ny / length, nz / length]
    const along = pos[a * 3] * ux + pos[a * 3 + 1] * uy + pos[a * 3 + 2] * uz
    pos[a * 3] -= 2 * along * ux
    pos[a * 3 + 1] -= 2 * along * uy
    pos[a * 3 + 2] -= 2 * along * uz

    const { overlapFraction } = measure(mesh, pos, 200000)
    expect(overlapFraction).toBeGreaterThan(0)
  })
})

describe('measuring shape', () => {
  const R0 = 6371
  const DEG = Math.PI / 180

  /**
   * A ten-by-ten patch of the sphere around a place, as its own group.
   *
   * Degrees in, radians out. The first version of this handed degrees straight
   * to lonLatToDirection, which takes radians, and scattered every patch over
   * the whole sphere -- so the shrinking test read 57% and looked like a real
   * finding about the measure. Points sixteen thousand kilometres apart are not
   * an island; the numbers below are only worth anything because the patch is
   * the size a shield actually is.
   */
  const patch = (
    lonDeg: number, latDeg: number, halfWidthDeg: number, group: number,
    out: { dirs: Float32Array; group: Int32Array }, from: number, count: number,
  ) => {
    for (let i = 0; i < count; i++) {
      const u = (i % 10) / 9 - 0.5
      const w = Math.floor(i / 10) / 9 - 0.5
      const d = lonLatToDirection(
        (lonDeg + 2 * u * halfWidthDeg) * DEG,
        (latDeg + 2 * w * halfWidthDeg) * DEG,
      )
      const v = from + i
      out.dirs[v * 3] = d[0]
      out.dirs[v * 3 + 1] = d[1]
      out.dirs[v * 3 + 2] = d[2]
      out.group[v] = group
    }
  }

  /** Lay a cap on a sphere the way holdIslands does: same km out, same bearing. */
  const layOn = (dirs: Float32Array, count: number, centre: number[], radiusKm: number) => {
    const pos = new Float64Array(dirs.length)
    for (let v = 0; v < count; v++) {
      const d = [dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2]]
      const dot = Math.min(1, d[0] * centre[0] + d[1] * centre[1] + d[2] * centre[2])
      const arcKm = Math.acos(dot) * R0
      const t = [d[0] - centre[0] * dot, d[1] - centre[1] * dot, d[2] - centre[2] * dot]
      const l = Math.hypot(t[0], t[1], t[2]) || 1
      const theta = arcKm / radiusKm
      for (let k = 0; k < 3; k++) {
        pos[v * 3 + k] = (centre[k] * Math.cos(theta) + (t[k] / l) * Math.sin(theta)) * radiusKm
      }
    }
    return pos
  }

  // Float32 directions and an acos of a dot product; a rigid body reads as
  // deformed by a couple of parts in a million and no less. Four orders below
  // the percents this is used to measure, so a floor rather than a worry.
  const FLOAT_NOISE = 1e-5

  it('reports a body that only turned as undeformed', () => {
    const dirs = new Float32Array(100 * 3)
    const group = new Int32Array(100).fill(-1)
    patch(20, 10, 6, 0, { dirs, group }, 0, 100)
    const pairs = shapePairs(dirs, group, 1, 100, R0)
    expect(pairs.a.length).toBeGreaterThan(50)
    // Turn the whole patch a third of the way round the pole. Every distance
    // within it is unchanged, so a measure of shape must say nothing happened.
    const pos = new Float64Array(dirs.length)
    const angle = Math.PI * 2 / 3
    for (let v = 0; v < 100; v++) {
      const x = dirs[v * 3], y = dirs[v * 3 + 1], z = dirs[v * 3 + 2]
      pos[v * 3] = (x * Math.cos(angle) - z * Math.sin(angle)) * R0
      pos[v * 3 + 1] = y * R0
      pos[v * 3 + 2] = (x * Math.sin(angle) + z * Math.cos(angle)) * R0
    }
    expect(distortion(pairs, pos, R0).islandDistortion).toBeLessThan(FLOAT_NOISE)
  })

  it('sees a stretch as the stretch it is', () => {
    const dirs = new Float32Array(100 * 3)
    const group = new Int32Array(100).fill(-1)
    patch(0, 0, 6, 0, { dirs, group }, 0, 100)
    const pairs = shapePairs(dirs, group, 1, 100, R0)
    // Blow the patch up by a tenth about its own centre. Distances outwards
    // from the middle grow by exactly a tenth and distances across it by
    // sin(1.1 theta) / sin(theta), which on a sphere is slightly less, so the
    // honest answer is a tenth and a hair under rather than a tenth exactly.
    const centre = lonLatToDirection(0, 0)
    const pos = new Float64Array(dirs.length)
    for (let v = 0; v < 100; v++) {
      const d = [dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2]]
      const dot = Math.min(1, d[0] * centre[0] + d[1] * centre[1] + d[2] * centre[2])
      const theta = Math.acos(dot) * 1.1
      const t = [d[0] - centre[0] * dot, d[1] - centre[1] * dot, d[2] - centre[2] * dot]
      const l = Math.hypot(t[0], t[1], t[2]) || 1
      for (let k = 0; k < 3; k++) {
        pos[v * 3 + k] = (centre[k] * Math.cos(theta) + (t[k] / l) * Math.sin(theta)) * R0
      }
    }
    const seen = distortion(pairs, pos, R0).islandDistortion
    expect(seen).toBeGreaterThan(0.098)
    expect(seen).toBeLessThan(0.1)
  })

  it('does not mistake the sphere shrinking for a continent deforming', () => {
    // The measure's one real hazard. A rigid cap cannot be laid on a smaller
    // sphere without deforming -- Theorema Egregium -- so this reads something
    // once the Earth is 61% of its present size whatever the solver does, and
    // if that reading were the size of the deformation being looked for the
    // diagnostic would be worthless. For a cap the size of a shield it is not:
    // a thousandth, against the tens of percent a lat/lon continent shows.
    const dirs = new Float32Array(100 * 3)
    const group = new Int32Array(100).fill(-1)
    patch(0, 0, 6, 0, { dirs, group }, 0, 100)
    const pairs = shapePairs(dirs, group, 1, 100, R0)
    const small = 3905
    const pos = layOn(dirs, 100, lonLatToDirection(0, 0), small)
    expect(distortion(pairs, pos, small).islandDistortion).toBeLessThan(0.002)
    // And it is the shrinking that does it, not the laying-on: the same cap
    // laid on today's sphere comes back exactly where it started.
    const same = layOn(dirs, 100, lonLatToDirection(0, 0), R0)
    expect(distortion(pairs, same, R0).islandDistortion).toBeLessThan(FLOAT_NOISE)
  })

  it('blames the island that deformed and not its neighbour', () => {
    const dirs = new Float32Array(200 * 3)
    const group = new Int32Array(200).fill(-1)
    patch(0, 0, 6, 0, { dirs, group }, 0, 100)
    patch(120, 0, 6, 1, { dirs, group }, 100, 100)
    const pairs = shapePairs(dirs, group, 2, 200, R0)
    const pos = new Float64Array(dirs.length)
    for (let i = 0; i < dirs.length; i++) pos[i] = dirs[i] * R0
    // Fold the second island's northern half onto its southern edge. The first
    // is untouched, so it must come out clean and the worst must be the second.
    for (let v = 100; v < 200; v++) {
      if (dirs[v * 3 + 1] <= 0) continue
      for (let k = 0; k < 3; k++) pos[v * 3 + k] = dirs[100 * 3 + k] * R0
    }
    const seen = distortion(pairs, pos, R0)
    expect(seen.worstGroup).toBe(1)
    expect(seen.worstIslandDistortion).toBeGreaterThan(0.2)
    const alone = shapePairs(dirs, Int32Array.from(group, (g) => (g === 0 ? 0 : -1)), 1, 200, R0)
    expect(distortion(alone, pos, R0).islandDistortion).toBeLessThan(FLOAT_NOISE)
  })
})

describe('reading the stretch marks', () => {
  const W = 360
  const H = 180
  const DEG = Math.PI / 180

  /**
   * A synthetic ocean whose answer is known.
   *
   * A ridge on the meridian, spreading east and west at a stated rate, so the
   * age at longitude L is |L| times the degrees-per-Ma. Every conjugate pair is
   * then exactly (L, -L) and every one is known before the tracer runs. A real
   * grid could only ever be checked against itself.
   */
  const madeUpOcean = (degPerMa: number, oldest: number) => {
    const age = new Float64Array(W * H).fill(Number.NaN)
    for (let row = 0; row < H; row++) {
      const lat = 90 - (row + 0.5)
      // A wide band, poles left undated so nothing walks over them. Wide on
      // purpose: a path following a gradient takes great-circle steps, and a
      // great circle aimed due east drifts poleward, so a narrow band would be
      // testing the band's edge rather than the tracer.
      if (Math.abs(lat) > 70) continue
      for (let col = 0; col < W; col++) {
        const lon = col + 0.5 - 180
        const a = Math.abs(lon) / degPerMa
        if (a > oldest) continue
        age[row * W + col] = a
      }
    }
    return age
  }

  it('walks a made-up ocean back to the pairs it was built from', () => {
    // Two degrees per Ma of half-spreading, out to 60 Ma: crust 120 degrees
    // either side of the ridge.
    const age = madeUpOcean(2, 60)
    const { tracks, seeds } = traceFlowLines(age, W, H, { seedSpacingKm: 500, stepKm: 40 })
    expect(seeds).toBeGreaterThan(10)
    expect(tracks.length).toBeGreaterThan(8)
    const found: [number, number][] = []
    // A stand-in for the mesh: every point is its own one-vertex "triangle",
    // which is all this test needs -- it is about where the walk went.
    const { pairs } = conjugatePairs(tracks, [20, 40], (x, y, z) => {
      const lon = Math.atan2(-z, x) / DEG
      const lat = Math.asin(Math.min(1, Math.max(-1, y))) / DEG
      found.push([lon, lat])
      const i = found.length - 1
      return { v: [i, i, i] as [number, number, number], w: [1, 0, 0] as [number, number, number] }
    })
    expect(pairs.length).toBeGreaterThan(10)
    for (const pair of pairs) {
      const [lonA, latA] = found[pair.a.v[0]]
      const [lonB, latB] = found[pair.b.v[0]]
      // The two halves must straddle the ridge, at the longitude the age says.
      expect(Math.sign(lonA)).toBe(-Math.sign(lonB))
      expect(Math.abs(Math.abs(lonA) - 2 * pair.ageMa)).toBeLessThan(4)
      expect(Math.abs(Math.abs(lonB) - 2 * pair.ageMa)).toBeLessThan(4)
      // And they must have stayed on their own line of latitude, because in
      // this ocean the age does not vary with latitude at all.
      expect(Math.abs(latA - latB)).toBeLessThan(6)
    }
  })

  it('refuses to walk over crust the grid does not date', () => {
    // The same ocean with a continent in the middle of the eastern flank. No
    // pair may have a half beyond it: a path that crossed dry land would be
    // pairing crust from another ocean entirely.
    const age = madeUpOcean(2, 60)
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const lon = col + 0.5 - 180
        if (lon > 40 && lon < 60) age[row * W + col] = Number.NaN
      }
    }
    const { tracks } = traceFlowLines(age, W, H, { seedSpacingKm: 500, stepKm: 40 })
    const lons: number[] = []
    const { pairs } = conjugatePairs(tracks, [10, 20, 30, 40], (x, _y, z) => {
      lons.push(Math.atan2(-z, x) / DEG)
      const i = lons.length - 1
      return { v: [i, i, i] as [number, number, number], w: [1, 0, 0] as [number, number, number] }
    })
    expect(pairs.length).toBeGreaterThan(3)
    for (const pair of pairs) {
      expect(lons[pair.a.v[0]]).toBeLessThan(41)
      expect(lons[pair.b.v[0]]).toBeLessThan(41)
    }
  })

  it('throws out a pair whose halves are not as far apart as their paths are long', () => {
    // Two points a hundred kilometres apart cannot both have walked two
    // thousand kilometres from the same ridge in opposite directions, and that
    // is what a walk that came home looks like. Hand-build exactly that.
    const near = (lonDeg: number) => {
      const lon = lonDeg * DEG
      return { x: Math.cos(lon), y: 0, z: -Math.sin(lon), fromRidgeKm: 2000 }
    }
    const track = {
      ridge: 1,
      points: [
        { ...near(20), ageMa: 40 },
        { x: 1, y: 0, z: 0, ageMa: 0, fromRidgeKm: 0 },
        { ...near(21), ageMa: 40 },
      ],
    }
    const seen = conjugatePairs([track], [40], () => ({
      v: [0, 0, 0] as [number, number, number], w: [1, 0, 0] as [number, number, number],
    }))
    expect(seen.pairs).toHaveLength(0)
    expect(seen.rejected['not as far apart as the paths are long']).toBe(1)
  })

  /** Pairs whose ends are single vertices, which is all these cases need. */
  const atVertices = (as: number[], bs: number[], ages: number[]) => ({
    aVerts: Uint32Array.from(as.flatMap((v) => [v, v, v])),
    aWeights: Float32Array.from(as.flatMap(() => [1, 0, 0])),
    bVerts: Uint32Array.from(bs.flatMap((v) => [v, v, v])),
    bWeights: Float32Array.from(bs.flatMap(() => [1, 0, 0])),
    ageMa: Float32Array.from(ages),
  })

  it('scores a pair the model reunited and one it did not', () => {
    // Two pairs, both due at 40 Ma. One is in the same place, one is a quarter
    // of the way round the world from where it should be.
    const pos = new Float64Array(4 * 3)
    const put = (v: number, lonDeg: number) => {
      pos[v * 3] = 6371 * Math.cos(lonDeg * DEG)
      pos[v * 3 + 2] = -6371 * Math.sin(lonDeg * DEG)
    }
    put(0, 10); put(1, 10)
    put(2, 0); put(3, 90)
    const fit = conjugateFit(
      atVertices([0, 2], [1, 3], [40, 40]), 40, pos, 6371, 200, (v: number) => v,
    )
    expect(fit.conjugateCount).toBe(2)
    expect(fit.conjugateMatched).toBe(0.5)
    expect(fit.conjugateMerged).toBe(0)
    expect(fit.conjugateMedianKm).toBeCloseTo((Math.PI / 2) * 6371, 0)
  })

  it('counts a pair the mesh merged as reunited, and says how many those were', () => {
    // A collapse is the model closing the ocean and making the two banks one
    // point, which is the right answer -- and also an unfalsifiable zero, so it
    // has to be reported separately or a run that merged everything would look
    // perfect.
    const pos = new Float64Array(2 * 3)
    pos[0] = 6371
    pos[3] = 6371
    const fit = conjugateFit(atVertices([0], [1], [40]), 40, pos, 6371, 200, () => 0)
    expect(fit.conjugateMatched).toBe(1)
    expect(fit.conjugateMerged).toBe(1)
  })

  it('measures only the pairs due at the time it is asked about', () => {
    const pos = new Float64Array(4 * 3).fill(0)
    pos[0] = 6371; pos[3] = -6371; pos[6] = 6371; pos[9] = 6371
    const fit = conjugateFit(
      atVertices([0, 2], [1, 3], [40, 80]), 80, pos, 6371, 200, (v: number) => v,
    )
    expect(fit.conjugateCount).toBe(1)
    expect(fit.conjugateMedianKm).toBeCloseTo(0, 6)
  })

  it('places a pair inside its triangle rather than at the nearest corner', () => {
    // The point of the barycentric ends. Two points a fifth of a triangle
    // apart, in the same triangle: snapped to corners they are either the same
    // place or a whole edge apart, and neither is what the age grid said.
    const { positions, indices } = buildIcosphere(4)
    const count = positions.length / 3
    const dirs = Float32Array.from(positions)
    const snap = faceSnapper(dirs, indices, count)
    const mix = (a: number, b: number, c: number, wa: number, wb: number, wc: number) => {
      const x = dirs[a * 3] * wa + dirs[b * 3] * wb + dirs[c * 3] * wc
      const y = dirs[a * 3 + 1] * wa + dirs[b * 3 + 1] * wb + dirs[c * 3 + 1] * wc
      const z = dirs[a * 3 + 2] * wa + dirs[b * 3 + 2] * wb + dirs[c * 3 + 2] * wc
      const l = Math.hypot(x, y, z)
      return [x / l, y / l, z / l] as const
    }
    const [a, b, c] = [indices[0], indices[1], indices[2]]
    const one = mix(a, b, c, 0.6, 0.3, 0.1)
    const two = mix(a, b, c, 0.4, 0.5, 0.1)
    const pa = snap(...one)
    const pb = snap(...two)
    expect(pa).not.toBeNull()
    expect(pb).not.toBeNull()
    // Same triangle, different weights: the corners cannot tell them apart.
    expect([...pa!.v].sort()).toEqual([...pb!.v].sort())
    const pos = new Float64Array(count * 3)
    for (let i = 0; i < pos.length; i++) pos[i] = dirs[i] * 6371
    const fit = conjugateFit(
      {
        aVerts: Uint32Array.from(pa!.v),
        aWeights: Float32Array.from(pa!.w),
        bVerts: Uint32Array.from(pb!.v),
        bWeights: Float32Array.from(pb!.w),
        ageMa: Float32Array.from([40]),
      },
      40, pos, 6371, 200, (v: number) => v,
    )
    const truth = Math.acos(one[0] * two[0] + one[1] * two[1] + one[2] * two[2]) * 6371
    // A tenth of a subdivision-4 edge, and it reads it to within a kilometre.
    expect(truth).toBeGreaterThan(50)
    expect(truth).toBeLessThan(200)
    expect(fit.conjugateMedianKm).toBeCloseTo(truth, 0)
  })

  it('snaps a direction to the nearest vertex, poles included', () => {
    const { positions } = buildIcosphere(3)
    const count = positions.length / 3
    const snap = vertexSnapper(Float32Array.from(positions), count)
    // Against the honest answer: ask every vertex.
    const brute = (x: number, y: number, z: number) => {
      let best = -1
      let bestDot = -2
      for (let v = 0; v < count; v++) {
        const dot = x * positions[v * 3] + y * positions[v * 3 + 1] + z * positions[v * 3 + 2]
        if (dot > bestDot) { bestDot = dot; best = v }
      }
      return best
    }
    for (const [lon, lat] of [[0, 0], [37, 12], [-140, -63], [10, 89], [-95, -89], [179, 45]]) {
      const d = lonLatToDirection(lon * DEG, lat * DEG)
      expect(snap(d[0], d[1], d[2])).toBe(brute(d[0], d[1], d[2]))
    }
  })

  it('round-trips the track file', () => {
    const tracks = {
      offsets: Uint32Array.from([0, 3, 5]),
      ridge: Uint32Array.from([1, 3]),
      pointVerts: Uint32Array.from([
        7, 8, 9,  8, 9, 10,  9, 10, 11,  20, 21, 22,  21, 22, 23,
      ]),
      pointWeights: Float32Array.from([
        1, 0, 0,  0.5, 0.5, 0,  0.2, 0.3, 0.5,  0.6, 0.4, 0,  0.34, 0.33, 0.33,
      ]),
      ageMa: Float32Array.from([10, 0, 10, 0, 25]),
      fromRidgeKm: Float32Array.from([400, 0, 400, 0, 900]),
      pairAVerts: Uint32Array.from([7, 8, 9]),
      pairAWeights: Float32Array.from([0.5, 0.25, 0.25]),
      pairBVerts: Uint32Array.from([20, 21, 7]),
      pairBWeights: Float32Array.from([0.1, 0.8, 0.1]),
      pairAgeMa: Float32Array.from([10]),
      pairTrack: Uint32Array.from([1]),
      trackKind: Uint32Array.from([0, 1]),
      pairKind: Uint32Array.from([1]),
    }
    const back = readTracks(writeTracks(tracks))
    for (const key of Object.keys(tracks) as (keyof typeof tracks)[]) {
      expect([...back[key]]).toEqual([...tracks[key]])
    }
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
  /**
   * Every file these tests read, not just the first one.
   *
   * The guard used to ask for `mesh.bin` alone, and the reconstruction arrives
   * in two stages with a cache each: the mesh, whose key leaves the solver out,
   * and the solve, whose key includes it. Change only the solver -- which is
   * what changing the model usually is -- and the first cache hits while the
   * second misses, so CI held a mesh with no `meta.json` beside it, the guard
   * said the data was there, and the run failed on a missing file before it had
   * built anything. The tests were right and the question they asked was too
   * narrow.
   */
  const present = ['mesh.bin', 'meta.json', 'frames.bin', 'strain.bin']
    .every((file) => existsSync(resolve(data, file)))

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

  // MODEL.md once described a 4006 km Earth at 200 Ma with about ninety plates
  // and 8.6% of the sphere unaccounted for, against a shipped run of 3905 km,
  // two blocks and a coverage figure of zero. Every one of those numbers had
  // been true of some earlier solver. Prose gets updated when the model
  // changes; tables of measurements do not, so they are generated -- and this
  // fails until they have been.
  //
  // It only asks that of a run that claims to be the model. A sweep with one
  // knob moved, or a ten-step draft, is not the shipped model and its numbers
  // are not supposed to be in the documents -- but this used to fail on it all
  // the same, so the failure had to be explained away by hand every time, and
  // that is exactly how a real one gets explained away too. A run records
  // which environment variables were set; if any were, this stands down and
  // says so.
  it.runIf(present)('quotes the run it ships with, in every document', () => {
    const meta = JSON.parse(readFileSync(resolve(data, 'meta.json'), 'utf8')) as Meta
    const overrides = meta.overrides ?? []
    if (overrides.length > 0) {
      console.log(
        `[test] public/data is an experiment (${overrides.join(', ')} set), ` +
          'not the shipped model; not checking the documents against it',
      )
      return
    }
    const blocks = runBlocks(meta)
    for (const name of ['README.md', 'MODEL.md']) {
      const text = readFileSync(resolve(import.meta.dirname, '..', name), 'utf8')
      for (const asked of blocksIn(text)) {
        expect(Object.keys(blocks), `${name} asks for an unknown block`).toContain(asked)
      }
      expect(fillBlocks(text, blocks), `${name} is stale; run pnpm docs`).toBe(text)
    }
  })

  // The raster is written into a buffer that pngjs and jpeg-js both keep four
  // bytes wide whatever colour they are asked for, and setting a grey field
  // straight into it filled the red, green, blue and alpha of the first quarter
  // of the rows and left the rest black. On the globe that is a north polar cap
  // of real data on a blank planet, which looks exactly like a texture that has
  // half loaded -- so it is checked by latitude rather than in total.
  it.runIf(existsSync(resolve(data, 'fabric.jpg')))('paints the fabric over the whole globe', () => {
    const image = jpeg.decode(readFileSync(resolve(data, 'fabric.jpg')), { useTArray: true })
    expect([image.width, image.height]).toEqual([3600, 1800])

    // Lossy, so a cell the survey never reached comes back near zero rather
    // than at it. Anything this dark is a gap whatever the encoder did.
    const unsurveyed = (from: number, to: number) => {
      let dark = 0
      let seen = 0
      for (let row = from; row < to; row += 3) {
        for (let column = 0; column < image.width; column += 3) {
          if (image.data[(row * image.width + column) * 4] < 4) dark++
          seen++
        }
      }
      return dark / seen
    }
    // Everything but the ice caps, band by band, so a raster written into the
    // wrong quarter of its buffer cannot pass by averaging out.
    for (let band = 100; band < 1700; band += 200) {
      expect(unsurveyed(band, band + 200), `rows ${band}-${band + 200}`).toBeLessThan(0.25)
    }
  })

  // The freshness check holds `tools/solve.ts` out of the mesh's input hash, so
  // that editing the solver does not rebuild the mesh. That is only sound while
  // the dependency runs one way. If the builder ever imported the solver, a
  // solver change would leave a stale mesh behind and look like a change with
  // no effect -- the exact failure tools/run.ts was written to stop.
  it('builds the mesh without reference to the solver', () => {
    const seen = new Set<string>()
    const walk = (file: string) => {
      if (seen.has(file)) return
      seen.add(file)
      const source = readFileSync(resolve(import.meta.dirname, '..', file), 'utf8')
      for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
        const target = resolve(dirname(file), match[1]).replace(/\.js$/, '.ts')
        walk(target.slice(resolve(import.meta.dirname, '..').length + 1))
      }
    }
    walk('tools/build-data.ts')
    expect([...seen].filter((file) => file.endsWith('solve.ts'))).toEqual([])
    expect(seen.size).toBeGreaterThan(5)
  })

  // The list the run reports its overrides from is written by hand next to
  // CONFIG, so it can fall behind the knobs themselves -- and a knob missing
  // from it is silent in the worst way: the run calls itself the model, the
  // documents get checked against an experiment, and the numbers that get
  // committed are from a sweep. Read out of the source rather than imported,
  // because importing the solver runs it.
  it('lists every knob the solver reads', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../tools/solve.ts'), 'utf8')
    const listed = new Set(
      (source.match(/export const KNOBS = \[([^\]]*)\]/)?.[1] ?? '')
        .match(/'([A-Z_0-9]+)'/g)
        ?.map((q) => q.slice(1, -1)) ?? [],
    )
    const read = new Set(
      (source.match(/process\.env\.[A-Z_0-9]+/g) ?? []).map((m) => m.slice('process.env.'.length)),
    )
    expect(listed.size).toBeGreaterThan(0)
    expect([...read].filter((name) => !listed.has(name))).toEqual([])
    expect([...listed].filter((name) => !read.has(name))).toEqual([])
  })

  it.runIf(present)('has a generated block for every figure worth drifting', () => {
    const readme = readFileSync(resolve(import.meta.dirname, '../README.md'), 'utf8')
    const model = readFileSync(resolve(import.meta.dirname, '../MODEL.md'), 'utf8')
    expect(blocksIn(readme)).toContain('radius')
    expect(blocksIn(model)).toEqual(expect.arrayContaining(['blocks', 'reports', 'fits']))
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

describe('a grid of measurements', () => {
  const grid = (width: number, height: number, fill: (c: number, r: number) => number): Grid => {
    const samples = new Int16Array(width * height)
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) samples[r * width + c] = fill(c, r)
    return { width, height, scale: 0.03125, offset: 100, units: 'vgg (Eotvos)', samples }
  }

  it('comes back out of a file exactly as it went in', () => {
    const before = grid(37, 11, (c, r) => (c * 13 + r * 7) % 900 - 400)
    const after = readGrid(writeGrid(before))
    expect(after.width).toBe(before.width)
    expect(after.height).toBe(before.height)
    expect(after.units).toBe(before.units)
    expect(after.scale).toBe(before.scale)
    expect(after.offset).toBe(before.offset)
    expect(Array.from(after.samples)).toEqual(Array.from(before.samples))
  })

  // The unit string is padded out to a multiple of four so the samples start on
  // an even offset; a name whose length is not a multiple of four is the case
  // that catches a padding rule applied on one side and not the other.
  it('survives a unit name of any length', () => {
    for (const units of ['m', 'Ma', 'vgg', 'Eotvos', 'metres above the geoid']) {
      const before = grid(8, 4, (c) => c)
      before.units = units
      expect(readGrid(writeGrid(before)).units).toBe(units)
    }
  })

  it('reads a flat field as flat and a step as rough', () => {
    const dirs = new Float32Array([1, 0, 0])
    const flat = sampleStructure(grid(720, 360, () => 100), dirs, 1, 300, R0_KM)
    expect(flat.roughness[0]).toBeCloseTo(0, 6)

    // A ramp of one sample per column. The grid runs 0.5 degrees to the cell,
    // about 56 km at the equator, so a step of one sample -- 0.03125 Eotvos --
    // per 56 km is 0.056 per 100 km.
    const ramp = sampleStructure(grid(720, 360, (c) => c % 200), dirs, 1, 300, R0_KM)
    expect(ramp.roughness[0]).toBeGreaterThan(0.04)
    expect(ramp.roughness[0]).toBeLessThan(0.07)
  })

  // A cell of longitude is 56 km wide at the equator and 10 km at 80 degrees,
  // so a field that steps by the same amount per cell really is changing six
  // times faster per kilometre up there, and the measure has to say so. The
  // ratio is the test: it comes out as one over the cosine of the latitude only
  // if the gradient is divided by the width of the cell it was read across, at
  // that cell's own latitude. Reading in cells instead would report the two as
  // equal and call the whole Arctic featureless.
  it('measures gradients per kilometre, not per cell', () => {
    const ramp = grid(720, 360, (c) => c)
    const lat = (80 * Math.PI) / 180
    const dirs = Float32Array.from([
      ...lonLatToDirection(0, 0), ...lonLatToDirection(0, lat),
    ])
    const seen = sampleStructure(ramp, dirs, 2, 200, R0_KM)
    expect(seen.roughness[1] / seen.roughness[0]).toBeCloseTo(1 / Math.cos(lat), 0)
  })

  it('reports the vertices the survey never reached', () => {
    const patchy = grid(720, 360, (_, r) => (r < 10 ? GRID_GAP : 100))
    const pole = lonLatToDirection(0, (88 * Math.PI) / 180)
    const dirs = Float32Array.from([...pole, ...lonLatToDirection(0, 0)])
    const seen = sampleStructure(patchy, dirs, 2, 100, R0_KM)
    expect(seen.unsurveyed).toBe(1)
    expect(Number.isNaN(seen.value[0])).toBe(true)
    expect(Number.isNaN(seen.value[1])).toBe(false)
  })

  // A hole in a field the solver reads is not a missing number, it is a number
  // that turns everything it touches into NaN. Filling from the measured edge
  // inwards says the honest thing instead: as far as anyone knows, like its
  // neighbour.
  it('fills a hole from the crust around it', () => {
    // A strip of four vertices, holed in the middle: 0 - 1 - 2 - 3.
    const field = Float32Array.from([10, NaN, NaN, 20])
    const indices = Uint32Array.from([0, 1, 2, 1, 2, 3])
    expect(fillGaps(field, indices)).toBe(2)
    expect(field.every(Number.isFinite)).toBe(true)
    expect(field[1]).toBeGreaterThan(9)
    expect(field[2]).toBeLessThan(21)
  })

  it('leaves nothing NaN even when every neighbour is a hole too', () => {
    const field = Float32Array.from([NaN, NaN, NaN])
    fillGaps(field, Uint32Array.from([0, 1, 2]))
    expect(field.every(Number.isFinite)).toBe(true)
  })
})

describe('which way the lineaments run', () => {
  const W = 720
  const H = 360
  const striped = (f: (column: number, row: number) => number): Grid => {
    const samples = new Int16Array(W * H)
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) samples[r * W + c] = f(c, r)
    return { width: W, height: H, scale: 1, offset: 0, units: 'test', samples }
  }
  /** The returned axis as a bearing: degrees east of north, folded to 0-180. */
  const bearing = (grid: Grid, lonDeg: number, latDeg: number) => {
    const field = lineaments(grid, R0_KM, 300)
    const [x, y, z] = lonLatToDirection((lonDeg * Math.PI) / 180, (latDeg * Math.PI) / 180)
    const axis = lineamentAt(field, x, y, z)
    if (!axis) return null
    let nx = -y * x, ny = 1 - y * y, nz = -y * z
    const nl = Math.hypot(nx, ny, nz)
    nx /= nl; ny /= nl; nz /= nl
    const ex = ny * z - nz * y, ey = nz * x - nx * z, ez = nx * y - ny * x
    const deg = (Math.atan2(
      axis.tx * ex + axis.ty * ey + axis.tz * ez,
      axis.tx * nx + axis.ty * ny + axis.tz * nz,
    ) * 180) / Math.PI
    return { deg: ((deg % 180) + 180) % 180, coherence: axis.coherence }
  }

  /**
   * Two conventions meet inside the tensor and getting them the wrong way round
   * is silent: the eigenvector's angle is measured from east, and what is
   * stored is a bearing from north. Read as-is the axis came out square to the
   * truth -- and on real data a lineament field that is ninety degrees wrong is
   * indistinguishable from one that has nothing to say. It measured 47 degrees
   * from the paths, where 45 is what a coin would give, and the mistake was
   * only visible against a stripe whose direction is known by construction.
   */
  it('reads a trough as running along itself, not across it', () => {
    const eastWest = bearing(striped((_, row) => Math.round(200 * Math.sin(row * 0.6))), 0, 0)
    expect(eastWest!.deg).toBeCloseTo(90, 0)
    const northSouth = bearing(striped((column) => Math.round(200 * Math.sin(column * 0.6))), 0, 0)
    expect(northSouth!.deg % 180).toBeCloseTo(0, 0)
    const diagonal = bearing(
      striped((column, row) => Math.round(200 * Math.sin((column + row) * 0.4))), 0, 0,
    )
    expect(diagonal!.deg).toBeCloseTo(45, 0)
  })

  it('is certain about a clean stripe and says nothing about a flat field', () => {
    const clean = bearing(striped((_, row) => Math.round(200 * Math.sin(row * 0.6))), 0, 0)
    expect(clean!.coherence).toBeGreaterThan(0.9)
    expect(bearing(striped(() => 100), 0, 0)).toBe(null)
  })

  // A bearing is only a bearing next to a north, and away from the equator the
  // grid's rows stop being straight lines. A stripe that follows a parallel is
  // running east there just as it is at the equator, and the axis has to say so
  // rather than reporting the projection it was read out of.
  it('answers in bearings away from the equator too', () => {
    const eastWest = striped((_, row) => Math.round(200 * Math.sin(row * 0.6)))
    for (const lat of [0, 30, 60]) {
      expect(bearing(eastWest, 0, lat)!.deg, `${lat} deg north`).toBeCloseTo(90, 0)
    }
  })
})

describe('finding the line a path should be on', () => {
  // One strong ridge running east-west at the equator, and nothing else. A path
  // heading east across it should be told how far north or south it is.
  const W = 720
  const H = 360
  const ridgeAt = (row: number) => {
    const samples = new Int16Array(W * H)
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        // A step in the field across the ridge row: its gradient peaks there.
        samples[r * W + c] = r < row ? 0 : 300
      }
    }
    return { width: W, height: H, scale: 1, offset: 0, units: 'test', samples } as Grid
  }
  /** Looking north from a point, how far to the ridge. */
  const offsetFrom = (latDeg: number, ridgeRow: number) => {
    const field = lineaments(ridgeAt(ridgeRow), R0_KM, 60, 25)
    const [x, y, z] = lonLatToDirection(0, (latDeg * Math.PI) / 180)
    // North at that point, which is the direction across an east-west line.
    let nx = -y * x, ny = 1 - y * y, nz = -y * z
    const nl = Math.hypot(nx, ny, nz)
    return crestOffsetKm(field, x, y, z, nx / nl, ny / nl, nz / nl, 300, R0_KM)
  }

  it('says which side the line is on and how far', () => {
    // Row 180 of 360 is the equator and rows count southward, so a ridge at row
    // 178 sits north of a point on the equator and one at 182 sits south. Two
    // rows of a 360-row grid is one degree, about 110 km -- kept well inside the
    // 300 km reach, because a peak at the very edge of the reach falls on the
    // outermost sample, which has no outer neighbour to be a peak against.
    const north = offsetFrom(0, 178)
    const south = offsetFrom(0, 182)
    expect(north).not.toBe(null)
    expect(south).not.toBe(null)
    expect(north!).toBeGreaterThan(0)
    expect(south!).toBeLessThan(0)
    for (const found of [north!, south!]) {
      expect(Math.abs(found)).toBeGreaterThan(40)
      expect(Math.abs(found)).toBeLessThan(220)
    }
  })

  it('finds nothing to steer towards in a field with no line in it', () => {
    const flat: Grid = {
      width: W, height: H, scale: 1, offset: 0, units: 'test',
      samples: new Int16Array(W * H).fill(100),
    }
    const field = lineaments(flat, R0_KM, 60, 25)
    const [x, y, z] = lonLatToDirection(0, 0)
    let nx = -y * x, ny = 1 - y * y, nz = -y * z
    const nl = Math.hypot(nx, ny, nz)
    expect(crestOffsetKm(field, x, y, z, nx / nl, ny / nl, nz / nl, 300, R0_KM)).toBe(null)
  })
})

describe("finding a groove the way a reader finds one", () => {
  /**
   * A synthetic fabric with the three things that look alike in a real one.
   *
   * The reader's rule is that a groove is a light band with a dark centre
   * line, and both halves of it earn their place here. A solid bright band
   * with no dark middle -- a volcanic ridge -- is the commonest long line in
   * the fabric and is not a groove: that is what the centre line rules out. A
   * seamount, whose bright ring does have a dark middle, is the strongest
   * bright-dark-bright profile in the real South Atlantic: that is what being
   * a line, and keeping the shape along its whole length, rules out.
   */
  const W = 3600
  const H = 1800
  const cell = (lon: number, lat: number) =>
    [Math.round(((lon + 180) / 360) * W), Math.round(((90 - lat) / 180) * H)] as const
  const fabric = () => {
    const data = new Uint8Array(W * H).fill(90)
    const put = (c: number, r: number, v: number) => {
      if (r < 0 || r >= H) return
      data[r * W + ((c % W) + W) % W] = v
    }
    // A groove along latitude -20, running the full width of the window: two
    // bright walls two cells out, a dark floor between them.
    const [, grooveRow] = cell(0, -20)
    for (let c = 0; c < W; c++) {
      put(c, grooveRow, 20)
      for (const d of [-2, -3, 2, 3]) put(c, grooveRow + d, 220)
    }
    // A bright band along latitude -25 with no dark line down it.
    const [, bandRow] = cell(0, -25)
    for (let c = 0; c < W; c++) {
      for (const d of [-3, -2, -1, 0, 1, 2, 3]) put(c, bandRow + d, 220)
    }
    // A seamount at 10 west, 30 south: a bright ring with a dark middle.
    const [mountColumn, mountRow] = cell(-10, -30)
    for (let r = -6; r <= 6; r++) {
      for (let c = -6; c <= 6; c++) {
        const away = Math.hypot(c, r)
        if (away < 2) put(mountColumn + c, mountRow + r, 20)
        else if (away < 5) put(mountColumn + c, mountRow + r, 220)
      }
    }
    return { width: W, height: H, at: (c: number, r: number) => data[r * W + c] }
  }
  const found = () => {
    const at = fabric()
    const window = { lonFrom: -20, lonTo: 0, latFrom: -35, latTo: -15 }
    return walkGrooves(at, grooveField(at, window), {})
  }
  /** How much detected line runs within a degree of a latitude. */
  const alongLat = (grooves: ReturnType<typeof walkGrooves>, lat: number) => {
    let steps = 0
    for (const groove of grooves) {
      for (const point of groove.points) if (Math.abs(point.lat - lat) < 1) steps++
    }
    return steps
  }

  it('finds the groove, and not the bright band or the seamount', () => {
    const grooves = found()
    expect(alongLat(grooves, -20)).toBeGreaterThan(10)
    expect(alongLat(grooves, -25)).toBe(0)
    expect(alongLat(grooves, -30)).toBe(0)
  })

  it('reports the groove running the way it runs', () => {
    const grooves = found()
    const along = grooves.filter((g) => Math.abs(g.points[0].lat - -20) < 1)
    expect(along.length).toBeGreaterThan(0)
    for (const groove of along) {
      const a = groove.points[0]
      const b = groove.points[groove.points.length - 1]
      expect(axisDiff(bearingDeg(a, b), 90)).toBeLessThan(5)
    }
  })
})

describe('telling a fracture zone from an abyssal hill', () => {
  const W = 720
  const H = 360
  /**
   * A patch of sea floor with two kinds of line in it, and an age that rises
   * northwards so that the travelled direction is north.
   *
   * The east-west stripes are abyssal hills: strong, coherent, and square to
   * the way the crust went. The north-south one is a fracture zone: it runs the
   * way the crust went. Only the second should survive.
   */
  const patch = () => {
    const samples = new Int16Array(W * H)
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const hills = 400 * Math.sin(r * 0.9)
        const zone = Math.abs(c - 360) < 2 ? -900 : 0
        samples[r * W + c] = Math.round(hills + zone)
      }
    }
    return { width: W, height: H, scale: 1, offset: 0, units: 'test', samples } as Grid
  }
  /** Age rising northwards everywhere, so the crust travelled north. */
  const northwards = () => {
    const age = new Float32Array(W * H)
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) age[r * W + c] = (H - r) * 0.5
    return age
  }
  const strength = (found: ReturnType<typeof fractureZones>, lonDeg: number) => {
    const field = found.zones
    const column = Math.floor(((lonDeg + 180) / 360) * W)
    let most = 0
    for (let r = H / 2 - 20; r < H / 2 + 20; r++) {
      for (let d = -3; d <= 3; d++) {
        most = Math.max(most, field.ridgeness[r * W + ((column + d + W) % W)])
      }
    }
    return most
  }

  it('keeps the line that runs the way the crust went and drops the ones across it', () => {
    const grid = patch()
    const sharp = lineaments(grid, R0_KM, 60, 25)
    const guide = lineaments(grid, R0_KM, 200, 100)
    const found = fractureZones(sharp, guide, northwards(), W, H, R0_KM)
    // Longitude 0 is column 360, where the north-south line is.
    const onTheZone = strength(found, 0)
    // A quarter of the way round, where there is nothing but hills.
    const onTheHills = strength(found, -90)
    expect(onTheZone).toBeGreaterThan(0)
    expect(onTheHills).toBeLessThan(onTheZone / 2)
  })

  // Alignment gates rather than weighting, because multiplying strength by
  // alignment lets a loud half-aligned feature outrank a quiet perfectly
  // aligned one -- which is exactly what happened on the real grid, where the
  // strongest detections came out at 44 degrees to the flow.
  it('throws away a strong line that is square to the flow rather than dimming it', () => {
    const grid = patch()
    const sharp = lineaments(grid, R0_KM, 60, 25)
    const guide = lineaments(grid, R0_KM, 200, 100)
    const gated = fractureZones(sharp, guide, northwards(), W, H, R0_KM, { alignmentGate: 0.94 })
    const open = fractureZones(sharp, guide, northwards(), W, H, R0_KM, { alignmentGate: 0 })
    expect(strength(gated, -90)).toBeLessThan(strength(open, -90))
  })
})

describe('remembering how the globe was set up', () => {
  // The store keeps the view settings in localStorage so that a reader
  // comparing two layers with one continent held still does not have to set all
  // three again after every reload. What a stored value must never do is
  // outlive the code that made it and quietly leave the globe painted with
  // nothing, so anything unrecognised falls back to the default.
  it('takes back what it recognises', () => {
    expect(remembered({
      mode: 'fabric',
      surfaceMap: SURFACE_MAPS[1].id,
      referenceFrame: 'australia',
      showZones: true,
      showGrid: false,
      speed: 40,
    })).toEqual({
      mode: 'fabric',
      surfaceMap: SURFACE_MAPS[1].id,
      referenceFrame: 'australia',
      showZones: true,
      showGrid: false,
      speed: 40,
    })
    // No net rotation is a real choice and not a missing one.
    expect(remembered({ referenceFrame: '' })).toEqual({ referenceFrame: '' })
  })

  it('drops anything it no longer understands', () => {
    expect(remembered({
      mode: 'heat-flow',
      surfaceMap: 'a-map-that-was-deleted',
      referenceFrame: 'atlantis',
      showZones: 'yes',
      speed: -1,
    })).toEqual({})
    expect(remembered(null)).toEqual({})
    expect(remembered('the whole thing as a string')).toEqual({})
    expect(remembered({})).toEqual({})
  })

  it('numbers the view modes the way the shader reads them', () => {
    // uMode in src/scene/shaders.ts: 0 surface, 1 age, 2 strain, 3 rigidity,
    // 4 islands, 5 fabric, 6 thickness, 7 crustal class. The renderer indexes it to get
    // that number, so the order here is load-bearing and a new mode goes on
    // the end.
    expect(VIEW_MODES).toEqual([
      'surface', 'age', 'strain', 'rigidity', 'islands', 'fabric', 'thickness', 'crust',
    ])
  })
})

describe('keeping rigid crust out of rigid crust', () => {
  /**
   * One triangle of island 1, and a point of island 2 sitting inside it.
   *
   * The point is deliberately off centre, so the shallowest way out is a
   * particular edge and not a matter of taste: a contact pushes a continent out
   * the way it came, and out the far side would carry a craton clean across its
   * neighbour.
   */
  const setUp = (lonDeg: number, latDeg: number) => {
    const at = (lon: number, lat: number) => {
      const a = (lon * Math.PI) / 180
      const b = (lat * Math.PI) / 180
      const c = Math.cos(b)
      return [c * Math.cos(a), Math.sin(b), -c * Math.sin(a)]
    }
    // Corners 0..2 are the triangle; vertex 3 is the intruder.
    const pos = Float64Array.from([
      ...at(0, 0), ...at(6, 0), ...at(3, 5), ...at(lonDeg, latDeg),
    ].map((v) => v * R0_KM))
    const mesh = {
      faceVerts: Uint32Array.from([0, 1, 2]),
      faceAlive: Uint8Array.from([1]),
    }
    return { pos, mesh }
  }
  const vertexIsland = Uint16Array.from([1, 1, 1, 2])
  const faceIsland = Uint16Array.from([1])
  const alive = Uint8Array.from([1, 1, 1, 1])

  it('pushes a point of one island out of another, the shallow way', () => {
    // Just inside the bottom edge, which runs along the equator.
    const { pos, mesh } = setUp(3, 0.4)
    const before = pos[10] // the intruder's y, which is its latitude
    const report = separateIslands(
      pos, mesh, 1, 4, vertexIsland, faceIsland, alive, R0_KM, 1, newContactScratch(cellBuckets().length),
    )
    expect(report.found).toBe(1)
    // 0.4 degrees of a 6371 km sphere is about 44 km.
    expect(report.deepestKm).toBeGreaterThan(30)
    expect(report.deepestKm).toBeLessThan(60)
    // Out across the equator, southwards, not up over the far corner.
    expect(pos[10]).toBeLessThan(before)
  })

  it('leaves a point of the same island alone, however deep inside', () => {
    const { pos, mesh } = setUp(3, 1)
    const same = Uint16Array.from([1, 1, 1, 1])
    const kept = Float64Array.from(pos)
    const report = separateIslands(
      pos, mesh, 1, 4, same, faceIsland, alive, R0_KM, 1, newContactScratch(cellBuckets().length),
    )
    expect(report.found).toBe(0)
    expect([...pos]).toEqual([...kept])
  })

  it('leaves two islands that merely touch alone', () => {
    // Outside the triangle by half a degree: contact, not interpenetration,
    // and pushing here would open every closed ocean back up.
    const { pos, mesh } = setUp(3, -0.5)
    const kept = Float64Array.from(pos)
    const report = separateIslands(
      pos, mesh, 1, 4, vertexIsland, faceIsland, alive, R0_KM, 1, newContactScratch(cellBuckets().length),
    )
    expect(report.found).toBe(0)
    expect([...pos]).toEqual([...kept])
  })

  it('moves the triangle back as far as it moves the point out', () => {
    const { pos, mesh } = setUp(3, 0.4)
    const before = [0, 1, 2, 3].map((v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]])
    separateIslands(
      pos, mesh, 1, 4, vertexIsland, faceIsland, alive, R0_KM, 1, newContactScratch(cellBuckets().length),
    )
    // The four points' centre of mass must not have moved: a contact that
    // pushed only the intruder would walk the pair of islands across the globe.
    for (let k = 0; k < 3; k++) {
      const was = before.reduce((sum, p) => sum + p[k], 0)
      let now = 0
      for (let v = 0; v < 4; v++) now += pos[v * 3 + k]
      expect(now).toBeCloseTo(was, 6)
    }
  })
})

describe('carrying the frames to the viewer', () => {
  // Ten megabytes of positions is two thirds of what a visitor waits for, so
  // the frames go over the wire as differences with their bytes split. Both
  // halves lean on Int16 arithmetic wrapping identically on the way out and the
  // way in, which is the kind of thing that works until a position happens to
  // land near the end of the range.
  it('gives back exactly what it was handed', () => {
    const vertexCount = 7
    const words = vertexCount * 3
    const frames = [0, 1, 2, 3].map((f) => Int16Array.from(
      { length: words },
      (_, i) => Math.round(32767 * Math.sin(i * 1.7 + f * 0.4)),
    ))
    const round = readFrames(
      writeFrames(frames, vertexCount).buffer as ArrayBuffer, vertexCount,
    )
    for (let f = 0; f < frames.length; f++) {
      expect([...round.subarray(f * words, (f + 1) * words)]).toEqual([...frames[f]])
    }
  })

  it('survives a jump across the whole range, where the wrap-around bites', () => {
    // A point at one extreme followed by the other is a difference of 65534,
    // which does not fit in a short. It has to come back anyway.
    const frames = [
      Int16Array.from([32767, -32768, 0]),
      Int16Array.from([-32768, 32767, 32767]),
      Int16Array.from([0, 0, -32768]),
    ]
    const round = readFrames(writeFrames(frames, 1).buffer as ArrayBuffer, 1)
    expect([...round]).toEqual([...frames[0], ...frames[1], ...frames[2]])
  })

  it('gives back a one-byte channel exactly, wrap and all', () => {
    // How deep inside the shell each point sits under the fold. Nearly all of
    // it is 255 and the rest changes by a step or two a frame, so it goes over
    // as differences too -- with Uint8 wrapping instead of Int16.
    const frames = [
      Uint8Array.from([255, 0, 128, 255]),
      Uint8Array.from([0, 255, 129, 254]),
      Uint8Array.from([255, 255, 1, 0]),
    ]
    const round = readChannel(writeChannel(frames).buffer as ArrayBuffer, 4)
    expect([...round]).toEqual([...frames[0], ...frames[1], ...frames[2]])
  })
})

describe('folding un-erupted crust inside the shell', () => {
  /**
   * A patch of the sphere whose crust has not erupted yet, at 10 Ma, with
   * everything else already there.
   *
   * The claim being tested is the one the whole file rests on: the crust that
   * exists stays on the shell, the crust that does not hangs below it by as
   * much crust as lies between it and the nearest living shore, and the
   * triangles at the join -- the ones with a corner either side -- are the ones
   * asked to bring the two shores together.
   */
  const patch = (radiusRad: number) => {
    const { positions, indices } = buildIcosphere(4)
    const vertexCount = positions.length / 3
    const faceCount = indices.length / 3
    const mesh = new DynamicMesh(vertexCount, faceCount, indices)
    const faceAge = new Float32Array(faceCount).fill(PERMANENT_MA)
    // Centred on the north pole, so "inside the patch" is just a latitude.
    for (let f = 0; f < faceCount; f++) {
      let z = 0
      for (let k = 0; k < 3; k++) z += positions[indices[f * 3 + k] * 3 + 2]
      if (Math.acos(Math.min(1, z / 3)) < radiusRad) faceAge[f] = 0
    }
    const restEdge = new Float64Array(faceCount * 3)
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const a = indices[f * 3 + k] * 3
        const b = indices[f * 3 + ((k + 1) % 3)] * 3
        restEdge[f * 3 + k] = R0_KM * Math.hypot(
          positions[a] - positions[b], positions[a + 1] - positions[b + 1],
          positions[a + 2] - positions[b + 2],
        )
      }
    }
    const pos = Float64Array.from(positions, (v) => v * R0_KM)
    return { mesh, pos, faceAge, restEdge, vertexCount, faceCount, positions, indices }
  }

  it('sinks only the crust that is not there yet, by how much crust it carries', () => {
    const { mesh, pos, faceAge, restEdge, vertexCount, faceCount } = patch(0.5)
    const crustHere = new Uint8Array(faceCount)
    const closing = new Uint8Array(faceCount)
    const scratch = newFoldScratch(vertexCount)
    markCrust(mesh, faceAge, 10, crustHere, closing, scratch)
    const result = measureFold(
      mesh, restEdge, crustHere, closing, vertexCount, R0_KM, 0, scratch,
    )
    pullInward(pos, vertexCount, scratch, 1)

    expect(result.sunk).toBeGreaterThan(0)
    // Every point that touches crust is still exactly on the shell, and every
    // point that does not is below it.
    for (let v = 0; v < vertexCount; v++) {
      const at = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
      if (scratch.onShell[v]) expect(at).toBeCloseTo(R0_KM, 6)
      else expect(at).toBeLessThan(R0_KM)
    }
    // The patch is 0.5 radians across, so its middle is about a quarter of a
    // radian -- 1,600 km of crust -- from the nearest shore, and the deepest
    // point hangs by that much rather than by some fixed amount.
    expect(result.hangingKm).toBeGreaterThan(1000)
    expect(result.hangingKm).toBeLessThan(0.5 * R0_KM)
    // Compressed towards the centre, never past it.
    expect(result.deepestKm).toBeLessThan(result.hangingKm)
    expect(result.deepestKm).toBeLessThan(R0_KM)
  })

  it('asks the triangles at the join, and only those, to shut the gap', () => {
    const { mesh, faceAge, restEdge, vertexCount, faceCount } = patch(0.5)
    const crustHere = new Uint8Array(faceCount)
    const closing = new Uint8Array(faceCount)
    const scratch = newFoldScratch(vertexCount)
    markCrust(mesh, faceAge, 10, crustHere, closing, scratch)
    measureFold(mesh, restEdge, crustHere, closing, vertexCount, R0_KM, 0, scratch)

    let shut = 0
    for (let f = 0; f < faceCount; f++) {
      if (!closing[f]) continue
      shut++
      // Not crust, and touching some.
      expect(crustHere[f]).toBe(0)
      let touching = 0
      for (let k = 0; k < 3; k++) if (scratch.onShell[mesh.faceVerts[f * 3 + k]]) touching++
      expect(touching).toBeGreaterThan(0)
    }
    expect(shut).toBeGreaterThan(0)
    // A rim, not the whole patch: the crust deep inside it is crumpled and
    // asks for nothing.
    let dead = 0
    for (let f = 0; f < faceCount; f++) if (!crustHere[f]) dead++
    expect(shut).toBeLessThan(dead)
  })

  it('releases the crust at the lip of a closing ridge and holds the rest out', () => {
    const { mesh, faceAge, restEdge, vertexCount, faceCount, positions } = patch(0.5)
    const crustHere = new Uint8Array(faceCount)
    const closing = new Uint8Array(faceCount)
    const scratch = newFoldScratch(vertexCount)
    markCrust(mesh, faceAge, 10, crustHere, closing, scratch)
    measureFold(mesh, restEdge, crustHere, closing, vertexCount, R0_KM, 400, scratch)

    // The patch is at the north pole, so the south pole is as far from any
    // closing ridge as the sphere allows: pinned to the shell. A point on the
    // rim is free to tip into the slot.
    let farthest = 0
    for (let v = 1; v < vertexCount; v++) {
      if (positions[v * 3 + 2] < positions[farthest * 3 + 2]) farthest = v
    }
    expect(scratch.hold[farthest]).toBe(1)
    let atTheLip = 0
    for (let f = 0; f < faceCount; f++) {
      if (!closing[f]) continue
      for (let k = 0; k < 3; k++) {
        const v = mesh.faceVerts[f * 3 + k]
        if (scratch.onShell[v]) { atTheLip = v; break }
      }
      if (atTheLip) break
    }
    expect(scratch.hold[atTheLip]).toBe(0)
  })
})

describe('telling crust from seam', () => {
  /**
   * Two triangles sharing an edge: one is a normal mesh triangle, the other has
   * had a collapse either side of it and now bridges a thousand kilometres of
   * sea floor that does not exist at this time.
   *
   * The one that matters is the second. Its inside is painted by interpolating
   * between its corners, so without this it shows a thousand kilometres of
   * ocean floor -- ridge and all -- squeezed into one triangle. That is what a
   * reader watching the East Pacific Rise close saw: the ridge still there in
   * the middle, growing and blurring as the triangles around it grew.
   */
  const at = (lonDeg: number, latDeg: number) => {
    const lon = (lonDeg * Math.PI) / 180
    const lat = (latDeg * Math.PI) / 180
    const c = Math.cos(lat)
    return [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)]
  }

  it('marks a triangle that bridges crust that is gone, and leaves the rest alone', () => {
    // Four points: a tight triangle of three, plus one a long way east.
    const dirs = Float32Array.from([
      ...at(0, 0), ...at(1, 0), ...at(0.5, 1), ...at(12, 0),
    ])
    // Face 0 is the tight one; face 1 reaches out to the distant point.
    const index = Uint32Array.from([0, 1, 2, 1, 2, 3])
    const seam = new Float32Array(4)
    measureSeams(dirs, index, index.length, seam)
    // A degree is 111 km, so the tight triangle spans well under the threshold.
    expect(seam[0]).toBe(0)
    // The far corner and the two it reaches back to are all on the seam: eleven
    // degrees is more than 1200 km.
    expect(seam[3]).toBe(1)
    expect(seam[1]).toBe(1)
    expect(seam[2]).toBe(1)
  })

  it('ramps rather than switching, so a closing ocean does not flicker', () => {
    expect(seamReach(SEAM_START_KM - 1)).toBe(0)
    expect(seamReach(SEAM_START_KM + 1)).toBeGreaterThan(0)
    expect(seamReach((SEAM_START_KM + SEAM_FULL_KM) / 2)).toBeCloseTo(0.5, 2)
    expect(seamReach(SEAM_FULL_KM * 10)).toBe(1)
  })

  it('leaves a present-day mesh entirely unmarked', () => {
    // The whole point of the threshold: at 0 Ma nothing has collapsed, so
    // nothing may be tinted. The widest triangle in the shipped mesh spans
    // 132 km, well inside the 220 the ramp starts at.
    const dirs = Float32Array.from([...at(0, 0), ...at(1, 0), ...at(0.5, 1)])
    const seam = new Float32Array(3)
    measureSeams(dirs, Uint32Array.from([0, 1, 2]), 3, seam)
    expect([...seam]).toEqual([0, 0, 0])
  })
})

describe('linking lit cells into curves', () => {
  /**
   * One north-south scarp, three cells across, with a guide axis that points
   * north everywhere.
   *
   * Three cells is what a real detection looks like after thinning: the
   * non-maximum suppression narrows a scarp but does not reduce it to a single
   * cell everywhere along its length. The linker used to answer with a curve
   * for each of them -- five of the twelve zones a reader picked off the globe
   * were the same scarp counted over and over -- so this is the regression
   * test for that.
   */
  const scarp = () => {
    const width = 720
    const height = 360
    const size = width * height
    const ridgeness = new Float32Array(size)
    for (let row = 100; row < 260; row++) {
      for (let column = 359; column <= 361; column++) {
        // A little variation across the scarp so there is a real maximum to
        // find, and along it so the walk is not choosing between equals.
        ridgeness[row * width + column] = 3 - Math.abs(column - 360) + (row % 7) * 0.01
      }
    }
    const field = {
      width, height, ridgeness,
      // Bearing zero: the lineaments run north-south, which is the way the
      // scarp goes.
      axis: new Uint8Array(size),
      coherence: new Uint8Array(size).fill(200),
      known: new Uint8Array(size).fill(1),
    }
    return field
  }

  it('answers with one curve for one scarp, not one per cell across it', () => {
    const field = scarp()
    const curves = linkCurves(field, field, R0_KM)
    expect(curves.length).toBe(1)
    // And it is the whole scarp, not a fragment of it.
    expect(curves[0].length).toBeGreaterThan(140)
  })

  it('keeps two scarps that are genuinely apart', () => {
    const field = scarp()
    for (let row = 100; row < 260; row++) {
      for (let column = 400; column <= 402; column++) {
        field.ridgeness[row * field.width + column] = 3 - Math.abs(column - 401)
      }
    }
    expect(linkCurves(field, field, R0_KM).length).toBe(2)
  })
})

describe('painting the detected zones', () => {
  // The detector answers in curves a cell wide, which at eleven kilometres a
  // cell is invisible on a globe. The raster widens them so they can be seen,
  // and the widening must not invent detections where there were none: a lone
  // cell becomes a small patch, and empty ground stays empty.
  it('widens a detection without spreading it across the map', () => {
    const width = 40
    const height = 20
    const ridgeness = new Float32Array(width * height)
    ridgeness[10 * width + 20] = 5
    const painted = zoneRaster({
      width, height, ridgeness,
      axis: new Uint8Array(width * height),
      coherence: new Uint8Array(width * height),
      known: new Uint8Array(width * height).fill(1),
    }, [[10 * width + 20]], 1)
    expect(painted.strength[10 * width + 20]).toBeGreaterThan(0)
    expect(painted.strength[10 * width + 21]).toBeGreaterThan(0)
    expect(painted.strength[9 * width + 19]).toBeGreaterThan(0)
    expect(painted.strength[10 * width + 23]).toBe(0)
    let lit = 0
    for (const v of painted.strength) if (v) lit++
    expect(lit).toBe(9)
    // The whole patch belongs to the one curve it was widened from, so a click
    // anywhere in it names the same fracture zone.
    expect(painted.curve[10 * width + 20]).toBe(1)
    expect(painted.curve[9 * width + 21]).toBe(1)
    expect(painted.curve[10 * width + 23]).toBe(0)
  })

  it('paints nothing at all when nothing was detected', () => {
    const width = 20
    const height = 10
    const painted = zoneRaster({
      width, height,
      ridgeness: new Float32Array(width * height),
      axis: new Uint8Array(width * height),
      coherence: new Uint8Array(width * height),
      known: new Uint8Array(width * height).fill(1),
    }, [])
    expect(painted.strength.some((v) => v !== 0)).toBe(false)
    expect(painted.curve.some((v) => v !== 0)).toBe(false)
  })
})

describe('fitting a direction to the whole ocean', () => {
  const W = 180
  const H = 90
  const flat: Grid = {
    width: W, height: H, scale: 1, offset: 0, units: 'test',
    samples: new Int16Array(W * H).fill(100),
  }
  /** Age rising northwards: the crust travelled north everywhere. */
  const northwards = () => {
    const age = new Float32Array(W * H)
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) age[r * W + c] = (H - r) * 2
    return age
  }
  /** One anchor patch, running east, square to what the age grid says. */
  const anchors = (fromCol: number, toCol: number) => {
    const ridgeness = new Float32Array(W * H)
    const axis = new Uint8Array(W * H)
    for (let c = fromCol; c < toCol; c++) {
      ridgeness[(H / 2) * W + c] = 1
      // A bearing of ninety degrees east of north, in the stored encoding.
      axis[(H / 2) * W + c] = 128
    }
    return {
      width: W, height: H, ridgeness, axis,
      coherence: new Uint8Array(W * H).fill(255),
      known: new Uint8Array(W * H).fill(1),
    }
  }
  /** The fitted bearing at a place, degrees east of north, folded to 0-180. */
  const bearing = (field: ReturnType<typeof flowField>, lonDeg: number, latDeg: number) => {
    const [x, y, z] = lonLatToDirection((lonDeg * Math.PI) / 180, (latDeg * Math.PI) / 180)
    const flow = flowAt(field, x, y, z, [0, 1, 0])
    let nx = -y * x, ny = 1 - y * y, nz = -y * z
    const nl = Math.hypot(nx, ny, nz)
    nx /= nl; ny /= nl; nz /= nl
    const ex = ny * z - nz * y, ey = nz * x - nx * z, ez = nx * y - ny * x
    const deg = (Math.atan2(
      flow!.tx * ex + flow!.ty * ey + flow!.tz * ez,
      flow!.tx * nx + flow!.ty * ny + flow!.tz * nz,
    ) * 180) / Math.PI
    return ((deg % 180) + 180) % 180
  }

  // The whole reason for fitting a field rather than reading a gradient: an
  // anchor is evidence about its neighbourhood, not only about its own cell.
  it('follows the anchors where they are and the age grid where they are not', () => {
    const field = flowField(anchors(85, 95), northwards(), W, H, flat, R0_KM, {
      width: W, height: H, passes: 300,
    })
    // Longitude 0 is the middle of the anchor patch, so the answer there runs
    // east -- but not exactly east, and that is the design rather than a
    // shortfall. An anchor weighs 0.6, so two fifths of its own cell is still
    // its neighbours, and out here they are all being told north by the age
    // grid. It comes out around 82 degrees: firmly the anchor's answer, pulled
    // a little towards the ocean around it, which is what makes one wrong
    // anchor survivable.
    expect(bearing(field, 0, 0)).toBeGreaterThan(70)
    // A quarter of the way round the world from it, nothing but the age grid
    // is talking, and the age grid says the crust went north.
    expect(bearing(field, -90, 0) % 180).toBeCloseTo(0, 0)
  })

  it('carries an anchor into the ground beside it, and lets go with distance', () => {
    const field = flowField(anchors(85, 95), northwards(), W, H, flat, R0_KM, {
      width: W, height: H, passes: 300,
    })
    const near = bearing(field, 0, 6)
    const far = bearing(field, 0, 40)
    // Near the patch the answer is pulled well off what the age grid alone
    // would say; far from it, it has gone back.
    const fromNorth = (deg: number) => Math.min(deg, 180 - deg)
    expect(fromNorth(near)).toBeGreaterThan(fromNorth(far) + 10)
  })
})

describe('the lines in the age grid\'s jumps', () => {
  // Half a degree a cell, a ridge along longitude zero spreading east and west
  // at two million years a degree, with a six-million-year terrace every five
  // degrees on top of the slope -- the compiled age grid's own banding -- and a
  // fracture zone along the equator across which the southern flank is offset
  // by twenty million years.
  //
  // That gives one of each kind of bright line in the jump field. The terraces
  // put a north-south edge every five degrees, which the crust crosses; the
  // offset puts an east-west line along the equator, which the crust runs
  // along. Only the second is a path. The slope between the terraces is left
  // in because it is the reference that tells the two apart, and a synthetic
  // with flat bands would have nothing to read it from.
  const W = 720
  const H = 360
  const ages = new Raster(W, H, new Float32Array(W * H))
  for (let r = 0; r < H; r++) {
    const lat = 90 - ((r + 0.5) / H) * 180
    for (let c = 0; c < W; c++) {
      const lon = ((c + 0.5) / W) * 360 - 180
      ages.data[r * W + c] = 2 * Math.abs(lon)
        + 6 * Math.floor(Math.abs(lon) / 5)
        + (lat < 0 ? 20 : 0)
    }
  }
  // The threshold is given rather than measured from this field: a tenth of
  // these cells are terrace edges, so the ninetieth centile lands on the
  // edges themselves. What the real grid's own distribution says is the third
  // test below. Four is above the two Ma per hundred km the slope reads and
  // well below the eight an edge reads.
  const field = stepAnchors(ages, { width: 180, height: 90, windowKm: 200, minStep: 4 })
  const at = (lonDeg: number, latDeg: number) => {
    const i = Math.floor(((90 - latDeg) / 180) * 90) * 180
      + Math.floor(((lonDeg + 180) / 360) * 180)
    return { kind: field.kind[i], bearing: (field.axis[i] / 256) * 180, share: field.ridgeness[i] }
  }

  it('anchors the flow along an offset of the isochrons', () => {
    const on = at(30, 0)
    expect(on.kind).toBe(StepKind.Along)
    // East-west, which is the way the crust travelled here.
    expect(Math.min(on.bearing, 180 - on.bearing)).toBeGreaterThan(75)
    expect(on.share).toBeGreaterThan(0)
  })

  // The discriminator, and the reason it reads the climb off the line rather
  // than on it: a disc centred on the offset averages both sides and reports
  // the offset, which would refuse this very anchor.
  it('ignores the terrace edges between the age bands', () => {
    let along = 0
    let across = 0
    for (let lon = 10; lon <= 60; lon += 2) {
      const kind = at(lon, 30).kind
      if (kind === StepKind.Along) along++
      if (kind === StepKind.Across) across++
    }
    expect(across).toBeGreaterThan(0)
    expect(along).toBe(0)
  })

  it('finds a jump far above a spreading gradient and calls the slope nothing', () => {
    const steps = ageSteps(ages)
    // A terrace edge steps six million years over a cell of fifty-five km, so
    // it is worth about ten Ma per hundred km, where the slope between the
    // edges reads two -- so the top of the distribution is a jump and the
    // middle of it is a slope.
    expect(steps.quantile(0.99)).toBeGreaterThan(10)
    expect(steps.quantile(0.5)).toBeLessThan(steps.quantile(0.99))
  })
})

describe('the gravity grid in the repository', () => {
  const file = resolve(import.meta.dirname, '../data-src/vgg.grid')
  const present = existsSync(file)

  // The dataset is committed, so this is a check on the file itself rather than
  // on anything computed: it is what the crustal fabric is read from, and a
  // truncated or re-fetched-and-different file should fail here rather than
  // show up as a globe that looks slightly wrong.
  it.runIf(present)('covers the planet at a tenth of a degree, land included', () => {
    const grid = readGrid(readFileSync(file))
    expect([grid.width, grid.height]).toEqual([3600, 1800])
    expect(grid.units).toBe('vgg (Eotvos)')

    let covered = 0
    let total = 0
    for (let row = 0; row < grid.height; row++) {
      const weight = Math.cos(Math.PI * (0.5 - (row + 0.5) / grid.height))
      for (let column = 0; column < grid.width; column++) {
        total += weight
        if (grid.samples[row * grid.width + column] !== GRID_GAP) covered += weight
      }
    }
    expect(covered / total).toBeGreaterThan(0.98)

    // Land specifically. The altimetry stops at about 81 degrees and nowhere
    // else, so a grid that only surveyed the sea would fail here while still
    // passing the figure above.
    const land: Array<[number, number]> = [
      [-100, 40], [25, 55], [80, 25], [-60, -10], [20, 0], [135, -25],
    ]
    for (const [lon, lat] of land) {
      const column = Math.floor(((lon + 180) / 360) * grid.width)
      const row = Math.floor(((90 - lat) / 180) * grid.height)
      expect(grid.samples[row * grid.width + column], `${lon}, ${lat}`).not.toBe(GRID_GAP)
    }
  })
})
