/**
 * Is the run in `public/data` the run this code would produce?
 *
 * The deploy does not solve. It restores the published run and builds the app
 * around it, which is only honest if that run came from this checkout --
 * otherwise the site would serve one model while the repository describes
 * another, and nothing would say so.
 *
 * `public/data/inputs.sha` is the hash of every file the reconstruction was
 * solved from, written by `tools/run.ts` when it finishes. This asks the same
 * question `tools/publish-run.ts` asks before it will publish, from the other
 * side: there, that the run about to be published matches the tree; here, that
 * the run that was published matches the tree that is being deployed.
 *
 * A mismatch is not something to work around in the workflow. It means a solve
 * was shipped without being published, and the answer is to publish it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { allInputs, hashOf } from './lib/inputs.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STAMP = resolve(ROOT, 'public/data/inputs.sha')

const stamped = existsSync(STAMP) ? readFileSync(STAMP, 'utf8').trim() : ''
const hash = hashOf(ROOT, allInputs(ROOT))

if (!stamped) {
  console.error(
    '[check] there is no run in public/data, or it carries no stamp.\n'
    + '        Solve one with `pnpm data` and publish it with\n'
    + '        `pnpm tsx tools/publish-run.ts --to s3 --label "..."`.',
  )
  process.exit(1)
}

if (stamped !== hash) {
  console.error(
    `[check] the run in public/data was solved from ${stamped.slice(0, 12)} and this tree\n`
    + `        hashes to ${hash.slice(0, 12)}, so it is not this code's answer.\n`
    + '        Solve it here with `pnpm data` and publish it with\n'
    + '        `pnpm tsx tools/publish-run.ts --to s3 --label "..."`.',
  )
  process.exit(1)
}

console.log(`[check] the run is this code's run (${hash.slice(0, 12)})`)
