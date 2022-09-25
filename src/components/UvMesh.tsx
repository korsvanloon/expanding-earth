/** @jsx jsx */
import { css, jsx } from '@emotion/react'
import { MouseEvent, PointerEvent } from 'react'
import { pixelToUv, uvToPixel } from 'lib/image'
import { getPointsAtTime, Polygon } from 'lib/polygon'
import { Vector2 } from 'three'
import ControlPoint from './ControlPoint'
import Delaunator from 'delaunator'
import { pipeInto } from 'ts-functional-pipe'
import { combine, map, toArray } from 'lib/iterable'
import clsx from 'clsx'
import { delaunayTriangles, connectingTriangles } from 'lib/triangulation'

type Props = {
  height: number
  time: number
  polygons: Polygon[]
  current?: Polygon
  currentPointIndex?: number
  uvColor: (uv: Vector2) => string | undefined
  onClick?: (uv: Vector2, event: MouseEvent) => void
  onPointMoved?: (oldUv: Vector2, newUv: Vector2, polygon: Polygon, index: number) => void
  onPointClick?: (
    uv: Vector2,
    event: PointerEvent<SVGCircleElement>,
    polygon: Polygon,
    index: number,
  ) => void
}

const UvMesh = ({
  height,
  time,
  polygons,
  current,
  currentPointIndex,
  uvColor,
  onClick,
  onPointMoved,
  onPointClick,
}: Props) => {
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
        if (e.target instanceof SVGCircleElement) {
          return
        }
        onClick?.(pixelToUv(new Vector2(e.clientX - box.left, e.clientY - box.top), height), e)
      }}
    >
      {polygons.map((polygon, pi) => {
        const uvs = getPointsAtTime(polygon, time)
        const delaunay = Delaunator.from(
          polygon.points,
          (p) => p.x,
          (p) => p.y,
        )

        const triangles = pipeInto(
          delaunayTriangles(delaunay, uvs),
          combine(connectingTriangles(delaunay, uvs)),
          map(({ id, nodes }) => ({
            id,
            pixels: nodes.map(({ value: uv }) => uvToPixel(uv, height)),
          })),
          toArray,
        )

        return (
          <g key={pi} className={clsx('plate', polygon === current && 'selected')}>
            {/* <clipPath id={`polygon-${pi}`}><polygon points={polygonPoints} /></clipPath> */}
            {triangles.map(({ pixels }, i) => (
              <polygon
                key={pixelsToSvgPoints(pixels, height)}
                points={pixelsToSvgPoints(pixels, height)}
                stroke={'black'}
                // fill={`hsla(0, 100%, 50%, ${10 * abs((1 - time * 0.5) * initial.area - area)})`}
                strokeWidth={0.001}
                onClick={() => console.log(polygon)}
                style={{ color: polygon.color ?? 'hsla(0, 100%, 50%, 0.2' }}
              />
            ))}
            {uvs.map((uv, i) => (
              <ControlPoint
                key={`${uv.x};${uv.y}:${pi}`}
                xlinkTitle={`${uv.x};${uv.y}:${pi}`}
                containerHeight={height}
                uv={uv}
                className={clsx(currentPointIndex === i && 'selected')}
                color={uvColor(uv)}
                onMove={(newUv) => {
                  onPointMoved?.(uv, newUv, polygon, i)
                  // end.corners = [...end.corners]
                  // points[i].setX(newUv.x)
                  // points[i].setY(newUv.y)
                  // const [a, b, d, c] = end.corners.map(uvToPoint)
                  // end.area = areaOfSquare(a, b, c, d)
                  // end.angles = anglesOfSquare(a, b, c, d)
                }}
                onClick={(uv, event) => onPointClick?.(uv, event, polygon, i)}
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
    position: relative;
    polygon {
      fill: transparent;
    }
  }
  g.selected {
    z-index: 1;
    polygon {
      /* fill: currentColor; */
    }
  }
  g.plate:hover {
    /* z-index: 1; */
    polygon {
      /* fill: currentColor; */
      /* fill: hsla(200, 80%, 50%, 0.5); */
    }
  }
  circle:hover {
    fill: hsla(200, 80%, 50%, 1);
  }
  circle.selected {
    stroke: hsla(200, 100%, 80%, 1);
    stroke-width: 0.01px;
  }
`

const pixelsToSvgPoints = (pixels: Vector2[], height: number) =>
  pixels.map(({ x, y }) => `${x / height},${y / height}`).join(' ')
