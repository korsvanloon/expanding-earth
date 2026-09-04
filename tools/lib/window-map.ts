/**
 * A rectangle of the world, big enough to look at.
 *
 * Several instruments here draw the same window of the same crustal fabric and
 * put different things on top of it: numbered pairs to be judged, detected
 * grooves to be confirmed. They have to agree on where a longitude lands in
 * pixels, or the answer to "is this line on that groove" is about two different
 * pictures. So the projection, the fabric's colour ramp and the few drawing
 * primitives live here and the tools only decide what to draw.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PNG } from 'pngjs'

export interface Window {
  lonFrom: number
  lonTo: number
  latFrom: number
  latTo: number
  /** How many pixels to a fabric cell, so a line is not one pixel wide. */
  scale: number
}

/** The window asked for on the command line, with the North Atlantic as default. */
export function windowFromEnv(env = process.env): Window {
  const [lonFrom, lonTo] = (env.LON ?? '-50,-5').split(',').map(Number)
  const [latFrom, latTo] = (env.LAT ?? '0,45').split(',').map(Number)
  return { lonFrom, lonTo, latFrom, latTo, scale: Number(env.SCALE ?? 2) }
}

/** Three by five, which is the smallest a digit can be and stay a digit. */
const DIGITS: Record<string, string> = {
  0: '111101101101111', 1: '010010010010010', 2: '111001111100111',
  3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001001',
}

/** The globe's own fabric ramp, so the window looks like the view it came from. */
export function fabricColour(encoded: number): [number, number, number] {
  if (encoded < 1) return [51, 51, 56]
  const t = Math.min(1, Math.max(0, (encoded - 1) / 254))
  const quiet = [23, 28, 41]
  const middle = [74, 107, 140]
  const busy = [247, 222, 158]
  const mix = (a: number[], b: number[], f: number) =>
    [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  const c = t < 0.55 ? mix(quiet, middle, t / 0.55) : mix(middle, busy, (t - 0.55) / 0.45)
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
}

/**
 * The sea floor's age, in one muted hue.
 *
 * Deliberately not the fabric's ramp, which ends in a bright cream: this base
 * exists to have lines drawn over it, and the lines were disappearing into the
 * young crust along every ridge. One hue, light where the crust is young and
 * deep where it is old, leaves every other colour on the page to the lines.
 * `age` is millions of years, or NaN where nothing is dated.
 */
export function ageColour(age: number, oldestMa = 180): [number, number, number] {
  if (Number.isNaN(age)) return [58, 58, 64]
  const t = Math.min(1, Math.max(0, age / oldestMa))
  // Both ends darker than they want to be as a map in their own right. This
  // one exists to be drawn over, and at the light end the white lines were
  // vanishing into the young crust along every ridge -- which is exactly where
  // the most interesting lines are.
  const young = [116, 146, 178]
  const old = [12, 22, 44]
  return [
    Math.round(young[0] + (old[0] - young[0]) * t),
    Math.round(young[1] + (old[1] - young[1]) * t),
    Math.round(young[2] + (old[2] - young[2]) * t),
  ]
}

export type Colour = readonly [number, number, number]

export class Canvas {
  readonly width: number
  readonly height: number
  private readonly png: PNG
  /** Where a label has already been put, so the next one can dodge it. */
  private readonly placed: { x: number; y: number }[] = []

  constructor(readonly window: Window, cellsX: number, cellsY: number) {
    this.width = cellsX * window.scale
    this.height = cellsY * window.scale
    this.png = new PNG({ width: this.width, height: this.height })
  }

  put(x: number, y: number, c: Colour) {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const at = (y * this.width + x) * 4
    this.png.data[at] = c[0]
    this.png.data[at + 1] = c[1]
    this.png.data[at + 2] = c[2]
    this.png.data[at + 3] = 255
  }

  /** Where a longitude and latitude land, as this window's pixels. */
  at(lon: number, lat: number): { px: number; py: number } {
    const { lonFrom, lonTo, latFrom, latTo } = this.window
    return {
      px: ((lon - lonFrom) / (lonTo - lonFrom)) * this.width,
      py: ((latTo - lat) / (latTo - latFrom)) * this.height,
    }
  }

  inside(p: { lon: number; lat: number }): boolean {
    const { lonFrom, lonTo, latFrom, latTo } = this.window
    return p.lon >= lonFrom && p.lon <= lonTo && p.lat >= latFrom && p.lat <= latTo
  }

  /** A line two pixels thick, which is what it takes to read one over bright fabric. */
  line(from: { px: number; py: number }, to: { px: number; py: number }, c: Colour) {
    const dx = to.px - from.px
    const dy = to.py - from.py
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))))
    for (let s = 0; s <= steps; s++) {
      const x = from.px + (dx * s) / steps
      const y = from.py + (dy * s) / steps
      this.put(x, y, c)
      this.put(x, y - 1, c)
    }
  }

  ring(at: { px: number; py: number }, c: Colour, radii: number[] = [5, 6]) {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * 2 * Math.PI
      for (const radius of radii) {
        this.put(at.px + Math.cos(t) * radius, at.py + Math.sin(t) * radius, c)
      }
    }
  }

  /**
   * A number beside a point, on a dark backing so it is still a number over
   * bright fabric, and pushed clear of any label already placed: two features
   * that nearly coincide had put their numbers on top of each other, which is
   * the one thing a numbered picture may not do.
   */
  label(text: string, atX: number, atY: number, c: Colour, size = 5) {
    let mx = Math.round(atX)
    let my = Math.round(atY)
    const wide = text.length * (4 * size) + 8
    const tall = 5 * size + 8
    while (this.placed.some((q) => Math.abs(q.x - mx) < wide && Math.abs(q.y - my) < tall)) {
      my += tall
    }
    if (my > this.height - tall) {
      my = Math.round(atY)
      mx += wide
    }
    this.placed.push({ x: mx, y: my })
    for (let by = -4; by < tall - 4; by++) {
      for (let bx = -4; bx < wide - 4; bx++) this.put(mx + bx, my + by, [14, 16, 20])
    }
    let x = mx
    for (const ch of text) {
      const bits = DIGITS[ch]
      if (bits) {
        for (let row = 0; row < 5; row++) {
          for (let column = 0; column < 3; column++) {
            if (bits[row * 3 + column] !== '1') continue
            for (let dy = 0; dy < size; dy++) {
              for (let dx = 0; dx < size; dx++) {
                this.put(x + column * size + dx, my + row * size + dy, c)
              }
            }
          }
        }
      }
      x += 4 * size
    }
  }

  write(file: string) {
    mkdirSync(dirname(resolve(file)), { recursive: true })
    writeFileSync(resolve(file), PNG.sync.write(this.png))
    return `${this.width}x${this.height} -> ${resolve(file)}`
  }
}

