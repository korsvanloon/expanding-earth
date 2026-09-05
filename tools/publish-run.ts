/**
 * Put a solved run somewhere the viewer can fetch it, without a deploy.
 *
 * A solve takes eight minutes and the Pages build then spends the same eight
 * minutes computing the same thing again, because the reconstruction is not
 * committed and the workflow's cache misses the moment the solver changes. The
 * app itself is usually untouched. So the run goes to a store instead, the
 * viewer fetches it from there, and a new reconstruction costs a push rather
 * than a build.
 *
 * **Nothing is ever overwritten.** Each run lands under `runs/<id>/`, where the
 * id is a hash of the run's own bytes, so every URL is immutable and any cache
 * anywhere may keep it forever -- which is the whole of the answer to "does
 * this go wrong with caching". The one mutable file is `runs.json`, a few
 * hundred bytes listing what exists, fetched with revalidation.
 *
 * The store here is a branch of this repository, served by jsDelivr, because it
 * needs no credentials that this machine does not already have. It is a branch
 * with no history: each publish writes a fresh orphan commit holding the runs
 * worth keeping, so the repository carries the runs that are listed and not
 * every run ever made. Point `PUBLISH_BASE` at a real blob store and only the
 * uploading changes; the layout and the immutability are the same.
 *
 *     pnpm tsx tools/publish-run.ts --label "shared slab, drag 0.1"
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Meta } from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const WORK = resolve(ROOT, '.stage/publish')
const BRANCH = process.env.PUBLISH_BRANCH ?? 'runs'
/**
 * How many runs the store keeps.
 *
 * What falls off the list is deleted, and that matters more here than it
 * would elsewhere: the store is a branch of this repository, so every run kept
 * is thirty megabytes that everyone who clones pays for. Three is enough to
 * hold the shipped run and two to compare it against. A real blob store has
 * no such limit -- point `RUN_STORE` at one and raise this.
 */
const KEEP = Number(process.env.PUBLISH_KEEP ?? 3)

/**
 * Everything the site serves for one run.
 *
 * The rasters are in here even though they come from the survey rather than
 * from the solve, and are the same in every run. A published run is meant to
 * be a whole site's worth of data: the deploy restores one and builds nothing,
 * so anything missing here is missing from the site.
 */
const FILES = [
  'meta.json', 'mesh.bin', 'frames.bin', 'topology.bin',
  'tracks.bin', 'sink.bin', 'strain.bin', 'plates.bin',
  'fabric.jpg', 'zones.png', 'crust.png',
  // The hash of every input this run was solved from, which is what lets the
  // deploy check that the run it restored is the one this code would make.
  'inputs.sha',
]

export interface PublishedRun {
  /** A hash of the run's own bytes, which is also its folder. */
  id: string
  /** What to call it in the viewer's list. */
  label: string
  /** Anything worth knowing about how it was made. */
  note?: string
  /** When it was solved, from the run's own metadata. */
  solvedAt: string
  /** The commit the solver was at, so a run can be traced back to its code. */
  commit: string
  /** Knobs this run was given, empty for the model as it ships. */
  overrides: string[]
  bytes: number
}

export interface RunIndex {
  version: 1
  /** Which run the viewer opens with. */
  default: string
  runs: PublishedRun[]
}

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()

const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : undefined
}

function collect() {
  const files: { name: string; bytes: Uint8Array }[] = []
  for (const name of FILES) {
    const path = join(DATA, name)
    if (!existsSync(path)) continue
    files.push({ name, bytes: readFileSync(path) })
  }
  // The coarse meshes the in-browser explorer solves on travel with the run,
  // because they are cut from the same data and a run's explorer should be
  // exploring that run.
  const preview = join(DATA, 'preview')
  if (existsSync(preview)) {
    for (const level of readdirSync(preview)) {
      for (const name of readdirSync(join(preview, level))) {
        files.push({
          name: `preview/${level}/${name}`,
          bytes: readFileSync(join(preview, level, name)),
        })
      }
    }
  }
  return files
}

