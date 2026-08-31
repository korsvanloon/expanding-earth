/**
 * Runs the two pipeline stages, skipping them when their output is already
 * newer than every input. The generated data is reproducible from the textures
 * in the repository, so it is not committed; this hook makes `npm run dev` just
 * work anyway.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
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
]

const mtime = (path: string) => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

const META = resolve(ROOT, 'public/data/meta.json')
const output = mtime(META)
const newestInput = Math.max(...inputs.map((p) => mtime(p) ?? 0))

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

if (output !== null && output > newestInput && builtAt === subdivision()) {
  console.log('[data] up to date')
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
}
