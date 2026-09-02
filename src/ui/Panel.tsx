import { useState } from 'react'
import { SURFACE_MAPS } from '@shared/maps'
import { R0_KM, REGIONS, surfaceGravity } from '@shared/model'
import { radiusAt, type Dataset } from '@/data'
import { describePicks, describeZones, useStore, ZONE_LIMIT, type ViewMode } from '@/store'
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
  {
    id: 'fabric',
    label: 'Crustal fabric',
    hint: 'How fast the vertical gravity gradient changes: dark where the crust has been left alone, bright where it has been cut about. Fracture zones, sutures, failed rifts and mountain roots, at a tenth of a degree over land and sea alike',
  },

]

export function Panel({ data }: { data: Dataset }) {
  const timeMa = useClockTime(8)
  const { mode, setMode, showGrid, setShowGrid, showMesh, setShowMesh,
    showSection, setShowSection,
    surfaceMap, setSurfaceMap, referenceFrame, setReferenceFrame,
    showTracks, setShowTracks, showZones, setShowZones } = useStore()
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
  const biggestBlock = pick((i) => meta.diagnostics[i].biggestBlockShare)
  const forcing = pick((i) => meta.diagnostics[i].forcingFraction)
  const speed = pick((i) => meta.diagnostics[i].medianSpeedKmMyr)
  const heldShape = pick((i) => meta.diagnostics[i].islandDistortion)
  const subduction = pick((i) => meta.fixedRadiusDiagnostics[i].gapFraction)

  // The overlay draws the pairs of the nearest frame, so this has to name that
  // frame's count rather than an interpolation between two of them.
  const atFrame = meta.diagnostics.reduce((best, d) =>
    Math.abs(d.timeMa - timeMa) < Math.abs(best.timeMa - timeMa) ? d : best)
  const pairsDue = atFrame.conjugateCount

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
        <Stat
          label="Plates"
          value={blocks.toFixed(0)}
          note={`biggest ${(100 * biggestBlock).toFixed(0)}% of the shell`}
        />
        <Stat label="Median strain" value={`${(100 * strain).toFixed(1)}%`} note="asked of the crust" />
        <Stat
          label="Bare sphere"
          value={`${(100 * bare).toFixed(1)}%`}
          note="no crust overhead; the mouth of an unshut ridge"
        />
      </div>
      <p className="caption">
        {/* Which run this is. The reconstruction is not committed -- every build
            recomputes it -- so without this there is no way to tell a fresh
            deploy from a page the browser had cached, which cost a reader a
            quarter of an hour of waiting to check nothing. */}
        {data.meta.folded ? 'Un-erupted crust folded inside the shell' : 'Un-erupted crust collapsed away'}
        {data.meta.builtAt ? `, solved ${new Date(data.meta.builtAt).toLocaleString()}` : ''}.
      </p>

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
      <label className="toggle">
        <input
          type="checkbox"
          checked={showSection}
          onChange={(e) => setShowSection(e.target.checked)}
        />
        Slice through it
      </label>
      <p className="caption">
        Keeps a slice a couple of hundred kilometres thick through the centre, square to you, and
        turns it with the globe. This is the only way to see crust that is not on the surface:
        where a run sends un-erupted sea floor back down inside the shell instead of deleting it,
        the curtain of it hangs under the ridge that swallowed it.
      </p>
      {data.tracks && (
        <>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showTracks}
              onChange={(e) => setShowTracks(e.target.checked)}
            />
            Flow lines and pairs
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showZones}
              onChange={(e) => setShowZones(e.target.checked)}
            />
            Fracture zones (from gravity)
          </label>
          <p className="caption">
            In turquoise: not paths, but the scarps a fracture zone leaves in the
            gravity field, found without ever reading the age grid. A line is
            kept only where it is strong, narrow, keeps going for hundreds of
            kilometres, and runs within twenty degrees of the way the crust
            travelled &mdash; 0.6% of the sea floor survives all four. They are
            the flow lines nature drew for us, and the ones to hang the rest of
            the family on. Drawn about three times wider than measured, or they
            would be invisible.
          </p>
          <p className="caption">
            The paths the crust took away from the ridges, in magenta &mdash; read off the age grid,
            not drawn. Each line runs from one coast, through the ridge, to the coast it left. Scrub
            back and they should shorten to nothing as the ocean closes. The yellow segments join the
            {' '}<strong>{pairsDue}</strong> pairs of points that were a single point at this very
            moment, so each one&rsquo;s length is the model being wrong, in kilometres you can see.
          </p>
        </>
      )}

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
            {
              values: meta.diagnostics.map((d) => 100 * (d.islandOverlapFraction ?? 0)),
              color: '#c07fd0',
              label: 'two rigid islands at once',
            },
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
          failing, reported rather than tuned away. The bare figure is measured against a hundred
          thousand directions spread over the sphere; it used to ask only the mesh&rsquo;s own
          corners, where crust is hardest to miss, and meant nothing.
        </p>
      </section>

      <PickedZones data={data} />
      <PickedPoints />

      <section>
        <h2>Is anything still moving?</h2>
        <Chart
          times={times}
          series={[
            {
              values: meta.diagnostics.map((d) => d.medianSpeedKmMyr),
              color: '#6f9fd8',
              label: 'median surface speed',
            },
          ]}
          currentMa={timeMa}
          endMa={end}
          format={(v) => `${v.toFixed(0)} km/Myr`}
        />
        <p className="caption">
          The only thing that makes this model move is crust leaving it, and at {timeMa.toFixed(0)}{' '}
          Ma the age grid is taking away{' '}
          <strong>{(100 * forcing).toFixed(3)}%</strong> of the globe per million years. The crust
          answers at <strong>{speed.toFixed(1)} km/Myr</strong> at the median point, in{' '}
          <strong>{blocks.toFixed(0)}</strong> blocks whose biggest covers{' '}
          <strong>{(100 * biggestBlock).toFixed(0)}%</strong> of the shell, while the shields keep
          their own shape to <strong>{(100 * heldShape).toFixed(1)}%</strong>.
        </p>
        <p className="caption">
          Read the block count against the speed, never alone. Blocks are found by growing a region
          over every point one rotation explains to within a few km/Myr, so once the crust slows
          below that a still shell and a rigid one look identical and everything joins one block
          turning at nearly nothing. That is what happens past 180 Ma, where the sea floor runs out:
          the count falling to one there is the record ending, not a shell welding.
        </p>
      </section>

      <section>
        <h2>Do the pieces come back together?</h2>
        <Chart
          times={times}
          series={[
            {
              values: meta.diagnostics.map((d) => 100 * d.conjugateMatched),
              color: '#6fbf9f',
              label: 'pairs reunited',
            },
            {
              values: meta.diagnostics.map((d) => 100 * d.conjugateMerged),
              color: '#8a94a6',
              label: 'merged by the mesh',
            },
          ]}
          currentMa={timeMa}
          endMa={end}
          format={(v) => `${v.toFixed(0)}%`}
        />
        <p className="caption">
          The age grid says which piece of crust was once against which: two points that left the
          same ridge along the same fracture zone at the same age were, at that age, one point. So
          at {atFrame.timeMa} Ma there are <strong>{pairsDue}</strong> pairs whose separation ought
          to be zero, and the model gets{' '}
          <strong>{(100 * atFrame.conjugateMatched).toFixed(0)}%</strong> of them within 200 km, the
          median missing by <strong>{atFrame.conjugateMedianKm.toFixed(0)} km</strong>. Thousands of
          checks, none of them chosen by hand, all from the same observation the model is driven by.
        </p>
        <p className="caption">
          Two things keep this honest. The 0 Ma reading is the floor, because at 0 Ma the
          reconstruction <em>is</em> the present day and cannot be wrong &mdash; whatever it misses
          by there is the mesh&rsquo;s own resolution. And the grey line is the share of pairs the
          mesh has merged into single points, which score zero by construction; the gap between the
          two lines is what the reconstruction actually earned.
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
              // How much margin is in contact, against how much already was
              // today. A pair that starts in contact has nothing to prove, and
              // one of these does: it is the gain that is evidence, not the
              // level.
              const held = fit.matchedFraction[index] ?? 0
              const already = fit.matchedFraction[0] ?? 0
              const gained = held - already
              return (
                <tr key={`${fit.a}-${fit.b}`} title={fit.note}>
                  <th>
                    {label(fit.a)} – {label(fit.b)}
                  </th>
                  <td>{watched ? `${meta.endTimeMa} Ma` : `${fit.joinedByMa} Ma`}</td>
                  <td className={watched ? 'watched' : gained > 0.15 ? 'good' : gained > 0.05 ? 'fair' : 'poor'}>
                    {Math.round(100 * held)}%
                  </td>
                  <td className="was">
                    {already > 0.02 ? `${Math.round(100 * already)}% already` : `${Math.round(km)} km apart`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="caption">
          The first five are pairs whose former adjacency is independently supported. The last two
          are watched rather than scored: where Antarctica and Australia end up as the Pacific
          shuts is the open question here, and the hand-assembled reconstructions that answer it
          are not evidence. Shown is how much of the shorter of the two margins lies against the
          other at the time they should have been joined, with what was already in contact today
          beside it. A fit is a length of coastline, not a distance: this used to report the closest
          approach, where one corner brushing another read as 0 km while the coasts alongside were
          nowhere near nesting. Note that Greenland and North America start at 38% and end at 36%,
          so that fit is not one the reconstruction achieves &mdash; it was there to begin with.
          Nothing here reaches 100%: the west coast of South America can never lie against Africa,
          so read the gain rather than the level.
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
          The bare-sphere figure is a count of directions, not a sum of areas &mdash; a shell
          folded over in one place and short in another sums to the right total while covering
          neither. Its resolution is one part in a hundred thousand of the sphere, so it can say
          the crust tiles to a few thousandths of a percent and no finer.
        </li>
        <li>
          One of the five scored fits proves nothing. Greenland and North America are already in
          contact along 38% of Greenland&rsquo;s margin today, and the reconstruction ends at 36%,
          so it cannot be failed by any run. Four independent checks, not five.
        </li>
        <li>
          Contact is counted where two margins come within 200 km, about two triangles of this
          mesh. Below that this resolution cannot tell touching from adjacent. Raising it would
          inflate every figure at once.
        </li>
        <li>
          Rigid crust cannot lie on a sphere of different curvature — Gauss's Theorema Egregium — so
          some deformation is unavoidable and the strain figure is the honest residual, not a bug.
        </li>
        <li>
          The model reaches 180 Ma, not {meta.endTimeMa}. Over the last twenty million years of the
          run the age grid removes almost nothing, so the frames are the solver settling rather than
          history &mdash; and the one fit whose target date lies past that edge, North America
          against Africa at 190 Ma, is being asked something the data cannot answer.
        </li>
        <li>
          Through the middle of the run the crust moves as scores of patches of a few percent each,
          where the Earth has about fifteen plates and the Pacific alone is a fifth of the surface.
          Deformation is spread through every piece of weak crust instead of concentrating into
          belts, so nothing plate-sized moves as one. This is the open problem here, and it is why a
          margin can come to rest against its conjugate with a fifth of its length in contact.
        </li>
        <li>
          Craton strain is an area strain, per triangle. Shear preserves area exactly and a
          per-face figure cannot see a shield bent in half, so it reads small whatever happens to
          the shape of a continent. The island figure above is the one to read for that: distances
          between pairs of points of the same shield, which no rotation or reflection can flatter.
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

/**
 * The crust the user has right-clicked, and nothing else.
 *
 * Hidden until something is picked: it is a tool for saying "these two should
 * have been touching", not a permanent part of the read-out. The text is
 * already on the clipboard by the time this appears; showing it is so you can
 * see you clicked what you meant to.
 */
/**
 * The fracture zones the reader has selected.
 *
 * Listed rather than only highlighted, because the point of selecting one is to
 * say something about it, and saying something needs a name. Length is the
 * useful figure: it is what separated a fracture zone from a seamount in the
 * detector, so a short one in the list is the first place to look when a
 * detection is wrong.
 */
function PickedZones({ data }: { data: Dataset }) {
  const picked = useStore((s) => s.pickedZones)
  const clearZones = useStore((s) => s.clearZones)
  const toggleZone = useStore((s) => s.toggleZone)
  const zones = data.meta.fractureZones ?? []
  const [copied, setCopied] = useState(false)
  if (!picked.length) return null
  const copy = () => {
    void navigator.clipboard?.writeText(describeZones(picked, zones))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <section>
      <h2>Picked fracture zones</h2>
      <ul className="zonelist">
        {picked.map((id) => {
          const zone = zones[id - 1]
          return (
            <li key={id}>
              <button type="button" className="linkish" onClick={() => toggleZone(id)}>
                #{id}
              </button>
              {zone ? (
                <>
                  {' \u2014 '}
                  <strong>{zone.lengthKm} km</strong>
                  {`, centred at ${zone.lon.toFixed(1)}, ${zone.lat.toFixed(1)}`}
                  <br />
                  <span className="caption">
                    {zone.ageMa === null ? 'undated' : `${zone.ageMa} Ma`}
                    {` \u00b7 swing ${zone.swingE} E \u00b7 bowl ${zone.bowlMa.toFixed(2)} Ma`}
                    {/*
                      * Said rather than removed. A curve on young crust whose
                      * sea floor dips on the line is a spreading axis and not a
                      * fracture zone, and a reader who marked five of those was
                      * right about every one. Taking them out of the detector
                      * costs the reconstruction more than they cost the
                      * picture, though -- see axisBowlMa in
                      * tools/build-data.ts -- so they stay in the fit and are
                      * labelled here.
                      */}
                    {zone.bowlMa > 0.8 && zone.ageMa !== null && zone.ageMa < 40
                      ? ' \u00b7 probably a spreading axis, not a fracture zone'
                      : ''}
                  </span>
                </>
              ) : (
                ' \u2014 no record of this one'
              )}
            </li>
          )
        })}
      </ul>
      <p className="caption">
        In orange on the globe. Right-click a turquoise line to add or drop one; the last{' '}
        {ZONE_LIMIT} are kept. <em>Swing</em> is how much the gravity rises and falls walking
        along the line: a chain of seamounts is lumpy, a fracture-zone scarp is not.{' '}
        <em>Bowl</em> is how far the sea floor is younger on the line than 60 km either side,
        so a positive one is a spreading axis rather than a fracture zone.{' '}
        <button type="button" className="linkish" onClick={copy}>
          {copied ? 'copied' : 'copy the list'}
        </button>{' '}
        <button type="button" className="linkish" onClick={clearZones}>
          clear
        </button>
      </p>
    </section>
  )
}

function PickedPoints() {
  const picks = useStore((s) => s.picks)
  const clearPicks = useStore((s) => s.clearPicks)
  if (!picks.length) return null
  return (
    <section>
      <h2>Picked points</h2>
      <pre className="picks">{describePicks(picks)}</pre>
      <p className="caption">
        Copied. Right-click the globe to add another; the last six are kept.{' '}
        <button type="button" className="linkish" onClick={clearPicks}>
          clear
        </button>
      </p>
    </section>
  )
}
