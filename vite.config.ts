/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // GitHub Pages serves the site from a sub-path; local development does not.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: { port: 3000 },
  // legacy/ is the earlier prototype, kept for reference but not built or tested.
  test: { include: ['test/**/*.test.ts'] },
})
