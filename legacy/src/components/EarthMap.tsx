// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css } from '@emotion/react'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import { useRerender } from 'hooks/useRerender'
import { useShortCuts } from 'hooks/useShortcuts'
import { useUpdate } from 'hooks/useUpdate'
import { getPixelColor, loadImageData, pixelColorToHex, uvToPixel } from 'lib/image'
import { findMax, round } from 'lib/math'
import { getPointsAtTime, Polygon, polygonFromRawJson, setPointsAtTime } from 'lib/polygon'
import { globeMesh } from 'lib/triangulation'
import { MouseEvent, useCallback, useEffect } from 'react'
import { Vector2 } from 'three'
import { Link } from 'wouter'
import AgeFilter from './AgeFilter'
import ChoiceInput from './ChoiceInput'
import CurrentState from './CurrentState'
import NavBar from './NavBar'
import RangeInput from './RangeInput'
import StoreButton from './StoreButton'
import UvMesh from './UvMesh'

const backgroundImages = [
  //
  'earth-relief-map.jpg',
  'color-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'crustal-age-map.jpg',
]

// const height = 400
const initialTime = 0.0

type Data = {
  height: number
  ageData?: ImageData
  polygon: Polygon
}

type State = {
  pointIndex?: number
  currentTriangleIndex?: number
  background: string
}

function EarthMap() {
  const [current, updateState] = useUpdate<State>({
    background: backgroundImages[0],
  })
  const [data, updateData] = useUpdate<Data>({
    height: 400,
    polygon: { points: [] },
  })
  const animation = useAnimationLoop(initialTime, initialTime)
  const rerender = useRerender()

  useEffect(() => {
    const height = Math.min(window.innerHeight - 100, window.innerWidth / 2 - 100)
    updateData({ height })
    loadImageData('textures/age-map.png', height * 2, height).then((ageData) =>
      updateData({ ageData }),
    )
  }, [])

  useShortCuts(animation)

  const humanAge = round(animation.time * 280)
    .toString()
    .padStart(3)

  const uvClick = useCallback(
    (uv: Vector2, event: MouseEvent) => {
      if (event.shiftKey) {
        data.polygon.points.push(uv)
        data.polygon.timeline?.forEach((t) => t.points.push(uv))
      }
    },
    [data.polygon],
  )

  ;(window as any).polygon = data.polygon

  const deletePoint = (pointIndex: number) => {
    data.polygon.points.splice(pointIndex, 1)
    data.polygon.timeline?.forEach((t) => t.points.splice(pointIndex, 1))
    updateState({ pointIndex: undefined })
  }
  const uvs = getPointsAtTime(data.polygon, animation.time)

  const mesh = globeMesh(uvs)

  return (
    <div>
      <NavBar>
        <button autoFocus onClick={animation.running ? animation.stop : animation.start}>
          {animation.running ? 'stop' : 'start'}
        </button>
        <RangeInput name="age" value={animation.time} onValue={animation.setTime} step={0.01}>
          <code>{humanAge}</code> million years ago
        </RangeInput>
        <ChoiceInput
          name="background"
          options={backgroundImages.map((value) => ({ value, label: value }))}
          value={current.background}
          onValue={(background) => updateState({ background })}
        >
          Image
        </ChoiceInput>
        <StoreButton
          name={`plates`}
          onLoad={(rawPolygons) => updateData({ polygon: rawPolygons.map(polygonFromRawJson)[0] })}
          onSave={() => [data.polygon!]}
        >
          Store
        </StoreButton>
        <Link href="/globe">Globe</Link>
      </NavBar>

      <div css={style} style={{ width: `${data.height * 2}px`, height: `${data.height}px` }}>
        <AgeFilter id="color-replace" time={animation.time} />
        <div
          className="background"
          style={{
            backgroundImage: `url(/textures/${current.background})`,
            backgroundSize: `${data.height * 2}px ${data.height}px`,
          }}
        />
        <img
          alt=""
          src="/textures/age-map.png"
          width={data.height * 2}
          height={data.height}
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
        {data.ageData && data.polygon && (
          <UvMesh
            mesh={mesh}
            height={data.height}
            ageData={data.ageData}
            selected={current}
            time={animation.time}
            uvColor={(uv) =>
              data.ageData
                ? pixelColorToHex(getPixelColor(data.ageData, uvToPixel(uv, data.height)))
                : undefined
            }
            onClick={uvClick}
            onPointMoved={(oldUv, newUv, pointIndex) => {
              updateState({ pointIndex })
              const newPoints = getPointsAtTime(data.polygon, animation.time)
              const uv = newPoints.find((p) => p.equals(oldUv))
              uv?.setX(newUv.x)
              uv?.setY(newUv.y)
              setPointsAtTime(data.polygon, animation.time, newPoints)
              rerender()
            }}
            onPointClick={(_uv, event, pointIndex) => {
              updateState({ pointIndex })
              if (event.shiftKey) {
                deletePoint(pointIndex)
              }
            }}
          />
        )}
      </div>
      <CurrentState
        height={data.height}
        currentPointIndex={current.pointIndex}
        currentPolygon={data.polygon}
        ageData={data.ageData}
        onChange={rerender}
        onDeletePoint={() => data.polygon && current.pointIndex && deletePoint(current.pointIndex)}
        onClosePoint={() => updateState({ pointIndex: undefined })}
        onAddAge={() => {
          if (!data.polygon) return

          const lastAge = data.polygon.timeline
            ? findMax(data.polygon.timeline, (age) => age.time)
            : undefined
          setPointsAtTime(
            data.polygon,
            (lastAge?.time ?? 0) + 0.1,
            (lastAge?.points ?? data.polygon.points).map((x) => x.clone()),
          )
          rerender()
        }}
        onSelectAge={(age) => animation.setTime(age.time)}
        onDeleteAge={(age) => {
          if (!data.polygon) return
          data.polygon.timeline = data.polygon.timeline?.filter((a) => a !== age)
          rerender()
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
