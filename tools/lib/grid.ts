/**
 * A global raster of measurements, on disk.
 *
 * The age map arrives as a PNG, which means 256 grey levels and a calibration
 * to recover the numbers from them. That is fine for a picture and thin for a
 * measurement. Anything fetched from the Generic Mapping Tools server comes as
 * real values instead, and this is how they are kept: the source's own signed
 * 16-bit samples, with the scale and offset that turn them back into whatever
 * the field is measured in, gzipped so the file is small enough to commit.
 *
 * Row 0 is the north pole and column 0 is longitude -180, the same convention
 * as `directionToPixel`, so every raster in the project can be sampled the same
 * way. GMT's own grids run south to north; `tools/fetch-grids.ts` flips them on
 * the way in rather than leaving a second convention lying about.
 */
import { gunzipSync, gzipSync } from 'node:zlib'

/** Sample value for a cell the survey never covered. */
export const GRID_GAP = -32768

export interface Grid {
  width: number
  height: number
  /** value = sample * scale + offset, for samples that are not GRID_GAP. */
  scale: number
  offset: number
  /** What the values are, e.g. 'vgg (Eotvos)'. Carried so a file says so. */
  units: string
  samples: Int16Array
}

/**
 * Header: width, height, the length of the unit string, then that many bytes of
 * it padded out to four, then scale and offset, then the samples.
 */
export function writeGrid(grid: Grid): Buffer {
  const units = Buffer.from(grid.units, 'utf8')
  const pad = (4 - (units.length % 4)) % 4
  const head = Buffer.alloc(12 + units.length + pad + 8)
  head.writeUInt32LE(grid.width, 0)
  head.writeUInt32LE(grid.height, 4)
  head.writeUInt32LE(units.length, 8)
  units.copy(head, 12)
  head.writeFloatLE(grid.scale, 12 + units.length + pad)
  head.writeFloatLE(grid.offset, 16 + units.length + pad)
  const body = Buffer.from(
    grid.samples.buffer, grid.samples.byteOffset, grid.samples.byteLength,
  )
  return gzipSync(Buffer.concat([head, body]), { level: 9 })
}

export function readGrid(file: Buffer | Uint8Array): Grid {
  const raw = gunzipSync(file)
  const width = raw.readUInt32LE(0)
  const height = raw.readUInt32LE(4)
  const unitLength = raw.readUInt32LE(8)
  const pad = (4 - (unitLength % 4)) % 4
  const units = raw.subarray(12, 12 + unitLength).toString('utf8')
  const scale = raw.readFloatLE(12 + unitLength + pad)
  const offset = raw.readFloatLE(16 + unitLength + pad)
  const start = 20 + unitLength + pad
  // Copy rather than view: gunzipSync's buffer is pooled, so its byte offset is
  // whatever the pool happened to be at and an Int16Array cannot start there.
  const samples = new Int16Array(width * height)
  Buffer.from(samples.buffer).set(raw.subarray(start, start + width * height * 2))
  return { width, height, scale, offset, units, samples }
}

/** The value at a cell, or NaN where the survey has a gap. */
export function gridValue(grid: Grid, column: number, row: number): number {
  const sample = grid.samples[row * grid.width + column]
  return sample === GRID_GAP ? NaN : sample * grid.scale + grid.offset
}
