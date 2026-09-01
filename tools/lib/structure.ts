/**
 * How busy the crust is around each point of the mesh.
 *
 * ECM1 answers what kind of crust a place is, once per square degree and out of
 * eleven names. That is the right question and much too coarse an answer: it
 * calls the whole Canadian Shield one thing, and it cannot see the suture
 * running through the middle of it. A gravity grid can. The vertical gravity
 * gradient responds to density contrasts a few kilometres down, so a fracture
 * zone, a failed rift, a buried suture and a mountain root all show up in it as
 * structure, at a tenth of a degree, over land and sea alike.
 *
 * Two numbers come back per vertex. The value is the field itself, which is
 * what you look at. The roughness is the size of its gradient nearby, which is
 * what you measure: flat means undisturbed crust, busy means crust that has
 * been worked. Deformation belongs in the second kind.
 */
import { GRID_GAP, type Grid } from './grid.js'
import { directionToPixel } from '../../shared/sphere.js'

export interface Structure {
  /** Mean field value in the neighbourhood, in the grid's own units. */
  value: Float32Array
  /** Mean gradient magnitude there, units per 100 km. */
  roughness: Float32Array
  /** How many vertices found no surveyed cell at all. */
  unsurveyed: number
}

/**
 * Sample a disc around every vertex.
 *
 * The disc is the mesh's own spacing wide, so neighbouring vertices see
 * overlapping but different crust and the field is smoothed to the resolution
 * the mesh can actually carry. Gradients are taken in kilometres rather than in
 * cells, because a cell of longitude is 11 km at the equator and 2 km at 80
 * degrees, and a measure that did not divide that out would call the Arctic the
 * most structured crust on the planet.
 */
export function sampleStructure(
  grid: Grid, dirs: Float32Array, vertexCount: number, radiusKm: number, r0: number,
): Structure {
  const value = new Float32Array(vertexCount)
  const roughness = new Float32Array(vertexCount)
  let unsurveyed = 0

  const cellHeightKm = (Math.PI * r0) / grid.height
  const rowReach = Math.max(1, Math.round(radiusKm / cellHeightKm))

  for (let v = 0; v < vertexCount; v++) {
    const x = dirs[v * 3], y = dirs[v * 3 + 1], z = dirs[v * 3 + 2]
    const [column, row] = directionToPixel(x, y, z, grid.width, grid.height)
    const lat = Math.PI * (0.5 - (row + 0.5) / grid.height)
    const cosLat = Math.max(1e-3, Math.cos(lat))
    const cellWidthKm = ((2 * Math.PI * r0) / grid.width) * cosLat
    const columnReach = Math.min(
      grid.width >> 1, Math.max(1, Math.round(radiusKm / cellWidthKm)),
    )

    let sum = 0
    let seen = 0
    let gradient = 0
    let gradients = 0
    for (let dr = -rowReach; dr <= rowReach; dr++) {
      const r = row + dr
      if (r < 1 || r >= grid.height - 1) continue
      // Cell width follows the row being read, not the vertex's own row: a disc
      // near the pole spans rows of very different widths.
      const rowLat = Math.PI * (0.5 - (r + 0.5) / grid.height)
      const widthKm = Math.max(
        0.01, ((2 * Math.PI * r0) / grid.width) * Math.max(1e-3, Math.cos(rowLat)),
      )
      for (let dc = -columnReach; dc <= columnReach; dc++) {
        const c = ((column + dc) % grid.width + grid.width) % grid.width
        const here = grid.samples[r * grid.width + c]
        if (here === GRID_GAP) continue
        sum += here * grid.scale + grid.offset
        seen++

        const east = grid.samples[r * grid.width + ((c + 1) % grid.width)]
        const west = grid.samples[r * grid.width + ((c - 1 + grid.width) % grid.width)]
        const south = grid.samples[(r + 1) * grid.width + c]
        const north = grid.samples[(r - 1) * grid.width + c]
        if (east === GRID_GAP || west === GRID_GAP
          || south === GRID_GAP || north === GRID_GAP) continue
        const dx = ((east - west) * grid.scale) / (2 * widthKm)
        const dy = ((north - south) * grid.scale) / (2 * cellHeightKm)
        gradient += Math.sqrt(dx * dx + dy * dy)
        gradients++
      }
    }
    if (!seen) {
      unsurveyed++
      value[v] = NaN
      roughness[v] = NaN
      continue
    }
    value[v] = sum / seen
    roughness[v] = gradients ? (100 * gradient) / gradients : 0
  }
  return { value, roughness, unsurveyed }
}

