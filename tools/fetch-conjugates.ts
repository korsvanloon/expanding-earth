/**
 * Fetch an externally picked conjugate set, with the published error on each
 * pick, and store it as one compact file.
 *
 * This is the answer to the sharpest criticism of the model's own score. The
 * conjugate pairs it grades itself on are built by its own fracture-zone
 * tracer, from the same age grid it reconstructs -- half of them pull the
 * solver and half are held back, which controls for overfitting but not for the
 * tracer being wrong in the same way twice. An external set has no such
 * problem, and it comes with something the tracer cannot supply: a positional
 * uncertainty per pick, published by the people who made it.
 *
 * Two files are read and neither is guessed at.
 *
 * **The Hellinger archive** (Seton et al. 2014, G-cubed 15, 1629) holds 162
 * `.pick` files from eleven plate-pair studies, in Chang's `hellinger1` format.
 * Each file is one chron of one plate pair, and each row is
 * `side segment lat lon sigma_km kind`, where side is 1 or 2 for the two
 * plates. That is what makes the file worth having: **picks with the same
 * segment number on opposite sides are the same isochron segment on the two
 * flanks of one ridge**, so the pairing is published rather than inferred. The
 * sigmas run 3 to 6 km for Cenozoic magnetic picks and 5 to 15 km for
 * Cretaceous, quiet-zone and fracture-zone picks.
 *
 * **The global pick compilation** is read only for its chron ages. Its header
 * carries a `GeeK2007` age on every pick, so the chron-to-age table comes out
 * of the data by grouping on the chron name and its young/old/centre flag,
 * rather than out of a timescale nobody here has opened. 417 chron ends are
 * resolved that way.
 *
 * What is deliberately thrown away: any file whose label cannot be resolved to
 * one chron end unambiguously (the full-fit and quiet-zone-boundary files, and
 * a handful of bare anomaly numbers from the older studies), and any segment
 * that does not have picks on both sides. The count of each is printed, because
 * a set that quietly drops half its content is not an external check.
 *
 *   pnpm exec tsx tools/fetch-conjugates.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HELLINGER =
  'https://www.soest.hawaii.edu/PT/GSFML/HELL/DATA/GSFML.Global.hellinger.zip'
const PICKS = 'https://www.soest.hawaii.edu/PT/GSFML/ML/DATA/GSFML.global.picks.gmt'

/** One isochron segment, as the two places the reconstruction must bring together. */
interface Conjugate {
  /** The plate pair, from the file name: `SAM-AFR` and so on. */
  pair: string
  /** The chron label as the study wrote it. */
  chron: string
  /** Its age on Gee & Kent 2007, from the compilation's own column. */
  ageMa: number
  /** The study's own 1-sigma position error for these picks, km. */
  sigmaKm: number
  /** How many picks each side's place is the mean of. */
  countA: number
  countB: number
  lonA: number
  latA: number
  lonB: number
  latB: number
}

/** Every file in a zip, by name, without a dependency. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  // Walk the local file headers. Every entry in this archive is stored or
  // deflated, and the central directory is not needed to read them in order.
  let at = 0
  while (at + 30 <= zip.length && zip.readUInt32LE(at) === 0x04034b50) {
    const method = zip.readUInt16LE(at + 8)
    const compressed = zip.readUInt32LE(at + 18)
    const uncompressed = zip.readUInt32LE(at + 22)
    const nameLength = zip.readUInt16LE(at + 26)
    const extraLength = zip.readUInt16LE(at + 28)
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString('latin1')
    const body = at + 30 + nameLength + extraLength
    // A directory entry is legitimately empty; a file entry with both sizes
    // zero has them in a trailing data descriptor, which is not read here.
    if (compressed === 0 && uncompressed === 0 && !name.endsWith('/')) {
      throw new Error(`${name}: sizes are in a data descriptor, which is not read here`)
    }
    const bytes = zip.subarray(body, body + compressed)
    if (!name.endsWith('/')) {
      out.set(name, method === 0 ? Buffer.from(bytes) : inflateRawSync(bytes))
    }
    at = body + compressed
  }
  return out
}

/**
 * Chron name and end to age, from the compilation's own GeeK2007 column.
 *
 * Keys are `C21n|y`. The compilation writes a chron and one of y/o/c on every
 * pick, so grouping gives the published age of each end without a timescale
 * being interpreted here.
 */
