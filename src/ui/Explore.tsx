import { useRef, useState } from 'react'
import { EXPLORER_KNOBS, explore, type Knobs } from '@/explore'
import type { Dataset } from '@/data'

/**
 * Turn a knob and look at it.
 *
 * Every number in MODEL.md cost a run of seven and a half minutes, which is
 * why the sweeps in it are two or three values wide. This solves the same model
 * on a coarser mesh in the browser, in seconds, so a reader can push a knob
 * around and see which way the reconstruction goes before anyone spends an
 * evening measuring it properly.
 *
 * It is emphatically not the model, and the caption says so where it cannot be
 * missed: two and a half thousand points instead of forty-one thousand, points
 * five hundred kilometres apart, and margins that come out hundreds of
 * kilometres from where the real run puts them. Directions, not numbers.
 */
interface Slider {
  name: keyof Knobs
  label: string
  min: number
  max: number
  step: number
  what: string
}

const SLIDERS: Slider[] = [
  { name: 'PAIR_K', label: 'Pairs pull', min: 0, max: 1, step: 0.05,
    what: 'How hard a conjugate pair hauls its two halves together. The main engine.' },
  { name: 'DRAG', label: 'Slab drag', min: 0, max: 1, step: 0.05,
    what: 'How much of the hanging curtain’s pull becomes a turn of the plate above it.' },
  { name: 'ISLAND_HOLD', label: 'Islands keep shape', min: 0, max: 1, step: 0.05,
    what: 'How hard a continent is pulled back to its own shape each sweep.' },
  { name: 'HOLD_STRENGTH', label: 'by their own strength', min: 0, max: 1, step: 0.1,
    what: 'At one, a shield holds and a thinned sliver bends. At zero, both alike.' },
  { name: 'COMPRESS_K', label: 'Resist squeezing', min: 0, max: 1, step: 0.05,
    what: 'How much stiffer shortening an edge is than stretching it.' },
  { name: 'LAND_MARGIN', label: 'Land may shrink to', min: 0.1, max: 1, step: 0.05,
    what: 'The least area a piece of continent may be squeezed into.' },
  { name: 'FOLD_MARGIN', label: 'Sea floor may shrink to', min: 0.02, max: 1, step: 0.02,
    what: 'The same for sea floor, which is allowed far more because it folds away.' },
  { name: 'BREAKS_BELOW', label: 'Crust faults below', min: 0, max: 1, step: 0.05,
    what: 'Weaker than this and the mesh may redraw itself there instead of straining.' },
  { name: 'SWEEPS', label: 'Relaxation sweeps', min: 5, max: 80, step: 5,
    what: 'How hard each frame is settled. The speed dial: fewer is faster and looser.' },
]

export function Explore({ onRun, onRevert, exploring }: {
  onRun: (data: Dataset, seconds: number) => void
  onRevert: () => void
  exploring: boolean
}) {
  const [knobs, setKnobs] = useState<Knobs>({ ...EXPLORER_KNOBS })
  const [share, setShare] = useState<number | null>(null)
  const [note, setNote] = useState<string>()
  const running = useRef<{ cancel: () => void } | null>(null)

  const run = () => {
    if (running.current) return
    setNote(undefined)
    setShare(0)
    const job = explore(knobs, 4, setShare)
    running.current = job
    job.promise.then(
      ({ data, seconds }) => {
        running.current = null
        setShare(null)
        setNote(`solved in ${seconds.toFixed(1)} s`)
        onRun(data, seconds)
      },
      (error: Error) => {
        running.current = null
        setShare(null)
        setNote(error.message)
      },
    )
  }

  const changed = SLIDERS.filter((s) => knobs[s.name] !== EXPLORER_KNOBS[s.name])

  return (
    <>
      <h3>Turn a knob</h3>
      <p className="caption">
        The same solver, on a mesh of 2,562 points instead of 40,962, in the
        browser. A coarse answer is a different answer and not a faster one
        &mdash; its points are five hundred kilometres apart, so the fold, the
        closing rims and the continental margins all behave differently, and its
        margin fits land hundreds of kilometres from where the real run puts
        them. Read it for which way a knob pushes, never for a number.
      </p>
      {SLIDERS.map((slider) => (
        <label className="field slider" key={slider.name}>
          <span>
            {slider.label}
            <em>{knobs[slider.name]}</em>
          </span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={knobs[slider.name]}
            disabled={share !== null}
            onChange={(e) => setKnobs({ ...knobs, [slider.name]: Number(e.target.value) })}
            title={slider.what}
          />
        </label>
      ))}
      <div className="explore-run">
        <button onClick={run} disabled={share !== null}>
          {share !== null ? 'Solving…' : 'Solve this'}
        </button>
        {exploring && share === null && (
          <button onClick={onRevert} className="quiet">Back to the shipped run</button>
        )}
      </div>
      {share !== null && (
        <>
          <div className="progress"><div style={{ width: `${Math.round(100 * share)}%` }} /></div>
          <p className="caption">
            Walking back through the run, {Math.round(100 * share)}% of the way.
            About ten seconds in all.
          </p>
        </>
      )}
      {note && <p className="caption">{note}</p>}
      {changed.length > 0 && (
        <p className="caption">
          Moved from the shipped run:{' '}
          {changed.map((s) => `${s.label} ${knobs[s.name]}`).join(', ')}.
          {' '}
          <button className="quiet" onClick={() => setKnobs({ ...EXPLORER_KNOBS })}>
            Put them back
          </button>
        </p>
      )}
    </>
  )
}
