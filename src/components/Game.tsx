// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { jsx } from '@emotion/react'
import { round } from 'lib/math'
import { useEffect, useRef } from 'react'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGame, { GameMap, NORTH_POLE, SOUTH_POLE } from '3d/game-map'
import { Link } from 'wouter'
import NavBar from './NavBar'
import { useSave } from 'hooks/useSave'

type GameState = {
  globeCenter: number
}

const centers = [
  { label: 'Hyperborea', value: NORTH_POLE },
  { label: 'Neuschwabenland', value: SOUTH_POLE },
]

function Game() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ gameMap?: GameMap }>({
    gameMap: undefined,
  })

  const [state, saveState] = useSave<GameState>('game', {
    globeCenter: 0,
  })

  const { time, setTime, running, start, stop } = useAnimationLoop(0, 1)

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGame({
        container: webGlContainerRef.current,
        centerLatLng: centers[state.globeCenter].value,
      }).then((actions) => {
        actionsRef.current.gameMap = actions
      })
    }
  }, [])

  useEffect(() => {
    actionsRef.current.gameMap?.setCenter(centers[state.globeCenter].value)
  }, [state.globeCenter])

  const year = (1945 + round(time * 100)).toString().padStart(4)

  return (
    <div>
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
        <RangeInput name="year" value={time} onValue={setTime} step={0.01}>
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

      <div ref={webGlContainerRef} style={{ width: '100vw', height: 'calc(100vh - 70px)' }}></div>
    </div>
  )
}

export default Game
