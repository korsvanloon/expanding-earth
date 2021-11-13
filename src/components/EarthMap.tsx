// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { round } from 'lib/math'
import { useCallback, useEffect, useState, MouseEvent } from 'react'
import { Vector2 } from 'three'
import StoreButton from './StoreButton'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import AgeFilter from './AgeFilter'
import UvMesh from './UvMesh'
import { getHull } from 'lib/triangulation'
import { getPointsAtTime, Polygon, polygonFromRawJson, setPointsAtTime } from 'lib/polygon'
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

// const height = 400
const initialTime = 0.5

const findPolygon = (uv: Vector2, polygons: Polygon[]) =>
  polygons.find((p) =>
    pointInPolygon(
      uv.toArray(),
      getHull(p.points).map((pt) => pt.toArray()),
    ),
  )

function EarthMap() {
  const [height, setHeight] = useState<number>(400)
  const [currentPoint, setCurrentPoint] = useState<Vector2>()
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [currentPolygon, setCurrentPolygon] = useState<Polygon>()

  const { time, setTime, running, start, stop } = useAnimationLoop(initialTime)

  useEffect(() => {
    const height = Math.min(window.innerHeight - 100, window.innerWidth / 2 - 100)
    setHeight(height)
  }, [])

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
      if (event.shiftKey) {
        const polygon = currentPolygon ?? { points: [] }

        polygon.points.push(uv)
        polygon.timeline?.forEach((t) => t.points.push(uv))
        if (!polygons.includes(polygon)) {
          setPolygons([...polygons, polygon])
        } else {
          setPolygons([...polygons])
        }
        setCurrentPolygon(polygon)
      }
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
          onLoad={(rawPolygons) => setPolygons(rawPolygons.map(polygonFromRawJson))}
          onSave={() => polygons}
        >
          Store
        </StoreButton>
        <Link href="/globe">Globe</Link>
      </NavBar>

      <div css={style} style={{ width: `${height * 2}px`, height: `${height}px` }}>
        <AgeFilter id="color-replace" time={time} />
        <div
          className="background"
          style={{
            backgroundImage: `url(/textures/${background})`,
            backgroundSize: `${height * 2}px ${height}px`,
          }}
        />
        <img
          alt=""
          src="/textures/age-map.png"
          width={height * 2}
          height={height}
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
            setPointsAtTime(polygon, time, newPoints)
            setPolygons([...polygons])
          }}
          onPointClick={(uv, event, polygon, i) => {
            if (event.shiftKey) {
              polygon.points.splice(i, 1)
              polygon.timeline?.forEach((t) => t.points.splice(i, 1))
              setPolygons([...polygons])
            }
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
