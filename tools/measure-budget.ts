/**
 * How much deformation the data asks for, against how much the run performs.
 *
 * A reader put the model's own principle sharply: *we weten de oppervlakte en
 * hoeveel korst er op moet. alles wat er niet op moet klapt naar binnen, en
 * misschien is er een klein beetje te veel korst voor de radius vanwege
 * incomplete data. die delta mag vervormen.* The crust should **move**. Only
 * the mismatch between what the sphere can hold and what the crust measures is
 * allowed to squash, and that mismatch is knowable in advance -- it comes out
 * of the age grid and the radius curve, with no reconstruction involved.
 *
 * This used to compute it, in a second implementation of the solver's own area
 * arithmetic, which is the reason nobody ran it: a measurement that lives
 * outside the run gets looked at once. The solver measures it per frame now and
 * writes it into `meta.json`, so this only reads and lays it out.
 *
 *   pnpm exec tsx tools/measure-budget.ts
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Meta } from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = resolve(ROOT, process.env.DATA_IN ?? 'public/data')

const meta = JSON.parse(readFileSync(resolve(DATA, 'meta.json'), 'utf8')) as Meta

console.log(
  '  Ma   the data allows   the run deforms      squeezed    stretched   over budget',
)
for (const d of meta.diagnostics) {
  if (d.timeMa % 20 !== 0) continue
  const pc = (x: number, places = 2) => `${(100 * x).toFixed(places)}%`
  console.log(
    `${String(d.timeMa).padStart(4)}  ${pc(d.budgetFraction).padStart(14)}`
    + `  ${pc(d.deformedFraction, 1).padStart(15)}`
    + `  ${pc(d.squeezedFraction, 1).padStart(12)}`
    + ` ${pc(d.stretchedFraction, 1).padStart(12)}`
    + `  ${`x${d.overBudget.toFixed(0)}`.padStart(12)}`,
  )
}
console.log(
  '\n  Shares of the sphere at that time. The allowance is the disagreement'
  + '\n  between two readings of one dataset -- the sphere from the radius curve,'
  + '\n  the demand from 81,920 triangles -- and it is all the licence there is.',
)
