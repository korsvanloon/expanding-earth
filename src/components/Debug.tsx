// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { abs, clamp01, round } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { Vector2, Vector3 } from 'three'
import ControlPoint from 'components/ControlPoint'
import { PlateMovement, PlatesEarth } from 'lib/platesEarth'
import createAgeEarth, { AgeEarth } from 'lib/ageEarth'
import EarthGeometry from 'lib/EarthGeometry'
import { flatMap, makePocketsOf, map, toArray } from 'lib/iterable'
import { pipe, pipeInto } from 'ts-functional-pipe'
import StoreButton from './StoreButton'
import RangeInput from './RangeInput'
import { angle, anglesOfSquare, areaOfSquare, areaOfTriangle, uvToPoint } from 'lib/sphere'
import ChoiceInput from './ChoiceInput'

const height = 400

const geometry = new EarthGeometry(6)

function* geometryUvs(geometry: EarthGeometry) {
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.array.length; i += 2) {
    yield new Vector2(uv.array[i], uv.array[i + 1])
  }
}

function* geometryVertices(geometry: EarthGeometry) {
  const vertices = geometry.getAttribute('position')
  for (let i = 0; i < vertices.array.length; i += 3) {
    yield new Vector3(vertices.array[i], vertices.array[i + 1], vertices.array[i + 2])
  }
}

function* geometryFaces(geometry: EarthGeometry) {
  const index = geometry.index!.array
  for (let i = 0; i < index.length; i += 3) {
    yield [index[i], index[i + 1], index[i + 2]] as [number, number, number]
  }
}

type Plate = {
  area: number
  angles: number[]
  corners: Vector2[]
}
type MovingPlate = {
  current: Plate
  initial: Plate
}

const createInitialPlates = (geometry: EarthGeometry) => {
  const uvs = [...geometryUvs(geometry)]
  return pipeInto(
    geometryFaces(geometry),
    map((x) => x.map((i) => ({ i, uv: uvs[i], p: uvToPoint(uvs[i]) }))),
    makePocketsOf(2),
    map(
      // triangle1: a, c, b; triangle2: b, c, d
      ([[a1, c1, b1], [_b2, _c2, d2]]): Plate => ({
        area: areaOfSquare(a1.p, b1.p, c1.p, d2.p),
        angles: anglesOfSquare(a1.p, b1.p, c1.p, d2.p),
        corners: [a1.uv, b1.uv, d2.uv, c1.uv],
      }),
    ),
    toArray,
  )
}
const initialPlates = createInitialPlates(geometry)
const currentPlates = createInitialPlates(geometry)

