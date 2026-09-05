/**
 * Solving in the browser, so a knob can be turned and looked at.
 *
 * Every measurement in this project has cost a run: eight minutes to find out
 * which way a number pushes, which is why so few of them have been tried. On a
 * coarse mesh the same solver takes a few seconds, and a few seconds is a
 * different kind of question -- one you ask twenty times in an evening.
 *
 * What comes back is the same set of buffers the site fetches for the shipped
 * run, so the viewer draws it with the same code (see `buildDataset`). What it
 * is not is the model: see the note at the top of src/explore-worker.ts.
 */
import { asset } from '@/assets'
import { buildDataset, type Dataset } from '@/data'
import type { ExploreEvent, ExploreRequest } from '@/explore-worker'
import type { Meta } from '@shared/model'

export interface ExploreResult {
  data: Dataset
  seconds: number
}

/**
 * What the explorer is doing while it is not finished.
 *
 * Three waits in a row, and only the middle two can be counted: the worker
 * starting (a bundle the browser has to fetch and compile), the coarse mesh
 * arriving, and the solve walking forwards through time. Naming them apart
 * keeps the loader from claiming a share of a run that has not begun.
 */
export interface ExploreStage {
  phase: 'starting' | 'fetching' | 'solving'
  /** How far along, 0 to 1, or null when there is nothing to count yet. */
  share: number | null
}

/** The knobs the panel offers, with the values the shipped run uses. */
export const EXPLORER_KNOBS = {
  PAIR_K: 0.15,
  DRAG: 0.1,
  ISLAND_HOLD: 0.35,
  HOLD_STRENGTH: 1,
  COMPRESS_K: 0.9,
  LAND_MARGIN: 0.5,
  FOLD_MARGIN: 0.08,
  BREAKS_BELOW: 0.65,
  SWEEPS: 20,
} as const

export type Knobs = Record<keyof typeof EXPLORER_KNOBS, number>

/**
 * Settings the explorer imposes on itself rather than offering.
 *
 * The probes are what the coverage figures are measured with, a hundred
 * thousand of them per frame, and they were thirteen of the thirty seconds a
 * coarse run took. A fifth of them is a rougher bare-sphere number and a run
 * that comes back while a reader is still looking at it.
 */
const FIXED = { PROBES: '20000' }

export function explore(
  knobs: Knobs,
  level: number,
  onProgress: (stage: ExploreStage) => void,
): { promise: Promise<ExploreResult>; cancel: () => void } {
  const worker = new Worker(new URL('./explore-worker.ts', import.meta.url), { type: 'module' })
  const promise = new Promise<ExploreResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ExploreEvent>) => {
      const message = event.data
      if (message.kind === 'fetching') {
        // Nothing landed yet is nothing to count: the loader sweeps rather
        // than sitting at zero for the whole of the first file.
        const share = message.got === 0 ? null : message.got / message.wanted
        onProgress({ phase: 'fetching', share })
        return
      }
      if (message.kind === 'progress') {
        onProgress({
          phase: 'solving',
          share: Math.min(1, message.timeMa / Math.max(1, message.endMa)),
        })
        return
      }
      worker.terminate()
      if (message.kind === 'failed') { reject(new Error(message.message)); return }
      const built = buildDataset({
        meta: JSON.parse(message.meta) as Meta,
        mesh: message.mesh,
        frames: message.frames,
        topology: message.topology,
        tracks: message.tracks,
        sink: message.sink ?? undefined,
      })
      console.log(
        `[explore] ${built.vertexCount} points over ${built.meta.frameCount} frames `
        + `in ${message.seconds.toFixed(1)} s`,
      )
      resolve({ data: built, seconds: message.seconds })
    }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message)) }
  })
  worker.postMessage({
    // Absolute, and resolved against the page rather than the worker script.
    urls: Object.fromEntries(
      ['mesh.bin', 'tracks.bin', 'crust-age.bin', 'meta.partial.json'].map((name) => [
        name,
        new URL(asset(`data/preview/${level}/${name}`), document.baseURI).href,
      ]),
    ),
    knobs: {
      ...FIXED,
      ...Object.fromEntries(Object.entries(knobs).map(([name, value]) => [name, String(value)])),
    },
  } satisfies ExploreRequest)
  return { promise, cancel: () => worker.terminate() }
}
