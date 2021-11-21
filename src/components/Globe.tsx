// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { AgeEarth } from 'lib/ageEarth'
import EarthGeometry from 'lib/EarthGeometry'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGlobeEarth, { GlobeEarth } from 'lib/globeEarth'
import { Link } from 'wouter'
import NavBar from './NavBar'
import { load } from './StoreButton'
import { Polygon, polygonFromRawJson } from 'lib/polygon'
import { uvToPoint } from 'lib/sphere'
import { TextureLoader } from 'three'
import { flatMap, map, toArray } from 'lib/iterable'
import { globeMesh } from 'lib/triangulation'
import { pipeInto } from 'ts-functional-pipe'
import { info } from 'lib/log'

const backgroundImages = [
  //
  'earth-relief-map.jpg',
  'color-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'crustal-age-map.jpg',
  'lines-map.png',
]

// const resolution = 12
// const geometry = new EarthGeometry(buildCubeSphere({ resolution, size: 1 }))

const polygons = load<Polygon[]>('plates')?.map(polygonFromRawJson) ?? []
const delaunayUvs = polygons.flatMap((p) => p.points)

const { triangles, nodes } = globeMesh(delaunayUvs)
const uvs = nodes.map(({ value }) => value)
const vertices = uvs.map(uvToPoint)

const geometry = new EarthGeometry({
  uvs,
  vertices,
  normals: vertices,
  indices: pipeInto(
    triangles,
    flatMap((t) => [...t.nodes].reverse()),
    map((n) => n.id),
    toArray,
  ),
})

function Globe() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ globe?: GlobeEarth; age?: AgeEarth }>({
    age: undefined,
    globe: undefined,
  })

  const { time, setTime, running, start, stop } = useAnimationLoop(0, 0.3)

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGlobeEarth({
        container: webGlContainerRef.current,
        geometry,
        // height,
      }).then((actions) => {
        actionsRef.current.globe = actions
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [background, setBackground] = useState(backgroundImages[0])

  useEffect(() => {
    // actionsRef.current.age?.update(time)
    // const points = polygons.flatMap((p) => getPointsAtTime(p, time)).map((uv) => uvToPoint(uv))
    // geometry.setPoints(points)
  }, [time])

  useEffect(() => {
    actionsRef.current.globe?.updateColorTexture(
      new TextureLoader().load(`/textures/${background}`),
    )
  }, [background])

  const humanAge = round(time * 280)
    .toString()
    .padStart(3)

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

      <div ref={webGlContainerRef} style={{ width: '100vw', height: 'calc(100vh - 70px)' }}></div>
    </div>
  )
}

export default Globe
