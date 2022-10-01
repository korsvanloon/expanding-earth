import { nukesWithPosition } from '../src/lib/game'
import { scenario } from '../src/data'

test.each([
  { time: 0, count: 6 }, //
  { time: 0.5, count: 12 },
  { time: 1, count: 18 },
  { time: 1.5, count: 17 },
])('nukesWithPosition:($time, $result)', ({ time, count }) =>
  expect(nukesWithPosition(scenario, time)).toHaveLength(count),
)
