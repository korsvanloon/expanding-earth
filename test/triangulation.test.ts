import { Vector2 } from 'three'
import { Polygon, getPointsAtTime } from '../src/lib/polygon'

const polygon: Polygon = {
  points: [new Vector2(0, 0)],
  timeline: [
    {
      time: 0.1,
      points: [new Vector2(1, 1)],
    },
  ],
}

describe('getPointsAtTime', () => {
  test.each([
    { time: 0.0, expectation: [0, 0] },
    { time: 0.1, expectation: [1, 1] },
    { time: 0.05, expectation: [0.5, 0.5] },
  ])('time: $time => $expectation', ({ time, expectation }) => {
    const result = getPointsAtTime(polygon, time)
    expect(result[0].toArray()).toStrictEqual(expectation)
  })
})
