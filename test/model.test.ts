import { describe, expect, it } from 'vitest'
import { buildIcosphere, sphericalTriangleArea } from '../tools/lib/icosphere'
import { crustScale, sampleCurve, MIN_SCALE, TAU_MA } from '../shared/model'
import { directionToUv, lonLatToDirection } from '../shared/sphere'
import { loadRaster } from '../tools/lib/raster'
import { resolve } from 'node:path'

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
