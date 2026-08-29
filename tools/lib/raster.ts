import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'
import { directionToPixel } from '../../shared/sphere.js'

/**
 * A single-channel equirectangular raster: x spans longitude -180..180,
 * y spans latitude +90..-90.
 */
export class Raster {
  constructor(
    readonly width: number,
    readonly height: number,
    readonly data: Uint8Array,
  ) {}

  at(x: number, y: number): number {
    const cx = ((x % this.width) + this.width) % this.width
    const cy = Math.min(this.height - 1, Math.max(0, y))
    return this.data[cy * this.width + cx]
  }

  /** Sample at a unit direction vector (y = north pole). */
  atDirection(dx: number, dy: number, dz: number): number {
    const [column, row] = directionToPixel(dx, dy, dz, this.width, this.height)
    return this.at(column, row)
  }

  /** cos(latitude) weight of row y — the relative area of a cell in that row. */
  rowWeight(y: number): number {
    return Math.cos((0.5 - (y + 0.5) / this.height) * Math.PI)
  }

  /** Total cos-weighted cell count, i.e. the area of the sphere in cell units. */
  totalWeight(): number {
    let total = 0
    for (let y = 0; y < this.height; y++) total += this.rowWeight(y) * this.width
    return total
  }
}

/** Load the red channel of a PNG or JPEG as an equirectangular raster. */
export function loadRaster(path: string): Raster {
  const buffer = readFileSync(path)
  const decoded = path.endsWith('.png')
    ? PNG.sync.read(buffer)
    : jpeg.decode(buffer, { useTArray: true })
  const { width, height } = decoded
  const rgba = decoded.data as Uint8Array
  const out = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4]
  return new Raster(width, height, out)
}

/**
 * Box-downsample a raster in which `nodata` marks absent values.
 *
 * Averaging a nodata sentinel with real values would smear it, so each output
 * cell takes the median of the valid inputs, and becomes nodata only when the
 * majority of its inputs are nodata. That keeps coastlines crisp instead of
 * bleeding a band of fake ages around every continent.
 */
export function downsample(src: Raster, width: number, height: number, nodata: number): Raster {
  const out = new Uint8Array(width * height)
  const sx = src.width / width
  const sy = src.height / height
  const bucket: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bucket.length = 0
      let missing = 0
      let total = 0
      for (let j = Math.floor(y * sy); j < Math.floor((y + 1) * sy); j++) {
        for (let i = Math.floor(x * sx); i < Math.floor((x + 1) * sx); i++) {
          const v = src.at(i, j)
          total++
          if (v === nodata) missing++
          else bucket.push(v)
        }
      }
      if (total === 0 || missing * 2 >= total) {
        out[y * width + x] = nodata
      } else {
        bucket.sort((a, b) => a - b)
        out[y * width + x] = bucket[bucket.length >> 1]
      }
    }
  }
  return new Raster(width, height, out)
}

/**
 * Grey level at which the cos-weighted area above that level equals `fraction`
 * of the sphere. Used to calibrate the height map against known figures
 * (29.2% of the globe is land, ~41% is continental crust) without needing to
 * know how the image was scaled.
 */
export function areaQuantile(raster: Raster, fraction: number): number {
  const area = new Float64Array(256)
  let total = 0
  for (let y = 0; y < raster.height; y++) {
    const w = raster.rowWeight(y)
    for (let x = 0; x < raster.width; x++) {
      area[raster.at(x, y)] += w
      total += w
    }
  }
  let accumulated = 0
  for (let g = 255; g >= 0; g--) {
    accumulated += area[g]
    if (accumulated / total >= fraction) return g
  }
  return 0
}
