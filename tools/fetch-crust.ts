/**
 * Fetch ECM1 and store it as a compact binary in the repository.
 *
 * ECM1 (Mooney, Barrera-Lopez, Chichanov et al., 2023) is a 1x1 degree global
 * crustal model: https://www.earthcrustmodel1.com/
 *
 * The source is a 2 MB text file; this writes 324 KB of typed arrays, small
 * enough to commit so that `pnpm data` never needs the network and the build
 * stays reproducible even if the site changes. Run it by hand when the upstream
 * model is updated:
 *
 *   pnpm exec tsx tools/fetch-crust.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { CRUST_TYPES, type CrustType } from '../shared/crust.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE =
  'https://www.earthcrustmodel1.com/_files/archives/' +
  'b6b6a8_9328c1b220614f6fbc14e06638868e3e.zip?dn=ECM1_TotalThickness.zip'

const WIDTH = 360
const HEIGHT = 180

async function main() {
  console.log('[crust] downloading ECM1')
  const zip = Buffer.from(await (await fetch(SOURCE)).arrayBuffer())
  const text = extractText(zip)

  const thickness = new Float32Array(WIDTH * HEIGHT)
  const type = new Uint8Array(WIDTH * HEIGHT)
  let parsed = 0

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5 || Number.isNaN(Number(parts[1]))) continue
    const index = CRUST_TYPES.indexOf(parts[3] as CrustType)
    if (index < 0) throw new Error(`unknown crustal type ${parts[3]}`)
    // Cell centres sit on half degrees, row 0 at the north pole.
    const row = Math.min(HEIGHT - 1, Math.max(0, Math.round(89.5 - Number(parts[2]))))
    const column = Math.min(WIDTH - 1, Math.max(0, Math.round(Number(parts[1]) + 179.5)))
    thickness[row * WIDTH + column] = Number(parts[4])
    type[row * WIDTH + column] = index
    parsed++
  }
  if (parsed !== WIDTH * HEIGHT) {
    throw new Error(`expected ${WIDTH * HEIGHT} cells, parsed ${parsed}`)
  }

  const out = resolve(ROOT, 'data-src/ecm1.bin')
  mkdirSync(dirname(out), { recursive: true })
  const buffer = Buffer.concat([
    Buffer.from(new Uint32Array([WIDTH, HEIGHT]).buffer),
    Buffer.from(thickness.buffer),
    Buffer.from(type.buffer),
  ])
  writeFileSync(out, buffer)
  console.log(`[crust] wrote ${out} (${(buffer.length / 1e3).toFixed(0)} KB)`)
}

/**
 * Pull the text entry out of the zip.
 *
 * Read the central directory at the end rather than walking local headers from
 * the front: this archive was written as a stream, so its local headers carry a
 * zero compressed size and only the central directory knows how long each entry
 * really is.
 */
function extractText(zip: Buffer): string {
  let eocd = zip.length - 22
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip archive')

  const entries = zip.readUInt16LE(eocd + 10)
  let offset = zip.readUInt32LE(eocd + 16)

  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad central directory')
    const method = zip.readUInt16LE(offset + 10)
    const compressed = zip.readUInt32LE(offset + 20)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localOffset = zip.readUInt32LE(offset + 42)
    const name = zip.subarray(offset + 46, offset + 46 + nameLength).toString()

    if (name.endsWith('.txt') && !name.includes('__MACOSX') && !name.includes('/.')) {
      const start =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
      const body = zip.subarray(start, start + compressed)
      return method === 0 ? body.toString() : inflateRawSync(body).toString()
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('no text entry found in the archive')
}

main()
