/**
 * Crust at least this strong belongs to an island that keeps its shape: shields
 * at 1.00, platforms at 0.90, stable basins at 0.70. Orogens, thinned margins,
 * island arcs and sea floor are all below it and stay free to bend -- though
 * the thick ones among them still resist being stretched, which is a different
 * question and is answered by their thickness.
 */
export const holdStrength = Number(process.env.ISLAND_STRENGTH ?? 0.7)
const HOLD_STRENGTH = holdStrength
/** Smaller than this fraction of the sphere and it is not worth holding. */
const SMALLEST = Number(process.env.SMALLEST_ISLAND ?? 0.0002)

/**
 * The islands of crust that are not allowed to lose their shape.
 *
 * Not plates: plates covered the whole sphere and had to account for every
 * triangle, which is what made them arbitrary. These are islands -- the pale
 * ground on the crustal strength map, shields and platforms and stable basins,
 * connected up wherever it is continuous. Arabia, Madagascar, India, western
 * and eastern Australia, Greenland, the Siberian and East European platforms,
 * the several pieces of Africa. Between them the crust is free, because between
 * them the crust really is: orogens, thinned margins, island arcs, sea floor.
 *
 * A shield does not deform. Springs alone say that only locally -- a correction
 * has to diffuse across thirty triangles to reach the far side of a craton, and
 * forty sweeps barely manage it -- so each island is also fitted as a whole and
 * pulled back towards the one rigid position that best explains where its
 * points have got to.
 */
export function findIslands(
  indices: Uint32Array,
  rigidity: Float32Array,
  faceArea: Float64Array,
  faceCount: number,
  vertexCount: number,
) {
  const neighbourOf: number[][] = Array.from({ length: faceCount }, () => [])
  {
    const seen = new Map<number, number>()
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) {
        const x = indices[f * 3 + k]
        const y = indices[f * 3 + ((k + 1) % 3)]
        const key = Math.min(x, y) * vertexCount + Math.max(x, y)
        const other = seen.get(key)
        if (other === undefined) seen.set(key, f)
        else {
          neighbourOf[f].push(other)
          neighbourOf[other].push(f)
        }
      }
    }
  }

  const island = new Int32Array(faceCount).fill(-1)
  const areas: number[] = []
  const stack: number[] = []
  for (let f = 0; f < faceCount; f++) {
    if (island[f] >= 0 || rigidity[f] < HOLD_STRENGTH) continue
    const id = areas.length
    let area = 0
    island[f] = id
    stack.push(f)
    while (stack.length) {
      const g = stack.pop()!
      area += faceArea[g]
      for (const n of neighbourOf[g]) {
        if (island[n] >= 0 || rigidity[n] < HOLD_STRENGTH) continue
        island[n] = id
        stack.push(n)
      }
    }
    areas.push(area)
  }

  // Too small to hold a shape worth keeping.
  const minArea = SMALLEST * 4 * Math.PI
  const keep = new Map<number, number>()
  areas.forEach((area, id) => {
    if (area >= minArea) keep.set(id, keep.size)
  })
  const vertexIsland = new Int32Array(vertexCount).fill(-1)
  for (let f = 0; f < faceCount; f++) {
    const id = island[f] < 0 ? undefined : keep.get(island[f])
    if (id === undefined) continue
    for (let k = 0; k < 3; k++) vertexIsland[indices[f * 3 + k]] = id
  }
  const across = [...keep.keys()]
    .map((id) => Math.round(2 * 6371 * Math.asin(Math.sqrt(areas[id] / (4 * Math.PI)))))
    .sort((a, b) => b - a)
  console.log(
    `[solve] ${keep.size} islands of strong crust, ${across.slice(0, 10).join(' ')} km across` +
      `${across.length > 10 ? ` ... ${across[across.length - 1]}` : ''}`,
  )
  return { vertexIsland, count: keep.size }
}
