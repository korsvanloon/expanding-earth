import { PERMANENT_MA } from '../../shared/model.js'

/** The most a piece of continental crust is believed to have been stretched. */
const MAX_STRETCH = Number(process.env.MAX_STRETCH ?? 2.5)

/**
 * How much each piece of continental crust was stretched to reach its present
 * thickness, and when that happened.
 *
 * Continental crust is about forty kilometres thick where nothing has happened
 * to it. The places ECM1 reads as thin -- the passive margins, the extended
 * crust behind them -- are thin because they were pulled out during rifting,
 * and crust conserves its volume: a margin now twenty kilometres thick covered
 * half the ground before it was stretched. Run backwards, it has to gather
 * itself back up.
 *
 * Which is also why those places show as weak on the strength map. They are not
 * weak by accident and then stretched; they are thin because they were
 * stretched, and thin is what weak means here. The reconstruction was treating
 * them as rigid pieces of their present size, so the crust it had to fit onto
 * the smaller Earth was several percent larger than the crust that actually
 * existed.
 *
 * When it happened is set by the ocean next door: a margin was pulled apart as
 * the sea floor beside it began to open, so the age of the nearest sea floor is
 * when to have finished putting it back.
 */
export function unstretching(
  thickness: Float32Array,
  faceAges: Float32Array,
  rigidity: Float32Array,
  faceCount: number,
  indices: Uint32Array,
) {
  // Unextended continental crust, read off the model rather than assumed: the
  // median thickness of the shields and platforms, which are the crust nothing
  // has pulled on.
  const intact: number[] = []
  for (let f = 0; f < faceCount; f++) if (rigidity[f] >= 0.9) intact.push(thickness[f])
  intact.sort((a, b) => a - b)
  const reference = intact.length ? intact[Math.floor(intact.length / 2)] : 40

  const stretch = new Float32Array(faceCount).fill(1)
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] < PERMANENT_MA || thickness[f] <= 0) continue
    // Capped: past about two and a half the crust is no longer a stretched
    // continent but the start of an ocean, and ECM1's thinnest cells are as
    // likely to be the grid being a degree across as they are to be real.
    stretch[f] = Math.min(MAX_STRETCH, Math.max(1, reference / thickness[f]))
  }

  // When the sea floor beside it opened, spread inland over the face graph.
  const riftMa = new Float32Array(faceCount).fill(-1)
  const queue: number[] = []
  for (let f = 0; f < faceCount; f++) {
    if (faceAges[f] >= PERMANENT_MA) continue
    riftMa[f] = faceAges[f]
    queue.push(f)
  }
  // Oldest sea floor first, so an inland margin takes the age of the ocean it
  // actually rifted from rather than of whatever water is nearest.
  queue.sort((a, b) => faceAges[b] - faceAges[a])

  // The face graph: two triangles are neighbours when they share an edge.
  const neighbourOf: number[][] = Array.from({ length: faceCount }, () => [])
  {
    const seen = new Map<number, number>()
    const width = indices.reduce((m, v) => Math.max(m, v), 0) + 1
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const x = indices[f * 3 + k]
        const y = indices[f * 3 + ((k + 1) % 3)]
        const key = Math.min(x, y) * width + Math.max(x, y)
        const other = seen.get(key)
        if (other === undefined) seen.set(key, f)
        else {
          neighbourOf[f].push(other)
          neighbourOf[other].push(f)
        }
      }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const f = queue[head]
    for (const n of neighbourOf[f]) {
      if (riftMa[n] >= 0) continue
      riftMa[n] = riftMa[f]
      queue.push(n)
    }
  }
  for (let f = 0; f < faceCount; f++) if (riftMa[f] < 0) riftMa[f] = 0

  let thinned = 0
  for (let f = 0; f < faceCount; f++) if (stretch[f] > 1.05) thinned++
  console.log(
    `[solve] unextended continental crust ${reference.toFixed(0)} km; ` +
      `${((100 * thinned) / faceCount).toFixed(1)}% of the shell reads as stretched`,
  )
  return { stretch, riftMa }
}
