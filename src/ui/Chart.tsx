import { useMemo } from 'react'

export interface Series {
  values: number[]
  color: string
  label: string
  dashed?: boolean
}

interface Props {
  /** X value of each sample, in Ma. */
  times: number[]
  series: Series[]
  /** Optional band drawn behind the lines, e.g. an uncertainty envelope. */
  band?: { low: number[]; high: number[]; color: string }
  currentMa: number
  endMa: number
  format: (value: number) => string
  height?: number
}

const WIDTH = 260

export function Chart({ times, series, band, currentMa, endMa, format, height = 76 }: Props) {
  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.values).concat(band ? [...band.low, ...band.high] : [])
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    const pad = (hi - lo) * 0.12 || 1
    return { min: lo - pad, max: hi + pad }
  }, [series, band])

  // Time runs the way the timeline does: deep past on the left, today on the right.
  const x = (ma: number) => ((endMa - ma) / endMa) * WIDTH
  const y = (value: number) => height - ((value - min) / (max - min)) * height
  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')
  /** The same line traced right to left, to close a band under its upper edge. */
  const back = (values: number[]) =>
    values
      .map((_, i) => values.length - 1 - i)
      .map((j) => `L${x(times[j]).toFixed(1)},${y(values[j]).toFixed(1)}`)
      .join('')

  return (
    <svg className="chart" viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
      {band && <path d={`${path(band.high)}${back(band.low)}Z`} fill={band.color} stroke="none" />}
      {series.map((s) => (
        <path
          key={s.label}
          d={path(s.values)}
          fill="none"
          stroke={s.color}
          strokeWidth={1.4}
          strokeDasharray={s.dashed ? '3 3' : undefined}
        />
      ))}
      <line
        x1={x(currentMa)}
        x2={x(currentMa)}
        y1={0}
        y2={height}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1}
      />
      <title>{series.map((s) => `${s.label}: ${format(valueAt(s.values, times, currentMa))}`).join('\n')}</title>
    </svg>
  )
}

export function valueAt(values: number[], times: number[], ma: number) {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - ma)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return values[best]
}
