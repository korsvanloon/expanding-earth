/**
 * The runs the viewer can be pointed at.
 *
 * A reconstruction is twenty-one megabytes that took eight minutes to solve,
 * and it used to be recomputed by the Pages build on every deploy even when
 * nothing about the app had changed. It is published to a store instead -- see
 * tools/publish-run.ts -- which has a second effect worth more than the saved
 * build: several runs can be on offer at once, so two reconstructions can be
 * looked at one after the other instead of compared through a table.
 *
 * Nothing in the store is ever overwritten. Each run lives under `runs/<id>/`
 * with the id taken from its own bytes, so every URL is immutable and any cache
 * between here and there may keep it as long as it likes. The only mutable file
 * is the index, which is a few hundred bytes and is fetched with revalidation.
 */

/** The store's base URL, baked in at build time; see vite.config.ts. */
declare const __RUN_STORE__: string
/** Where the list of runs is, which is not always inside the store. */
declare const __RUN_INDEX__: string

export interface PublishedRun {
  id: string
  label: string
  note?: string
  solvedAt: string
  /** The commit the solver was at, so a run can be traced back to its code. */
  commit: string
  /** Knobs this run was given; empty for the model as it ships. */
  overrides: string[]
  bytes: number
  /** Every file in the run's folder; the deploy fetches them by name. */
  files?: string[]
  /** What the run turned out to be, copied out of its metadata when published. */
  summary?: RunSummary
}

/**
 * The few numbers that say what a run is.
 *
 * A run's own metadata is nine hundred kilobytes and its frames are thirty
 * megabytes, and the point of a picker is to choose before fetching either. So
 * every run carries this: the held-back pairs, which are the score, and the
 * fits at the dates the geology gives them, which are the check.
 */
export interface RunSummary {
  endTimeMa: number
  subdivision: number
  vertexCount: number
  radiusKm: number
  pairs: { timeMa: number; medianKm: number; within: number }[]
  fits: { a: string; b: string; atMa: number; watched?: true; km: number; matched: number }[]
  bare: number
  islandOverlap: number
}

export interface RunIndex {
  version: 1
  default: string
  runs: PublishedRun[]
}

/** This site's own data folder, which is what local development solves into. */
export const OWN_RUN = 'own'

/** Where a run's files are; the empty string means this site's own folder. */
export const runBase = (id: string, index: RunIndex | null) => {
  if (id === OWN_RUN || !index) return ''
  return index.runs.some((run) => run.id === id) ? `${__RUN_STORE__}/runs/${id}` : ''
}

/**
 * What the store is offering, or null if it has nothing to say.
 *
 * Never throws and never blocks the viewer: a store that is unreachable, or
 * empty, or not configured at all leaves the site loading its own data exactly
 * as it did before there was a store.
 */
export async function loadRunIndex(): Promise<RunIndex | null> {
  if (!__RUN_STORE__) return null
  try {
    // Revalidated rather than trusted: this is the one file in the store that
    // is rewritten, and it is small enough that asking every time costs
    // nothing.
    const response = await fetch(__RUN_INDEX__, { cache: 'no-cache' })
    if (!response.ok) return null
    const index = await response.json() as RunIndex
    return index?.runs?.length ? index : null
  } catch {
    return null
  }
}

/** Which run to open with: the one in the address, else the store's default. */
export function chosenRun(index: RunIndex | null): string {
  const asked = new URLSearchParams(window.location.search).get('run')
  if (asked === OWN_RUN) return OWN_RUN
  if (asked && index?.runs.some((run) => run.id === asked)) return asked
  return index ? index.default : OWN_RUN
}

/**
 * Put the run in the address bar, so a comparison can be sent to someone.
 *
 * Replaced rather than pushed: switching runs is looking at the same page a
 * different way, and a back button that walked through every run someone tried
 * would be in the way of leaving the site.
 */
export function rememberRun(id: string, index: RunIndex | null) {
  const url = new URL(window.location.href)
  // The default gets a clean address and everything else is named, so that
  // any run someone is actually looking at -- this site's own build included
  // -- is a link they can send.
  if (index && id === index.default) url.searchParams.delete('run')
  else url.searchParams.set('run', id)
  window.history.replaceState({}, '', url)
}
