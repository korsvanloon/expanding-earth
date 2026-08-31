/**
 * The figures in the documentation, written from the run rather than by hand.
 *
 * They had drifted badly: MODEL.md described a 4006 km Earth at 200 Ma with 90
 * plates, 8.6% of the sphere unaccounted for and continents thousands of
 * kilometres from where they should be, against a shipped run of 3905 km, two
 * blocks, and fits measured in tens of kilometres. Every one of those numbers
 * was true of some earlier solver. Prose can be edited when the model changes;
 * tables of measurements cannot be relied on to be, so these are generated and
 * a test fails when the file on disk disagrees.
 *
 * Keep prose out of the marked blocks and numbers out of the prose.
 */
import type { FrameDiagnostics, Meta } from '../../shared/model.js'

const OPEN = (name: string) => `<!-- from-the-run: ${name} -->`
const CLOSE = '<!-- /from-the-run -->'

const pct = (x: number, places = 2) => `${(100 * x).toFixed(places)}%`

/** The frames the tables quote. Coarse enough to read, wide enough to show the trend. */
const SHOWN_MA = [5, 30, 60, 120, 200]

export function runBlocks(meta: Meta): Record<string, string> {
  const at = (ma: number) => meta.diagnostics.find((d) => d.timeMa === ma)
  const last = meta.diagnostics[meta.diagnostics.length - 1]

  const rows = SHOWN_MA.map((ma) => {
    const d = at(ma)
    if (!d) return null
    return `| ${ma} Ma | ${d.radiusKm.toFixed(0)} km | ${pct(d.gapFraction)} | ` +
      `${pct(d.overlapFraction)} | ${pct(d.foldFraction)} | ${pct(d.cratonStrain)} | ` +
      `${pct(d.weakStrain, 1)} |`
  }).filter((r) => r !== null)

  const name = (id: string) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
  const fits = meta.scorecard.map((s) => {
    const closest = Math.min(...s.separationKm)
    const when = s.separationKm.indexOf(closest) * meta.frameStepMa
    // The number that actually tests the model is the gap at the moment the two
    // are supposed to have been joined. The closest approach anywhere in the run
    // flatters it: a pair can brush past at the wrong time entirely and still
    // report zero, which is worth showing side by side rather than instead.
    const i = Math.min(
      s.separationKm.length - 1,
      Math.round((s.joinedByMa > 0 ? s.joinedByMa : meta.endTimeMa) / meta.frameStepMa),
    )
    const held = s.matchedFraction[i] ?? 0
    const already = s.matchedFraction[0] ?? 0
    const share = (x: number) => `${(100 * x).toFixed(0)}%`
    return `| ${name(s.a)} &ndash; ${name(s.b)} | ` +
      `${s.joinedByMa > 0 ? `${s.joinedByMa} Ma` : 'watched'} | ` +
      `${share(already)} | ${share(held)} | ` +
      `${(100 * (held - already) >= 0 ? '+' : '')}${(100 * (held - already)).toFixed(0)} | ` +
      `${s.separationKm[i].toFixed(0)} km | ${closest.toFixed(0)} km at ${when} Ma |`
  })

  return {
    reports: [
      '| time | radius | bare sphere | covered twice | inside out | craton strain | weak strain |',
      '|---|---|---|---|---|---|---|',
      ...rows,
    ].join('\n'),

    fits: [
      '| pair | joined by | margin in contact today | then | gain | apart then |'
        + ' closest anywhere |',
      '|---|---|---|---|---|---|---|',
      ...fits,
    ].join('\n'),

    radius: `R(${meta.endTimeMa} Ma) = ${last.radiusKm.toFixed(0)} km, ` +
      `${((100 * last.radiusKm) / meta.r0Km).toFixed(1)}% of today.`,

    bounds: (() => {
      const end = (id: string) => meta.crustModels.find((m) => m.id === id)?.radiusKm.at(-1) ?? NaN
      const asContinent = end('permanent')
      const asOcean = end('nearest-age')
      return `Counting it as continent gives R(${meta.endTimeMa} Ma) = ` +
        `${asContinent.toFixed(0)} km, counting it as ocean gives ${asOcean.toFixed(0)} km &mdash; ` +
        `the entire ambiguity is worth ` +
        `${(100 * (asContinent - asOcean) / asOcean).toFixed(1)}% of the radius.`
    })(),

    shortfall: `At ${meta.endTimeMa} Ma it falls short by ` +
      `${(100 * (1 - (last.radiusKm / meta.r0Km) ** 2)).toFixed(0)}%.`,

    blocks: `The run finds ${meta.diagnostics.map((d) => d.blockCount).reduce((a, b) => Math.max(a, b))} ` +
      `blocks at its most divided and ${last.blockCount} at ${meta.endTimeMa} Ma.`,

    motion: [
      '| time | crust removed | median speed | blocks | biggest block | island shape |',
      '|---|---|---|---|---|---|',
      ...SHOWN_MA.concat(meta.endTimeMa).filter((ma, i, all) => all.indexOf(ma) === i)
        .map((ma) => {
          const d = at(ma)
          if (!d) return null
          return `| ${ma} Ma | ${pct(d.forcingFraction, 3)}/Myr | ` +
            `${d.medianSpeedKmMyr.toFixed(1)} km/Myr | ${d.blockCount} | ` +
            `${pct(d.biggestBlockShare, 0)} | ${pct(d.islandDistortion, 1)} |`
        }).filter((r) => r !== null),
    ].join('\n'),

    reach: (() => {
      // Rates against rates and peaks against peaks. Nothing in here is a
      // threshold: the window is stated, the extremes are the run's own, and
      // the reader can see the ratio rather than being handed a date this file
      // decided on.
      const quiet = 20
      const tail = meta.diagnostics.filter((d) => d.timeMa > meta.endTimeMa - quiet)
      const removed = tail.reduce((a, d) => a + d.forcingFraction * meta.frameStepMa, 0)
      const peak = (get: (d: FrameDiagnostics) => number) =>
        meta.diagnostics.reduce((a, d) => Math.max(a, get(d)), 0)
      return `Over the last ${quiet} Myr of the run the age grid takes away ` +
        `${pct(removed, 2)} of the globe in total &mdash; ${pct(removed / quiet, 3)} per Myr, ` +
        `against a peak of ${pct(peak((d) => d.forcingFraction), 2)}. The median surface speed ` +
        `falls from a peak of ${peak((d) => d.medianSpeedKmMyr).toFixed(0)} km/Myr to ` +
        `${last.medianSpeedKmMyr.toFixed(1)}, the block count from as many as ` +
        `${peak((d) => d.blockCount)} to ${last.blockCount}, and the biggest block grows to ` +
        `${pct(last.biggestBlockShare, 0)} of the shell.`
    })(),
  }
}

/** Replace each marked block; throws if the document is missing one. */
export function fillBlocks(text: string, blocks: Record<string, string>): string {
  let out = text
  for (const [name, body] of Object.entries(blocks)) {
    const open = OPEN(name)
    const start = out.indexOf(open)
    if (start < 0) continue
    const from = start + open.length
    const end = out.indexOf(CLOSE, from)
    if (end < 0) throw new Error(`${open} is never closed with ${CLOSE}`)
    out = `${out.slice(0, from)}\n${body}\n${out.slice(end)}`
  }
  return out
}

/** Which blocks a document asks for, so a test can tell it apart from a typo. */
export function blocksIn(text: string): string[] {
  return [...text.matchAll(/<!-- from-the-run: ([a-z]+) -->/g)].map((m) => m[1])
}
