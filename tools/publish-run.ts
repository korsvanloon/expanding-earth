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
 * Two stores, the same layout in both:
 *
 * - **Azure Blob** (`--to azure`), which is where these belong: nothing enters
 *   the repository, so a run costs nobody a slower clone and as many can be
 *   kept as are worth keeping. It needs `AZURE_BLOB_SAS` -- a container URL
 *   with a shared access signature that may read, write, delete and list.
 *   That is a secret and belongs in the environment, never in the repository.
 * - **A branch of this repository** (`--to branch`, the default until the
 *   container exists), served by jsDelivr, which needs no credentials this
 *   machine does not already have. It is a branch with no history: each
 *   publish writes one orphan commit holding the runs worth keeping.
 *
 *     pnpm tsx tools/publish-run.ts --label "shared slab, drag 0.1"
 *     pnpm tsx tools/publish-run.ts --to azure --label "drag 1, no sharing"
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Meta } from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * A container URL with a shared access signature on the end, for `--to azure`.
 *
 * Read, write, delete and list: publishing puts a run there, rewrites the
 * index, and deletes what has fallen off the list. The viewer needs none of
 * this -- it reads the container anonymously -- so this signature never leaves
 * the machine that publishes.
 */
const SAS = process.env.AZURE_BLOB_SAS
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
  /**
   * Every file in this run's folder.
   *
   * Listed because a store reached over HTTP cannot be copied wholesale the
   * way a checkout can: the deploy fetches these names one by one. Written
   * here rather than in the workflow so that adding a file to a run is one
   * change and not two, with the second one silently forgotten.
   */
  files: string[]
  /** What the run turned out to be; see `summarise`. */
  summary: RunSummary
}

/**
 * The few numbers that say what a run is, small enough to list.
 *
 * A run's own metadata is nine hundred kilobytes, and the point of a picker is
 * to choose *before* fetching thirty megabytes. So the numbers that decide
 * whether a reconstruction is any good are copied out at publish time: the
 * held-back pairs, which are the score, and the dated fits, which are the
 * check. The panel already draws the whole scorecard for the run on screen --
 * this is for the ones that are not.
 */
