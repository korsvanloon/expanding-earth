// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { abs, round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { Vector2 } from 'three'
import ControlPoint from 'components/ControlPoint'
import createAgeEarth, { AgeEarth } from 'lib/ageEarth'
import EarthGeometry, { geometryUvs } from 'lib/EarthGeometry'
import { makePocketsOf, map, toArray } from 'lib/iterable'
import { pipeInto } from 'ts-functional-pipe'
import StoreButton from './StoreButton'
import RangeInput from './RangeInput'
import { anglesOfSquare, areaOfSquare, uvToPoint } from 'lib/sphere'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGlobeEarth, { GlobeEarth } from 'lib/globeEarth'

const backgroundImages = [
  //
  'crustal-age-map.jpg',
  'color-map.jpg',
  'earth-relief-map.jpg',
  'height-map.jpg',
  'age-map.png',
]

const height = 400

const geometry = new EarthGeometry(6)

type Plate = {
  area: number
  angles: number[]
  corners: Vector2[]
}
type MovingPlate = {
  end: Plate
  initial: Plate
}

const createInitialPlates = (geometry: EarthGeometry) =>
  pipeInto(
    geometryUvs(geometry),
    map((uv) => ({ uv: uv.clone(), p: uvToPoint(uv) })),
    makePocketsOf(4),
    map(
      // triangle1: a, c, b; triangle2: b, c, d
      ([a, b, c, d]): Plate => ({
        area: areaOfSquare(a.p, b.p, c.p, d.p),
        angles: anglesOfSquare(a.p, b.p, c.p, d.p),
        // clockwise corners are [a,b,d,c]
        corners: [a.uv, b.uv, d.uv, c.uv],
      }),
    ),
    toArray,
  )
const initialPlates = createInitialPlates(geometry)
const endPlates = createInitialPlates(geometry)

const currentCorners = (movingPlate: MovingPlate, time: number) =>
  movingPlate.initial.corners.map((c, i) => c.clone().lerp(movingPlate.end.corners[i], time))

const cornersToSquare = ([a, b, d, c]: Vector2[]) => [a, b, c, d]

function Debug() {
  const ref = useRef<HTMLCanvasElement>(null)
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ globe?: GlobeEarth; age?: AgeEarth }>({
    age: undefined,
    globe: undefined,
  })
  const [movingPlates, setMovingPlates] = useState<MovingPlate[]>(
    initialPlates.map((initial, i) => ({ initial, end: endPlates[i] })),
  )

  const { time, setTime, running, start, stop } = useAnimationLoop()

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

  useEffect(() => {
    // actionsRef.current.age?.update(time)
    const newUvs = movingPlates.flatMap(({ initial, end }) =>
      cornersToSquare(initial.corners.map((c, i) => c.clone().lerp(end.corners[i], time))),
    )
    geometry.setUv(newUvs)
  }, [time, movingPlates])

  const humanAge = round(time * 280)
    .toString()
    .padStart(3)

  const [background, setBackground] = useState(backgroundImages[0])

  return (
    <div css={rootCss}>
      <div css={controlPanelCss}>
        <ChoiceInput
          name="background"
          options={backgroundImages.map((value) => ({ value, label: value }))}
          value={background}
          onValue={setBackground}
        >
          Image
        </ChoiceInput>
        <button onClick={running ? stop : start}>{running ? 'stop' : 'start'}</button>
        <RangeInput name="age" value={time} onValue={setTime} step={0.01}>
          <code>{humanAge}</code> million years ago
        </RangeInput>
        <StoreButton
          name="moving-plates"
          disabled={running || time !== 1}
          onLoad={(endPlates) => {
            setMovingPlates(
              movingPlates.map(({ initial }, i) => ({
                initial,
                end: {
                  ...endPlates[i],
                  corners: endPlates[i].corners.map(({ x, y }) => new Vector2(x, y)),
                },
              })),
            )
          }}
          onSave={() => movingPlates.map((p) => p.end)}
        >
          Store
        </StoreButton>
      </div>
      <div css={uvMapCss}>
        <div className="background" style={{ backgroundImage: `url(/textures/${background})` }} />
        <canvas className="age-lines" width={height * 2} height={height} ref={ref} />
        <svg
          version="1.1"
          x="0px"
          y="0px"
          width={height * 2}
          height={height}
          viewBox="0.5 0 1 1"
          css={svgCss}
        >
          {movingPlates.map(({ initial, end }, pi) => {
            const corners = currentCorners({ initial, end }, time)
            const [a, b, d, c] = corners.map((uv) => uvToPoint(uv))
            const area = areaOfSquare(a, b, c, d)
            const angles = anglesOfSquare(a, b, c, d)
            const polygonPoints = corners.map(({ x, y }) => `${x * 2},${1 - y}`).join(' ')

            return (
              <g key={pi} className="plate">
                <clipPath id={`polygon-${pi}`}>
                  <polygon points={polygonPoints} />
                </clipPath>
                <polygon
                  points={polygonPoints}
                  stroke={'black'}
                  fill={`hsla(0, 100%, 50%, ${10 * abs((1 - time * 0.5) * initial.area - area)})`}
                  strokeWidth={0.001}
                  onClick={() => console.log({ initial, end, current: { area, angles, corners } })}
                />
                {corners.map((uv, i) => (
                  <ControlPoint
                    key={`${uv.x};${uv.y}:${pi}`}
                    containerHeight={height}
                    uv={uv}
                    disabled={time !== 1}
                    color={`hsla(0, ${abs(round((initial.angles[i] - angles[i]) * 100))}%, 50%, 1`}
                    onMove={(newUv) => {
                      end.corners = [...end.corners]
                      end.corners[i] = newUv
                      const [a, b, d, c] = end.corners.map(uvToPoint)
                      end.area = areaOfSquare(a, b, c, d)
                      end.angles = anglesOfSquare(a, b, c, d)
                      movingPlates[pi] = { end, initial }
                      setMovingPlates([...movingPlates])
                    }}
                    polygonId={`polygon-${pi}`}
                  />
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div ref={webGlContainerRef} style={{ width: '100vw', height: '400px' }}></div>
    </div>
  )
}

const rootCss = css`
  color: white;
  background-color: black;
  input {
    background: hsla(0, 0%, 100%, 0.8);
    border: 1px solid hsla(0, 0%, 100%, 0.9);
    border-radius: 2px;
    height: 24px;
    font-size: 16px;
  }
  button {
    text-transform: uppercase;
    height: 24px;
    min-width: 72px;
    font-size: 12px;
  }
`

const controlPanelCss = css`
  padding: 2em;
  > * {
    margin-bottom: 1rem;
    :last-child {
      margin-bottom: 0;
    }
  }
`

const uvMapCss = css`
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

const svgCss = css`
  position: absolute;
  g.plate:hover {
    z-index: 1;
    polygon {
      fill: hsla(200, 80%, 50%, 0.5);
    }
    circle {
      fill: hsla(200, 80%, 50%, 1);
    }
  }
`

export default Debug
