// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGame, { ATLANTIC, GameMap, NORTH_POLE, SOUTH_POLE } from '3d/game-map'
import { Link } from 'wouter'
import NavBar from './NavBar'
import { useSave } from 'hooks/useSave'
import {
  coordinateToOrthographicLatLng,
  LatLng,
  Pixel,
  Point,
  UV,
  withinCircle,
} from 'lib/orthographic'

type GameState = {
  globeCenter: number
}

const centers = [
  { label: 'Thule', value: NORTH_POLE },
  { label: 'Neuschwabenland', value: SOUTH_POLE },
  { label: 'Neuatlantis', value: ATLANTIC },
]

function Game() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ gameMap?: GameMap }>({
    gameMap: undefined,
  })

  const [state, saveState] = useSave<GameState>('game', {
    globeCenter: 0,
  })
  const [point, setPoint] = useState<Point>()

  const { time, setTime, running, start, stop } = useAnimationLoop({
    startTime: 1945,
    endTime: 2050,
    step: 0.001,
  })

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGame({
        container: webGlContainerRef.current,
        centerLatLng: centers[state.globeCenter].value,
      }).then((actions) => {
        actionsRef.current.gameMap = actions
      })
    }
    return () => {
      actionsRef.current.gameMap?.cleanUp()
    }
  }, [])

  useEffect(() => {
    actionsRef.current.gameMap?.setCenter(centers[state.globeCenter].value)
    actionsRef.current.gameMap?.update()
  }, [state.globeCenter])

  useEffect(() => {
    if (point) {
      const uv: UV = {
        x: point.x,
        y: 1.0 - point.y,
      }
      actionsRef.current.gameMap?.setMouse(uv)
      actionsRef.current.gameMap?.update()
    }
  }, [point])

  const year = round(time)

  return (
    <div>
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
        <RangeInput name="year" value={time} onValue={setTime} step={1} min={1945} max={2050}>
          <code>{year}</code>
        </RangeInput>
        <ChoiceInput
          name="background"
          options={centers.map(({ label }, i) => ({ value: i.toString(), label }))}
          value={state.globeCenter.toString()}
          onValue={(value) => saveState({ globeCenter: Number(value) })}
        >
          Center
        </ChoiceInput>
      </NavBar>

      <div
        ref={webGlContainerRef}
        style={{ width: '100vw', height: 'calc(100vh - 70px)' }}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const diameter = 0.8 * box.height
          const top = 0.1 * box.height
          const left = (box.width - diameter) / 2
          const point: Point = {
            x: (e.clientX - box.left - left) / diameter,
            y: (e.clientY - box.top - top) / diameter,
          }
          const uv: UV = {
            x: point.x,
            y: 1 - point.y,
          }
          setPoint(withinCircle(uv) ? point : undefined)
        }}
      ></div>
      <button css={hyperboreaStyle} style={globeCenterLabelOffset[state.globeCenter]}>
        {centers[state.globeCenter].label}
        <div style={globeCenterOffset[state.globeCenter]} />
      </button>
      {point && <PointInfoBox point={point} centerLatLng={centers[state.globeCenter].value} />}
    </div>
  )
}

const globeCenterOffset = [
  {
    top: '3rem',
    left: '1rem',
  },
  {
    top: '-4rem',
    left: '5rem',
  },
  {
    top: '-2rem',
    left: '6rem',
  },
]
const globeCenterLabelOffset = [
  {
    left: 'calc(50vw - 3rem)',
  },
  {},
  {},
]
const hyperboreaStyle = css`
  position: absolute;
  left: calc(50vw - 6rem);
  top: calc(50vh);
  border: none;
  font-size: 1.5rem;
  padding: 0.5rem;
  color: black;
  background-color: hsl(0 0% 100% / 10%);
  cursor: pointer;

  & > * {
    position: absolute;
    display: block;
    width: 1rem;
    height: 1rem;
    border-radius: 1rem;
    background: hsl(0 0% 100% / 40%);
    box-shadow: 0 0 16px 2px hsl(0 0% 100% / 100%);
    transition: background-color 1s ease-out;
  }
  &:hover {
    /* background: hsl(0 0% 100% / 80%); */
    & > * {
      background: hsl(0 0% 100% / 80%);
    }
  }
`

const PointInfoBox = ({ point, centerLatLng }: { point: Point; centerLatLng: LatLng }) => {
  const pixel: Pixel = {
    x: point.x - 0.5,
    y: 0.5 - point.y,
  }
  const uv: UV = {
    x: point.x,
    y: 1 - point.y,
  }
  const latLng = coordinateToOrthographicLatLng(pixel, centerLatLng)
  return (
    <div css={preStyle}>
      {'       horiz. verti.'}
      {[
        { name: 'Point ', value: point },
        { name: 'Pixel ', value: pixel },
        { name: 'UV    ', value: uv },
        { name: 'LatLng', value: latLng },
      ].map(({ name, value }) => (
        <div key={name}>
          {name} {value.x.toFixed(3).padStart(6, ' ')} {value.y.toFixed(3).padStart(6, ' ')}
        </div>
      ))}
    </div>
  )
}

export default Game

const preStyle = css`
  font-family: monospace;
  white-space: pre;
  position: fixed;
  top: 5rem;
  right: 1rem;
`
