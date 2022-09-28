// this comment tells babel to convert jsx to calls to a function called jsx instead of React.createElement
/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { PI, round, sqrt } from 'lib/math'
import { useEffect, useRef, useState } from 'react'
import RangeInput from './RangeInput'
import ChoiceInput from './ChoiceInput'
import { useAnimationLoop } from 'hooks/useAnimationLoop'
import createGame, { ATLANTIC, GameMap, NORTH_POLE, SOUTH_POLE } from '3d/game-map'
import { Link } from 'wouter'
import NavBar from './NavBar'
import { useSave } from 'hooks/useSave'
import {
  latLngToOrthographicPoint,
  orthographicPointToLatLng,
  withinCircle,
} from 'lib/orthographic'
import colorToCountry from '../data/color-area.json'
import { getPixelColor, loadImageData, pixelColorToHex, pixelsInRange, uvToPixel } from 'lib/image'
import { isValue } from 'lib/iterable'
import { LatLng, Point, UV } from 'lib/type'
import { areaNukes } from '../data'

type GameState = {
  globeCenter: number
}

const centers = [
  { label: 'Thule', value: NORTH_POLE },
  { label: 'Neuschwabenland', value: SOUTH_POLE },
  { label: 'Neuatlantis', value: ATLANTIC },
]

function Game() {
  const webGlContainerRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<{ gameMap?: GameMap }>({
    gameMap: undefined,
  })

  const [state, saveState] = useSave<GameState>('game', {
    globeCenter: 0,
  })
  const [latLng, setLatLng] = useState<LatLng>()
  const [areaData, setAreaData] = useState<ImageData>()
  // const [histogram, setHistogram] = useState<Record<string, number[]>>({})

  const { time, setTime, running, start, stop } = useAnimationLoop({
    startTime: 1945,
    endTime: 2050,
    step: 0.001,
  })

  useEffect(() => {
    if (webGlContainerRef.current) {
      createGame({
        container: webGlContainerRef.current,
        centerLatLng: centers[state.globeCenter].value,
      }).then((actions) => {
        actionsRef.current.gameMap = actions
      })
    }
    loadImageData('textures/areas-map.png', 2048, 1024).then((d) => {
      setAreaData(d)
      // for (const pixel of pixelsInRange(d)) {
      //   const color = getPixelColor(d, pixel)
      //   if (color[3]) {
      //     const hex = pixelColorToHex(color)
      //     if (!histogram[hex]) histogram[hex] = [0, pixel.x, pixel.y]
      //     histogram[hex][0]++
      //   }
      // }
      // setHistogram(histogram)
    })

    return () => {
      actionsRef.current.gameMap?.cleanUp()
    }
  }, [])

  useEffect(() => {
    actionsRef.current.gameMap?.setCenter(centers[state.globeCenter].value)
    actionsRef.current.gameMap?.update()
  }, [state.globeCenter])

  useEffect(() => {
    if (latLng) {
      actionsRef.current.gameMap?.setMouse(latLng)
      actionsRef.current.gameMap?.update()
    }
  }, [latLng])

  const year = round(time)

  const dimension = webGlContainerRef.current?.clientHeight

  return (
    <div>
      <NavBar>
        <Link href="/">&lt;</Link>
        <button onClick={running ? stop : start} autoFocus>
          {running ? 'stop' : 'start'}
        </button>
        <RangeInput name="year" value={time} onValue={setTime} step={1} min={1945} max={2050}>
          <code>{year}</code>
        </RangeInput>
        <ChoiceInput
          name="background"
          options={centers.map(({ label }, i) => ({ value: i.toString(), label }))}
          value={state.globeCenter.toString()}
          onValue={(value) => saveState({ globeCenter: Number(value) })}
        >
          Center
        </ChoiceInput>
      </NavBar>

      <main css={style}>
        <div
          ref={webGlContainerRef}
          style={{ width: '100%', height: '100%' }}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()

            const point: Point = {
              x: (e.clientX - box.left) / box.height,
              y: (e.clientY - box.top) / box.height,
            }
            const latLng = orthographicPointToLatLng(point, centers[state.globeCenter].value)
            setLatLng(withinCircle(point) ? latLng : undefined)
          }}
          onClick={() =>
            console.log(`${latLng?.x.toLocaleString('nl')}\t${latLng?.y.toLocaleString('nl')}`)
          }
        ></div>
        {dimension &&
          areaNukes
            .map(({ name, lat, lng, active }) => ({
              name,
              active,
              point: latLngToOrthographicPoint(
                { x: lng, y: lat },
                centers[state.globeCenter].value,
              ),
            }))
            .map((a) => (
              <button
                className="nuke-site"
                key={a.name}
                title={a.name}
                style={{
                  top: `${a.point.y * dimension}px`,
                  left: `${a.point.x * dimension}px`,
                  width: `${sqrt(a.active)}px`,
                  height: `${sqrt(a.active)}px`,
                }}
              ></button>
            ))}
        <button css={hideoutStyle} style={globeCenterLabelOffset[state.globeCenter]}>
          {centers[state.globeCenter].label}
          <div style={globeCenterOffset[state.globeCenter]} />
        </button>
        {latLng && <PointInfoBox latLng={latLng} areaData={areaData} />}
      </main>
    </div>
  )
}

