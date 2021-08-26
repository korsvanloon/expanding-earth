// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { clamp01 } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import { Vector2, Vector3 } from 'three'
import { PlateMovement, PlatesEarth } from '../lib/platesEarth'
import createAgeEarth, { AgeEarth } from '../lib/ageEarth'
import ControlPoint from './ControlPoint'
import { EarthGeometry } from '../lib/EarthGeometry'
import { area, uvToPoint } from 'lib/sphere'

const height = 400

const geometry = new EarthGeometry(10)
const uvs = [...geometryUvs(geometry)]
const positions = [...geometryVertices(geometry)]
const faces = [...geometryFaces(geometry)]
const areas = faces
  .map((face) => face.map((i) => uvs[i]))
  .map((face) => area(uvToPoint(face[0]), uvToPoint(face[1]), uvToPoint(face[2])))

console.log(geometry)

const max = areas.reduce((a, b) => Math.max(a, b), 0)
const min = areas.reduce((a, b) => Math.min(a, b), 2)

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
  // geometry.index.
  const index = geometry.index!.array
  for (let i = 0; i < index.length; i += 3) {
    yield [index[i], index[i + 1], index[i + 2]] as [number, number, number]
  }
}

const initControlPoints = () => {
  const result = [...geometryUvs(geometry)]
  return result

  // const raw = localStorage.getItem('control-points')
  // return raw
  //   ? (JSON.parse(raw) as { x: number; y: number }[]).map(({ x, y }) => new Vector2(x, y))
  //   : [...equirectangularUVs()]
}

type Geometry = {
  uvs: Vector2[]
  positions: Vector3[]
  faces: [number, number, number][]
}

const Debug = () => {
  const ref = useRef<HTMLCanvasElement>(null)
  const actionsRef = useRef<PlatesEarth | AgeEarth>()
  const [sphere, setSphere] = useState<Geometry>({ uvs: [], positions: [], faces: [] })

  const { time, setTime, running, start, stop } = useAnimationLoop()

  useEffect(() => {
    setSphere({ uvs, positions, faces })

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

  const humanAge = Math.round(time * 280)
    .toString()
    .padStart(3)

  return (
    <div>
      <div css={containerCss}>
        {/* <canvas ref={ref} /> */}
        <img width={height * 2} height={height} src="/textures/crustal-age-map.jpg" alt="" />
        <svg
          version="1.1"
          x="0px"
          y="0px"
          width={height * 2}
          height={height}
          viewBox="0.5 0 1 1"
          css={svgCss}
          // onClick={(e) => {
          //   if (!(e.target instanceof SVGSVGElement)) return
          //   // console.log(e.target )
          //   const rect = ref.current!.getBoundingClientRect()
          //   const uv = new Vector2(
          //     (e.clientX - rect.left) / rect.width,
          //     (e.clientY - rect.top) / rect.height,
          //   )
          //   console.log(uv)
          //   setControlPoints((points) => [...points, uv])
          // }}
        >
          {sphere.faces
            .map((face) => face.map((i) => sphere.uvs[i]))
            .map((face) => (
              <polygon
                key={face.map((uv) => `${uv.x};${uv.y}`).join(';')}
                points={face
                  .map(
                    ({ x, y }, _, faceUvs) =>
                      `${
                        faceUvs.some((uv) => uv.x === 0) &&
                        faceUvs.some((uv) => uv.x > 0.9) &&
                        x === 0
                          ? 2
                          : faceUvs.some((uv) => uv.x === 1) &&
                            faceUvs.some((uv) => uv.x < 0.2) &&
                            x === 1
                          ? 0
                          : x * 2
                      },${y}`,
                  )
                  .join(' ')}
                // cx={uv.x * 2}
                // cy={uv.y}
                // r={0.005}
                stroke={'black'}
                strokeWidth={0.001}
                fill={`hsla(0, 0%, 0%, ${
                  0.5 -
                  (area(uvToPoint(face[0]), uvToPoint(face[1]), uvToPoint(face[2])) - min) /
                    (max - min) /
                    2
                })`}
              />
            ))}
          {sphere.uvs.map((uv, i) => (
            <ControlPoint
              key={`${uv.x};${uv.y}:${i}`}
              containerHeight={height}
              uv={uv}
              disabled={
                [0, 1 / 32, 31 / 32, 1].includes(uv.x) || [0, 1 / 16, 15 / 16, 1].includes(uv.y)
              }
              onMove={(uv) => {
                sphere.uvs[i] = uv
                setSphere({ ...sphere, uvs: sphere.uvs })
                // console.log(uv)
              }}
              // cx={uv.x * 2}
              // cy={uv.y}
              // r={0.005}
              // fill={'black'}
            />
          ))}
        </svg>
      </div>
      <div>
        <span css={yearCss}>
          <code>{humanAge}</code> million years ago
        </span>
      </div>
      <button onClick={running ? stop : start}>{running ? 'stop' : 'start'}</button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={time}
        onChange={(e) => setTime(e.target.valueAsNumber)}
      />
      <div>
        <button
          onClick={() => {
            localStorage.setItem(
              'control-points',
              JSON.stringify(sphere.uvs.map(({ x, y }) => ({ x, y }))),
            )
          }}
        >
          Save points
        </button>
      </div>
    </div>
  )
}

const containerCss = css`
  position: relative;
`

const yearCss = css`
  background-color: gray;
  padding: 4px 8px;
  code {
    display: inline-block;
    white-space: pre;
  }
`

const svgCss = css`
  position: absolute;
  left: 0;
  top: 0;
  polygon:hover {
    fill: hsla(0, 100%, 50%, 0.5);
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
