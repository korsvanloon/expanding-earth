import { Vector2 } from 'three'
import { getPixelColor, uvToPixel } from './image'
import { areaOfTriangle, uvToPoint } from './sphere'
import { Triangle, Node } from './triangulation'

export const a = ({
  uvs,
  triangles,
  ageData,
  height,
  growth,
}: {
  uvs: Vector2[]
  ageData: ImageData
  height: number
  triangles: Triangle<Vector2>[]
  /** A value */
  growth: number
}) => {
  const nodeAges = uvs.map((uv) => getPixelColor(ageData, uvToPixel(uv, height))[0] / 256)
  const points = uvs.map(uvToPoint)
  const initialTriangleSizes = triangles.map((t) => {
    const [a, b, c] = t.nodes.map((n) => points[n.id])
    return areaOfTriangle(a, b, c)
  })

  const targetTriangleSizes = initialTriangleSizes.map((size) => size * growth)
  const nodeDirections = uvs.map(() => new Vector2(0, 0))

  for (const triangle of triangles) {
    const center = triangle.nodes
      .reduce((result, current) => result.add(current.value), new Vector2(0, 0))
      .divideScalar(3)

    const direction = triangle.nodes
      .reduce(
        (result, node) =>
          result.add(node.value.clone().sub(center).multiplyScalar(nodeAges[node.id])),
        new Vector2(0, 0),
      )
      .normalize()

    for (const node of triangle.nodes) {
      const expansionStrength =
        targetTriangleSizes[triangle.id] / initialTriangleSizes[triangle.id] / 2
      nodeDirections[node.id].add(node.value.clone().sub(center).multiplyScalar(expansionStrength))
    }
  }
}

export const triangleCenter = (triangle: Triangle<Vector2>) =>
  triangle.nodes
    .reduce((result, current) => result.add(current.value), new Vector2(0, 0))
    .divideScalar(3)

export const triangleDirection = (
  triangle: Triangle<Vector2>,
  center: Vector2,
  nodeAges: number[],
) =>
  triangle.nodes.reduce(
    (result, node) => result.add(node.value.clone().sub(center).multiplyScalar(nodeAges[node.id])),
    new Vector2(0, 0),
  )
