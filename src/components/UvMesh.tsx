/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { pixelToUv, uvToPixel } from 'lib/image'
import { getHull, Polygon } from 'lib/triangulation'
import { Vector2 } from 'three'
import ControlPoint from './ControlPoint'
import Delaunator from 'delaunator'
import { pipeInto } from 'ts-functional-pipe'
import { makePocketsOf, map, toArray } from 'lib/iterable'

type Props = {
  height: number
  polygons: Polygon[]
  onClick: (uv: Vector2) => void
}

const UvMesh = ({ height, polygons, onClick }: Props) => {
  return (
    <svg
      version="1.1"
      x="0px"
      y="0px"
      width={height * 2}
      height={height}
      viewBox="0.5 0 1 1"
      css={rootCss}
      onClickCapture={(e) => {
        const box = e.currentTarget.getBoundingClientRect()
        onClick(pixelToUv(new Vector2(e.clientX - box.left, e.clientY - box.top), height))
      }}
    >
      {polygons.map(({ points, color }, pi) => {
        const hull = getHull(points)

        const triangles = pipeInto(
          Delaunator.from(
            points,
            (p) => p.x,
            (p) => p.y,
          ).triangles,
          map((i) => uvToPixel(points[i], height)),
          makePocketsOf(3),
          toArray,
        )

        // const polygonPoints = pixelsToSvgPoints(hull.map((uv) => uvToPixel(uv, height)))
        // const area = areaOfSquare(a, b, c, d)
        // const angles = anglesOfSquare(a, b, c, d)

        return (
          <g key={pi} className="plate">
            <clipPath id={`polygon-${pi}`}>{/* <polygon points={polygonPoints} /> */}</clipPath>
            {triangles.map((pixels, i) => (
              <polygon
                key={pixelsToSvgPoints(pixels, height)}
                points={pixelsToSvgPoints(pixels, height)}
                stroke={'black'}
                // fill={`hsla(0, 100%, 50%, 0.2`}
                // fill={`hsla(0, 100%, 50%, ${10 * abs((1 - time * 0.5) * initial.area - area)})`}
                // fill={color}
                strokeWidth={0.001}
                onClick={() => console.log({ points })}
                style={{
                  fill: color,
                }}
              />
            ))}
            {points.map((uv, i) => (
              <ControlPoint
                key={`${uv.x};${uv.y}:${pi}`}
                containerHeight={height}
                uv={uv}
                // color={`hsla(0, ${abs(round((initial.angles[i] - angles[i]) * 100))}%, 50%, 1`}
                onMove={(newUv) => {
                  // end.corners = [...end.corners]
                  // end.corners[i] = newUv
                  // const [a, b, d, c] = end.corners.map(uvToPoint)
                  // end.area = areaOfSquare(a, b, c, d)
                  // end.angles = anglesOfSquare(a, b, c, d)
                  // movingPlates[pi] = { end, initial }
                  // setMovingPlates([...movingPlates])
                }}
                polygonId={`polygon-${pi}`}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

export default UvMesh

const rootCss = css`
  position: absolute;
  g.plate {
    polygon {
      fill: hsla(200, 80%, 50%, 0.3);
    }
  }
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

const pixelsToSvgPoints = (pixels: Vector2[], height: number) =>
  pixels.map(({ x, y }) => `${x / height},${y / height}`).join(' ')
