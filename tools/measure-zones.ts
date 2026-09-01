/**
 * What is wrong with the detected fracture zones, measured rather than guessed.
 *
 * Two complaints came back from a reader who spent an evening clicking them,
 * and both are the kind that a picture cannot settle:
 *
 *   1. "four of them often lie on top of each other" -- five of the twelve ids
 *      they sent are centred within 0.4 degrees of one another.
 *   2. "most of these are seamounts, some are ridges" -- i.e. the detector is
 *      firing on volcanoes built on the crust and on the ridge axis itself,
 *      neither of which is a fracture zone.
 *
 * So: measure how many curves are near-duplicates of a longer one, and print
 * what any named id actually is -- its gravity signature, its age, how it sits
 * against the flow. Run it with ids to interrogate:
 *
 *     pnpm exec tsx tools/measure-zones.ts 1605 958 444 424 1160
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRaster } from './lib/raster.js'
import { readGrid, gridValue } from './lib/grid.js'
import { fractureZones, lineamentAt, lineaments } from './lib/structure.js'
import { directionToPixel } from '../shared/sphere.js'
import { R0_KM } from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Kept in step with CONFIG in build-data.ts by hand; a mismatch shows up
// immediately as a different curve count from the one the build printed.
const CONFIG = {
  maxAgeMa: 280,
  structureSmoothKm: 100,
  structureWindowKm: 200,
  crestSmoothKm: 25,
  crestWindowKm: 60,
  alignmentGate: 0.82,
  strengthQuantile: 0.5,
  minZoneLengthKm: 400,
}

const NODATA = 255

function main() {
  const wanted = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n))

  const ageFull = loadRaster(resolve(ROOT, 'public/textures/age-map.png'))
  const ageMa = new Float32Array(ageFull.width * ageFull.height)
  for (let i = 0; i < ageMa.length; i++) {
    ageMa[i] = ageFull.data[i] === NODATA ? NaN : (ageFull.data[i] / 255) * CONFIG.maxAgeMa
  }
  const vgg = readGrid(readFileSync(resolve(ROOT, 'data-src/vgg.grid')))
  const guide = lineaments(vgg, R0_KM, CONFIG.structureWindowKm, CONFIG.structureSmoothKm)
  const sharp = lineaments(vgg, R0_KM, CONFIG.crestWindowKm, CONFIG.crestSmoothKm)
  const { zones, curves } = fractureZones(
    sharp, guide, ageMa, ageFull.width, ageFull.height, R0_KM,
    {
      alignmentGate: CONFIG.alignmentGate,
      strengthQuantile: CONFIG.strengthQuantile,
      minLengthKm: CONFIG.minZoneLengthKm,
    },
  )
  console.log(`${curves.length} curves`)

  const { width, height } = zones
  const cellKm = (Math.PI * R0_KM) / height
  const dir = (at: number) => {
    const lon = (((at % width) + 0.5) / width - 0.5) * 2 * Math.PI
    const lat = (0.5 - (Math.floor(at / width) + 0.5) / height) * Math.PI
    const c = Math.cos(lat)
    return [c * Math.cos(lon), Math.sin(lat), -c * Math.sin(lon)] as const
  }
  const place = (at: number) => {
    const lon = (((at % width) + 0.5) / width - 0.5) * 360
    const lat = (0.5 - (Math.floor(at / width) + 0.5) / height) * 180
    return `${lon.toFixed(1)}, ${lat.toFixed(1)}`
  }
  const lengthKm = (curve: number[]) => {
    let km = 0
    for (let i = 1; i < curve.length; i++) {
      const a = dir(curve[i - 1]), b = dir(curve[i])
      km += Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R0_KM
    }
    return km
  }

  // --- 1. near-duplicates -------------------------------------------------
  //
  // Two curves are the same feature if most of the shorter one runs within a
  // few cells of the longer one. Measured by painting every curve's cells into
  // a grid of buckets and asking, for each curve, what fraction of its cells
  // have a *different* curve's cell within `nearCells`.
  const order = [...curves.keys()].sort((a, b) => lengthKm(curves[b]) - lengthKm(curves[a]))
  const owner = new Int32Array(width * height).fill(-1)
  for (const c of order) for (const at of curves[c]) if (owner[at] < 0) owner[at] = c

  for (const nearCells of [2, 3, 5]) {
    const nearKm = nearCells * cellKm
    let duplicates = 0
    const groups = new Map<number, number[]>()
    for (const c of order) {
      // Who else is within reach of most of this curve?
      const votes = new Map<number, number>()
      for (const at of curves[c]) {
        const row = Math.floor(at / width), column = at % width
        const seen = new Set<number>()
        for (let dy = -nearCells; dy <= nearCells; dy++) {
          const r = row + dy
          if (r < 0 || r >= height) continue
          for (let dx = -nearCells; dx <= nearCells; dx++) {
            const q = owner[r * width + ((column + dx + width) % width)]
            if (q >= 0 && q !== c) seen.add(q)
          }
        }
        for (const q of seen) votes.set(q, (votes.get(q) ?? 0) + 1)
      }
      let host = -1
      for (const [q, n] of votes) {
        if (n < 0.6 * curves[c].length) continue
        if (lengthKm(curves[q]) > lengthKm(curves[c])) { host = q; break }
      }
      if (host >= 0) {
        duplicates++
        const list = groups.get(host) ?? []
        list.push(c)
        groups.set(host, list)
      }
    }
    const sizes = [...groups.values()].map((g) => g.length + 1)
    sizes.sort((a, b) => b - a)
    console.log(
      `within ${nearCells} cells (${nearKm.toFixed(0)} km): ${duplicates} of ${curves.length} `
      + `curves shadow a longer one (${(100 * duplicates / curves.length).toFixed(0)}%), in `
      + `${groups.size} groups, biggest ${sizes[0] ?? 0}, median group `
      + `${sizes.length ? sizes[sizes.length >> 1] : 0}`,
    )
  }

  // --- 2. what a named curve is -------------------------------------------
  //
  // The three things that separate a fracture zone from the two impostors:
  //   * a seamount is a mass excess, so its gravity gradient is strongly
  //     positive at the crest; a fracture zone is a step, positive on one side
  //     and negative on the other, so its mean over the line is near zero.
  //   * a ridge axis is young; a fracture zone crosses all ages.
  //   * a fracture zone runs across the isochrons; both impostors need not.
  /**
   * The three-way test, sampled across the line.
   *
   * A fracture zone, a ridge axis and a seamount chain are all narrow lines in
   * a gravity grid, which is why all three get detected. They are not alike in
   * what the crust does around them:
   *
   *   fracture zone  age steps across it -- older one side, younger the other,
   *                  and the two sides average to the age on the line.
   *   ridge axis     age is at a *minimum* on the line and rises on both sides,
   *                  because the crust is being made there.
   *   seamount chain age is the same on both sides and on the line; the chain
   *                  was built on top of crust that was already there. Its
   *                  gravity is a peak, not a step.
   *
   * So: `step` separates fracture zones from the other two, `bowl` catches the
   * ridge axis, and `peak` catches the seamount.
   */
  const across = (curve: number[], reachKm: number) => {
    let step = 0, bowl = 0, peak = 0, excess = 0, excessN = 0, n = 0
    const peaks: number[] = []
    for (const at of curve) {
      const [x, y, z] = dir(at)
      const line = lineamentAt(guide, x, y, z)
      if (!line) continue
      // The normal to the line, in the tangent plane.
      let nx = line.ty * z - line.tz * y
      let ny = line.tz * x - line.tx * z
      let nz = line.tx * y - line.ty * x
      const nl = Math.hypot(nx, ny, nz) || 1
      nx /= nl; ny /= nl; nz /= nl
      const sample = (d: number) => {
        const a = (d * 1.0) / R0_KM
        const c = Math.cos(a), s2 = Math.sin(a)
        const px = x * c + nx * s2, py = y * c + ny * s2, pz = z * c + nz * s2
        const l = Math.hypot(px, py, pz) || 1
        const [ac, ar] = directionToPixel(px / l, py / l, pz / l, ageFull.width, ageFull.height)
        const [gc2, gr2] = directionToPixel(px / l, py / l, pz / l, vgg.width, vgg.height)
        return [ageMa[ar * ageFull.width + ac], gridValue(vgg, gc2, gr2)] as const
      }
      const [aM, gM] = sample(-reachKm)
      const [a0, g0] = sample(0)
      const [aP, gP] = sample(reachKm)
      if (!Number.isFinite(aM) || !Number.isFinite(a0) || !Number.isFinite(aP)) continue
      if (!Number.isFinite(gM) || !Number.isFinite(g0) || !Number.isFinite(gP)) continue
      step += Math.abs(aP - aM)
      bowl += (aP + aM) / 2 - a0
      peak += g0 - (gP + gM) / 2
      peaks.push(g0 - (gP + gM) / 2)
      // The same measurement, taken twice more a line-width away on either
      // side. Young crust near a ridge changes age so fast that any line
      // drawn on it shows a big step over 120 km whether or not anything is
      // broken -- these two controls are what a smooth age field gives, so
      // the difference is the part that is actually a discontinuity.
      const [cMM] = sample(-3 * reachKm)
      const [cM] = sample(-2 * reachKm)
      const [cP] = sample(2 * reachKm)
      const [cPP] = sample(3 * reachKm)
      if ([cMM, cM, cP, cPP].every(Number.isFinite)) {
        const control = (Math.abs(cM - cMM) + Math.abs(cPP - cP)) / 2
        excess += Math.abs(aP - aM) / 2 - control
        excessN++
      }
      n++
    }
    peaks.sort((a, b) => a - b)
    return n
      ? {
        step: step / n,
        bowl: bowl / n,
        peak: peak / n,
        blob: peaks[Math.floor(0.9 * peaks.length)] ?? 0,
        excess: excessN ? excess / excessN : 0,
        n,
      }
      : null
  }

  // How the whole population sits on the three tests, so a threshold can be
  // chosen against the distribution rather than against one example.
  const scored = curves.map((c) => across(c, 60)).filter((s) => s !== null)
  const quantile = (values: number[], q: number) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  }
  for (const key of ['step', 'bowl', 'peak', 'blob', 'excess'] as const) {
    const values = scored.map((s) => s![key])
    console.log(
      `${key.padEnd(5)} p10 ${quantile(values, 0.1).toFixed(1)}  `
      + `p25 ${quantile(values, 0.25).toFixed(1)}  median ${quantile(values, 0.5).toFixed(1)}  `
      + `p75 ${quantile(values, 0.75).toFixed(1)}  p90 ${quantile(values, 0.9).toFixed(1)}`,
    )
  }

  for (const id of wanted) {
    const curve = curves[id - 1]
    if (!curve) { console.log(`#${id}: no such curve`); continue }
    const a = across(curve, 60)
    let sum = 0, absSum = 0, minV = Infinity, maxV = -Infinity
    let ageSum = 0, ageN = 0, ageMin = Infinity, ageMax = -Infinity
    for (const at of curve) {
      const [x, y, z] = dir(at)
      const [gc, gr] = directionToPixel(x, y, z, vgg.width, vgg.height)
      const v = gridValue(vgg, gc, gr)
      if (Number.isFinite(v)) {
        sum += v; absSum += Math.abs(v)
        minV = Math.min(minV, v); maxV = Math.max(maxV, v)
      }
      const [c, r] = directionToPixel(x, y, z, ageFull.width, ageFull.height)
      const a = ageMa[r * ageFull.width + c]
      if (Number.isFinite(a)) { ageSum += a; ageN++; ageMin = Math.min(ageMin, a); ageMax = Math.max(ageMax, a) }
    }
    const n = curve.length
    console.log(
      `#${id}  ${lengthKm(curve).toFixed(0)} km  centred ${place(curve[n >> 1])}  `
      + `vgg mean ${(sum / n).toFixed(1)} Eotvos (|mean|/mean|.| `
      + `${(Math.abs(sum) / (absSum || 1)).toFixed(2)}), range ${minV.toFixed(0)}..${maxV.toFixed(0)}  `
      + `age ${ageN ? `${(ageSum / ageN).toFixed(0)} Ma, ${ageMin.toFixed(0)}..${ageMax.toFixed(0)}, spread ${(ageMax - ageMin).toFixed(0)}` : 'undated'}`
      + (a
        ? `  step ${a.step.toFixed(1)}  bowl ${a.bowl.toFixed(2)}  peak ${a.peak.toFixed(1)}`
          + `  blob ${a.blob.toFixed(1)}  excess ${a.excess.toFixed(2)}`
        : '  no cross-profile'),
    )
  }
}

main()