export interface RunSummary {
  endTimeMa: number
  subdivision: number
  vertexCount: number
  /** The sphere at the end of the run, km. */
  radiusKm: number
  /** Held-back conjugate pairs: median km and the share within 200 km. */
  pairs: { timeMa: number; medianKm: number; within: number }[]
  /**
   * Each scorecard fit, at the date the geology gives it.
   *
   * Some have no such date -- they are watched rather than scored -- and are
   * read at the end of the run instead, where they are worth looking at. They
   * say so, because a number with no date behind it is not a check.
   */
  fits: { a: string; b: string; atMa: number; watched?: true; km: number; matched: number }[]
  /** Of the sphere at the end: bare, and under two islands at once. */
  bare: number
  islandOverlap: number
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

/**
 * Read the summary out of a run's own metadata.
 *
 * Everything here is already measured by the solver and written to meta.json;
 * nothing is recomputed, so a summary cannot disagree with the run it
 * describes.
 */
function summarise(meta: Meta & {
  frameStepMa: number
  endTimeMa: number
  subdivision: number
  vertexCount: number
  diagnostics: Record<string, number>[]
  scorecard: {
    a: string; b: string; joinedByMa: number | null
    separationKm: number[]; matchedFraction: number[]
  }[]
}): RunSummary {
  const at = (timeMa: number) =>
    meta.diagnostics.find((d) => Math.abs(d.timeMa - timeMa) < 1e-9)
  const end = meta.diagnostics[meta.diagnostics.length - 1]
  return {
    endTimeMa: meta.endTimeMa,
    subdivision: meta.subdivision,
    vertexCount: meta.vertexCount,
    radiusKm: Math.round(end?.radiusKm ?? 0),
    pairs: [20, 60, 120].flatMap((timeMa) => {
      const d = at(timeMa)
      return d
        ? [{
            timeMa,
            medianKm: Math.round(d.conjugateMedianKm),
            within: Number(d.conjugateMatched.toFixed(3)),
          }]
        : []
    }),
    fits: meta.scorecard.map((fit) => {
      // Zero is how the scorecard says "no date from the geology": watched
      // rather than scored. Read at the end of the run, where two continents
      // that never parted should be together if they ever will be.
      const watched = !fit.joinedByMa
      const atMa = watched ? meta.endTimeMa : fit.joinedByMa
      const frame = Math.round(atMa / meta.frameStepMa)
      return {
        a: fit.a,
        b: fit.b,
        atMa,
        ...(watched ? { watched: true as const } : {}),
        km: Math.round(fit.separationKm[frame]),
        matched: Number(fit.matchedFraction[frame].toFixed(3)),
      }
    }),
    bare: Number((end?.gapFraction ?? 0).toFixed(4)),
    islandOverlap: Number((end?.islandOverlapFraction ?? 0).toFixed(4)),
  }
}

/**
 * Where each file comes from: a measurement run, else the built data.
 *
 * A sweep writes only what it solves -- the frames, the strain, the metadata --
 * because the mesh and the age grid it read are the same ones on disk. So
 * `--from .stage/sweep/g1` publishes that experiment as a run without having
 * to solve it again into public/data, which is the whole point of being able
 * to put two reconstructions side by side.
 */
const sourceOf = (name: string) => {
  const from = arg('from')
  if (from) {
    const path = resolve(ROOT, from, name)
    if (existsSync(path)) return path
  }
  return join(DATA, name)
}

function collect() {
  const files: { name: string; bytes: Uint8Array }[] = []
  for (const name of FILES) {
    const path = sourceOf(name)
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

async function main() {
  if (!existsSync(join(DATA, 'meta.json'))) {
    throw new Error('there is no run in public/data to publish; run pnpm data first')
  }
  const meta = JSON.parse(readFileSync(sourceOf('meta.json'), 'utf8')) as Parameters<
    typeof summarise
  >[0] & { builtAt: string; overrides: string[] }
  const files = collect().filter(
    // An experiment is not the model, and `inputs.sha` is what the deploy
    // trusts to decide it may skip solving. Publishing a sweep with the
    // shipped run's stamp on it would let a knob-turned run be restored as
    // though this code had made it.
    (file) => !(arg('from') && file.name === 'inputs.sha'),
  )
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
    files: files.map((file) => file.name),
    summary: summarise(meta),
  }

  if ((arg('to') ?? process.env.PUBLISH_TO ?? 'branch') === 'azure') {
    void toAzure(files, run)
    return
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

  const repository = git('remote', 'get-url', 'origin')
    .replace(/.*github\.com[:/]/, '').replace(/\.git$/, '')
  const base = `https://cdn.jsdelivr.net/gh/${repository}@${BRANCH}`
  // jsDelivr holds a branch for twelve hours at the edge, which is right for
  // the run folders and wrong for the one file that changes. The viewer reads
  // the index from raw.githubusercontent for that reason; this asks jsDelivr
  // to forget its copy anyway, so that anything else reading it -- a link
  // someone kept, a second viewer -- is not told about a run that has been
  // deleted. Best effort: a purge that fails costs nothing that matters.
  await fetch(`https://purge.jsdelivr.net/gh/${repository}@${BRANCH}/runs.json`)
    .then((r) => console.log(`[publish] purged the index from jsDelivr (${r.status})`))
    .catch(() => console.log('[publish] could not purge the index from jsDelivr'))
  console.log(`[publish] ${id}  ${run.label}  ${(bytes / 1e6).toFixed(1)} MB`)
  console.log(`[publish] ${index.runs.length} runs listed, default ${index.default}`)
  console.log(`[publish] ${base}/runs.json`)
}

/** What a browser should be told each kind of file is. */
const TYPES: Record<string, string> = {
  json: 'application/json',
  bin: 'application/octet-stream',
  sha: 'text/plain',
  jpg: 'image/jpeg',
  png: 'image/png',
}

/**
 * The same layout, in a container.
 *
 * The URL carries its own signature, so every request is that URL with a path
 * in front of the query. Nothing here is clever: a block blob is a single PUT
 * as long as it is under 256 MB, and the largest file in a run is ten.
 */
async function toAzure(files: { name: string; bytes: Uint8Array }[], run: PublishedRun) {
  if (!SAS) {
    throw new Error(
      'AZURE_BLOB_SAS is not set: it wants a container URL with a shared access '
      + 'signature that may read, write, delete and list',
    )
  }
  const [container, query] = SAS.split('?')
  const at = (path: string, extra = '') =>
    `${container.replace(/\/$/, '')}/${path}?${extra}${extra ? '&' : ''}${query}`

  const send = async (path: string, body: Uint8Array | string, cache: string) => {
    const type = TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream'
    const response = await fetch(at(path), {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-blob-content-type': type,
        // Set here rather than on the container, because the two kinds of file
        // want opposite answers: a run's folder is never rewritten and may be
        // kept forever, while the index is the one thing that changes.
        'x-ms-blob-cache-control': cache,
        'content-type': type,
      },
      // The view's own bytes, which is what fetch wants; a Uint8Array read
      // from disk can sit in a larger buffer, and handing that over would
      // upload the whole buffer.
      body: typeof body === 'string'
        ? body
        : new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice(),
    })
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${(await response.text()).slice(0, 200)}`)
    }
  }

  const held = await fetch(at('runs.json'))
  const index: RunIndex = held.ok
    ? await held.json() as RunIndex
    : { version: 1, default: run.id, runs: [] }

  let done = 0
  for (const file of files) {
    await send(`runs/${run.id}/${file.name}`, file.bytes, 'public, max-age=31536000, immutable')
    done += file.bytes.byteLength
    process.stdout.write(`\r[publish] ${(done / 1e6).toFixed(1)} MB of ${
      (files.reduce((sum, f) => sum + f.bytes.byteLength, 0) / 1e6).toFixed(1)} MB`)
  }
  process.stdout.write('\n')

  const dropped = index.runs.slice(KEEP - 1).filter((old) => old.id !== run.id)
  index.runs = [run, ...index.runs.filter((old) => old.id !== run.id)].slice(0, KEEP)
  index.default = arg('default') === 'no' ? index.default : run.id
  if (!index.runs.some((r) => r.id === index.default)) index.default = index.runs[0].id
  // The index goes last: until it names the run, the run is not there as far
  // as anyone reading is concerned, and a publish that fails halfway has
  // uploaded some unreferenced blobs rather than broken the site.
  await send('runs.json', `${JSON.stringify(index, null, 2)}\n`, 'max-age=60')

  for (const old of dropped) {
    const listing = await fetch(
      at('', `restype=container&comp=list&prefix=${encodeURIComponent(`runs/${old.id}/`)}`),
    )
    if (!listing.ok) continue
    for (const [, name] of (await listing.text()).matchAll(/<Name>([^<]+)<\/Name>/g)) {
      await fetch(at(name), { method: 'DELETE' })
    }
    console.log(`[publish] dropped ${old.id} (${old.label})`)
  }

  console.log(`[publish] ${run.id}  ${run.label}  ${(run.bytes / 1e6).toFixed(1)} MB`)
  console.log(`[publish] ${index.runs.length} runs listed, default ${index.default}`)
  console.log(`[publish] ${container.replace(/\/$/, '')}/runs.json`)
}

await main()
