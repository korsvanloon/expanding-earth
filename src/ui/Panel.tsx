import { useState } from 'react'
import { SURFACE_MAPS } from '@shared/maps'
import { R0_KM, REGIONS, surfaceGravity } from '@shared/model'
import { radiusAt, type Dataset } from '@/data'
import { useStore, type ViewMode } from '@/store'
import { Chart, valueAt } from './Chart'
import { useClockTime } from './useClockTime'

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'surface', label: 'Surface', hint: "Today's surface, carried along with the crust" },
  {
    id: 'age',
    label: 'Crustal age',
    hint: "Each band keeps today's colour throughout, so red vanishes first, then orange, then yellow",
  },
  { id: 'strain', label: 'Strain', hint: 'Deformation the reconstruction demands of the crust' },
  {
    id: 'islands',
    label: 'Strong islands',
    hint: 'The shields, platforms and stable basins that are held to their own shape; everything between them is free to deform',
  },
  {
    id: 'rigidity',
    label: 'Crustal strength',
    hint: "ECM1's crustal type, read as strength: shields and platforms pale, thinned margins and island arcs dark. This is what decides where a fragment ends",
  },

]

export function Panel({ data }: { data: Dataset }) {
  const timeMa = useClockTime(8)
  const { mode, setMode, showGrid, setShowGrid, showMesh, setShowMesh,
    surfaceMap, setSurfaceMap, referenceFrame, setReferenceFrame } = useStore()
  const [showMethod, setShowMethod] = useState(false)

  /**
   * One control for what the globe is painted with, where there used to be two.
   *
   * The two were not independent: picking a surface map did nothing at all
   * unless the mode happened to be `surface`, so the panel offered a choice
   * that silently had no effect. They are one question -- what am I looking at
   * -- so they are one list, grouped by whether the answer is data carried
   * along or something the reconstruction worked out.
   */
  const painting = mode === 'surface' ? `surface:${surfaceMap}` : mode
  const paint = (value: string) => {
    const [chosen, map] = value.split(':')
    setMode(chosen as ViewMode)
    if (map) setSurfaceMap(map)
  }
  const paintingNote = mode === 'surface'
    ? SURFACE_MAPS.find((m) => m.id === surfaceMap)?.note
    : MODES.find((m) => m.id === mode)?.hint

  const { meta } = data
  const end = meta.endTimeMa
  const times = meta.diagnostics.map((d) => d.timeMa)
  const radius = radiusAt(data, timeMa)
  const gravity = surfaceGravity(radius)

  const pick = (get: (i: number) => number) => valueAt(meta.diagnostics.map((_, i) => get(i)), times, timeMa)
  const bare = pick((i) => meta.diagnostics[i].gapFraction)
  const doubled = pick((i) => meta.diagnostics[i].overlapFraction)
  const folded = pick((i) => meta.diagnostics[i].foldFraction)
  const strain = pick((i) => meta.diagnostics[i].medianStrain)
  const blocks = pick((i) => meta.diagnostics[i].blockCount)
  const subduction = pick((i) => meta.fixedRadiusDiagnostics[i].gapFraction)

  const step = meta.radiusStepMa
  const curveTimes = meta.crustModels[0].radiusKm.map((_, i) => i * step)
  const low = curveTimes.map((_, i) => Math.min(...meta.crustModels.map((m) => m.radiusKm[i])))
  const high = curveTimes.map((_, i) => Math.max(...meta.crustModels.map((m) => m.radiusKm[i])))

  return (
    <aside className="panel">
      <header>
        <h1>Expanding Earth</h1>
        <p className="sub">
          A reconstruction driven by the sea-floor age grid, not by hand-placed continents.
        </p>
      </header>

      <div className="stats">
        <Stat label="Radius" value={`${radius.toFixed(0)} km`} note={`${((100 * radius) / R0_KM).toFixed(1)}% of today`} />
        <Stat label="Surface gravity" value={`${gravity.toFixed(1)} m/s²`} note="if mass were constant" />
        <Stat label="Plates" value={blocks.toFixed(0)} note="found in the motion" />
        <Stat label="Median strain" value={`${(100 * strain).toFixed(1)}%`} note="asked of the crust" />
      </div>

      <label className="field">
        <span>Show</span>
        <select value={painting} onChange={(e) => paint(e.target.value)}>
          <optgroup label="Today&rsquo;s surface, carried along with the crust">
            {SURFACE_MAPS.map((m) => (
              <option key={m.id} value={`surface:${m.id}`}>
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="What the reconstruction worked out">
            {MODES.filter((m) => m.id !== 'surface').map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <p className="caption">{paintingNote}</p>

      <label className="field">
        <span>Hold still</span>
        <select value={referenceFrame} onChange={(e) => setReferenceFrame(e.target.value)}>
          <option value="">Nothing (no net rotation)</option>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <p className="caption">
        A viewpoint, not a change to the model. Spread the motion evenly over every plate and a
        continent that travelled thousands of kilometres looks like it hardly moved.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        Graticule (fixed to the crust)
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} />
        Show the mesh
      </label>
      <p className="caption">
        The triangles the crust is made of, drawn on top of it. Watch them close up as the crust
        they stand for un-forms, and watch the edges be redrawn where one piece slides past
        another.
      </p>

      <section>
        <h2>Radius</h2>
        <Chart
          times={curveTimes}
          band={{ low, high, color: 'rgba(120,170,255,0.18)' }}
          series={[
            { values: meta.crustModels[0].radiusKm, color: '#7cb0ff', label: 'solved' },
            { values: meta.referenceRadiusKm, color: '#8892a6', label: 'full-res reference', dashed: true },
          ]}
          currentMa={timeMa}
          endMa={end}
          format={(v) => `${v.toFixed(0)} km`}
        />
        <p className="caption">
          Measured, not fitted: R = √(A/4π) over the crust that already existed. The band spans
          three ways of classifying the {(100 * 0.0277).toFixed(1)}% of the sphere the age grid
          leaves undated, and the dashed line is the same measurement taken at full raster
          resolution.
        </p>
      </section>

      <section>
        <h2>Does it close?</h2>
        <Chart
          times={times}
          series={[
            { values: meta.diagnostics.map((d) => 100 * d.gapFraction), color: '#e0a355', label: 'bare sphere' },
            { values: meta.diagnostics.map((d) => 100 * d.overlapFraction), color: '#d3685f', label: 'covered twice' },
            { values: meta.diagnostics.map((d) => 100 * d.foldFraction), color: '#b98cd0', label: 'inside out' },
            { values: meta.diagnostics.map((d) => 100 * d.medianStrain), color: '#6fbf9f', label: 'median strain' },
          ]}
          currentMa={timeMa}
          endMa={end}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <p className="caption">
          At {timeMa.toFixed(0)} Ma the reconstruction leaves{' '}
          <strong>{(100 * bare).toFixed(2)}%</strong> of the sphere with no crust on it at all,
          covers <strong>{(100 * doubled).toFixed(2)}%</strong> of it twice over, and turns{' '}
          <strong>{(100 * folded).toFixed(2)}%</strong> of the rock inside out. These are the model
          failing, reported rather than tuned away. Read the bare figure with suspicion: every
          direction it asks happens to fall on a triangle corner, where crust is hardest to miss,
          so it reads lower than the truth &mdash; how much lower is not yet known.
        </p>
      </section>

      <section>
        <h2>Does it land where it should?</h2>
        <table className="scorecard">
          <tbody>
            {meta.scorecard.map((fit) => {
              const watched = fit.joinedByMa === 0
              // A watched pair has no time it should have met, so it is read at
              // the end of the run and never coloured: colouring it would be
              // scoring the model against a guess.
              const index = watched
                ? fit.separationKm.length - 1
                : Math.min(
                    fit.separationKm.length - 1,
                    Math.round(fit.joinedByMa / meta.frameStepMa),
                  )
              const km = fit.separationKm[index] ?? 0
              const now = fit.separationKm[0] ?? 0
              return (
                <tr key={`${fit.a}-${fit.b}`} title={fit.note}>
                  <th>
                    {label(fit.a)} – {label(fit.b)}
                  </th>
                  <td>{watched ? `${meta.endTimeMa} Ma` : `${fit.joinedByMa} Ma`}</td>
                  <td className={watched ? 'watched' : km < 300 ? 'good' : km < 1000 ? 'fair' : 'poor'}>
                    {Math.round(km)} km
                  </td>
                  <td className="was">was {Math.round(now)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="caption">
          The first five are pairs whose former adjacency is independently supported. The last two
          are watched rather than scored: where Antarctica and Australia end up as the Pacific
          shuts is the open question here, and the hand-assembled reconstructions that answer it
          are not evidence. Shown is the closest approach still
          between them at the time they should be touching -- the gap between their nearest
          coasts, not between their centres, which stay thousands of kilometres apart even when two
          continents are pressed against each other. Reconstructions puzzled together by hand are
          left out on purpose: where Australia and Antarctica end up relative to South America is
          something this model should be allowed to answer, not something to steer it towards.
        </p>
      </section>

      <section>
        <h2>The other reading</h2>
        <p className="caption">
          Hold the radius at today's and the same crust budget cannot cover the sphere: at{' '}
          {timeMa.toFixed(0)} Ma it falls short by <strong>{(100 * subduction).toFixed(0)}%</strong>.
          On a non-expanding Earth that shortfall is not a gap, it is the area subduction has to
          have destroyed. The same number is the case for expansion or the measure of subduction,
          depending on which you already believe.
        </p>
      </section>

      <button className="method-toggle" onClick={() => setShowMethod(!showMethod)}>
        {showMethod ? 'Hide' : 'How this works & what to distrust'}
      </button>
      {showMethod && <Method data={data} />}
    </aside>
  )
}

const label = (id: string) => REGIONS.find((r) => r.id === id)?.label ?? id

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      <span className="note">{note}</span>
    </div>
  )
}

function Method({ data }: { data: Dataset }) {
  const { meta } = data
  return (
    <div className="method">
      <h3>The one assumption</h3>
      <p>
        No crust is ever destroyed. Everything else follows. The Earth at time <em>t</em> is exactly
        the crust that already existed then, so its area — and therefore its radius — is a
        measurement off the age grid rather than a free parameter.
      </p>

      <h3>Where the plates come from</h3>
      <p>
        Nowhere. No plate map is used. Take away the crust younger than <em>t</em> and the shell
        closes along the ridges on its own; where two pieces have to slide past each other the
        triangulation is redrawn, and it is allowed to do that only in crust weak enough to fault.
        The blocks are whatever still moves as one, read back out of the motion afterwards rather
        than assumed.
      </p>

      <h3>What to distrust</h3>
      <ul>
        <li>
          The grey ramp is calibrated on one landmark — the {meta.maxAgeMa} Ma Herodotus Basin at
          grey 254. If that reading is wrong, every date scales with it.
        </li>
        <li>
          2.8% of the sphere is deep water the age grid never dated. The three variants in the
          radius band bracket it; the spread is about 3%.
        </li>
        <li>
          The depth-age fit used to date those holes only reaches r² ={' '}
          {meta.depthAgeFit.r2.toFixed(2)} against this height map, so it is a weak inference. The
          solved run uses interpolation from dated neighbours instead.
        </li>
        <li>
          The bare-sphere figure is measured by asking a fixed set of directions whether any crust
          lies that way &mdash; and every one of those directions is a corner of the mesh, shared
          by six triangles. It is sampled where it cannot fail, so a reading of zero is not
          evidence the crust tiles.
        </li>
        <li>
          The fit scorecard reports the closest approach between two continents, which is not the
          same as a fit: one corner brushing another reads as 0 km while the margins alongside it
          are nowhere near nesting. Look at the shapes, not only the number.
        </li>
        <li>
          Rigid crust cannot lie on a sphere of different curvature — Gauss's Theorema Egregium — so
          some deformation is unavoidable and the strain figure is the honest residual, not a bug.
        </li>
        <li>
          Before ~200 Ma there is no ocean floor left to measure and the whole method stops. Nothing
          here is extrapolated past that.
        </li>
      </ul>

      <h3>And the big one</h3>
      <p>
        Expanding Earth is not accepted geology. Geodesy limits any change in Earth's radius to
        well under a millimetre a year, and no mechanism supplies the mass or energy. This is a
        model of the idea, built so its failures are visible, not an argument that it is true.
      </p>
    </div>
  )
}
