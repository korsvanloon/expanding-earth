/**
 * How the reconstructed positions travel from the solver to the viewer.
 *
 * Forty-one frames of forty thousand points, three signed shorts each, is ten
 * megabytes and two thirds of everything a visitor waits for before the globe
 * appears. Two changes make it smaller and neither loses a bit:
 *
 * **Differences.** Each frame is stored as what changed from the one before.
 * The crust moves a median 205 of the 32,767 units that make an Earth radius
 * over a five-million-year step, so the differences are small numbers where
 * the positions were large ones. A compressor can do something with that.
 *
 * **Byte split.** Within a frame, every low byte is written before every high
 * byte. Once the numbers are small their high bytes are almost all zero or all
 * ones, and putting them next to each other is what lets a compressor see it.
 *
 * Measured on the shipped run, gzipped: 6.45 MB as it was, 5.17 with the
 * differences alone, 6.93 with the split alone -- *worse*, because the split
 * only pays once the numbers are small -- and 4.51 MB with both.
 *
 * Both halves rely on Int16 arithmetic wrapping the same way on the way out as
 * on the way in, which it does: the writer's subtraction and the reader's
 * addition truncate to the same sixteen bits.
 */

/** Pack frames of quantised positions into the bytes that go on the wire. */
export function writeFrames(frames: Int16Array[], vertexCount: number): Uint8Array {
  const words = vertexCount * 3
  const out = new Uint8Array(frames.length * words * 2)
  const previous = new Int16Array(words)
  const delta = new Int16Array(words)
  const bytes = new Uint8Array(delta.buffer, delta.byteOffset, delta.byteLength)
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f]
    for (let i = 0; i < words; i++) delta[i] = frame[i] - previous[i]
    previous.set(frame)
    const at = f * words * 2
    for (let i = 0; i < words; i++) {
      out[at + i] = bytes[i * 2]
      out[at + words + i] = bytes[i * 2 + 1]
    }
  }
  return out
}

/** And back, giving exactly the array `writeFrames` was handed. */
export function readFrames(buffer: ArrayBuffer, vertexCount: number): Int16Array {
  const words = vertexCount * 3
  const frameCount = Math.floor(buffer.byteLength / (words * 2))
  const bytes = new Uint8Array(buffer)
  const out = new Int16Array(frameCount * words)
  const one = new Int16Array(words)
  const oneBytes = new Uint8Array(one.buffer)
  for (let f = 0; f < frameCount; f++) {
    const at = f * words * 2
    for (let i = 0; i < words; i++) {
      oneBytes[i * 2] = bytes[at + i]
      oneBytes[i * 2 + 1] = bytes[at + words + i]
    }
    const base = f * words
    const before = base - words
    for (let i = 0; i < words; i++) {
      out[base + i] = f === 0 ? one[i] : out[before + i] + one[i]
    }
  }
  return out
}

/**
 * The same differencing for a one-byte-per-vertex channel.
 *
 * How far inside the shell each point sits under the fold (tools/lib/fold.ts):
 * one byte a point a frame, which is 8.2 MB raw over a two-hundred-frame run.
 * Almost all of it is 255 -- crust on the surface -- and what is not changes by
 * a step or two a frame, so the differences are nearly all zero and a
 * compressor removes them. No byte split here: there is only one byte.
 *
 * Uint8 arithmetic wraps on the way out and on the way in, so this loses
 * nothing.
 */
export function writeChannel(frames: Uint8Array[]): Uint8Array {
  if (!frames.length) return new Uint8Array(0)
  const count = frames[0].length
  const out = new Uint8Array(frames.length * count)
  const previous = new Uint8Array(count)
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f]
    const at = f * count
    for (let i = 0; i < count; i++) out[at + i] = (frame[i] - previous[i]) & 255
    previous.set(frame)
  }
  return out
}

/** And back, giving exactly the frames `writeChannel` was handed. */
export function readChannel(buffer: ArrayBuffer, count: number): Uint8Array {
  const bytes = new Uint8Array(buffer)
  const frameCount = Math.floor(bytes.length / count)
  const out = new Uint8Array(frameCount * count)
  for (let f = 0; f < frameCount; f++) {
    const at = f * count
    for (let i = 0; i < count; i++) {
      out[at + i] = f === 0 ? bytes[i] : (out[at - count + i] + bytes[at + i]) & 255
    }
  }
  return out
}
