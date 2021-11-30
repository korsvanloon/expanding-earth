/** @jsx jsx */
import { css } from '@emotion/react'
import { MouseEvent, PointerEvent } from 'react'
import { pixelToUv, uvToPixel } from 'lib/image'
import { getPointsAtTime, Polygon } from 'lib/polygon'
import { Vector2, Vector3 } from 'three'
import ControlPoint from './ControlPoint'
import { pipeInto } from 'ts-functional-pipe'
import { toArray } from 'lib/iterable'
import clsx from 'clsx'
import { globeMesh, Node } from 'lib/triangulation'
import { algorithm } from 'lib/algorithm'
import { pointToUv, uvToPoint } from 'lib/sphere'

type Props = {
  height: number
  time: number
  ageData: ImageData
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
  ageData,
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
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
        </marker>
      </defs>

      {polygons.map((polygon, pi) => {
        const uvs = getPointsAtTime(polygon, time)

        // const nodeAges = uvs.map((uv) => getPixelColor(ageData, uvToPixel(uv, height))[0] / 256)

        const triangles = pipeInto(
          globeMesh(uvs).triangles,
          // map((triangle) => {
          //   const center = triangleCenter(triangle)
          //   return {
          //     ...triangle,
          //     center,
          //     direction: triangleDirection(triangle, center, nodeAges),
          //   }
          // }),
          toArray,
        )
        const { nodeDirections } = algorithm({ uvs, triangles, ageData, height, growth: 0.2, time })

        return (
          <g key={pi} className={clsx('plate', polygon === current && 'selected')}>
            <clipPath id={`polygon-${pi}`}>{/* <polygon points={polygonPoints} /> */}</clipPath>
            {triangles.map(({ nodes, id }) => (
              <g key={id}>
                {/* <line
                  x1={uvToPixel(center, height).x / height}
                  y1={uvToPixel(center, height).y / height}
                  x2={uvToPixel(center.clone().sub(direction), height).x / height}
                  y2={uvToPixel(center.clone().sub(direction), height).y / height}
                  color="red"
                  stroke={'currentColor'}
                  strokeWidth={0.001}
                  markerEnd="url(#arrowhead)"
                /> */}
                <polygon
                  points={nodesToSvgPoints(nodes, height)}
                  stroke={'black'}
                  // fill={`hsla(0, 100%, 50%, ${10 * abs((1 - time * 0.5) * initial.area - area)})`}
                  strokeWidth={0.001}
                  onClick={() => console.log(polygon)}
                  style={{ color: polygon.color ?? 'hsla(0, 100%, 50%, 0.2' }}
                />
              </g>
            ))}
            {uvs.map((uv, i) => (
              <g key={`${uv.x};${uv.y}:${pi}`}>
                {nodeDirections[i].equals(new Vector3()) ? undefined : (
                  <line
                    x1={uvToPixel(uv, height).x / height}
                    y1={uvToPixel(uv, height).y / height}
                    x2={
                      uvToPixel(pointToUv(uvToPoint(uv).sub(nodeDirections[i])), height).x / height
                    }
                    y2={
                      uvToPixel(pointToUv(uvToPoint(uv).sub(nodeDirections[i])), height).y / height
                    }
                    color="red"
                    stroke={'currentColor'}
                    strokeWidth={0.002}
                    markerEnd="url(#arrowhead)"
                  />
                )}
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
              </g>
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

const nodesToSvgPoints = (nodes: Node<Vector2>[], height: number) =>
  nodes
    .map((x) => x.value)
    .map((x) => uvToPixel(x, height))
    .map(({ x, y }) => `${x / height},${y / height}`)
    .join(' ')
