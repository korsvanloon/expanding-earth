/**
 * The concept page's relief view: a height map of the whole Earth, land and sea
 * floor, coloured by height the way an atlas does it -- ocean in blues by depth,
 * land from green lowlands through tan and brown to grey and white on the
 * highest ground -- with a light hillshade on top.
 *
 *   pnpm exec tsx tools/concept-relief.ts
 *
 * The heights are SRTM15+ at three arc minutes (about 5.5 km at the equator)
 * from the Generic Mapping Tools server, eight JPEG2000 tiles of 90 by 90
 * degrees. They are downloaded once into `.stage/relief/` and decoded with
 * ImageMagick (`convert`, built with OpenJPEG), which has to be installed. The
 * picture does not depend on the pieces, so it is made once and the builder
 * leaves it alone.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, process.env.CONCEPT_OUT ?? '.stage/concepts')
const CACHE = resolve(ROOT, '.stage/relief')
const SERVER = 'https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_03m_p'
/** Cells per tile side, and tiles across and down. */
const T = 1800
const W = T * 4
const H = T * 2
/** Tile names by row (north first) and column (from 180 W eastwards). */
const TILES = [
  ['N00W180', 'N00W090', 'N00E000', 'N00E090'],
  ['S90W180', 'S90W090', 'S90E000', 'S90E090'],
]

async function fetchTile(name: string): Promise<string> {
  const file = resolve(CACHE, `${name}.jp2`)
  if (existsSync(file)) return file
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${SERVER}/${name}.earth_relief_03m_p.jp2`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      return file
    } catch (err) {
      if (attempt >= 4) throw err
      await new Promise((ok) => setTimeout(ok, 2000 * attempt))
    }
  }
}

/**
 * Heights in metres, row 0 at 90 N, column 0 at 180 W. The tiles hold the
 * server's int16 at half a metre per step; ImageMagick hands them back as
 * unsigned 16-bit, which is the same number shifted by 32768.
 */
async function heights(): Promise<Float32Array> {
  mkdirSync(CACHE, { recursive: true })
  const z = new Float32Array(W * H)
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      const file = await fetchTile(TILES[ty][tx])
      const raw = execFileSync('convert', [file, '-depth', '16', '-endian', 'MSB', 'gray:-'], { maxBuffer: T * T * 2 + 1024 })
      if (raw.length !== T * T * 2) throw new Error(`${TILES[ty][tx]}: expected ${T}x${T} cells, got ${raw.length / 2}`)
      for (let y = 0; y < T; y++) {
        const row = (ty * T + y) * W + tx * T
        for (let x = 0; x < T; x++) z[row + x] = (raw.readUInt16BE((y * T + x) * 2) - 32768) * 0.5
      }
    }
  }
  return z
}

/** Colour stops: metres, then RGB. Sea and land meet at zero without blending. */
const SEA: [number, number, number, number][] = [
  [-10000, 14, 20, 70],
  [-7000, 20, 36, 110],
  [-5500, 28, 64, 150],
  [-4500, 38, 92, 178],
  [-3500, 56, 122, 198],
  [-2500, 80, 150, 212],
  [-1200, 118, 180, 226],
  [-200, 160, 208, 238],
  [0, 186, 224, 244],
]
const LAND: [number, number, number, number][] = [
  [0, 64, 122, 70],
  [150, 96, 150, 82],
  [400, 160, 180, 112],
  [800, 208, 196, 140],
  [1400, 196, 164, 112],
  [2200, 164, 128, 92],
  [3200, 140, 118, 112],
  [4200, 160, 150, 164],
  [5200, 210, 206, 214],
  [6500, 250, 250, 252],
]
function ramp(stops: [number, number, number, number][], m: number): [number, number, number] {
  if (m <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]]
  for (let i = 1; i < stops.length; i++) {
    if (m < stops[i][0]) {
      const a = stops[i - 1], b = stops[i], t = (m - a[0]) / (b[0] - a[0])
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]
    }
  }
  const l = stops[stops.length - 1]
  return [l[1], l[2], l[3]]
}

function picture(z: Float32Array): Uint8Array {
  const out = new Uint8Array(W * H * 4)
  const cell = (6371000 * Math.PI) / H // metres per cell north-south
  // How much steeper the light sees the ground than it is: at 5.5 km a cell
  // the true slopes are a few percent, and shading them as they are shows nothing.
  const EXAGGERATE = 12
  // Light from the north-west, 45 degrees up.
  const lx = -Math.SQRT1_2 * Math.SQRT1_2, ly = Math.SQRT1_2 * Math.SQRT1_2, lz = Math.SQRT1_2
  const at = (x: number, y: number) => z[Math.max(0, Math.min(H - 1, y)) * W + ((x + W) % W)]
  for (let y = 0; y < H; y++) {
    const coslat = Math.max(0.05, Math.cos(((90 - ((y + 0.5) / H) * 180) * Math.PI) / 180))
    for (let x = 0; x < W; x++) {
      const m = z[y * W + x]
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * cell * coslat)) * EXAGGERATE
      const dzdy = ((at(x, y - 1) - at(x, y + 1)) / (2 * cell)) * EXAGGERATE // northwards
      const n = Math.hypot(dzdx, dzdy, 1)
      const lambert = (-dzdx * lx - dzdy * ly + lz) / n
      // Flat ground comes out at one; slopes facing the light up to a third
      // brighter, slopes facing away up to half darker.
      const shade = Math.max(0.5, Math.min(1.3, 1 + (lambert - lz) * 1.1))
      const c = m < 0 ? ramp(SEA, m) : ramp(LAND, m)
      const o = (y * W + x) * 4
      for (let k = 0; k < 3; k++) out[o + k] = Math.max(0, Math.min(255, Math.round(c[k] * shade)))
      out[o + 3] = 255
    }
  }
  return out
}

const z = await heights()
mkdirSync(OUT, { recursive: true })
const file = resolve(OUT, 'relief.jpg')
writeFileSync(file, jpeg.encode({ width: W, height: H, data: Buffer.from(picture(z)) }, 88).data)
console.log(`${file}: ${W}x${H}, ${(readFileSync(file).length / 1e6).toFixed(1)} MB`)