function Debug() {
  const ref = useRef<HTMLCanvasElement>(null)
  const actionsRef = useRef<PlatesEarth | AgeEarth>()
  const [movingPlates, setMovingPlates] = useState<MovingPlate[]>(
    initialPlates.map((initial, i) => ({ initial, current: currentPlates[i] })),
  )

  const { time, setTime, running, start, stop } = useAnimationLoop()

  useEffect(() => {
    if (ref.current) {
      createAgeEarth({
        canvas: ref.current,
        height,
      }).then((actions) => {
        actionsRef.current = actions
        actions.update(time)
      })
      // createPlatesEarth({
      //   canvas: ref.current,
      //   height,
      //   plates,
      // }).then((actions) => {
      //   actionsRef.current = actions
      // actions.update(time)
      // })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current])

  useEffect(() => {
    actionsRef.current?.update(time)
  }, [time])

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
        <RangeInput name="age" value={time} onValue={setTime}>
          <code>{humanAge}</code> million years ago
        </RangeInput>
        <StoreButton
          name="moving-plates"
          onLoad={(current) => {
            setMovingPlates(
              movingPlates.map(({ initial }, i) => ({
                initial,
                current: {
                  ...current[i],
                  corners: current[i].corners.map(({ x, y }) => new Vector2(x, y)),
                },
              })),
            )
          }}
          onSave={() => movingPlates.map((p) => p.current)}
        >
          Store
        </StoreButton>
      </div>
      <div css={uvMapCss}>
        <img width={height * 2} height={height} src={`/textures/${background}`} alt="" />
        <img width={height * 2} height={height} src={`/textures/${background}`} alt="" />
        <img width={height * 2} height={height} src={`/textures/${background}`} alt="" />
        <svg
          version="1.1"
          x="0px"
          y="0px"
          width={height * 2}
          height={height}
          viewBox="0.5 0 1 1"
          css={svgCss}
        >
          {movingPlates.map(({ current, initial }, i) => (
            <polygon
              key={i}
              points={current.corners.map(({ x, y }) => `${x * 2},${1 - y}`).join(' ')}
              stroke={'black'}
              fill={`hsla(0, 100%, 50%, ${
                10 * abs((1 - time * 0.5) * initial.area - current.area)
              })`}
              strokeWidth={0.001}
            />
          ))}
          {movingPlates.map(({ current, initial }, pi) =>
            current.corners.map((uv, i) => (
              <ControlPoint
                key={`${uv.x};${uv.y}:${pi}`}
                containerHeight={height}
                uv={uv}
                color={`hsla(0, ${abs(
                  round(((1 - time * 0.5) * initial.angles[i] - current.angles[i]) * 100),
                )}%, 50%, ${abs(
                  0.5 + ((1 - time * 0.5) * initial.angles[i] - current.angles[i]),
                )})`}
                onMove={(newUv) => {
                  current.corners = [...current.corners]
                  current.corners[i] = newUv
                  const [a, b, d, c] = current.corners.map(uvToPoint)
                  current.area = areaOfSquare(a, b, c, d)
                  current.angles = anglesOfSquare(a, b, c, d)
                  movingPlates[i] = { current, initial }
                  setMovingPlates([...movingPlates])
                }}
              />
            )),
          )}
        </svg>
      </div>
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
  margin: 0 auto;
  > * {
    display: block;
  }
  > img {
    position: absolute;
    left: 0;
    top: 0;
    outline: 1px solid gray;
    :first-of-type {
      left: -800px;
    }
    :last-of-type {
      left: 800px;
    }
  }
`

const svgCss = css`
  position: absolute;
  polygon:hover {
    fill: hsla(200, 80%, 50%, 0.5);
  }
`

export default Debug

type EditingState =
  | 'basic'
  | 'moving_point'
  | 'connecting_points'
  | 'scaling_plate'
  | 'moving_plate'

// type ControlPoint = {
//   uv: Vector2
// plates: ControlPlate[]
// }
// type ControlPlate = {
//   points: ControlPoint[]
// }

const plates: PlateMovement[] = [
  {
    originUV: new Vector2(0.56, 0.25),
    name: 'Old World',
    color: '#000fff',
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Sahara',
    color: '#fbfa76',
    originUV: new Vector2(0.535, 0.4),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'South Africa',
    color: '#756c26',
    originUV: new Vector2(0.56, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Madagascar',
    color: '#d5d41f',
    originUV: new Vector2(0.56, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'New world',
    color: '#ff0000',
    originUV: new Vector2(0.325, 0.5),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Patagonia',
    color: '#317526',
    originUV: new Vector2(0.3, 0.65),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'India',
    color: '#1dff00',
    originUV: new Vector2(0.71, 0.335),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Australia',
    color: '#a6a6a6',
    originUV: new Vector2(0.85, 0.6),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Antarctica',
    color: '#d6d6d6',
    originUV: new Vector2(0.5, 0.95),
    destination: new Vector3(0, 0, 0),
    rotation: 0,
  },
]

export const useAnimationLoop = () => {
  const [time, setTime] = useState(0)
  const [running, setRunning] = useState(false)

  // Use useRef for mutable variables that we want to persist
  // without triggering a re-render on their change
  const requestRef = useRef<number>()
  const previousTRef = useRef<number>()
  const ascendingRef = useRef<boolean>(false)

  const animate = (t: number) => {
    if (previousTRef.current !== undefined) {
      const deltaTime = t - previousTRef.current

      // const approxTime = time + deltaTime * 0.0001 * (ascending ? 1 : -1))

      // Pass on a function to the setter of the state
      // to make sure we always have the latest state
      setTime((prevCount) => {
        const t = clamp01(prevCount + deltaTime * 0.0001 * (ascendingRef.current ? 1 : -1))
        if (t >= 1) {
          ascendingRef.current = false
        } else if (t <= 0) {
          ascendingRef.current = true
        }
        return t
      })
    }
    previousTRef.current = t
    requestRef.current = requestAnimationFrame(animate)
  }
  const start = () => {
    requestRef.current = requestAnimationFrame(animate)
    setRunning(true)
  }

  const stop = () => {
    cancelAnimationFrame(requestRef.current!)
    previousTRef.current = undefined
    setRunning(false)
  }

  return { time, setTime, running, stop, start }
}

const backgroundImages = [
  //
  'crustal-age-map.jpg',
  'color-map.jpg',
  'earth-relief-map.jpg',
  'height-map.jpg',
  'age-map.png',
  'plates.png',
]
