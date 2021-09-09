// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { jsx } from '@emotion/react'
import { round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { AgeEarth } from 'lib/ageEarth'
import EarthGeometry, { buildCubeSphere } from 'lib/EarthGeometry'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGlobeEarth, { GlobeEarth } from 'lib/globeEarth'
import { Link } from 'wouter'
import NavBar from './NavBar'

const backgroundImages = [
  //
  'earth-relief-map.jpg',
  'color-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'crustal-age-map.jpg',
]

const height = 400

const resolution = 12

const geometry = new EarthGeometry(buildCubeSphere({ resolution, size: 1 }))

function Globe() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ globe?: GlobeEarth; age?: AgeEarth }>({
    age: undefined,
    globe: undefined,
  })

  const { time, setTime, running, start, stop } = useAnimationLoop()

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGlobeEarth({
        container: webGlContainerRef.current,
        geometry,
        height,
      }).then((actions) => {
        actionsRef.current.globe = actions
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // useEffect(() => {
  //   // actionsRef.current.age?.update(time)
  //   const newUvs = movingPlates.flatMap(({ initial, end }) =>
  //     cornersToSquare(initial.corners.map((c, i) => c.clone().lerp(end.corners[i], time))),
  //   )
  //   geometry.setUv(newUvs)
  // }, [time, movingPlates])

  const humanAge = round(time * 280)
    .toString()
    .padStart(3)

  const [background, setBackground] = useState(backgroundImages[0])

  return (
    <div>
      <NavBar>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
        <RangeInput name="age" value={time} onValue={setTime} step={0.01}>
          <code>{humanAge}</code> million years ago
        </RangeInput>
        <ChoiceInput
          name="background"
          options={backgroundImages.map((value) => ({ value, label: value }))}
          value={background}
          onValue={setBackground}
        >
          Image
        </ChoiceInput>
        <Link href="/map">Map</Link>
      </NavBar>

      <div ref={webGlContainerRef} style={{ width: '100vw', height: '400px' }}></div>
    </div>
  )
}

export default Globe
