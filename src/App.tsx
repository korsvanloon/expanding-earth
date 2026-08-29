import { useEffect, useState } from 'react'
import { loadDataset, type Dataset } from '@/data'
import { Scene } from '@/scene/Scene'
import { Panel } from '@/ui/Panel'
import { Timeline } from '@/ui/Timeline'
import { clock, useStore } from '@/store'

export default function App() {
  const [data, setData] = useState<Dataset>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    loadDataset().then(setData, (e: unknown) => setError(String(e)))
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
          Run <code>npm run data</code> to generate the reconstruction from{' '}
          <code>public/textures/age-map.png</code>.
        </p>
        <pre>{error}</pre>
      </div>
    )
  }

  if (!data) return <div className="splash">Loading the reconstruction…</div>

  return (
    <div className="app">
      <Scene data={data} />
      <Panel data={data} />
      <Timeline endMa={data.meta.endTimeMa} />
    </div>
  )
}