function main() {
  if (!existsSync(join(DATA, 'meta.json'))) {
    throw new Error('there is no run in public/data to publish; run pnpm data first')
  }
  const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8')) as Meta & {
    builtAt: string
    overrides: string[]
  }
  const files = collect()
  const digest = createHash('sha256')
  for (const file of files) {
    digest.update(file.name)
    digest.update(file.bytes)
  }
  const id = digest.digest('hex').slice(0, 12)
  const bytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0)
  const run: PublishedRun = {
    id,
    label: arg('label') ?? (meta.overrides.length ? meta.overrides.join(', ') : 'the shipped model'),
    note: arg('note'),
    solvedAt: meta.builtAt,
    commit: git('rev-parse', '--short', 'HEAD'),
    overrides: meta.overrides,
    bytes,
  }

  // A worktree rather than a checkout, so the run being published stays where
  // it is and nothing about the branch you are on changes.
  rmSync(WORK, { recursive: true, force: true })
  git('worktree', 'prune')
  const known = git('ls-remote', '--heads', 'origin', BRANCH)
  if (known) {
    git('fetch', '--depth', '1', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`, '--force')
    git('worktree', 'add', '--force', '--detach', WORK, `origin/${BRANCH}`)
  } else {
    git('worktree', 'add', '--force', '--detach', WORK, 'HEAD')
    for (const entry of readdirSync(WORK)) {
      if (entry !== '.git') rmSync(join(WORK, entry), { recursive: true, force: true })
    }
  }

  const indexPath = join(WORK, 'runs.json')
  const index: RunIndex = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8')) as RunIndex
    : { version: 1, default: id, runs: [] }

  for (const file of files) {
    const path = join(WORK, 'runs', id, file.name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.bytes)
  }

  // Newest first, this run at the front, and no more than KEEP of them: what
  // falls off the list is deleted, so the repository holds what is listed.
  index.runs = [run, ...index.runs.filter((old) => old.id !== id)].slice(0, KEEP)
  index.default = arg('default') === 'no' ? index.default : id
  if (!index.runs.some((r) => r.id === index.default)) index.default = index.runs[0].id
  for (const entry of readdirSync(join(WORK, 'runs'))) {
    if (!index.runs.some((r) => r.id === entry)) {
      rmSync(join(WORK, 'runs', entry), { recursive: true, force: true })
    }
  }
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`)

  const inside = (...args: string[]) =>
    execFileSync('git', args, { cwd: WORK, encoding: 'utf8' }).trim()
  // A name of its own rather than the branch's, which the last publish will
  // have left behind here; what matters is the commit, and where it is pushed.
  const temporary = `publish-${id}`
  inside('checkout', '--orphan', temporary)
  inside('add', '-A')
  inside(
    '-c', 'user.name=publish-run', '-c', 'user.email=noreply@github.com',
    'commit', '-q', '-m',
    `The store, holding ${index.runs.length} run${index.runs.length === 1 ? '' : 's'}\n\n`
      + `Newest: ${run.label} (${id}), solved ${run.solvedAt} at ${run.commit}.\n`
      + 'A branch with no history: every publish writes the runs worth keeping\n'
      + 'as one commit, so the repository carries what is listed and not every\n'
      + 'run ever made. Paths under runs/<id>/ are never rewritten.\n',
  )
  inside('push', '--force', 'origin', `HEAD:${BRANCH}`)
  git('worktree', 'remove', '--force', WORK)
  try {
    git('branch', '-D', temporary)
  } catch {
    // Already gone with the worktree; nothing depends on it either way.
  }

  const base = `https://cdn.jsdelivr.net/gh/${
    git('remote', 'get-url', 'origin').replace(/.*github\.com[:/]/, '').replace(/\.git$/, '')
  }@${BRANCH}`
  console.log(`[publish] ${id}  ${run.label}  ${(bytes / 1e6).toFixed(1)} MB`)
  console.log(`[publish] ${index.runs.length} runs listed, default ${index.default}`)
  console.log(`[publish] ${base}/runs.json`)
}

main()
