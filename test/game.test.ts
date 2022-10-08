import { withPosition } from '../src/lib/game'
import { scenario } from '../src/data'

test.each([
  { time: 0, count: 14 }, //
  { time: 0.5, count: 24 },
  { time: 4, count: 33 },
])('nukesWithPosition:\t$time\t$count', ({ time, count }) =>
  expect(withPosition(scenario, time)).toHaveLength(count),
)
