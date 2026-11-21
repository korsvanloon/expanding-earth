/**
 * Fill the concept page's template again from what the last build left in the
 * output directory, without building anything: for a change to the page alone.
 *
 *     node tools/fill-concepts-page.mjs [.stage/concepts]
 *
 * tools/build-concepts.ts does the same at the end of a build.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.argv[2] ?? '.stage/concepts')
const dataUri = (file, type) => `data:${type};base64,${readFileSync(resolve(OUT, file)).toString('base64')}`
function crustBase64() {
  const file = resolve(ROOT, 'data-src/ecm1.bin')
  if (!existsSync(file)) return ''
  const raw = readFileSync(file)
  const n = raw.readUInt32LE(0) * raw.readUInt32LE(4)
  const out = Buffer.alloc(n)
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round(raw.readFloatLE(8 + i * 4) * 2)))
  return out.toString('base64')
}
// Replacements as functions: the data holds `$` sequences a string would act on.
const page = readFileSync(resolve(ROOT, 'tools/concepts-page.html'), 'utf8')
  .replace('/*CONCEPTS*/null', () => readFileSync(resolve(OUT, 'concepts.json'), 'utf8'))
  .replace('__PIECES__', () => dataUri('pieces.png', 'image/png'))
  .replace('__MARBLE__', () => dataUri('marble.jpg', 'image/jpeg'))
  .replace('__CRUST__', () => crustBase64())
writeFileSync(resolve(OUT, 'index.html'), page)
console.log(`${resolve(OUT, 'index.html')}: ${(page.length / 1e6).toFixed(1)} MB`)
