import { atan2, sqrt, sumBy } from 'lib/math'
import { CSSProperties, useEffect, useRef, useState } from 'react'
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
import { areaNukes, FlyingSaucer, MovementPathObject, nukePlan } from '../../data'
import LatLngInfoBox from './LatLngInfoBox'
import classes from './Game.module.css'
import clsx from 'clsx'
import { hasCaptured, withPosition } from 'lib/game'
import { formatHours } from 'lib/format'
import { getDistance, vec2 } from 'lib/lat-lng'
import ProgressBox from 'components/ProgressBox'

type GameState = {
  globeCenter: number
}

const startTime = 0
const endTime = 5

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
  const [latLng, setLatLng] = useState<LatLng>()
  const [areaData, setAreaData] = useState<ImageData>()

  const { time, setTime, running, start, stop } = useAnimationLoop({
    startTime,
    endTime,
    step: 0.0001,
    startOver: true,
  })

  const [allFlyingSaucers, setFlyingSaucers] = useState<MovementPathObject<FlyingSaucer>[]>([])

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGame({
        container: webGlContainerRef.current,
        centerLatLng: centers[state.globeCenter].value,
      }).then((actions) => {
        actionsRef.current.gameMap = actions
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
    actionsRef.current.gameMap?.setCenter(centers[state.globeCenter].value)
    actionsRef.current.gameMap?.update()
  }, [state.globeCenter])

  useEffect(() => {
    if (latLng) {
      actionsRef.current.gameMap?.setMouse(latLng)
      actionsRef.current.gameMap?.update()
    }
  }, [latLng])
  const dimension = webGlContainerRef.current?.clientHeight

  const displayTime = formatHours(time)

  const flyingSaucers = withPosition(allFlyingSaucers, time)
  const pNukes = withPosition(nukePlan, time)

  const nukes = pNukes.filter((n) => !flyingSaucers.some((s) => hasCaptured(s, n, 200, time)))

  const center = centers[state.globeCenter].value

  return (
    <div className="dark">
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
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
        <ChoiceInput
          name="background"
          options={centers.map(({ label }, i) => ({ value: i.toString(), label }))}
          value={state.globeCenter.toString()}
          onValue={(value) => saveState({ globeCenter: Number(value) })}
        >
          Center
        </ChoiceInput>
      </NavBar>

      <main
        className={classes.main}
        onClick={() => {
          if (!latLng) return

          if (running) {
            setFlyingSaucers((v) => [
              ...v,
              {
                movementPath: {
                  origin: center,
                  destination: latLng,
                  speed: 40_000,
                  startTime: time,
                },
                object: {
                  number: v.length,
                  amount: 50,
                },
              },
            ])
          }
          console.log(`${latLng.x.toLocaleString('nl')}\t${latLng.y.toLocaleString('nl')}`)
          console.log(`${latLng.x.toFixed(3)},${latLng.y.toFixed(3)}`)
        }}
      >
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
        ></div>
        {dimension && (
          <>
            {areaNukes.map((a) => (
              <button
                className={clsx(classes.place, classes.nukePlace)}
                key={a.name}
                title={a.name}
                style={{
                  ...toTopLeft(latLngToOrthographicPoint(a.latLng, center), dimension),
                  width: `${sqrt(a.active)}px`,
                  height: `${sqrt(a.active)}px`,
                }}
              ></button>
            ))}
            {nukes.map(({ object, currentPosition, movementPath: { destination, origin } }, i) => (
              <button
                className={clsx(
                  classes.nuke,
                  vec2(currentPosition).equals(vec2(destination)) && classes.detonated,
                )}
                key={i}
                title={`${object.amount}`}
                style={
                  {
                    ...toTopLeft(latLngToOrthographicPoint(currentPosition, center), dimension),
                    '--amount': `${object.amount}px`,
                    '--distance': `${getDistance(currentPosition, origin)}px`,
                    transform: `translate(-50%, -50%) rotate(${getRotation(
                      currentPosition,
                      destination,
                      center,
                    )}rad)`,
                  } as CSSProperties
                }
              ></button>
            ))}
            {flyingSaucers.map(
              (
                { currentPosition, movementPath: { destination, origin }, object: { number } },
                i,
              ) => (
                <button
                  className={clsx(classes.flyingSaucer)}
                  key={number}
                  title={`FS:${number}`}
                  style={
                    {
                      ...toTopLeft(latLngToOrthographicPoint(currentPosition, center), dimension),
                      '--distance': `${getDistance(currentPosition, origin)}px`,
                      transform: `translate(-50%, -50%) rotate(${getRotation(
                        currentPosition,
                        destination,
                        center,
                      )}rad)`,
                    } as CSSProperties
                  }
                ></button>
              ),
            )}
          </>
        )}
        <button
          className={clsx(classes.hideout, 'rich-text')}
          style={globeCenterLabelOffset[state.globeCenter]}
        >
          {centers[state.globeCenter].label}
          <div style={globeCenterOffset[state.globeCenter]} />
        </button>
        {latLng && <LatLngInfoBox latLng={latLng} areaData={areaData} />}
      </main>
      <ProgressBox time={time} allFlyingSaucers={allFlyingSaucers} scenario={nukePlan} />
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
