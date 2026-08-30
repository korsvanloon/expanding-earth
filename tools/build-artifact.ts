/**
 * Package the viewer as one self-contained HTML file, for publishing where
 * there is no server to fetch from.
 *
 * Everything the page needs -- script, styles, reconstruction and texture --
 * has to travel inside the file, and a published artifact is capped at 16 MB
 * with base64 charging a third on top. The reconstruction is 13.6 MB raw, so it
 * is compressed rather than decimated: keyframes are stored as differences from
 * the previous frame, split into byte planes, and gzipped. Continents move
 * slowly, so nearly every difference is a small number whose high byte is 0 or
 * -1; separating the high bytes from the low ones gives the compressor a run of
 * near-identical bytes to work with instead of interleaved noise. That takes
 * the keyframes from 10.1 MB to 5.7 MB and leaves the full 40,962-vertex mesh
 * intact, which matters: at half resolution the folded triangles the solver
 * leaves behind stop being slivers and smear across the globe.
 *
 * The page reverses all of this with DecompressionStream before React starts.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import jpeg from 'jpeg-js'
import type { Meta } from '../shared/model.js'
import { SURFACE_MAPS } from '../shared/maps.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, 'public/data')
const DIST = resolve(ROOT, 'dist')

const TEXTURE_WIDTH = 1024
const TEXTURE_QUALITY = 82

function main() {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'meta.json'), 'utf8')) as Meta
  const mesh = readFileSync(resolve(DATA, 'mesh.bin'))
  const frames = new Int16Array(readFileSync(resolve(DATA, 'frames.bin')).buffer)
  const strain = readFileSync(resolve(DATA, 'strain.bin'))

  const payload = {
    meta: gzipSync(Buffer.from(JSON.stringify(meta)), { level: 9 }),
    mesh: gzipSync(mesh, { level: 9 }),
    frames: gzipSync(deltaSplit(frames, meta.vertexCount * 3, meta.frameCount), { level: 9 }),
    strain: gzipSync(strain, { level: 9 }),
  }

  const bundle = readdirSync(resolve(DIST, 'assets'))
  const js = bundle.find((f) => f.endsWith('.js'))
  const css = bundle.find((f) => f.endsWith('.css'))
  if (!js || !css) throw new Error('run `npm run build` first')

  const textures = Object.fromEntries(
    SURFACE_MAPS.map((m) => [m.file, uri('image/jpeg', shrinkTexture(m.file))]),
  )

  const html = `<title>Expanding Earth</title>
<style>
${readFileSync(resolve(DIST, 'assets', css), 'utf8')}
/* The artifact host composites the page over a ground it paints itself, so
   this page has to paint its own or it borrows the host's. */
html, body, #root { height: 100%; margin: 0; background: #05070c; }
</style>
<div id="root"></div>
<script>
window.__ASSETS__ = ${JSON.stringify(textures)};
window.__DATA__ = (async () => {
  const bytes = (b64) => {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  };
  const gunzip = async (b64) => {
    const stream = new Blob([bytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  const P = ${JSON.stringify(Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, v.toString('base64')])))};
  const meta = JSON.parse(new TextDecoder().decode(await gunzip(P.meta)));
  const [mesh, frames, strain] = await Promise.all([gunzip(P.mesh), gunzip(P.frames), gunzip(P.strain)]);

  // Undo the byte-plane split, then the per-frame differencing. Int16Array
  // wraps on overflow exactly as the differencing did, so the running sum
  // recovers the originals without any special casing.
  const stride = meta.vertexCount * 3;
  const total = stride * meta.frameCount;
  const out = new Int16Array(total);
  for (let i = 0; i < total; i++) out[i] = (frames[i] | (frames[total + i] << 8)) << 16 >> 16;
  for (let f = 1; f < meta.frameCount; f++) {
    const to = f * stride, from = to - stride;
    for (let i = 0; i < stride; i++) out[to + i] += out[from + i];
  }
  return { meta, mesh: mesh.buffer, frames: out.buffer, strain: strain.buffer };
})();
</script>
<script type="module">
${readFileSync(resolve(DIST, 'assets', js), 'utf8').replaceAll('</script', '<\\/script')}
</script>
`

  const out = resolve(DIST, 'expanding-earth.html')
  writeFileSync(out, html)
  console.log('[artifact] payload, gzipped:')
  for (const [name, buffer] of Object.entries(payload)) {
    console.log(`  ${name.padEnd(8)} ${(buffer.length / 1e6).toFixed(2)} MB`)
  }
  console.log(
    `[artifact] ${SURFACE_MAPS.length} surface maps, ` +
      `${(Object.values(textures).reduce((n, t) => n + t.length, 0) / 1e6).toFixed(2)} MB`,
  )
  console.log(`[artifact] wrote ${out} (${(html.length / 1e6).toFixed(1)} MB of a 16 MB budget)`)
}

/**
 * Difference each keyframe against the one before it, then split every 16-bit
 * value into a low-byte plane followed by a high-byte plane.
 */
function deltaSplit(frames: Int16Array, stride: number, frameCount: number) {
  const total = stride * frameCount
  const delta = new Int16Array(total)
  delta.set(frames.subarray(0, stride))
  for (let f = 1; f < frameCount; f++) {
    const to = f * stride
    const from = to - stride
    for (let i = 0; i < stride; i++) delta[to + i] = frames[to + i] - frames[from + i]
  }
  const bytes = new Uint8Array(delta.buffer)
  const planes = Buffer.alloc(total * 2)
  for (let i = 0; i < total; i++) {
    planes[i] = bytes[i * 2]
    planes[total + i] = bytes[i * 2 + 1]
  }
  return planes
}

/** Box-downsample a surface texture and re-encode it small enough to inline. */
function shrinkTexture(file: string) {
  const source = jpeg.decode(readFileSync(resolve(ROOT, 'public', file)), { useTArray: true })
  const width = TEXTURE_WIDTH
  const height = width / 2
  const out = new Uint8Array(width * height * 4)
  const sx = source.width / width
  const sy = source.height / height
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, n = 0
      for (let j = Math.floor(y * sy); j < Math.floor((y + 1) * sy); j++) {
        for (let i = Math.floor(x * sx); i < Math.floor((x + 1) * sx); i++) {
          const k = (j * source.width + i) * 4
          r += source.data[k]; g += source.data[k + 1]; b += source.data[k + 2]
          n++
        }
      }
      const k = (y * width + x) * 4
      out[k] = r / n; out[k + 1] = g / n; out[k + 2] = b / n; out[k + 3] = 255
    }
  }
  return Buffer.from(jpeg.encode({ data: out, width, height }, TEXTURE_QUALITY).data)
}

const uri = (type: string, buffer: Buffer) => `data:${type};base64,${buffer.toString('base64')}`

main()