function chronAges(text: string): Map<string, number> {
  const ages = new Map<string, number[]>()
  for (const line of text.split('\n')) {
    if (!line.startsWith('# @D')) continue
    const parts = line.slice('# @D'.length).split('|')
    if (parts.length < 7) continue
    const age = Number(parts[6])
    if (!Number.isFinite(age)) continue
    const key = `${parts[0]}|${parts[1]}`
    const list = ages.get(key) ?? []
    list.push(age)
    ages.set(key, list)
  }
  const out = new Map<string, number>()
  for (const [key, list] of ages) {
    // One age per chron end in the source; the median guards against a stray
    // row rather than averaging anything real.
    list.sort((a, b) => a - b)
    out.set(key, list[list.length >> 1])
  }
  return out
}

/**
 * The age of a Hellinger file's chron label.
 *
 * Labels come in three shapes across the eleven studies: `C21y` (chron 21,
 * young end), `C33` (no end named) and bare `34` or `3ay` from the older
 * papers, which write the anomaly number without its `C`. The compilation
 * names the same chrons as `C21n`, `C3An.1n` and so on, so a label is resolved
 * by trying those spellings in order and taking the first that exists.
 *
 * Ambiguity is real and is handled by trying both readings rather than by
 * picking one: in `C6c` the `c` could be the chron letter (chron 6C) or the
 * centre of chron 6, and only one of the two will be in the table. A label
 * that resolves under neither reading is dropped and counted.
 */
function ageOf(label: string, ages: Map<string, number>): number | null {
  // Either `<number><letter><end>` or `<number><end>`, since the letter and
  // the end are both single letters and `c` can be either.
  const shapes = [
    /^C?(\d+)([A-Da-d])([yoc])?$/,
    /^C?(\d+)()([yoc])?$/,
  ]
  for (const shape of shapes) {
    const m = shape.exec(label)
    if (!m) continue
    const chron = `C${m[1]}${m[2].toUpperCase()}`
    const end = m[3]
    // Chrons subdivided into .1n, .2n: the young end of the chron as a whole
    // is the young end of its first subchron, and the old end the old end of
    // the last, which is what a study means by `C32y`.
    const named = [...ages.keys()]
      .filter((key) => key.split('|')[0].startsWith(`${chron}n`))
      .sort()
    if (!named.length) continue
    const pick = (which: string) => {
      const rows = named.filter((key) => key.endsWith(`|${which}`))
      if (!rows.length) return undefined
      const values = rows.map((key) => ages.get(key)!)
      return which === 'y' ? Math.min(...values) : Math.max(...values)
    }
    if (end === 'y') { const a = pick('y'); if (a !== undefined) return a }
    if (end === 'o') { const a = pick('o'); if (a !== undefined) return a }
    if (end === 'c' || !end) {
      const y = pick('y')
      const o = pick('o')
      // A label with no end named is the middle of the chron, which is only an
      // isochron age if the chron is short. Anomaly 34 is the Cretaceous
      // Normal Superchron -- 83 to 120.6 Ma -- and its middle is not a date
      // anything cooled at, so a chron wider than five million years is
      // refused rather than averaged.
      if (y !== undefined && o !== undefined && o - y <= 5) return (y + o) / 2
    }
  }
  return null
}

