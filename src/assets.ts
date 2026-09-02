import type { Meta } from '@shared/model'

/**
 * Assets in the single-file build.
 *
 * A published artifact has no server behind it, so the standalone build carries
 * the reconstruction inside the page and hands it over on `window` rather than
 * having the app fetch it. Small assets that a browser API has to load by URL,
 * such as the surface texture, arrive as data: URIs instead.
 */
export interface InlineData {
  meta: Meta
  mesh: ArrayBuffer
  frames: ArrayBuffer
  /** Only a self-contained artifact carries these; the site fetches them later. */
  strain?: ArrayBuffer
  plates?: ArrayBuffer
  topology: ArrayBuffer
  /**
   * How far inside the shell each point sits, per frame, when the run folded
   * un-erupted crust inwards rather than collapsing it away. Absent otherwise;
   * `meta.folded` says which. See tools/lib/fold.ts.
   */
  sink?: ArrayBuffer
  /**
   * The fracture-zone tracks, if the build has them. Optional because a
   * published artifact keeps only every other frame, so a pair whose age falls
   * on a dropped frame has no frame to be judged at; the overlay is simply
   * absent there rather than wrong.
   */
  tracks?: ArrayBuffer
}

/** The build's fingerprint of public/data; see vite.config.ts. */
declare const __DATA_VERSION__: string

declare global {
  interface Window {
    /** Resolves once the inlined payload has been decompressed. */
    __DATA__?: Promise<InlineData>
    __ASSETS__?: Record<string, string>
  }
}

/**
 * Where to fetch an asset from, and which version of it.
 *
 * A standalone artifact carries everything inline and answers with a data URI.
 * Otherwise it is a path, with the build's data fingerprint on the end for
 * anything generated: those files have fixed names, so without it a returning
 * visitor is served the new code against whatever data their browser cached
 * last time, and the page quietly looks unchanged. See vite.config.ts.
 */
export const asset = (path: string) => {
  const inline = window.__ASSETS__?.[path]
  if (inline) return inline
  return path.startsWith('data/') ? `${path}?v=${__DATA_VERSION__}` : path
}
export const inlineData = () => window.__DATA__
