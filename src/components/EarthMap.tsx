// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { round } from 'lib/math'
import { useCallback, useEffect, useRef, useState, MouseEvent } from 'react'
import { Vector2 } from 'three'
import createAgeEarth, { AgeEarth } from 'lib/ageEarth'
import StoreButton from './StoreButton'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import { GlobeEarth } from 'lib/globeEarth'
import AgeFilter from './AgeFilter'
import UvMesh from './UvMesh'
import { getHull } from 'lib/triangulation'
import { getPointsAtTime, Polygon, setPointsAtTime } from 'lib/polygon'
import { Link } from 'wouter'
import NavBar from './NavBar'
import pointInPolygon from 'point-in-polygon'

const backgroundImages = [
  //
  'earth-relief-map.jpg',
  'color-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'crustal-age-map.jpg',
]

const height = 400
const initialTime = 0.01

const findPolygon = (uv: Vector2, polygons: Polygon[]) =>
  polygons.find((p) =>
    pointInPolygon(
      uv.toArray(),
      getHull(p.points).map((pt) => pt.toArray()),
    ),
  )

function EarthMap() {
  const ref = useRef<HTMLCanvasElement>(null)
  const actionsRef = useRef<{ globe?: GlobeEarth; age?: AgeEarth }>({
    age: undefined,
    globe: undefined,
  })
  const [currentPoint, setCurrentPoint] = useState<Vector2>()
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [currentPolygon, setCurrentPolygon] = useState<Polygon>()

  const { time, setTime, running, start, stop } = useAnimationLoop(initialTime)

  useEffect(() => {
    if (ref.current) {
      createAgeEarth({
        canvas: ref.current,
        height,
      }).then((actions) => {
        actionsRef.current.age = actions
        actions.update(time)
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

  const handleClick = useCallback(
    (uv: Vector2, event: MouseEvent) => {
      const clickedPolygon = findPolygon(uv, polygons)

      if (clickedPolygon && clickedPolygon !== currentPolygon) {
        setCurrentPolygon(clickedPolygon)
        return
      }
      const polygon = currentPolygon ?? { points: [] }

      polygon.points.push(uv)
      if (!polygons.includes(polygon)) {
        setPolygons([...polygons, polygon])
      } else {
        setPolygons([...polygons])
      }
      setCurrentPolygon(polygon)
    },
    [currentPolygon, polygons],
  )

  ;(window as any).polygons = polygons

  return (
    <div>
      <NavBar>
        <button autoFocus onClick={running ? stop : start}>
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
        <StoreButton
          name={`plates`}
          onLoad={(rawPolygons) => {
            setPolygons(
              rawPolygons.map(({ points, timeline, color }, i) => ({
                points: points.map(({ x, y }) => new Vector2(x, y)),
                timeline: timeline?.map(({ points, time }) => ({
                  time,
                  points: points.map(({ x, y }) => new Vector2(x, y)),
                })),
                color: color ?? `hsla(${(200 + 19 * i) % 360}, 80%, 50%, 0.3)`,
              })),
            )
          }}
          onSave={() => polygons}
        >
          Store
        </StoreButton>
        <Link href="/globe">Globe</Link>
      </NavBar>

      <div css={style}>
        <AgeFilter id="color-replace" time={time} />
        <div className="background" style={{ backgroundImage: `url(/textures/${background})` }} />
        <img
          alt=""
          src="/textures/age-map.png"
          width="800"
          height="400"
          style={{ filter: 'url(#color-replace)' }}
          className="age-lines"
        />
        <UvMesh
          height={height}
          polygons={polygons}
          current={currentPolygon}
          time={time}
          onClick={handleClick}
          onPointMoved={(oldUv, newUv, polygon, i) => {
            setCurrentPoint(newUv)
            const newPoints = getPointsAtTime(polygon, time)
            const uv = newPoints.find((p) => p.equals(oldUv))
            uv?.setX(newUv.x)
            uv?.setY(newUv.y)
            console.log(time, i, oldUv, uv, newUv)
            setPointsAtTime(polygon, time, newPoints)
            setPolygons([...polygons])
          }}
        />
      </div>
      {currentPolygon && (
        <div>
          <button
            onClick={() => {
              setPolygons(polygons.filter((p) => p !== currentPolygon))
              setCurrentPolygon(undefined)
            }}
          >
            Delete
          </button>
        </div>
      )}
      <pre>polygon: {currentPolygon && polygons.indexOf(currentPolygon)}</pre>
      <pre>{currentPoint && `point: (x: ${currentPoint.x}, y: ${currentPoint.y})`}</pre>
    </div>
  )
}

const style = css`
  position: relative;
  width: 800px;
  height: 400px;
  margin: 0 auto;
  > * {
    display: block;
  }
  > .age-lines {
    position: absolute;
    left: 0;
    top: 0;
  }
  > .background {
    position: absolute;
    background-size: 800px 400px;
    background-repeat: repeat-x;
    background-position-x: center;
    left: 0;
    top: 0;
    height: 100%;
    width: 100vw;
    left: 50%;
    right: 50%;
    margin-left: -50vw;
    margin-right: -50vw;
  }
`

export default EarthMap
