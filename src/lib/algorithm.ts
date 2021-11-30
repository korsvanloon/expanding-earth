import { flatMap, toArray, unique, where } from 'lib/iterable'
import { average } from 'lib/math'
import { Vector2, Vector3 } from 'three'
import { pipeInto } from 'ts-functional-pipe'
import { getPixelColor, uvToPixel } from './image'
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
  triangles: Triangle<Vector2>[]
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

  const nodeDirections = nodeNeighbors.map((neighborIs, i) => {
    // const highest = max(...neighbors.map((i) => nodeAges[i]))

    return neighborIs
      .filter((neighborI) => nodeAges[neighborI] < nodeAges[i])
      .reduce(
        (result, neighborI) =>
          result.add(
            points[i]
              .clone()
              .sub(points[neighborI])
              // .normalize()
              .multiplyScalar(1 - nodeAges[neighborI]),
          ),
        new Vector3(),
      )
      .divideScalar(neighborIs.length)
  })
  // const nodeDirections = nodeTriangles.map((triangles, i) => {
  //   const ages = triangles.map((triangle) => triangleAge(triangle, nodeAges))
  //   const highest = max(...ages)
  //   const point = points[i]

  //   return triangles
  //     .reduce(
  //       (result, triangle, index) =>
  //         result.add(
  //           averagePoint(triangle.nodes.map((n) => (n.mirror ? points[n.mirror] : points[n.id])))
  //             .sub(point)
  //             // .normalize()
  //             .multiplyScalar(1 - (highest - ages[index])),
  //         ),
  //       new Vector3(),
  //     )
  //     .divideScalar(triangles.length)
  // })

  return { nodeDirections, initialTriangleSizes, targetTriangleSizes }

  // for (const triangle of triangles) {
  //   const center = triangleCenter(triangle)

  //   const direction = triangle.nodes
  //     .reduce(
  //       (result, node) =>
  //         result.add(node.value.clone().sub(center).multiplyScalar(nodeAges[node.id])),
  //       new Vector2(0, 0),
  //     )
  //     .normalize()

  //   for (const node of triangle.nodes) {
  //     const expansionStrength =
  //       targetTriangleSizes[triangle.id] / initialTriangleSizes[triangle.id] / 2
  //     nodeDirections[node.id].add(node.value.clone().sub(center).multiplyScalar(expansionStrength))
  //   }
  // }
}

export const triangleCenter = (triangle: Triangle<Vector2>) =>
  triangle.nodes
    .reduce((result, current) => result.add(current.value), new Vector2())
    .divideScalar(3)
export const averagePoint = (points: Vector3[]) =>
  points.reduce((result, current) => result.add(current), new Vector3()).divideScalar(points.length)

export const triangleDirection = (
  triangle: Triangle<Vector2>,
  center: Vector2,
  nodeAges: number[],
) =>
  triangle.nodes.reduce(
    (result, node) => result.add(node.value.clone().sub(center).multiplyScalar(nodeAges[node.id])),
    new Vector2(0, 0),
  )

const triangleAge = (triangle: Triangle<Vector2>, nodeAges: number[]) =>
  average(triangle.nodes.map((n) => (n.mirror !== undefined ? nodeAges[n.mirror] : nodeAges[n.id])))
