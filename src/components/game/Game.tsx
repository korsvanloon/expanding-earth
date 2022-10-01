import { round, sqrt } from 'lib/math'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { areaNukes, scenario } from '../../data'
import LatLngInfoBox from './LatLngInfoBox'
import classes from './Game.module.css'
import clsx from 'clsx'
import { nukesWithPosition } from 'lib/game'

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
    // startOver: true,
  })

  const nukes = useMemo(() => nukesWithPosition(scenario, time), [time])

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

  const year = round(time)

  const dimension = webGlContainerRef.current?.clientHeight

  return (
    <div>
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
        <RangeInput
          name="year"
          value={time}
          onValue={setTime}
          step={0.01}
          min={startTime}
          max={endTime}
        >
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
        Nukes: {nukes.length}
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
            const latLng = orthographicPointToLatLng(point, centers[state.globeCenter].value)
            setLatLng(withinCircle(point) ? latLng : undefined)
          }}
          onClick={() =>
            console.log(`${latLng?.x.toLocaleString('nl')}\t${latLng?.y.toLocaleString('nl')}`)
          }
        ></div>
        {dimension &&
          areaNukes.map((a) => (
            <button
              className={clsx(classes.place, classes.nukePlace)}
              key={a.name}
              title={a.name}
              style={{
                ...toTopLeft(
                  latLngToOrthographicPoint(a.latLng, centers[state.globeCenter].value),
                  dimension,
                ),
                width: `${sqrt(a.active)}px`,
                height: `${sqrt(a.active)}px`,
              }}
            ></button>
          ))}
        {dimension &&
          nukes.map(({ object, currentPosition }, i) => (
            <button
              className={clsx(classes.nuke)}
              key={i}
              style={{
                ...toTopLeft(
                  latLngToOrthographicPoint(currentPosition, centers[state.globeCenter].value),
                  dimension,
                ),
                width: `${sqrt(object.amount)}px`,
                height: `${sqrt(object.amount)}px`,
              }}
            ></button>
          ))}
        <button className={clsx(classes.hideout)} style={globeCenterLabelOffset[state.globeCenter]}>
          {centers[state.globeCenter].label}
          <div style={globeCenterOffset[state.globeCenter]} />
        </button>
        {latLng && <LatLngInfoBox latLng={latLng} areaData={areaData} />}
      </main>
    </div>
  )
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
