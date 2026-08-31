import { PERMANENT_MA } from '../../shared/model.js'
import { CRUST_TYPES, type CrustType } from '../../shared/crust.js'

/**
 * The crust ECM1 reads as having been pulled out: extended crust and the
 * continental margins beside it.
 *
 * An island arc is thin too, and it was never stretched -- it is thin because
 * it is young volcanic crust built on nothing. Un-stretching it was what made
 * Central America start deforming within the first twenty million years, which
 * is a thing the model was doing to itself rather than a thing the data said.
 */
const STRETCHED: CrustType[] = ['EXCT', 'COMA']

/**
 * The crust ECM1 reads as having been piled up: mountain belts and the arcs
 * behind them.
 *
 * The same argument as for stretching, run the other way. A shield is forty
 * kilometres thick; the Andes and the Himalaya are fifty to seventy, and they
 * are thick because they were shortened. Crust conserves its volume, so a belt
 * now sixty kilometres thick covered half again as much ground before it was
 * shortened, and run backwards it has to spread out again -- the knuckle
 * unbending.
 *
 * This is also what the sea floor between the mountains needs. Two fifths of
 * the ocean triangles are drawn out into needles because the crust there is
 * being squeezed and has nowhere to go, and redrawing which piece lies against
 * which cannot help with that. What compressed crust does in the ground is get
 * thicker, and this is the model finally saying so.
 */
const SHORTENED: CrustType[] = ['ORON', 'COAR']

/** The most a mountain belt is believed to have been shortened. */
const MAX_SHORTENING = Number(process.env.MAX_SHORTENING ?? 1.6)

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
  crustType?: Uint8Array,
) {
  const stretched = new Set<CrustType>(STRETCHED)
  const shortened = new Set<CrustType>(SHORTENED)
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
    const type = crustType ? (CRUST_TYPES[crustType[f]] as CrustType) : undefined
    if (type && shortened.has(type)) {
      // Thicker than unextended crust, so it covered more ground before it was
      // piled up. Capped, because the thickest cells in a one-degree grid are
      // as likely to be the grid as the rock.
      stretch[f] = Math.max(1 / MAX_SHORTENING, Math.min(1, reference / thickness[f]))
      continue
    }
    if (type && !stretched.has(type)) continue
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
  // Oldest sea floor first, and claimed rather than merely visited first, so a
  // margin takes the age of the ocean it actually rifted from. Sorting the
  // seeds and then walking breadth-first does not do it: every seed sits at
  // depth zero, so the nearest water wins whatever its age, and a margin facing
  // an ancient ocean would date itself off some young sea a little closer.
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
  const REACH = 12
  const depth = new Int32Array(faceCount)
  for (const f of queue) depth[f] = 0
  for (let round = 0; round < REACH; round++) {
    const frontier = queue.slice()
    queue.length = 0
    for (const f of frontier) {
      for (const n of neighbourOf[f]) {
        if (riftMa[n] >= 0) continue
        riftMa[n] = riftMa[f]
        depth[n] = depth[f] + 1
        queue.push(n)
      }
    }
    if (!queue.length) break
  }
  for (let f = 0; f < faceCount; f++) if (riftMa[f] < 0) riftMa[f] = 0

  let thinned = 0
  let piled = 0
  for (let f = 0; f < faceCount; f++) {
    if (stretch[f] > 1.05) thinned++
    if (stretch[f] < 0.95) piled++
  }
  console.log(
    `[solve] unextended continental crust ${reference.toFixed(0)} km; ` +
      `${((100 * thinned) / faceCount).toFixed(1)}% of the shell reads as stretched, ` +
      `${((100 * piled) / faceCount).toFixed(1)}% as piled up`,
  )
  return { stretch, riftMa }
}
