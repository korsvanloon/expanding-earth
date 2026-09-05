/**
 * What the reconstruction is made of, so that a rebuild can be decided by it.
 *
 * `tools/run.ts` hashes these and compares the hash to the one written beside
 * the data it finds; the Pages workflow leans on the same hash to know whether
 * the run it restored from the store is the one this code would produce. Both
 * questions are the same question, and getting the list wrong is expensive in
 * one direction and wrong in the other: too narrow and a stale reconstruction
 * ships, too wide and a change that cannot affect the answer throws away
 * twenty-five megabytes of run and eight minutes of solving.
 *
 * It used to be every file in `tools/` and `shared/`. That is too wide, and
 * the moment there was a tool for publishing runs it started costing: editing
 * the publisher changed the hash of the reconstruction it had just published.
 * So the list is the import graph of the programs that actually make data --
 * which cannot drift, because it is read from the imports themselves rather
 * than kept by hand.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** The programs that write something into `public/data`. */
export const ENTRIES = ['build-data.ts', 'build-preview.ts', 'solve.ts']

/** `from './x.js'`, `from '../shared/y.js'`, and the bare `import './z.js'`. */
const SPECIFIER = /(?:from|import)\s*['"](\.[^'"]+)['"]/g

/**
 * Every source file the given programs reach, following relative imports.
 *
 * Specifiers are written with a `.js` ending because that is what TypeScript's
 * module resolution asks for; the file on disk is the `.ts`.
 */
export function sourceGraph(root: string, entries = ENTRIES): string[] {
  const seen = new Set<string>()
  const queue = entries.map((name) => resolve(root, 'tools', name))
  while (queue.length) {
    const file = queue.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const [, specifier] of text.matchAll(SPECIFIER)) {
      queue.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')))
    }
  }
  return [...seen]
}

/** The data the pipeline reads: the maps in the repository and the datasets beside them. */
export function dataInputs(root: string): string[] {
  return [
    resolve(root, 'public/textures/height-map.jpg'),
    // Fetched by hand and committed: the crustal model and the gravity grid.
    // Refetching one has to rebuild, for the same reason changing code does.
    ...readdirSync(resolve(root, 'data-src')).map((name) => resolve(root, 'data-src', name)),
  ]
}

export const allInputs = (root: string) => [...sourceGraph(root), ...dataInputs(root)]

/**
 * What the inputs are, by content rather than by clock.
 *
 * Timestamps are wrong in the one place this matters most. A fresh checkout
 * writes every file at the same instant, so on a runner "is the output newer
 * than every input" is a coin toss -- and a restored cache arrives with new
 * timestamps too. A hash is the same answer on a laptop, on a runner, and
 * after a cache restore.
 */
export function hashOf(root: string, paths: string[]): string {
  const digest = createHash('sha256')
  for (const path of [...paths].sort()) {
    digest.update(path.slice(root.length))
    try {
      digest.update(readFileSync(path))
    } catch {
      digest.update('missing')
    }
  }
  return digest.digest('hex')
}
