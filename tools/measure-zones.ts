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
import { readFileSync, writeFileSync } from 'node:fs'
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
  // Ids are positions in a list that is rebuilt from scratch every run, so a
  // number written down yesterday points at a different curve today. Accept a
  // place as well, and answer with whatever curve passes nearest to it.
  const args = process.argv.slice(2)
  const wanted = args.filter((a) => !a.includes(',')).map(Number).filter(Number.isFinite)
  const places = args.filter((a) => a.includes(',')).map((a) => {
    const [lon, lat] = a.split(',').map(Number)
    return { lon, lat }
  })

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

  {
    const lengths = curves.map((c) => lengthKm(c)).sort((a, b) => a - b)
    const cells = new Set<number>()
    for (const c of curves) for (const at of c) cells.add(at)
    console.log(
      `median ${lengths[lengths.length >> 1].toFixed(0)} km, longest `
      + `${lengths[lengths.length - 1].toFixed(0)} km, `
      + `${(lengths.reduce((a, b) => a + b, 0) / 1000).toFixed(0)} thousand km of line in total `
      + `over ${cells.size} distinct cells`,
    )
  }

  // Kept across a code change so the two answers can be compared: what
  // matters is not the curve count but whether a feature the old detector
  // found still has a curve on it.
  if (process.env.DUMP) {
    writeFileSync(process.env.DUMP, JSON.stringify({ width, height, curves }))
    console.log(`wrote ${process.env.DUMP}`)
  }
  if (process.env.AGAINST) {
    const before = JSON.parse(readFileSync(process.env.AGAINST, 'utf8')) as
      { width: number; height: number; curves: number[][] }
    const near = 3
    const owned = new Uint8Array(width * height)
    for (const c of curves) {
      for (const at of c) {
        const row = Math.floor(at / width), column = at % width
        for (let dy = -near; dy <= near; dy++) {
          const r = row + dy
          if (r < 0 || r >= height) continue
          for (let dx = -near; dx <= near; dx++) owned[r * width + ((column + dx + width) % width)] = 1
        }
      }
    }
    let covered = 0
    let lostKm = 0
    for (const c of before.curves) {
      let hit = 0
      for (const at of c) if (owned[at]) hit++
      if (hit >= 0.6 * c.length) covered++
      else lostKm += lengthKm(c)
    }
    console.log(
      `${covered} of ${before.curves.length} curves from the run before still have a `
      + `curve within ${near} cells of most of their length `
      + `(${(100 * covered / before.curves.length).toFixed(0)}%); the rest are `
      + `${(lostKm / 1000).toFixed(0)} thousand km`,
    )
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

  // --- 1b. where they are ----------------------------------------------
  //
  // A screenshot of one ocean suggests the detector only works in that ocean,
  // so the share each basin gets of its own sea floor is worth having. Boxes
  // rather than real basin outlines: crude, but stated, and the comparison is
  // between them rather than against anything absolute.
  {
    const basins: { name: string; lon: [number, number]; lat: [number, number] }[] = [
      { name: 'South Atlantic', lon: [-70, 20], lat: [-55, 0] },
      { name: 'North Atlantic', lon: [-80, 0], lat: [0, 65] },
      { name: 'North Pacific', lon: [120, -100], lat: [0, 60] },
      { name: 'South Pacific', lon: [150, -70], lat: [-55, 0] },
      { name: 'Indian', lon: [20, 120], lat: [-55, 25] },
      { name: 'Southern', lon: [-180, 180], lat: [-80, -55] },
    ]
    const onCurve = new Uint8Array(width * height)
    for (const c of curves) for (const at of c) onCurve[at] = 1
    const inBox = (lon: number, lat: number, box: typeof basins[number]) => {
      if (lat < box.lat[0] || lat > box.lat[1]) return false
      return box.lon[0] <= box.lon[1]
        ? lon >= box.lon[0] && lon <= box.lon[1]
        : lon >= box.lon[0] || lon <= box.lon[1]
    }
    const counts = basins.map(() => ({ lit: 0, floor: 0 }))
    let litAll = 0
    let floorAll = 0
    for (let row = 0; row < height; row++) {
      const lat = (0.5 - (row + 0.5) / height) * 180
      for (let column = 0; column < width; column++) {
        const at = row * width + column
        const lon = ((column + 0.5) / width - 0.5) * 360
        const rad = Math.PI / 180
        const c = Math.cos(lat * rad)
        const [ac, ar] = directionToPixel(
          c * Math.cos(lon * rad), Math.sin(lat * rad), -c * Math.sin(lon * rad),
          ageFull.width, ageFull.height,
        )
        if (!Number.isFinite(ageMa[ar * ageFull.width + ac])) continue
        floorAll++
        if (onCurve[at]) litAll++
        for (let b = 0; b < basins.length; b++) {
          if (!inBox(lon, lat, basins[b])) continue
          counts[b].floor++
          if (onCurve[at]) counts[b].lit++
        }
      }
    }
    console.log(
      `${(100 * litAll / floorAll).toFixed(2)}% of the dated sea floor is on a curve: `
      + basins.map((b, i) => `${b.name} ${(100 * counts[i].lit / (counts[i].floor || 1)).toFixed(2)}%`).join(', '),
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
    // How lumpy the gravity is *along* the line. A fracture-zone scarp is a
    // step in the sea floor that runs for hundreds of kilometres, so walking
    // it the reading barely changes. A seamount chain is a string of separate
    // volcanoes: the same walk climbs 200 Eotvos and falls back between every
    // one of them.
    let swing = 0
    const seen: number[] = []
    for (const at of curve) {
      const [x, y, z] = dir(at)
      const [gc2, gr2] = directionToPixel(x, y, z, vgg.width, vgg.height)
      const v = gridValue(vgg, gc2, gr2)
      if (Number.isFinite(v)) seen.push(v)
    }
    seen.sort((a, b) => a - b)
    if (seen.length > 4) {
      swing = seen[Math.floor(0.9 * seen.length)] - seen[Math.floor(0.1 * seen.length)]
    }
    peaks.sort((a, b) => a - b)
    return n
      ? {
        step: step / n,
        bowl: bowl / n,
        peak: peak / n,
        blob: peaks[Math.floor(0.9 * peaks.length)] ?? 0,
        excess: excessN ? excess / excessN : 0,
        swing,
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
  for (const key of ['step', 'bowl', 'peak', 'blob', 'excess', 'swing'] as const) {
    const values = scored.map((s) => s![key])
    console.log(
      `${key.padEnd(5)} p10 ${quantile(values, 0.1).toFixed(1)}  `
      + `p25 ${quantile(values, 0.25).toFixed(1)}  median ${quantile(values, 0.5).toFixed(1)}  `
      + `p75 ${quantile(values, 0.75).toFixed(1)}  p90 ${quantile(values, 0.9).toFixed(1)}`,
    )
  }

  // Does the bowl test pick out the ridge axis, or just noise? If it is the
  // axis, what it flags should be young: crust made at a ridge in the last few
  // million years is what sits beside one.
  {
    const meanAge = (curve: number[]) => {
      let sum = 0, n = 0
      for (const at of curve) {
        const [x, y, z] = dir(at)
        const [c, r] = directionToPixel(x, y, z, ageFull.width, ageFull.height)
        const a = ageMa[r * ageFull.width + c]
        if (Number.isFinite(a)) { sum += a; n++ }
      }
      return n ? sum / n : NaN
    }
    for (const cut of [0.5, 0.7, 1.0]) {
      const flagged: number[] = []
      const rest: number[] = []
      for (let i = 0; i < curves.length; i++) {
        const a = across(curves[i], 60)
        if (!a) continue
        const age = meanAge(curves[i])
        if (!Number.isFinite(age)) continue
        ;(a.bowl > cut ? flagged : rest).push(age)
      }
      console.log(
        `bowl > ${cut}: ${flagged.length} curves, median age `
        + `${quantile(flagged, 0.5)?.toFixed(0)} Ma; the other ${rest.length} `
        + `median ${quantile(rest, 0.5)?.toFixed(0)} Ma`,
      )
    }
  }

  const nearest = places.map(({ lon, lat }) => {
    const rad = Math.PI / 180
    const c = Math.cos(lat * rad)
    const target = [c * Math.cos(lon * rad), Math.sin(lat * rad), -c * Math.sin(lon * rad)]
    let best = -1
    let bestKm = Infinity
    for (let i = 0; i < curves.length; i++) {
      for (const at of curves[i]) {
        const d = dir(at)
        const km = Math.acos(Math.min(1, Math.max(-1, d[0] * target[0] + d[1] * target[1] + d[2] * target[2]))) * R0_KM
        if (km < bestKm) { bestKm = km; best = i }
      }
    }
    console.log(`${lon}, ${lat}: nearest curve is #${best + 1}, ${bestKm.toFixed(0)} km away`)
    return best + 1
  })

  for (const id of [...wanted, ...nearest]) {
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
          + `  blob ${a.blob.toFixed(1)}  excess ${a.excess.toFixed(2)}  swing ${a.swing.toFixed(0)}`
        : '  no cross-profile'),
    )
  }
}

main()
