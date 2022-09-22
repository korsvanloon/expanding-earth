// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { findMax, round } from 'lib/math'
import { useCallback, useEffect, useState, MouseEvent } from 'react'
import { Vector2 } from 'three'
import StoreButton from './StoreButton'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import AgeFilter from './AgeFilter'
import UvMesh from './UvMesh'
import { getPointsAtTime, Polygon, polygonFromRawJson, setPointsAtTime } from 'lib/polygon'
import { Link } from 'wouter'
import NavBar from './NavBar'
import CurrentState from './CurrentState'
import { getPixelColor, loadImageData, pixelColorToHex, uvToPixel } from 'lib/image'

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

// const height = 400
const initialTime = 0.0

// const findPolygon = (uv: Vector2, polygons: Polygon[]) =>
//   polygons.find((p) =>
//     pointInPolygon(
//       uv.toArray(),
//         pipeInto(
//           getHull(p.points),
//           map((pt) => pt.toArray()),
//         ),
//       ),
//     ),
//   )

function EarthMap() {
  const [height, setHeight] = useState<number>(400)
  const [currentPointIndex, setCurrentPointIndex] = useState<number>()
  const [polygons, setPolygons] = useState<Polygon[]>([])
  const [currentPolygon, setCurrentPolygon] = useState<Polygon>()
  const [ageData, setAgeData] = useState<ImageData>()

  const { time, setTime, running, start, stop } = useAnimationLoop(initialTime, initialTime)

  useEffect(() => {
    const height = Math.min(window.innerHeight - 100, window.innerWidth / 2 - 100)
    setHeight(height)
    loadImageData('textures/age-map.png', height * 2, height).then((data) => {
      setAgeData(data)
    })
  }, [])

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

  const [background, setBackground] = useState(backgroundImages[0])

  const handleClick = useCallback(
    (uv: Vector2, event: MouseEvent) => {
      // const clickedPolygon = findPolygon(uv, polygons)
      const clickedPolygon = polygons[0]

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

  const deletePoint = (polygon: Polygon, pointIndex: number) => {
    polygon.points.splice(pointIndex, 1)
    polygon.timeline?.forEach((t) => t.points.splice(pointIndex, 1))
    setCurrentPointIndex(undefined)
  }

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
            const polygons = rawPolygons.map(polygonFromRawJson)
            setPolygons(polygons)
            setCurrentPolygon(polygons[0])
          }}
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
        {/* <img
          alt=""
          src="/textures/lines.png"
          width={height * 2}
          height={height}
          className="age-lines"
          style={{ opacity: 0.6 }}
        /> */}
        <UvMesh
          height={height}
          polygons={polygons}
          current={currentPolygon}
          currentPointIndex={currentPointIndex}
          time={time}
          uvColor={(uv) =>
            ageData ? pixelColorToHex(getPixelColor(ageData, uvToPixel(uv, height))) : undefined
          }
          onClick={handleClick}
          onPointMoved={(oldUv, newUv, polygon, i) => {
            setCurrentPointIndex(i)
            const newPoints = getPointsAtTime(polygon, time)
            const uv = newPoints.find((p) => p.equals(oldUv))
            uv?.setX(newUv.x)
            uv?.setY(newUv.y)
            setPointsAtTime(polygon, time, newPoints)
            setPolygons([...polygons])
          }}
          onPointClick={(uv, event, polygon, i) => {
            setCurrentPolygon(polygon)
            setCurrentPointIndex(i)
            if (event.shiftKey) {
              deletePoint(polygon, i)
            }
          }}
        />
      </div>
      <CurrentState
        currentPointIndex={currentPointIndex}
        currentPolygon={currentPolygon}
        polygons={polygons}
        onChange={() => {
          setPolygons([...polygons])
        }}
        onDeletePolygon={() => {
          setPolygons(polygons.filter((p) => p !== currentPolygon))
          setCurrentPolygon(undefined)
        }}
        onDeletePoint={() => {
          if (!currentPolygon || !currentPointIndex!) return
          deletePoint(currentPolygon, currentPointIndex)
        }}
        onClosePoint={() => {
          setCurrentPointIndex(undefined)
        }}
        onAddAge={() => {
          if (!currentPolygon) return

          const lastAge = currentPolygon.timeline
            ? findMax(currentPolygon.timeline, (age) => age.time)
            : undefined
          setPointsAtTime(
            currentPolygon,
            (lastAge?.time ?? 0) + 0.1,
            (lastAge?.points ?? currentPolygon.points).map((x) => x.clone()),
          )
          setPolygons([...polygons])
        }}
        onSelectAge={(age) => setTime(age.time)}
        onDeleteAge={(age) => {
          if (!currentPolygon) return
          currentPolygon.timeline = currentPolygon.timeline?.filter((a) => a !== age)
          setPolygons([...polygons])
        }}
      />
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
