/**
 * Runs the two pipeline stages, skipping them when their output is already
 * newer than every input. The generated data is reproducible from the textures
 * in the repository, so it is not committed; this hook makes `npm run dev` just
 * work anyway.
 */
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputs = [
  'tools/build-data.ts',
  'tools/solve.ts',
  'tools/lib/raster.ts',
  'tools/lib/icosphere.ts',
  'shared/model.ts',
  'public/textures/age-map.png',
  'public/textures/height-map.jpg',
].map((p) => resolve(ROOT, p))

const mtime = (path: string) => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

const output = mtime(resolve(ROOT, 'public/data/meta.json'))
const newestInput = Math.max(...inputs.map((p) => mtime(p) ?? 0))

if (output !== null && output > newestInput) {
  console.log('[data] up to date')
} else {
  for (const stage of ['build-data.ts', 'solve.ts']) {
    const result = spawnSync(
      process.execPath,
      [resolve(ROOT, 'node_modules/tsx/dist/cli.mjs'), resolve(ROOT, 'tools', stage)],
      { stdio: 'inherit' },
    )
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}
