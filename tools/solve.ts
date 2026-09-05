/**
 * The reconstruction, from the command line.
 *
 * The solver itself is tools/lib/solver.ts and knows nothing about files or
 * environments: it is handed a set of knobs and a host that can read and write
 * by name. This is that host, over `public/data` and `.stage`, plus the process
 * environment as the knobs -- which is what `pnpm data` and the Pages workflow
 * run, and what every measurement in MODEL.md was taken with.
 *
 * The split is for the browser. A panel of sliders wants to hand in nine
 * numbers and get an answer back in a few seconds, which means the same code
 * running in a worker on a coarser mesh, and a worker cannot import `node:fs`.
 * Nothing about this run changed when it moved: `frames.bin`, `strain.bin`,
 * `topology.bin` and `plates.bin` all came out byte for byte identical, and
 * meta.json identical on every field but its timestamp.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configure, setHost, solve } from './lib/solver.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IN = resolve(ROOT, 'public/data')
const STAGE = resolve(ROOT, '.stage')
/**
 * Where the answers go, `public/data` unless told otherwise.
 *
 * A sweep is several runs of the same eight minutes, and on a machine with
 * cores to spare they may as well be taken at once -- which they cannot be
 * while every one of them writes `frames.bin` to the same place. The inputs
 * never move: the mesh and the age grid are what the runs have in common, and
 * only what they conclude is different. `DATA_OUT` is the same variable
 * tools/build-data.ts already takes for the same reason.
 */
const OUT = resolve(ROOT, process.env.DATA_OUT ?? 'public/data')

/** Where each name the solver asks for is read from. */
const pathOf = (name: string) =>
  resolve(name === 'meta.partial.json' ? STAGE : IN, name)

setHost({
  read: (name) => readFileSync(pathOf(name)),
  readText: (name) => readFileSync(pathOf(name), 'utf8'),
  write: (name, data) => writeFileSync(resolve(OUT, name), data),
})
configure(process.env)
solve()
