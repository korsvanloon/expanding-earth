/**
 * Runs the two pipeline stages, skipping them when their output is already
 * newer than every input. The generated data is reproducible from the textures
 * in the repository, so it is not committed; this hook makes `npm run dev` just
 * work anyway.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { subdivision } from './lib/resolution.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every source the pipeline reads, found rather than listed.
 *
 * The list used to be written out by hand, and it had drifted: the dynamic mesh
 * was not on it, so changing how the triangulation collapses and flips -- which
 * is most of what the solver does -- left the data untouched and the viewer
 * quietly serving the run before. A stale build that looks like a change with
 * no effect is worse than a slow one.
 */
const sources = (dir: string): string[] =>
  readdirSync(resolve(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(`${dir}/${entry.name}`)
      : entry.name.endsWith('.ts')
        ? [resolve(ROOT, dir, entry.name)]
        : [],
  )

const inputs = [
  ...sources('tools'),
  ...sources('shared'),
  resolve(ROOT, 'public/textures/height-map.jpg'),
  // The datasets fetched by hand and committed: the crustal model and the
  // gravity grid. Refetching one has to rebuild, for the same reason changing
  // the code does.
  ...readdirSync(resolve(ROOT, 'data-src')).map((name) => resolve(ROOT, 'data-src', name)),
]

/**
 * What the inputs are, by content rather than by clock.
 *
 * This used to compare modification times, and that is wrong in the one place
 * it matters most. A fresh checkout writes every file at the same instant, so
 * in the Pages workflow "is the output newer than every input" is a coin toss
 * -- and a restored build cache arrives with new timestamps too. A hash is the
 * same answer on a laptop, on a runner, and after a cache restore.
 *
 * It also closes the failure this file's own comment warns about from the other
 * side: a change with no effect on the data now provably has none, because the
 * hash is unchanged, rather than merely appearing to.
 */
const hashOf = (paths: string[]) => {
  const digest = createHash('sha256')
  for (const path of [...paths].sort()) {
    digest.update(path.slice(ROOT.length))
    try {
      digest.update(readFileSync(path))
    } catch {
      digest.update('missing')
    }
  }
  return digest.digest('hex')
}

const inputHash = hashOf(inputs)

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
const stageHash = hashOf(inputs.filter((path) => !SOLVER.includes(path)))

const META = resolve(ROOT, 'public/data/meta.json')
/** The hash the data on disk was built from, written after a successful run. */
const STAMP = resolve(ROOT, 'public/data/inputs.sha')
/** And the same for the mesh alone, written after the first stage. */
const STAGE_STAMP = resolve(ROOT, '.stage/stage.sha')
const stamp = (path: string) => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}
const builtFrom = stamp(STAMP)
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
  run('solve.ts')
  // Only once both stages have succeeded, or a crash halfway would leave a
  // stamp claiming the half-built data was current.
  writeFileSync(STAMP, `${inputHash}\n`)
}
