import { useEffect, useState } from 'react'
import { loadDataset, type Dataset } from '@/data'
import { Loader } from '@/ui/Loader'
import { Scene } from '@/scene/Scene'
import { Panel } from '@/ui/Panel'
import { Timeline } from '@/ui/Timeline'
import { clock, useStore } from '@/store'

export default function App() {
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState<string>()
  /**
   * The run the site shipped, kept aside while the explorer's is on screen.
   *
   * Swapping the dataset is all it takes to show a different run, because
   * everything the globe draws hangs off that one object -- but the explorer's
   * is a coarser mesh entirely, so there is no going back to the real one
   * without having held on to it.
   */
  const [shipped, setShipped] = useState<Dataset>()
  // On a narrow screen the globe is the whole point, so the readouts start out
  // of the way and the reader opens them.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 760)

  /**
   * How far the first load has got. Sixteen megabytes arrive before anything
   * can be drawn, so the wait needs something that visibly moves.
   */
  const [loading, setLoading] = useState({ share: 0, note: '' })

  useEffect(() => {
    loadDataset((share, note) => setLoading({ share, note }))
      .then(setData, (e: unknown) => setError(String(e)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !data) return
      e.preventDefault()
      const { playing, setPlaying } = useStore.getState()
      if (!playing && clock.timeMa <= 0.5) clock.timeMa = data.meta.endTimeMa
      setPlaying(!playing)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data])

  if (error) {
    return (
      <div className="splash">
        <h1>No data</h1>
        <p>
          Run <code>pnpm data</code> to generate the reconstruction from{' '}
          <code>data-src/agegrid.nc</code>.
        </p>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="splash">
        <p>Loading the reconstruction</p>
        <Loader share={loading.share} note={loading.note} />
      </div>
    )
  }

  return (
    <div className="app">
      <Scene data={data} />
      <button
        className="panel-toggle"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
      >
        {panelOpen ? 'Hide' : 'Details'}
      </button>
      {panelOpen && (
        <Panel
          data={data}
          exploring={shipped !== undefined}
          onExplore={(next) => {
            setShipped(shipped ?? data)
            setData(next)
          }}
          onRevert={() => {
            if (shipped) setData(shipped)
            setShipped(undefined)
          }}
        />
      )}
      <Timeline endMa={data.meta.endTimeMa} />
    </div>
  )
}
