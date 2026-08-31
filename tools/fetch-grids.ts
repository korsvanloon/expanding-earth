/**
 * Fetch a global grid from the Generic Mapping Tools server and store it in the
 * repository as one compact file.
 *
 * GMT publishes its remote datasets as netCDF-4, which is HDF5 underneath, so
 * reading one needs a library the browser has no business carrying. This runs
 * by hand, converts once, and writes `data-src/<name>.grid` -- gzipped int16 in
 * the source's own quantisation -- so that `pnpm data` never touches the network
 * and a build made today and a build made next year read the same numbers.
 *
 *   pnpm exec tsx tools/fetch-grids.ts vgg
 *   pnpm exec tsx tools/fetch-grids.ts vgg age relief
 *
 * See https://docs.generic-mapping-tools.org/6.5/datasets/ for the catalogue.
 *
 * Behind an HTTP proxy, run it as `NODE_USE_ENV_PROXY=1 pnpm exec tsx ...`:
 * Node's fetch ignores the standard proxy variables unless it is told not to,
 * and the symptom is a download that hangs rather than one that fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import h5wasm from 'h5wasm'
import { GRID_GAP, writeGrid } from './lib/grid.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = 'https://oceania.generic-mapping-tools.org/server/earth'

/**
 * Which grids we know how to fetch, and at what spacing.
 *
 * 06m is six arc minutes, a tenth of a degree, about 11 km at the equator. That
 * is the choice worth explaining: the mesh is 115 km between vertices and the
 * fracture-zone tracer walks in 40 km steps, so 11 km cells are already several
 * per step and finer ones would cost four times the file for detail nothing
 * downstream can use. Change the spacing here if that stops being true; the
 * finer tiers are JPEG2000 and would need a decoder as well.
 */
const CATALOGUE = {
  vgg: {
    file: 'earth_vgg/earth_vgg_06m_p.grd',
    note: 'Vertical gravity gradient (Sandwell et al.), Eotvos',
  },
  age: {
    file: 'earth_age/earth_age_06m_p.grd',
    note: 'Sea-floor age (EarthByte GTS2012), Myr',
  },
  relief: {
    file: 'earth_relief/earth_relief_06m_p.grd',
    note: 'SRTM15+ topography and bathymetry, m',
  },
} as const

type Name = keyof typeof CATALOGUE

async function main() {
  const wanted = process.argv.slice(2) as Name[]
  if (!wanted.length) {
    console.log(`usage: tsx tools/fetch-grids.ts ${Object.keys(CATALOGUE).join('|')}`)
    process.exit(1)
  }
  for (const name of wanted) {
    if (!CATALOGUE[name]) throw new Error(`unknown grid ${name}`)
    await fetchGrid(name)
  }
}

async function fetchGrid(name: Name) {
  const { file, note } = CATALOGUE[name]
  const url = `${SERVER}/${file}`
  console.log(`[grids] downloading ${url}`)
  const download = Buffer.from(await (await fetch(url)).arrayBuffer())
  console.log(`[grids]   ${(download.length / 1e6).toFixed(1)} MB of netCDF`)

  const { FS } = await h5wasm.ready
  FS.writeFile('grid.nc', new Uint8Array(download))
  const nc = new h5wasm.File('grid.nc', 'r')
  const z = nc.get('z') as { shape: number[]; value: Int16Array; attrs: Record<string, { value: unknown }> }
  // Read once and hold it. `value` is a getter that pulls the whole dataset out
  // of the HDF5 file every time it is touched, so a loop that indexes into it
  // reads thirteen megabytes per cell and never finishes.
  const source: ArrayLike<number> = z.value
  if (!(source instanceof Int16Array)) {
    throw new Error(`${name}: expected 16-bit samples, got ${(source as object).constructor.name}`)
  }
  const [height, width] = z.shape
  const number = (key: string, fallback: number) => {
    const raw = z.attrs[key]?.value as ArrayLike<number> | undefined
    return raw ? Number(raw[0]) : fallback
  }
  const scale = number('scale_factor', 1)
  const offset = number('add_offset', 0)
  const fill = number('_FillValue', GRID_GAP)
  const units = String((z.attrs.long_name?.value as string) ?? name)

  // GMT counts rows from the south pole up and we count from the north pole
  // down, so the rows come over backwards. Doing it here means every raster in
  // the project answers to directionToPixel and nothing downstream has to
  // remember which grid came from where.
  const samples = new Int16Array(width * height)
  // Coverage by area, not by cell. A cell at 85 degrees is a twelfth of the
  // ground an equatorial one covers, so counting cells makes the ice caps look
  // like a tenth of the planet when they are a fiftieth of it.
  let covered = 0
  let total = 0
  for (let row = 0; row < height; row++) {
    const from = (height - 1 - row) * width
    const weight = Math.cos(Math.PI * (0.5 - (row + 0.5) / height))
    for (let column = 0; column < width; column++) {
      const value = source[from + column]
      const gap = value === fill
      samples[row * width + column] = gap ? GRID_GAP : value
      total += weight
      if (!gap) covered += weight
    }
  }
  nc.close()

  const out = resolve(ROOT, `data-src/${name}.grid`)
  mkdirSync(dirname(out), { recursive: true })
  const written = writeGrid({ width, height, scale, offset, units, samples })
  writeFileSync(out, written)
  console.log(
    `[grids] wrote ${out} -- ${width}x${height} ${units}, ` +
      `${((100 * covered) / total).toFixed(1)}% of the globe surveyed, ` +
      `${(written.length / 1e6).toFixed(1)} MB\n` +
      `[grids]   ${note}`,
  )
}

main()
