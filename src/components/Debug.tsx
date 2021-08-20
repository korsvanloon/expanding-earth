// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { clamp01 } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { Vector2, Vector3 } from 'three'
import createEarth, { PlateMovement, Earth } from '../lib/debug'

const height = 400
const Debug = () => {
  const ref = useRef<HTMLCanvasElement>(null)
  const actionsRef = useRef<Earth>()

  const { time, setTime, running, start, stop } = useAnimationLoop()

  useEffect(() => {
    start()
    if (ref.current) {
      createEarth({
        canvas: ref.current,
        height,
        plates,
      }).then((actions) => {
        actionsRef.current = actions
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref])

  useEffect(() => {
    actionsRef.current?.update(time)
  }, [time])

  const humanAge = Math.round(time * 200)
    .toString()
    .padStart(3)

  return (
    <div>
      <div css={containerCss}>
        <canvas ref={ref} />
        <svg
          version="1.1"
          x="0px"
          y="0px"
          width={height * 2}
          height={height}
          viewBox="0.5 0 1 1"
          css={svgCss}
        >
          {plates.map((plate) => (
            <circle cx={plate.originUV.x * 2} cy={plate.originUV.y} r={0.01} fill={plate.color} />
          ))}
        </svg>
      </div>
      <div>
        <span css={yearCss}>
          <code>{humanAge}</code> million years ago
        </span>
      </div>
      <button onClick={running ? stop : start}>{running ? 'stop' : 'start'}</button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={time}
        onChange={(e) => setTime(e.target.valueAsNumber)}
      />
    </div>
  )
}

const containerCss = css`
  position: relative;
`

const yearCss = css`
  background-color: gray;
  padding: 4px 8px;
  code {
    display: inline-block;
    white-space: pre;
  }
`

const svgCss = css`
  position: absolute;
  left: 0;
  top: 0;
`

export default Debug

const plates: PlateMovement[] = [
  {
    name: 'Old World',
    color: '#000fff',
    originUV: new Vector2(0.56, 0.25),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Sahara',
    color: '#fbfa76',
    originUV: new Vector2(0.535, 0.4),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'South Africa',
    color: '#756c26',
    originUV: new Vector2(0.56, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Madagascar',
    color: '#d5d41f',
    originUV: new Vector2(0.56, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'New world',
    color: '#ff0000',
    originUV: new Vector2(0.325, 0.5),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Patagonia',
    color: '#317526',
    originUV: new Vector2(0.3, 0.65),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'India',
    color: '#1dff00',
    originUV: new Vector2(0.71, 0.335),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Australia',
    color: '#a6a6a6',
    originUV: new Vector2(0.85, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Antarctica',
    color: '#d6d6d6',
    originUV: new Vector2(0.5, 0.95),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
]

export const useAnimationLoop = () => {
  const [time, setTime] = useState(0)
  const [running, setRunning] = useState(false)

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef<number>()
  const previousTRef = useRef<number>()
  const ascendingRef = useRef<boolean>(false)

  const animate = (t: number) => {
    if (previousTRef.current !== undefined) {
      const deltaTime = t - previousTRef.current

      // const approxTime = time + deltaTime * 0.0001 * (ascending ? 1 : -1))

      // Pass on a function to the setter of the state
      // to make sure we always have the latest state
      setTime((prevCount) => {
        const t = clamp01(prevCount + deltaTime * 0.0001 * (ascendingRef.current ? 1 : -1))
        if (t >= 1) {
          ascendingRef.current = false
        } else if (t <= 0) {
          ascendingRef.current = true
        }
        return t
      })
    }
    previousTRef.current = t
    requestRef.current = requestAnimationFrame(animate)
  }
  const start = () => {
    requestRef.current = requestAnimationFrame(animate)
    setRunning(true)
  }

  const stop = () => {
    cancelAnimationFrame(requestRef.current!)
    previousTRef.current = undefined
    setRunning(false)
  }

  return { time, setTime, running, stop, start }
}
