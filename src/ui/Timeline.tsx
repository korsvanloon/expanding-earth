import { PERIODS } from '@shared/model'
import { clock, useStore } from '@/store'
import { useClockTime } from './useClockTime'

const SPEEDS = [5, 15, 40, 100]

export function Timeline({ endMa }: { endMa: number }) {
  const timeMa = useClockTime(30)
  const { playing, speed, setPlaying, setSpeed } = useStore()

  const toggle = () => {
    // Starting from the present would play nothing, so rewind first.
    if (!playing && clock.timeMa <= 0.5) clock.timeMa = endMa
    setPlaying(!playing)
  }

  return (
    <div className="timeline">
      <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>

      <div className="track">
        <div className="periods">
          {PERIODS.filter((p) => p.startMa < endMa).map((p) => (
            <span
              key={p.name}
              style={{
                left: `${(100 * (endMa - Math.min(p.endMa, endMa))) / endMa}%`,
                width: `${(100 * (Math.min(p.endMa, endMa) - p.startMa)) / endMa}%`,
                background: p.color,
              }}
              title={`${p.name} — ${p.startMa}–${p.endMa} Ma`}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={endMa}
          step={0.25}
          value={endMa - timeMa}
          onChange={(e) => {
            clock.timeMa = endMa - Number(e.target.value)
            setPlaying(false)
          }}
        />
        <div className="ticks">
          <span>{endMa} Ma</span>
          <span>today</span>
        </div>
      </div>

      <div className="readout">
        <strong>{timeMa < 0.5 ? 'today' : `${timeMa.toFixed(0)} Ma`}</strong>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s} Myr/s
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
