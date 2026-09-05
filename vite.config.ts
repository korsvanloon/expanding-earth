/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * A fingerprint of the generated data, baked into the bundle.
 *
 * Vite hashes the names of everything it bundles, so a new build always
 * replaces the old code in a browser's cache. It does not touch public/, and
 * the reconstruction lives there under fixed names -- meta.json, frames.bin,
 * zones.png. A returning visitor therefore got the new code and the old data,
 * silently, and the page looked exactly as it had before the change. Appending
 * this to every data URL gives those files a name that changes when they do.
 */
const dataVersion = () => {
  try {
    const dir = fileURLToPath(new URL('./public/data', import.meta.url))
    const hash = createHash('sha1')
    for (const name of readdirSync(dir).sort()) {
      const path = `${dir}/${name}`
      // The contents, not the timestamp. CI regenerates all of this on every
      // deploy, so a timestamp would change every time and make every visitor
      // re-fetch twenty megabytes to receive exactly what they already had.
      // Hashing what is in the files costs a few tens of milliseconds and only
      // changes the URL when the answer changes.
      hash.update(name)
      hash.update(readFileSync(path))
    }
    return hash.digest('hex').slice(0, 12)
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  // GitHub Pages serves the site from a sub-path; local development does not.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  define: {
    __DATA_VERSION__: JSON.stringify(dataVersion()),
    /**
     * Where solved runs are published; see tools/publish-run.ts.
     *
     * A solve takes eight minutes and the deploy used to spend the same eight
     * minutes on the same answer. Now the run is pushed to a store and the
     * viewer fetches it, so a new reconstruction costs a push rather than a
     * build -- and, because every run keeps its own immutable folder there,
     * the viewer can offer several of them at once and be switched between
     * them. RUN_STORE='' falls back to this site's own data folder.
     */
    __RUN_STORE__: JSON.stringify(
      process.env.RUN_STORE
      ?? 'https://cdn.jsdelivr.net/gh/korsvanloon/expanding-earth@runs',
    ),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: { port: 3000 },
  // legacy/ is the earlier prototype, kept for reference but not built or tested.
  test: {
    include: ['test/**/*.test.ts'],
    /**
     * Vitest's default is five seconds, and several of these are not unit
     * tests: they decode an 8192x4096 age raster, walk a hundred thousand
     * probe directions over eighty thousand triangles, or replay a whole run's
     * connectivity. The slowest takes three and a half seconds on an idle
     * machine, which means it fails on a busy one -- and the Pages workflow
     * runs this suite twice, the second time straight after a ten-minute solve
     * has had the box to itself. A deploy that fails because a raster decode
     * took six seconds tells nobody anything.
     */
    testTimeout: 30000,
  },
})
