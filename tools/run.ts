/**
 * Runs the two pipeline stages, skipping them when their output is already
 * newer than every input. The generated data is reproducible from the textures
 * in the repository, so it is not committed; this hook makes `npm run dev` just
 * work anyway.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
  resolve(ROOT, 'public/textures/age-map.png'),
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
const inputHash = (() => {
  const digest = createHash('sha256')
  for (const path of [...inputs].sort()) {
    digest.update(path.slice(ROOT.length))
    try {
      digest.update(readFileSync(path))
    } catch {
      digest.update('missing')
    }
  }
  return digest.digest('hex')
})()

const META = resolve(ROOT, 'public/data/meta.json')
/** The hash the data on disk was built from, written after a successful run. */
const STAMP = resolve(ROOT, 'public/data/inputs.sha')
const builtFrom = (() => {
  try {
    return readFileSync(STAMP, 'utf8').trim()
  } catch {
    return null
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
  for (const stage of ['build-data.ts', 'solve.ts']) {
    const result = spawnSync(
      process.execPath,
      [resolve(ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(ROOT, 'tools', stage)],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  // Only once both stages have succeeded, or a crash halfway would leave a
  // stamp claiming the half-built data was current.
  writeFileSync(STAMP, `${inputHash}\n`)
}
