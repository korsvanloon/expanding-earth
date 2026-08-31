/**
 * Fill the generated figures in README.md and MODEL.md from the run on disk.
 *
 * Run after `pnpm data`. `pnpm test` checks the result, so a model change that
 * moves the numbers fails the build until this has been run.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Meta } from '../shared/model.js'
import { blocksIn, fillBlocks, runBlocks } from './lib/docs.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const DOCUMENTS = ['README.md', 'MODEL.md']

export function readMeta(): Meta {
  return JSON.parse(readFileSync(resolve(ROOT, 'public/data/meta.json'), 'utf8')) as Meta
}

function main() {
  const blocks = runBlocks(readMeta())
  for (const name of DOCUMENTS) {
    const path = resolve(ROOT, name)
    const before = readFileSync(path, 'utf8')
    const after = fillBlocks(before, blocks)
    const asked = blocksIn(before)
    const unknown = asked.filter((b) => !(b in blocks))
    if (unknown.length) {
      throw new Error(`${name} asks for blocks that do not exist: ${unknown.join(', ')}`)
    }
    if (after === before) {
      console.log(`[docs] ${name} already current (${asked.length} block(s))`)
      continue
    }
    writeFileSync(path, after)
    console.log(`[docs] ${name} updated (${asked.length} block(s))`)
  }
}

main()