const style = css`
  width: calc(100vh - 70px);
  height: calc(100vh - 70px);
  margin: 0 auto;
  position: relative;

  .nuke-site {
    position: absolute;
    width: 1%;
    height: 1%;
    border-radius: 100%;
    background-color: hsl(0 50% 50% / 80%);
    padding: 0;
    border: none;
    cursor: pointer;
    transform: translate(-50%, -50%);
  }
`

const globeCenterOffset = [
  {
    top: '3rem',
    left: '1rem',
  },
  {
    top: '-4rem',
    left: '5rem',
  },
  {
    top: '-2rem',
    left: '6rem',
  },
]
const globeCenterLabelOffset = [
  {
    left: 'calc(50vw - 3rem)',
  },
  {},
  {},
]
const hideoutStyle = css`
  position: absolute;
  left: calc(50vw - 6rem);
  top: calc(50vh);
  border: none;
  font-size: 1.5rem;
  padding: 0.5rem;
  color: black;
  background-color: hsl(0 0% 100% / 10%);
  cursor: pointer;

  & > * {
    position: absolute;
    display: block;
    width: 1rem;
    height: 1rem;
    border-radius: 1rem;
    background: hsl(0 0% 100% / 40%);
    box-shadow: 0 0 16px 2px hsl(0 0% 100% / 100%);
    transition: background-color 1s ease-out;
  }
  &:hover {
    /* background: hsl(0 0% 100% / 80%); */
    & > * {
      background: hsl(0 0% 100% / 80%);
    }
  }
`

const PointInfoBox = ({ latLng, areaData }: { latLng: Point; areaData?: ImageData }) => {
  const uv: UV = {
    x: latLng.x / (2 * PI) + 0.5,
    y: latLng.y / PI + 0.5,
  }

  const height = 1024
  const color = areaData
    ? pixelColorToHex(getPixelColor(areaData, uvToPixel(uv, height)))
    : undefined
  const name =
    color && color in colorToCountry
      ? colorToCountry[color as keyof typeof colorToCountry]
      : undefined

  const nukes = areaNukes.find((n) => n.name === name)
  return (
    <div css={preStyle}>
      {'       horiz. verti.'}
      {[
        { name: 'UV    ', value: uv },
        { name: 'LatLng', value: latLng },
      ]
        .filter(isValue)
        .map(({ name, value }) => (
          <div key={name}>
            {name} {formatFloat(value.x)} {formatFloat(value.y)}
          </div>
        ))}
      {color && (
        <div className="color" style={{ backgroundColor: color }}>
          {name}
        </div>
      )}
      {nukes && (
        <div>
          <div>
            Nukes{'   '}
            {formatInt(nukes.active)}
            {'  '}
            {formatInt(nukes.reserve)}
          </div>
          <div>
            LatLng {formatFloat(nukes.lng)} {formatFloat(nukes.lat)}
          </div>
        </div>
      )}
    </div>
  )
}

const formatFloat = (value: number) => value.toFixed(3).padStart(6, ' ')
const formatInt = (value: number) => Math.round(value).toString().padStart(5, ' ')

export default Game

const preStyle = css`
  font-family: monospace;
  white-space: pre;
  position: fixed;
  top: 5rem;
  right: 1rem;
`
