/**
 * Runs the two pipeline stages, skipping them when their output is already
 * newer than every input. The generated data is reproducible from the textures
 * in the repository, so it is not committed; this hook makes `npm run dev` just
 * work anyway.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allInputs, hashOf } from './lib/inputs.js'
import { subdivision } from './lib/resolution.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every source the pipeline reads, found rather than listed.
 *
 * Twice found the wrong way. A hand-written list drifted -- the dynamic mesh
 * was not on it, so changing how the triangulation collapses and flips left the
 * data untouched and the viewer quietly serving the run before. Every file in
 * `tools/` and `shared/` cannot drift but is too wide, and that started costing
 * the moment runs were published from here: editing the publisher changed the
 * hash of the reconstruction it had just published, and the deploy would solve
 * eight minutes to reach the same answer. It is the import graph of the
 * programs that write data; see tools/lib/inputs.ts.
 */
const inputs = allInputs(ROOT)

const inputHash = hashOf(ROOT, inputs)

/**
 * The same, for the first stage alone: everything but the solver.
 *
 * The two stages have different inputs and wildly different costs -- two
 * minutes to read the grids and cut the mesh, eleven to run two hundred steps
 * over it -- and they shared one hash, so editing `solve.ts` threw away the
 * mesh as well and paid for both. Which is most iterations, here and in the
 * Pages workflow.
 *
 * Only the solver is held out, rather than a hand-picked list of what the
 * first stage reads: this file's own comment records what happened the last
 * time such a list existed, which is that it drifted and a stale build looked
 * like a change with no effect. Holding out one file cannot drift, because
 * `build-data.ts` does not and could not import the solver -- the dependency
 * runs the other way, and a test says so.
 */
/**
 * Two files, since the solver was split: `tools/lib/solver.ts` is the whole of
 * it and `tools/solve.ts` is now a dozen lines of command line around it. The
 * split was for the browser -- a worker cannot import `node:fs` -- and if only
 * the old name were held out here, every change to the solver would throw the
 * mesh away again and pay two minutes for nothing.
 */
const SOLVER = ['tools/solve.ts', 'tools/lib/solver.ts'].map((p) => resolve(ROOT, p))
const stageHash = hashOf(ROOT, inputs.filter((path) => !SOLVER.includes(path)))

const META = resolve(ROOT, 'public/data/meta.json')
/** The hash the data on disk was built from, written after a successful run. */
const STAMP = resolve(ROOT, 'public/data/inputs.sha')
/** And the same for the mesh alone, written after the first stage. */
const STAGE_STAMP = resolve(ROOT, '.stage/stage.sha')
/** And for the coarse meshes the viewer's explorer solves on. */
const PREVIEW_STAMP = resolve(ROOT, '.stage/preview.sha')
const stamp = (path: string) => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}
const builtFrom = stamp(STAMP)
const havePreview = (() => {
  try {
    return statSync(resolve(ROOT, 'public/data/preview/4/mesh.bin')).size > 0
  } catch {
    return false
  }
})()
const haveData = (() => {
  try {
    return statSync(META).size > 0
  } catch {
    return false
  }
})()

/**
 * What resolution the data on disk was built at.
 *
 * A draft run leaves a coarse mesh behind with a fresh timestamp, which a
 * timestamp check alone would call up to date -- so the next `pnpm dev` would
 * serve a draft as though it were the published run, and the only clue would be
 * triangles the size of Spain.
 */
const builtAt = (() => {
  try {
    return JSON.parse(readFileSync(META, 'utf8')).subdivision as number
  } catch {
    return null
  }
})()

if (haveData && builtFrom === inputHash && builtAt === subdivision()) {
  console.log(`[data] up to date (inputs ${inputHash.slice(0, 12)})`)
} else {
  if (builtAt !== null && builtAt !== subdivision()) {
    console.log(`[data] on disk is subdivision ${builtAt}, asked for ${subdivision()}; rebuilding`)
  }
  const run = (stage: string) => {
    const result = spawnSync(
      process.execPath,
      [resolve(ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(ROOT, 'tools', stage)],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) process.exit(result.status ?? 1)
  }

  const haveMesh = (() => {
    try {
      return statSync(resolve(ROOT, 'public/data/mesh.bin')).size > 0
    } catch {
      return false
    }
  })()
  /**
   * What resolution the *mesh* was cut at, which is not what meta.json says.
   *
   * meta.json is the solver's, so on a resolution change it still describes the
   * previous run until the solve finishes -- and using it here would skip
   * rebuilding the very mesh whose resolution changed. `SUBDIV` is read from
   * the environment and so is invisible to the input hash, which is the whole
   * reason this check exists; the handover file is the only place that records
   * the answer for the mesh alone.
   */
  const meshAt = (() => {
    try {
      return JSON.parse(
        readFileSync(resolve(ROOT, '.stage/meta.partial.json'), 'utf8'),
      ).subdivision as number
    } catch {
      return null
    }
  })()
  if (haveMesh && stamp(STAGE_STAMP) === stageHash && meshAt === subdivision()) {
    console.log(`[data] mesh is up to date (${stageHash.slice(0, 12)}); solving only`)
  } else {
    run('build-data.ts')
    mkdirSync(dirname(STAGE_STAMP), { recursive: true })
    writeFileSync(STAGE_STAMP, `${stageHash}\n`)
  }
  /**
   * The coarse inputs the viewer's explorer solves on, on the same stamp as
   * the mesh, since it is the same stage at another resolution.
   *
   * Its own stamp, though, so a checkout that has the mesh cached but not the
   * preview still builds it -- which is what the Pages runner looks like the
   * first time after this went in.
   */
  if (stamp(PREVIEW_STAMP) === stageHash && havePreview) {
    console.log('[data] preview meshes are up to date')
  } else {
    run('build-preview.ts')
    writeFileSync(PREVIEW_STAMP, `${stageHash}\n`)
  }
  run('solve.ts')
  // Only once both stages have succeeded, or a crash halfway would leave a
  // stamp claiming the half-built data was current.
  writeFileSync(STAMP, `${inputHash}\n`)
}
