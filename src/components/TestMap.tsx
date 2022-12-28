import { round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import RangeInput from './form/RangeInput'
import ChoiceInput from './form/ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import { Link } from 'wouter'
import NavBar from './NavBar'
import { loadImageData } from 'lib/image'
import { useSave } from 'hooks/useSave'
import classes from './TestMap.module.css'
import createAgeEarth from 'lib/testMap'

const backgroundImages = [
  //
  'color-map.jpg',
  'earth-relief-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'crustal-age-map.jpg',
  'climate-map.svg',
  'topographic-map.jpg',
  'location-map.png',
  'population-density-map.png',
]

type UserState = {
  currentPointIndex?: number | null
  currentPolygonIndex?: number | null
  initialTime?: number | null
  background: string
}
const initialUserState: UserState = {
  background: backgroundImages[0],
}

function TestMap() {
  const [height, setHeight] = useState<number>(400)
  const [userState, saveUserState] = useSave('current', initialUserState)
  const [ageData, setAgeData] = useState<ImageData>()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { time, setTime, running, start, stop } = useAnimationLoop({
    startTime: userState.initialTime ?? 0,
    endTime: userState.initialTime ?? 0,
  })

  useEffect(() => {
    if (!canvasRef.current) return
    createAgeEarth({ canvas: canvasRef.current, height }).then((ageEarth) => {
      ageEarth.update(0)
    })
  }, [canvasRef, height])

  useEffect(() => {
    const shortCuts = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body) return
      event.preventDefault()
      switch (event.key) {
        case ' ':
          if (running) stop()
          else start()
          break
      }
    }
    window.addEventListener('keyup', shortCuts)
    return () => window.removeEventListener('keyup', shortCuts)
  }, [running, start, stop])

  const humanAge = round(time * 280)
    .toString()
    .padStart(3)

  return (
    <div>
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start}>{running ? 'stop' : 'start'}</button>
        <RangeInput name="age" value={time} onValue={setTime} step={0.01}>
          <code>{humanAge}</code> million years ago
        </RangeInput>
        <ChoiceInput
          name="background"
          options={backgroundImages.map((value) => ({ value, label: value }))}
          value={userState.background}
          onValue={(background) => saveUserState({ background })}
        >
          Image
        </ChoiceInput>
      </NavBar>

      <div
        className={classes.container}
        style={{ width: `${height * 2}px`, height: `${height}px` }}
      >
        <div
          className={classes.background}
          style={{
            backgroundImage: `url(/textures/${userState.background})`,
            backgroundSize: `${height * 2}px ${height}px`,
          }}
        />
        <canvas
          ref={canvasRef}
          width={height * 2}
          height={height}
          // style={{ filter: 'url(#color-replace)' }}
          className={classes.image}
        />
      </div>
    </div>
  )
}

export default TestMap
