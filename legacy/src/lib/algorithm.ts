import { Vector2, Vector3 } from 'three'
import { pipeInto } from 'ts-functional-pipe'
import { getPixelColor, uvToPixel } from './image'
import { flatMap, toArray, unique, where } from './iterable'
import { average, range } from './math'
import { areaOfTriangle, uvToPoint } from './sphere'
import { Triangle } from './triangulation'

/*
MOVE POINTS

initially
for each point
calculate strength based on age

on time
for each triangle
initialize offset to 0

do x times until minimization threshold
for each triangle
calculate size
add forces to points based on size difference and triangle offset
calculate direction of triangles based on points strength

calculate new size
*/

export const algorithm = ({
  uvs,
  triangles,
  ageData,
  height,
  growth,
  time,
}: {
  uvs: Vector2[]
  ageData: ImageData
  height: number
  triangles: Triangle[]
  /** A value */
  growth: number
  /** A value */
  time: number
}) => {
  const nodeAges = uvs.map((uv) => getPixelColor(ageData, uvToPixel(uv, height))[0] / 256)
  // const nodeTriangles = uvs.map((_, i) =>
  //   triangles.filter((t) => t.nodes.some((n) => n.id === i || n.mirror === i)),
  // )
  const nodeNeighbors = uvs.map((_, i) =>
    pipeInto(
      triangles,
      where((t) => t.nodes.some((n) => n.id === i || n.mirror === i)),
      flatMap((t) => t.nodes.map((n) => n.mirror || n.id)),
      where((i2) => i2 !== i),
      toArray,
    ).filter(unique),
  )
  const points = uvs.map(uvToPoint)

  const initialTriangleSizes = triangles.map((t) => {
    const [a, b, c] = t.nodes.map((n) => (n.mirror !== undefined ? points[n.mirror] : points[n.id]))
    return areaOfTriangle(a, b, c)
  })

  const targetTriangleSizes = initialTriangleSizes.map((size) => size * growth)

  const nextNodeDirections = (directions: Vector3[]) =>
    nodeNeighbors.map((neighborIs, nodeI) =>
      neighborIs
        // .filter((neighborI) => nodeAges[neighborI] < nodeAges[nodeI])
        .reduce(
          (result, neighborI) =>
            result
              .clone()
              .add(
                points[nodeI]
                  .clone()
                  .sub(points[neighborI])
                  // .normalize()
                  // .multiplyScalar(0.2)
                  .multiplyScalar(Math.max(0, nodeAges[nodeI] - nodeAges[neighborI])),
              )
              .add(directions[neighborI]),
          directions[nodeI],
        )
        .divideScalar(neighborIs.length),
    )

  const nodeDirections = range(3).reduce(
    nextNodeDirections,
    nodeNeighbors.map(() => new Vector3()),
  )

  return { nodeDirections, initialTriangleSizes, targetTriangleSizes }
}

export const triangleCenter = (triangle: Triangle, uvs: Vector2[]) =>
  triangle.nodes
    .reduce((result, current) => result.add(uvs[current.id]), new Vector2())
    .divideScalar(3)
export const averagePoint = (points: Vector3[]) =>
  points.reduce((result, current) => result.add(current), new Vector3()).divideScalar(points.length)

export const triangleDirection = (
  triangle: Triangle,
  center: Vector2,
  uvs: Vector2[],
  nodeAges: number[],
) =>
  triangle.nodes.reduce(
    (result, node) =>
      result.add(uvs[node.id].clone().sub(center).multiplyScalar(nodeAges[node.id])),
    new Vector2(0, 0),
  )

const triangleAge = (triangle: Triangle, nodeAges: number[]) =>
  average(triangle.nodes.map((n) => (n.mirror !== undefined ? nodeAges[n.mirror] : nodeAges[n.id])))