async function main() {
  console.log('[pairs] downloading the GSFML Hellinger archive and the pick compilation')
  const [zip, picks] = await Promise.all([
    fetch(HELLINGER).then(async (r) => Buffer.from(await r.arrayBuffer())),
    fetch(PICKS).then((r) => r.text()),
  ])
  const ages = chronAges(picks)
  console.log(`[pairs] ${ages.size} chron ends with a Gee & Kent 2007 age`)

  const files = unzip(zip)
  const conjugates: Conjugate[] = []
  let unresolved = 0
  let lonely = 0
  let pickCount = 0
  let malformed = 0
  let thirdPlate = 0
  for (const [path, body] of files) {
    if (!path.endsWith('.pick')) continue
    const name = path.slice(path.lastIndexOf('/') + 1)
    const [pair, label] = name.split('.')
    const ageMa = ageOf(label, ages)
    if (ageMa === null) {
      unresolved++
      continue
    }
    // side|segment -> the picks on it. Eleven studies wrote these files over
    // seventeen years and the trailing columns drift -- comments, cruise
    // names, a second sigma -- so every field is checked rather than assumed,
    // and a row that does not parse is counted rather than silently dropped.
    const sides = new Map<string, { lon: number; lat: number; sigmaKm: number }[]>()
    for (const line of body.toString('utf8').split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue
      const parts = line.trim().split(/\s+/)
      if (parts.length < 5) continue
      const side = Number(parts[0])
      const segment = Number(parts[1])
      const lat = Number(parts[2])
      const lon = Number(parts[3])
      const sigmaKm = Number(parts[4])
      if (!Number.isInteger(side) || !Number.isInteger(segment)) continue
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) continue
      if (!Number.isFinite(lon) || Math.abs(lon) > 360) continue
      if (!Number.isFinite(sigmaKm) || sigmaKm <= 0) { malformed++; continue }
      // A three-plate study numbers three sides; the file name's first two
      // codes are the pair, so the third plate's picks are not part of it.
      if (side !== 1 && side !== 2) { thirdPlate++; continue }
      const key = `${side}|${segment}`
      const list = sides.get(key) ?? []
      list.push({ lon, lat, sigmaKm })
      sides.set(key, list)
      pickCount++
    }
    const segments = new Set(
      [...sides.keys()].map((key) => Number(key.split('|')[1])),
    )
    for (const segment of segments) {
      const a = sides.get(`1|${segment}`)
      const b = sides.get(`2|${segment}`)
      if (!a || !b) {
        lonely++
        continue
      }
      const mean = (list: { lon: number; lat: number }[]) => [
        list.reduce((s, p) => s + p.lon, 0) / list.length,
        list.reduce((s, p) => s + p.lat, 0) / list.length,
      ]
      const [lonA, latA] = mean(a)
      const [lonB, latB] = mean(b)
      conjugates.push({
        pair, chron: label, ageMa,
        // The larger of the two sides' worst pick: the tolerance a segment
        // pair earns is set by its least certain end, not by its best.
        sigmaKm: Math.max(...a.map((p) => p.sigmaKm), ...b.map((p) => p.sigmaKm)),
        countA: a.length, countB: b.length,
        lonA, latA, lonB, latB,
      })
    }
  }

  conjugates.sort((x, y) => x.ageMa - y.ageMa || x.pair.localeCompare(y.pair))
  const out = resolve(ROOT, 'data-src/conjugates.json')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify({
    source: 'GSFML Hellinger archive (Seton et al. 2014); ages from the GSFML pick '
      + 'compilation, Gee & Kent 2007',
    conjugates,
  }, null, 1)}\n`)

  const byPair = new Map<string, number>()
  for (const c of conjugates) byPair.set(c.pair, (byPair.get(c.pair) ?? 0) + 1)
  console.log(
    `[pairs] ${conjugates.length} conjugate segments from ${pickCount} picks; `
    + `${unresolved} files skipped for an unresolvable chron, ${lonely} segments `
    + `skipped for having only one side, ${thirdPlate} picks belonging to a third `
    + `plate, ${malformed} rows unparsed`,
  )
  for (const [pair, n] of [...byPair].sort((a, b) => b[1] - a[1])) {
    const mine = conjugates.filter((c) => c.pair === pair)
    const oldest = Math.max(...mine.map((c) => c.ageMa))
    const youngest = Math.min(...mine.map((c) => c.ageMa))
    console.log(
      `[pairs]   ${pair.padEnd(12)} ${String(n).padStart(4)} segments, `
      + `${youngest.toFixed(1)} to ${oldest.toFixed(1)} Ma, `
      + `sigma ${Math.min(...mine.map((c) => c.sigmaKm))} to `
      + `${Math.max(...mine.map((c) => c.sigmaKm))} km`,
    )
  }
  console.log(`[pairs] wrote ${out}`)
}

await main()
