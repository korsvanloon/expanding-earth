/**
 * The sea-floor age grid, read from netCDF rather than from a picture of it.
 *
 * The model ran for a long time off `public/textures/age-map.png`, which is a
 * faithful but lossy rendering of this same grid: 255 grey levels over 280
 * million years, so **1.1 Ma to the level**. That was invisible while the fold
 * could only take crust that was wholly gone. It stopped being invisible the
 * moment the fold started walking each edge through the grid and asking how
 * much of it exists: at a half spreading rate of 33 km/Myr one grey level is 36
 * km of ridge-perpendicular distance, and the walk resolves 8 km. The texture
 * had become the limit, not the mesh.
 *
 * So this reads the grid itself. Muller et al. 2019 Tectonics v2.0, present
 * day, 0.1 degrees, float ages to 338.81 Ma with NaN over land -- against 280
 * Ma and "white means undated" in the picture.
 *
 * **Two conventions to get right, and they cancelled once.** GMT counts rows
 * from the south pole up; everything in this project counts from the north pole
 * down, because that is what `directionToPixel` answers to. And the grid is
 * node-registered: it has a row *at* each pole and a column at -180 and again
 * at +180, where a cell-centred raster has neither. Comparing the netCDF
 * against the PNG while assuming the netCDF was north-up made the PNG look
 * upside down, which it is not -- two flips reading as none. The check that
 * settles it takes a second: the bottom tenth of the PNG's rows is 97.7%
 * undated, and that is Antarctica.
 */
import h5wasm from 'h5wasm'
import { readFileSync } from 'node:fs'
import { Raster } from './raster.js'

/**
 * Load it as a cell-centred raster, rows north to south, no repeated meridian.
 *
 * Async because the HDF5 reader is a WebAssembly module and has to start up.
 * `width` and `height` are the output grid; the source has one more of each,
 * being node-registered, so each output cell is the average of the four nodes
 * at its corners -- which is exactly a half-cell box average, and puts the
 * samples where a raster expects them. A cell goes NaN as soon as two of its
 * four corners are, the same majority rule the downsamplers use, so a
 * coastline stays where it is instead of growing a fringe of invented ages.
 */
export async function loadAgeGrid(path: string): Promise<Raster> {
  const { FS } = await h5wasm.ready
  FS.writeFile('/agegrid.nc', readFileSync(path))
  const file = new h5wasm.File('/agegrid.nc', 'r')
  const z = file.get('z') as { shape: number[]; value: Float32Array }
  // Read once and hold it: `value` pulls the whole dataset out of the file
  // every time it is touched, so indexing into it in a loop reads the file
  // per cell and never finishes.
  const source = z.value
  const [nodeRows, nodeColumns] = z.shape
  if (!(source instanceof Float32Array)) {
    throw new Error(`${path}: expected float ages, got ${(source as object).constructor.name}`)
  }
  const latAscending = (file.get('lat') as { value: Float64Array }).value
  const southUp = latAscending[0] < latAscending[latAscending.length - 1]
  file.close()

  const width = nodeColumns - 1
  const height = nodeRows - 1
  const out = new Float32Array(width * height)
  const node = (row: number, column: number) => {
    // The source row for output row `row`, counting from whichever pole the
    // file starts at.
    const r = southUp ? nodeRows - 1 - row : row
    return source[r * nodeColumns + (column % nodeColumns)]
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      let dated = 0
      for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
        const v = node(y + dr, x + dc)
        if (!Number.isNaN(v)) { sum += v; dated++ }
      }
      // Two missing of four is a majority once ties go to missing, as above.
      out[y * width + x] = dated <= 2 ? NaN : sum / dated
    }
  }
  return new Raster(width, height, out)
}
