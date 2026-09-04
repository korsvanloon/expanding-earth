/**
 * The coarse inputs the viewer's explorer solves on.
 *
 * A reader wants sliders: move the pair stiffness or the slab drag and watch
 * what it does to the reconstruction. The shipped run is seven and a half
 * minutes, which is not a slider, and almost all of that is the forty-one
 * thousand points. At subdivision 4 there are two and a half thousand and the
 * same solver takes half a minute, which is a button; with fewer relaxation
 * sweeps it is a few seconds.
 *
 * So this cuts a mesh at that resolution with the same code that cuts the real
 * one -- there is no second way to make one that would still be the same model
 * -- and keeps only the four files a solve reads. Everything else the stage
 * writes is a picture for the viewer, and the viewer already has those at full
 * resolution.
 *
 * What it does not do is pretend to be the model. A subdivision-4 answer is a
 * different answer, not a faster one: the points are five hundred kilometres
 * apart, so the fold, the rims and the margins all behave differently, and
 * measured against the shipped run its scorecard fits are hundreds of
 * kilometres out. It is for watching which way a knob pushes.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** Subdivisions to ship. One for now; the browser will say if it wants coarser. */
const LEVELS = (process.env.PREVIEW_LEVELS ?? '4').split(',').map(Number)
/** The four names the solver's host is asked for. */
const NEEDED = ['mesh.bin', 'tracks.bin', 'crust-age.bin']

for (const level of LEVELS) {
  const scratch = resolve(ROOT, `.stage/preview-${level}`)
  const out = resolve(ROOT, `public/data/preview/${level}`)
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  mkdirSync(out, { recursive: true })
  console.log(`[preview] cutting a mesh at subdivision ${level}`)
  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(ROOT, 'tools/build-data.ts')],
    {
      stdio: ['inherit', 'pipe', 'inherit'],
      env: {
        ...process.env,
        SUBDIV: String(level),
        DATA_OUT: scratch,
        STAGE_OUT: scratch,
      },
    },
  )
  if (result.status !== 0) process.exit(result.status ?? 1)
  let bytes = 0
  for (const name of [...NEEDED, 'meta.partial.json']) {
    copyFileSync(resolve(scratch, name), resolve(out, name))
    bytes += statSync(resolve(out, name)).size
  }
  rmSync(scratch, { recursive: true, force: true })
  console.log(
    `[preview] public/data/preview/${level}: ${
      [...NEEDED, 'meta.partial.json'].join(', ')} (${(bytes / 1e6).toFixed(1)} MB)`,
  )
}
