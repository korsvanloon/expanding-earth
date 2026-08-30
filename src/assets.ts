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
  strain: ArrayBuffer
  plates: ArrayBuffer
}

declare global {
  interface Window {
    /** Resolves once the inlined payload has been decompressed. */
    __DATA__?: Promise<InlineData>
    __ASSETS__?: Record<string, string>
  }
}

export const asset = (path: string) => window.__ASSETS__?.[path] ?? path
export const inlineData = () => window.__DATA__
