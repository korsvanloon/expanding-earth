import { atan2, clamp, PI } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import RangeInput from '../form/RangeInput'
import ChoiceInput from '../form/ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGame, { ATLANTIC, GameMap, NORTH_POLE, SOUTH_POLE } from '3d/game-map'
import { Link } from 'wouter'
import NavBar from '../NavBar'
import { useSave } from 'hooks/useSave'
import {
  latLngToOrthographicPoint,
  orthographicPointToLatLng,
  withinCircle,
} from 'lib/orthographic'
import { loadImageData } from 'lib/image'
import { LatLng, Point } from 'lib/type'
import LatLngInfoBox from './LatLngInfoBox'
import classes from './Game.module.css'
import { formatHours } from 'lib/format'
import { vec2 } from 'lib/lat-lng'
import { Vector2 } from 'three'
import PointInput from 'components/form/PointInput'

type GameState = {
  globeCenter: Vector2
}

const startTime = 0
const endTime = 5

// const centers = [
//   { label: 'Thule', value: NORTH_POLE },
//   { label: 'Neuatlantis', value: ATLANTIC },
//   { label: 'Neuschwabenland', value: SOUTH_POLE },
// ]

function Game() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ gameMap?: GameMap }>({
    gameMap: undefined,
  })

  const [state, saveState] = useSave<GameState>(
    'game',
    {
      globeCenter: ATLANTIC,
    },
    (data) => ({
      globeCenter: vec2(data.globeCenter),
    }),
  )
  const [latLng, setLatLng] = useState<LatLng>()
  const [areaData, setAreaData] = useState<ImageData>()

  const { time, setTime, running, start, stop } = useAnimationLoop({
    startTime,
    endTime,
    step: 0.0001,
    startOver: true,
  })

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGame({
        container: webGlContainerRef.current,
        centerLatLng: state.globeCenter,
      }).then((actions) => {
        actionsRef.current.gameMap = actions
        webGlContainerRef.current?.focus()
      })
    }
    loadImageData('textures/areas-map.png', 2048, 1024).then((d) => {
      setAreaData(d)
    })

    return () => {
      actionsRef.current.gameMap?.cleanUp()
    }
  }, [])

  useEffect(() => {
    actionsRef.current.gameMap?.setCenter(state.globeCenter)
    actionsRef.current.gameMap?.update()
  }, [state])

  useEffect(() => {
    if (latLng) {
      actionsRef.current.gameMap?.setMouse(latLng)
      actionsRef.current.gameMap?.update()
    }
  }, [latLng])

  const displayTime = formatHours(time)

  const center = state.globeCenter

  return (
    <div className="dark">
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start}>{running ? 'stop' : 'start'}</button>
        <RangeInput
          name="year"
          value={time}
          onValue={setTime}
          step={0.25}
          sliderStep={1 / 12}
          min={startTime}
          max={endTime}
        >
          <code>{displayTime}</code>
        </RangeInput>
        <PointInput
          value={state.globeCenter}
          onChange={(globeCenter) => saveState({ globeCenter })}
          step={0.1}
          minX={-Math.round(1.0 * PI * 100) / 100}
          maxX={Math.round(1.0 * PI * 100) / 100}
          minY={-Math.round(0.5 * PI * 100) / 100}
          maxY={Math.round(0.5 * PI * 100) / 100}
        />
      </NavBar>

      <main className={classes.main}>
        <div
          ref={webGlContainerRef}
          style={{ width: '100%', height: '100%' }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()

            const point: Point = {
              x: (e.clientX - box.left) / box.height,
              y: (e.clientY - box.top) / box.height,
            }
            const latLng = orthographicPointToLatLng(point, center)
            setLatLng(withinCircle(point) ? latLng : undefined)
          }}
          contentEditable
          onKeyDown={(event) => {
            switch (event.key) {
              case 'ArrowLeft':
              case 'ArrowRight':
              case 'ArrowUp':
              case 'ArrowDown':
                event.preventDefault()
                const difference = vec2({
                  x:
                    -0.1 * Number(event.key === 'ArrowLeft') +
                    0.1 * Number(event.key === 'ArrowRight'),
                  y:
                    -0.1 * Number(event.key === 'ArrowDown') +
                    0.1 * Number(event.key === 'ArrowUp'),
                })
                const point = vec2(state.globeCenter).add(difference)
                point.y = clamp(point.y, -0.5 * PI, 0.5 * PI)
                saveState({ globeCenter: point })
                break
            }
          }}
        ></div>
        {latLng && <LatLngInfoBox latLng={latLng} areaData={areaData} />}
      </main>
      <div className="rich-text light">
        <h2>Germania One</h2>

        <p>Alle Menschen sind frei und gleich an Würde und Rechten</p>
      </div>
    </div>
  )
}

const getRotation = (currentPosition: LatLng, destination: LatLng, center: LatLng) => {
  const currentPoint = latLngToOrthographicPoint(currentPosition, center)
  const destinationPoint = latLngToOrthographicPoint(destination, center)
  const direction = vec2(destinationPoint).sub(vec2(currentPoint))

  return atan2(direction.y, direction.x)
}

export default Game

////////////////////

const toTopLeft = (point: Point, dimension: number) => ({
  top: `${point.y * dimension}px`,
  left: `${point.x * dimension}px`,
})

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
    left: 'calc(50%  - 3rem)',
  },
  {},
  {},
]
