import { describe, expect, it } from 'vitest'
import { buildIcosphere, sphericalTriangleArea } from '../tools/lib/icosphere'
import { crustScale, sampleCurve, MIN_SCALE, TAU_MA } from '../shared/model'

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
