import { useState } from 'react'
import { SURFACE_MAPS } from '@shared/maps'
import { R0_KM, surfaceGravity } from '@shared/model'
import { radiusAt, type Dataset } from '@/data'
import { useStore, type ViewMode } from '@/store'
import { Chart, valueAt } from './Chart'
import { useClockTime } from './useClockTime'

const MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'surface', label: 'Surface', hint: "Today's surface, carried along with the crust" },
  { id: 'age', label: 'Crustal age', hint: 'How old each piece of crust was at that moment' },
  { id: 'strain', label: 'Strain', hint: 'Deformation the reconstruction demands of the crust' },
]

export function Panel({ data }: { data: Dataset }) {
  const timeMa = useClockTime(8)
  const { mode, setMode, showGrid, setShowGrid, surfaceMap, setSurfaceMap } = useStore()
  const [showMethod, setShowMethod] = useState(false)

  const { meta } = data
  const end = meta.endTimeMa
  const times = meta.diagnostics.map((d) => d.timeMa)
  const radius = radiusAt(data, timeMa)
  const gravity = surfaceGravity(radius)

  const pick = (get: (i: number) => number) => valueAt(meta.diagnostics.map((_, i) => get(i)), times, timeMa)
  const unclosed = pick((i) => meta.diagnostics[i].gapFraction)
  const folded = pick((i) => meta.diagnostics[i].overlapFraction)
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
        <Stat label="Rigid blocks" value={blocks.toFixed(0)} note="found in the age data" />
        <Stat label="Median strain" value={`${(100 * strain).toFixed(1)}%`} note="asked of the crust" />
      </div>

      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'active' : ''}
            onClick={() => setMode(m.id)}
            title={m.hint}
          >
            {m.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span>Surface map</span>
        <select value={surfaceMap} onChange={(e) => setSurfaceMap(e.target.value)}>
          {SURFACE_MAPS.map((m) => (
            <option key={m.id} value={m.id} title={m.note}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <p className="caption">{SURFACE_MAPS.find((m) => m.id === surfaceMap)?.note}</p>
      <label className="toggle">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        Graticule (fixed to the crust)
      </label>

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
            { values: meta.diagnostics.map((d) => 100 * d.gapFraction), color: '#e0a355', label: 'unaccounted for' },
            { values: meta.diagnostics.map((d) => 100 * d.overlapFraction), color: '#d3685f', label: 'folded through itself' },
            { values: meta.diagnostics.map((d) => 100 * d.medianStrain), color: '#6fbf9f', label: 'median strain' },
          ]}
          currentMa={timeMa}
          endMa={end}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <p className="caption">
          At {timeMa.toFixed(0)} Ma the reconstruction leaves{' '}
          <strong>{(100 * unclosed).toFixed(1)}%</strong> of the sphere unaccounted for and folds{' '}
          <strong>{(100 * folded).toFixed(1)}%</strong> of the crust through itself. These are the
          model failing, reported rather than tuned away. It closes well for the last 30 Myr and
          gets steadily worse further back.
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
        falls apart on its own along the ridges; sharp steps in the age field cut it further along
        fracture zones. The blocks are whatever stays connected.
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
