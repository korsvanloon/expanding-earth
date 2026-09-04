/**
 * Where the age jumps, and which of those jump lines the paths are anchored to.
 *
 * The base is the size of the age jump over the whole world -- quiet where the
 * sea floor gets steadily older, cream where it steps. A reader looked at that
 * picture and named what it shows: bands of gradients, and a dividing line
 * between two bands that is a good indicator for a path.
 *
 * On top of it, one tick per cell of the anchor field, so which lines were
 * taken can be checked by looking:
 *
 *   amber   a jump line running with the flow -- a band boundary or any other
 *           offset of the isochrons. This anchors the direction field.
 *   slate   a jump line running across the flow -- a ridge crest, or a terrace
 *           edge between the age bands the grid was compiled from. Ignored:
 *           the age gradient already knows the crust crosses it.
 *   violet  a jump line where the climb either side is too flat to say which
 *           of the two it is. Also ignored.
 *
 *     LON=-180,180 LAT=-90,90 SCALE=1 tsx tools/draw-steps.ts
 *     LON=-60,10 LAT=-15,20 SCALE=3 tsx tools/draw-steps.ts
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAgeGrid } from './lib/agegrid.js'
import { StepKind, ageSteps, stepAnchors } from './lib/age-steps.js'
import { stepWindow, windowFromEnv, type Colour } from './lib/window-map.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.env.OUT ?? '.stage/maps')

const COLOUR: Record<number, Colour> = {
  [StepKind.Along]: [255, 176, 46],
  [StepKind.Across]: [96, 112, 136],
  [StepKind.Unread]: [150, 110, 190],
}

async function main() {
  const window = windowFromEnv()
  const ages = await loadAgeGrid(resolve(ROOT, 'data-src/agegrid.nc'))
  const steps = ageSteps(ages)
  const full = steps.quantile(0.99)
  console.log(
    `[steps] age jump, Ma per 100 km: median ${steps.quantile(0.5).toFixed(1)}, `
      + `q90 ${steps.quantile(0.9).toFixed(1)}, q99 ${full.toFixed(1)}`,
  )
  const canvas = stepWindow(window, steps, full)

  const field = stepAnchors(ages, {
    width: Number(process.env.FW ?? 720),
    height: Number(process.env.FH ?? 360),
    windowKm: Number(process.env.STEP_WINDOW ?? 150),
    maxOffDeg: Number(process.env.STEP_OFF ?? 30),
    regionalKm: Number(process.env.AGE_DISC ?? 200),
  })
  console.log(
    `[steps] ${field.counts.along} cells anchor the flow field, `
      + `${field.counts.across} run across it, ${field.counts.unread} unreadable`,
  )

  // One tick per cell that has a line, drawn along the line it found. Long
  // enough to read as a direction and short enough that neighbouring cells do
  // not merge into a mat.
  const cellDeg = 180 / field.height
  const half = Number(process.env.TICK ?? 0.45) * cellDeg
  let drawn = 0
  for (let row = 0; row < field.height; row++) {
    const lat = 90 - ((row + 0.5) / field.height) * 180
    for (let column = 0; column < field.width; column++) {
      const at = row * field.width + column
      const kind = field.kind[at]
      if (!kind) continue
      const lon = ((column + 0.5) / field.width) * 360 - 180
      if (lon < window.lonFrom || lon > window.lonTo) continue
      if (lat < window.latFrom || lat > window.latTo) continue
      drawn++
      const bearing = ((field.axis[at] / 256) * Math.PI)
      // A degree of longitude is shorter than a degree of latitude away from
      // the equator, so a tick drawn in degrees has to be stretched to come
      // out at the bearing it means.
      const stretch = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
      const dLon = Math.sin(bearing) * half * stretch
      const dLat = Math.cos(bearing) * half
      const from = canvas.at(lon - dLon, lat - dLat)
      const to = canvas.at(lon + dLon, lat + dLat)
      canvas.line(from, to, COLOUR[kind])
    }
  }
  console.log(`[steps] ${drawn} lines in the window`)
  console.log(`[steps] ${canvas.write(resolve(OUT, 'steps.png'))}`)
}

await main()
