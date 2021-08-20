import { Vector2, Vector3 } from 'three'
import { getIntermediatePoint, pointToUv, uvToPoint } from '../src/lib/sphere'

describe('uvToPoint', () => {
  test.each([
    { point: new Vector3(0, 1, 0), uv: new Vector2(0.5, 0) },
    { point: new Vector3(0, -1, 0), uv: new Vector2(0.5, 1) },
    { point: new Vector3(0, 0, 1), uv: new Vector2(0.5, 0.5) },
    { point: new Vector3(0.475, -0.587, 0.654), uv: new Vector2(0.6, 0.7) },
  ])('uv:($uv.x, $uv.y) => p:($point.x, $point.y, $point.z)', ({ point, uv }) => {
    const result = uvToPoint(uv)
    expect(result.x).toBeCloseTo(point.x)
    expect(result.y).toBeCloseTo(point.y)
    expect(result.z).toBeCloseTo(point.z)
  })
})

describe('pointToUv', () => {
  test.each([
    { point: new Vector3(0, 1, 0), uv: new Vector2(0.5, 0) },
    { point: new Vector3(0, -1, 0), uv: new Vector2(0.5, 1) },
    { point: new Vector3(0, 0, 1), uv: new Vector2(0.5, 0.5) },
    { point: new Vector3(0.475, -0.587, 0.654), uv: new Vector2(0.6, 0.7) },
  ])('p:($point.x, $point.y, $point.z) => uv:($uv.x, $uv.y)', ({ point, uv }) => {
    const result = pointToUv(point)
    expect(result.x).toBeCloseTo(uv.x)
    expect(result.y).toBeCloseTo(uv.y)
  })
})

describe('symmetry', () => {
  test.each([
    new Vector2(0.5, 0.5), //
    // new Vector2(0.4, 0.7),
    new Vector2(0.6, 0.7),
  ])('uv:($x, $y)', (uv) => {
    const result = pointToUv(uvToPoint(uv))
    expect({ x: result.x, y: result.y }).toEqual({ x: uv.x, y: uv.y })
  })
})

describe('getIntermediatePoint', () => {
  test.each([
    {
      start: new Vector3(0, 1, 0),
      end: new Vector3(0, 0.5, 0),
      fraction: 0,
      expected: new Vector3(0, 1, 0),
    },
    {
      start: new Vector3(0, 1, 0),
      end: new Vector3(0, 0.5, 0),
      fraction: 1,
      expected: new Vector3(0, 0.5, 0),
    },
  ])(
    'start:($start.x, $start.y, $start.z) end:($end.x, $end.y, $end.z) $fraction expected:($expected.x, $expected.y, $expected.z)',
    ({ start, end, fraction, expected }) => {
      const result = getIntermediatePoint(start, end, fraction)
      expect({ x: result.x, y: result.y, z: result.z }).toEqual({
        x: expected.x,
        y: expected.y,
        z: expected.z,
      })
    },
  )
})