/**
 * A canvas the size of the window's fabric cells, with the fabric already on it.
 *
 * `data` is the fabric's encoded roughness, one byte per cell of a global
 * equirectangular grid with row zero at the north pole.
 */
export function fabricWindow(
  window: Window, fabric: { width: number; height: number; at: (c: number, r: number) => number },
): Canvas {
  const cellsX = Math.round(((window.lonTo - window.lonFrom) / 360) * fabric.width)
  const cellsY = Math.round(((window.latTo - window.latFrom) / 180) * fabric.height)
  const canvas = new Canvas(window, cellsX, cellsY)
  for (let y = 0; y < canvas.height; y++) {
    const lat = window.latTo - ((y + 0.5) / canvas.height) * (window.latTo - window.latFrom)
    const row = Math.min(fabric.height - 1, Math.floor(((90 - lat) / 180) * fabric.height))
    for (let x = 0; x < canvas.width; x++) {
      const lon = window.lonFrom + ((x + 0.5) / canvas.width) * (window.lonTo - window.lonFrom)
      const column = ((Math.floor(((lon + 180) / 360) * fabric.width) % fabric.width)
        + fabric.width) % fabric.width
      canvas.put(x, y, fabricColour(fabric.at(column, row)))
    }
  }
  return canvas
}

/**
 * The size of an age jump, as a colour: quiet where the age slopes gently,
 * cream where it steps.
 *
 * Scaled against a jump that is definitely one rather than against the
 * biggest in the window, so the same brightness means the same jump in every
 * picture and two windows can be compared.
 */
export function stepColour(size: number, full: number): Colour {
  if (!(size > 0)) return [50, 50, 56]
  const t = Math.min(1, size / Math.max(1e-6, full))
  return [Math.round(20 + 230 * t), Math.round(30 + 200 * t), Math.round(60 + 120 * t)]
}

/** A canvas the size of the window's cells, with the age jump on it. */
export function stepWindow(
  window: Window,
  steps: { width: number; height: number; size: Float32Array },
  full: number,
): Canvas {
  const cellsX = Math.round(((window.lonTo - window.lonFrom) / 360) * steps.width)
  const cellsY = Math.round(((window.latTo - window.latFrom) / 180) * steps.height)
  const canvas = new Canvas(window, cellsX, cellsY)
  for (let y = 0; y < canvas.height; y++) {
    const lat = window.latTo - ((y + 0.5) / canvas.height) * (window.latTo - window.latFrom)
    const row = Math.min(steps.height - 1, Math.floor(((90 - lat) / 180) * steps.height))
    for (let x = 0; x < canvas.width; x++) {
      const lon = window.lonFrom + ((x + 0.5) / canvas.width) * (window.lonTo - window.lonFrom)
      const column = ((Math.floor(((lon + 180) / 360) * steps.width) % steps.width)
        + steps.width) % steps.width
      canvas.put(x, y, stepColour(steps.size[row * steps.width + column], full))
    }
  }
  return canvas
}

/** A canvas the size of the window's cells, with the sea floor's age on it. */
export function ageWindow(
  window: Window, ages: { width: number; height: number; at: (c: number, r: number) => number },
): Canvas {
  const cellsX = Math.round(((window.lonTo - window.lonFrom) / 360) * ages.width)
  const cellsY = Math.round(((window.latTo - window.latFrom) / 180) * ages.height)
  const canvas = new Canvas(window, cellsX, cellsY)
  for (let y = 0; y < canvas.height; y++) {
    const lat = window.latTo - ((y + 0.5) / canvas.height) * (window.latTo - window.latFrom)
    const row = Math.min(ages.height - 1, Math.floor(((90 - lat) / 180) * ages.height))
    for (let x = 0; x < canvas.width; x++) {
      const lon = window.lonFrom + ((x + 0.5) / canvas.width) * (window.lonTo - window.lonFrom)
      const column = ((Math.floor(((lon + 180) / 360) * ages.width) % ages.width)
        + ages.width) % ages.width
      canvas.put(x, y, ageColour(ages.at(column, row)))
    }
  }
  return canvas
}
