/**
 * The solver, in a worker, on a coarse mesh.
 *
 * This is the same `tools/lib/solver.ts` the shipped run uses. Not a copy of
 * it, not a simplified version: a second solver would be a second model, and
 * then a slider would be telling you about the second one. What differs is the
 * mesh it is handed -- two and a half thousand points against forty-one
 * thousand -- and the knobs, which come from the panel.
 *
 * Which is also the honest limit. A coarse answer is a different answer, not a
 * faster one: the points are five hundred kilometres apart, so the fold, the
 * closing rims and the continental margins all behave differently, and the
 * scorecard fits come out hundreds of kilometres from the real run's. It is for
 * watching which way a knob pushes.
 */
import { configure, setHost, solve } from '../tools/lib/solver'

/**
 * This file is a worker, and TypeScript would otherwise type `self` as a
 * window, whose `postMessage` takes an origin rather than a transfer list.
 *
 * Declared as the two members this file uses rather than pulling in the whole
 * WebWorker lib, which collides with the DOM types the rest of the viewer
 * needs -- and declaring the two says what a worker is for here better than a
 * lib reference would.
 */
declare const self: {
  onmessage: ((event: MessageEvent<ExploreRequest>) => void) | null
  postMessage(message: ExploreEvent, transfer?: Transferable[]): void
}

/** What the solver asks its host to read. */
const NEEDED = ['mesh.bin', 'tracks.bin', 'crust-age.bin', 'meta.partial.json'] as const

export interface ExploreRequest {
  /**
   * Where to fetch each file the solver asks for, absolute.
   *
   * Built on the main thread rather than here. A worker's relative URLs
   * resolve against the worker script, which lives in the bundle's asset
   * directory, so `data/preview/4/mesh.bin` would be looked for in the wrong
   * place -- and the helper that knows the right one reads `window`, which a
   * worker has not got.
   */
  urls: Record<string, string>
  /** Knobs, in the solver's own names; see KNOBS in tools/lib/solver.ts. */
  knobs: Record<string, string>
}

export type ExploreEvent =
  /** Files in hand out of files wanted, while the coarse mesh is on its way. */
  | { kind: 'fetching'; got: number; wanted: number }
  | { kind: 'progress'; timeMa: number; endMa: number }
  | { kind: 'done'; meta: string; frames: ArrayBuffer; topology: ArrayBuffer
      sink: ArrayBuffer | null; mesh: ArrayBuffer; tracks: ArrayBuffer; seconds: number }
  | { kind: 'failed'; message: string }

const files = new Map<string, Uint8Array>()

async function load(urls: Record<string, string>) {
  // Three and a half megabytes on the first run, nothing on the ones after it
  // -- the files stay in this map for as long as the worker lives, and it
  // lives until the run it was made for is done. Counted per file rather than
  // per byte because there are four of them and none dominates.
  let got = 0
  const tell = () => {
    self.postMessage({ kind: 'fetching', got, wanted: NEEDED.length } satisfies ExploreEvent)
  }
  tell()
  await Promise.all(NEEDED.map(async (name) => {
    const url = urls[name]
    if (!url) throw new Error(`nobody said where to find ${name}`)
    if (!files.has(url)) {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`${name} is not there (${response.status})`)
      files.set(url, new Uint8Array(await response.arrayBuffer()))
    }
    got++
    tell()
  }))
}

self.onmessage = async (event: MessageEvent<ExploreRequest>) => {
  const { urls, knobs } = event.data
  try {
    await load(urls)
    const out = new Map<string, Uint8Array | string>()
    setHost({
      read: (name) => files.get(urls[name])!,
      readText: (name) => new TextDecoder().decode(files.get(urls[name])!),
      write: (name, data) => out.set(name, data),
      progress: (timeMa, endMa) => {
        self.postMessage({ kind: 'progress', timeMa, endMa } satisfies ExploreEvent)
      },
    })
    // The solver talks: a line per frame and several more per step, which in a
    // worker is a few hundred messages to the console for a run nobody is
    // debugging. Kept for when someone is.
    const talk = console.log
    if (!knobs.TALK) console.log = () => {}
    configure(knobs)
    const started = performance.now()
    try {
      solve()
    } finally {
      console.log = talk
    }
    const bytes = (name: string) => {
      const held = out.get(name)
      if (held === undefined || typeof held === 'string') return null
      // A copy, because the buffer is transferred and the map keeps its view.
      return held.slice().buffer as ArrayBuffer
    }
    const frames = bytes('frames.bin')
    const topology = bytes('topology.bin')
    if (!frames || !topology) throw new Error('the solve wrote no frames')
    const mesh = files.get(urls['mesh.bin'])!.slice().buffer as ArrayBuffer
    const tracks = files.get(urls['tracks.bin'])!.slice().buffer as ArrayBuffer
    const sink = bytes('sink.bin')
    self.postMessage(
      {
        kind: 'done',
        meta: String(out.get('meta.json') ?? '{}'),
        frames,
        topology,
        sink,
        mesh,
        tracks,
        seconds: (performance.now() - started) / 1000,
      } satisfies ExploreEvent,
      [frames, topology, mesh, tracks, ...(sink ? [sink] : [])],
    )
  } catch (error) {
    self.postMessage({ kind: 'failed', message: String(error) } satisfies ExploreEvent)
  }
}
