/** @jsx jsx */
import { css } from '@emotion/react'
import clsx from 'clsx'
import { algorithm } from 'lib/algorithm'
import { pixelToUv, uvToPixel } from 'lib/image'
import { pointToUv, uvToPoint } from 'lib/sphere'
import { GlobeMesh } from 'lib/triangulation'
import { MouseEvent, PointerEvent } from 'react'
import { Vector2, Vector3 } from 'three'
import ControlPoint from './ControlPoint'

type Props = {
  mesh: GlobeMesh
  height: number
  time: number
  ageData: ImageData
  selected: { pointIndex?: number; triangleIndex?: number }
  uvColor: (uv: Vector2) => string | undefined
  onClick?: (uv: Vector2, event: MouseEvent) => void
  onPointMoved?: (oldUv: Vector2, newUv: Vector2, index: number) => void
  onPointClick?: (uv: Vector2, event: PointerEvent<SVGCircleElement>, index: number) => void
}

const UvMesh = ({
  mesh,
  height,
  time,
  ageData,
  selected,
  uvColor,
  onClick,
  onPointMoved,
  onPointClick,
}: Props) => {
  const { nodeDirections } = algorithm({
    ...mesh,
    ageData,
    height,
    growth: 0.2,
    time,
  })

  const mirrors = mesh.nodes.filter((n) => n.mirror)

  return (
    <svg
      version="1.1"
      // x="0px"
      // y="0px"
      width={height * 2 * 1.2}
      height={height}
      viewBox="0.5 0 1 1"
      css={rootCss}
      style={{ left: `-${height * 0.2}px` }}
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

      <g className={clsx('plate', 'selected')}>
        {mesh.triangles.map(({ nodes, id }) => (
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
              points={nodesToSvgPoints(
                nodes.map((n) => mesh.uvs[n.id]),
                height,
              )}
              stroke={'black'}
              // fill={`hsla(0, 100%, 50%, ${10 * abs((1 - time * 0.5) * initial.area - area)})`}
              strokeWidth={0.001}
              style={{ color: 'hsla(0, 100%, 50%, 0.2' }}
            />
          </g>
        ))}
        {mesh.nodes
          .filter((n) => !n.mirror)
          .map((n) => ({ ...n, uv: mesh.uvs[n.id] }))
          .map(({ value: uv, id }) => (
            <g key={`${uv.x};${uv.y}`}>
              {nodeDirections[id].equals(new Vector3()) ? undefined : (
                <line
                  x1={uvToPixel(uv, height).x / height}
                  y1={uvToPixel(uv, height).y / height}
                  x2={
                    uvToPixel(pointToUv(uvToPoint(uv).sub(nodeDirections[id])), height).x / height
                  }
                  y2={
                    uvToPixel(pointToUv(uvToPoint(uv).sub(nodeDirections[id])), height).y / height
                  }
                  color="red"
                  stroke={'currentColor'}
                  strokeWidth={0.002}
                  markerEnd="url(#arrowhead)"
                />
              )}
              <ControlPoint
                key={`${uv.x};${uv.y}`}
                xlinkTitle={`${uv.x};${uv.y}`}
                containerHeight={height}
                uv={uv}
                className={clsx(selected.pointIndex === id && 'selected')}
                color={uvColor(uv)}
                onMove={(newUv) => {
                  onPointMoved?.(uv, newUv, id)
                  // end.corners = [...end.corners]
                  // points[i].setX(newUv.x)
                  // points[i].setY(newUv.y)
                  // const [a, b, d, c] = end.corners.map(uvToPoint)
                  // end.area = areaOfSquare(a, b, c, d)
                  // end.angles = anglesOfSquare(a, b, c, d)
                }}
                onClick={(uv, event) => onPointClick?.(uv, event, id)}
                polygonId={`polygon`}
              />
            </g>
          ))}
        {mirrors.map(({ value: uv, id, mirror }) => (
          <g key={`${uv.x};${uv.y}`}>
            <ControlPoint
              key={`${uv.x};${uv.y}`}
              xlinkTitle={`${uv.x};${uv.y}`}
              containerHeight={height}
              uv={uv}
              className={clsx(selected.pointIndex === id && 'selected')}
              color={uvColor(uv)}
              onMove={(newUv) => {
                // onPointMoved?.(uv, newUv, polygon, i)
              }}
              onClick={(uv, event) => onPointClick?.(uv, event, mirror!)}
              polygonId={`polygon`}
            />
          </g>
        ))}
      </g>
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

const nodesToSvgPoints = (nodes: Vector2[], height: number) =>
  nodes
    .map((x) => uvToPixel(x, height))
    .map(({ x, y }) => `${x / height},${y / height}`)
    .join(' ')