/**
 * Fill in the vertices the survey never reached, from their neighbours.
 *
 * Altimetry stops at about 81 degrees, so the ice caps come back as NaN, and a
 * NaN in a field the solver reads is a hole that spreads. Flooding from the
 * edge inwards over the mesh's own adjacency gives those vertices the value of
 * the nearest crust that was measured, which is the honest answer -- it says
 * "as far as anyone knows, like its neighbour" -- and it says how many vertices
 * had to be guessed at so the number can be reported rather than hidden.
 */
export function fillGaps(field: Float32Array, indices: ArrayLike<number>): number {
  const missing: number[] = []
  for (let v = 0; v < field.length; v++) if (Number.isNaN(field[v])) missing.push(v)
  if (!missing.length) return 0
  const filled = missing.length

  const neighbours: Set<number>[] = Array.from({ length: field.length }, () => new Set())
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]
      const b = indices[i + ((k + 1) % 3)]
      neighbours[a].add(b)
      neighbours[b].add(a)
    }
  }

  let frontier = missing
  while (frontier.length) {
    const next: number[] = []
    const settled: Array<[number, number]> = []
    for (const v of frontier) {
      let sum = 0
      let seen = 0
      for (const w of neighbours[v]) {
        if (!Number.isNaN(field[w])) { sum += field[w]; seen++ }
      }
      if (seen) settled.push([v, sum / seen])
      else next.push(v)
    }
    // Nothing settled this round means the remainder has no measured
    // neighbour anywhere; leave them at zero rather than looping forever.
    if (!settled.length) {
      for (const v of next) field[v] = 0
      break
    }
    for (const [v, mean] of settled) field[v] = mean
    frontier = next
  }
  return filled
}

/**
 * The roughness of the whole grid, at the grid's own resolution.
 *
 * The per-vertex figures above are what a point of crust carries, and they are
 * carried at the mesh's resolution: a hundred and twelve kilometres between
 * points, against eleven to the grid cell. Measured against the raw field, the
 * mesh keeps a little over half its variation -- and subdividing once more, at
 * four times the cost of every run, takes that only to about two thirds. So
 * looking at this through the vertices is the wrong way round. A raster
 * painted on the crust rides along with it exactly as the surface maps do, and
 * loses nothing.
 *
 * Encoded as a byte per cell, on the same logarithmic scale the viewer's ramp
 * uses, because roughness runs from single figures over a platform to six
 * hundred along an arc and a linear scale renders every ocean and every shield
 * the same near-black. Zero is reserved for ground the survey never reached, so
 * the ice caps read as unknown rather than as undisturbed.
 */
export const FABRIC_UNSURVEYED = 0
const FABRIC_FLOOR = 4
const FABRIC_CEILING = 512

export function fabricRaster(grid: Grid, r0: number): Uint8Array {
  const out = new Uint8Array(grid.width * grid.height)
  const cellHeightKm = (Math.PI * r0) / grid.height
  const span = Math.log2(FABRIC_CEILING / (FABRIC_FLOOR * 2))
  for (let row = 1; row < grid.height - 1; row++) {
    const lat = Math.PI * (0.5 - (row + 0.5) / grid.height)
    const widthKm = Math.max(
      0.01, ((2 * Math.PI * r0) / grid.width) * Math.max(1e-3, Math.cos(lat)),
    )
    for (let column = 0; column < grid.width; column++) {
      const east = grid.samples[row * grid.width + ((column + 1) % grid.width)]
      const west = grid.samples[row * grid.width + ((column - 1 + grid.width) % grid.width)]
      const south = grid.samples[(row + 1) * grid.width + column]
      const north = grid.samples[(row - 1) * grid.width + column]
      if (east === GRID_GAP || west === GRID_GAP
        || south === GRID_GAP || north === GRID_GAP) continue
      const dx = ((east - west) * grid.scale) / (2 * widthKm)
      const dy = ((north - south) * grid.scale) / (2 * cellHeightKm)
      const roughness = 100 * Math.sqrt(dx * dx + dy * dy)
      const t = Math.min(1, Math.max(0,
        Math.log2(Math.max(roughness, FABRIC_FLOOR) / (FABRIC_FLOOR * 2)) / span))
      out[row * grid.width + column] = 1 + Math.round(t * 254)
    }
  }
  return out
}
