/**
 * Fetch a measured strength field and store it as a compact binary.
 *
 * The model's rigidity is eleven numbers assigned by hand, one per ECM1
 * crustal type. A research pass found a measurement that replaces them over a
 * third of the globe: Audet & Bürgmann 2011's effective elastic thickness,
 * from the wavelet coherence between topography and Bouguer gravity, published
 * as `te_global.xyz` under an MIT licence.
 *
 * Te is the thickness of the elastic plate that would bend the way the real
 * lithosphere is observed to bend under its own loads. It is not a rigidity in
 * the solver's dimensionless sense and the mapping between them is a choice --
 * see `teRigidity` in shared/crust.ts, where that choice is written down.
 *
 * Two things about the file are lucky and one is not.
 *
 * The grid is 360x180 on cell centres with **row 0 at the north pole and
 * column 0 at 180 W**, which is already this pipeline's own order, so nothing
 * is flipped or resampled on the way in. It also matches ECM1's grid exactly,
 * cell for cell, which is what lets the two be read side by side.
 *
 * What is not lucky: Te is NaN over the oceans, 33% coverage, and the oceans
 * are where two thirds of this model's crust is. Worse, the same pass found
 * that a measured oceanic Te does not follow the sea-floor age at all past
 * about 60 Ma (Lu et al. 2021, JGR 126, on the Pacific), so there is no honest
 * way to extend this field outward with a cooling law. The sea floor keeps the
 * value it has, and the field says so by covering only what it covers.
 *
 *   pnpm exec tsx tools/fetch-te.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE =
  'https://raw.githubusercontent.com/paudetseis/GlobalTe/master/data/te_global.xyz'

const WIDTH = 360
const HEIGHT = 180

async function main() {
  console.log('[te] downloading the Audet & Burgmann 2011 global Te')
  const text = await (await fetch(SOURCE)).text()

  // Zero is the fill: Te is a plate thickness in kilometres and the published
  // range is 1 to 200, so no real cell can be confused with an absent one.
  const te = new Float32Array(WIDTH * HEIGHT)
  let parsed = 0
  let measured = 0
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const lon = Number(parts[0])
    const lat = Number(parts[1])
    if (Number.isNaN(lon) || Number.isNaN(lat)) continue
    const value = Number(parts[2])
    // Cell centres on half degrees, row 0 at the north pole -- the same
    // arithmetic as tools/fetch-crust.ts, on the same graticule.
    const row = Math.min(HEIGHT - 1, Math.max(0, Math.round(89.5 - lat)))
    const column = Math.min(WIDTH - 1, Math.max(0, Math.round(lon + 179.5)))
    parsed++
    if (!Number.isFinite(value) || value <= 0) continue
    te[row * WIDTH + column] = value
    measured++
  }
  if (parsed !== WIDTH * HEIGHT) {
    throw new Error(`expected ${WIDTH * HEIGHT} cells, parsed ${parsed}`)
  }

  const out = resolve(ROOT, 'data-src/te.bin')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, Buffer.concat([
    Buffer.from(new Uint32Array([WIDTH, HEIGHT]).buffer),
    Buffer.from(te.buffer),
  ]))

  const values = [...te].filter((x) => x > 0).sort((a, b) => a - b)
  const q = (p: number) => values[Math.floor(p * (values.length - 1))]
  console.log(
    `[te] ${measured} cells measured of ${parsed} (${(100 * measured / parsed).toFixed(1)}% `
    + `of the grid by cell); Te p10 ${q(0.1)} km, median ${q(0.5)}, p90 ${q(0.9)}, `
    + `max ${values[values.length - 1]}`,
  )
  console.log(`[te] wrote ${out}`)
}

await main()
