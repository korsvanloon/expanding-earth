import { Vector2 } from 'three'
import Delaunator from 'delaunator'
import { map, toArray, where, range, combine } from './iterable'
import { pipeInto } from 'ts-functional-pipe'

export type Node<T> = {
  id: number
  value: T
  mirror?: number
}

export type Triangle<T> = {
  id: number
  /** counter clock-wise */
  nodes: Node<T>[]
}

/**
 * Creates a globe mesh consisting of triangles and uvs from a base set of points.
 *
 * The returning uvs
 *
 * @param points A set of uv-points.
 */
export const globeMesh = (points: Vector2[]) => {
  const delaunay = Delaunator.from(
    points,
    (p) => p.x,
    (p) => p.y,
  )
  const connectingNodes = pipeInto(
    convexHull(delaunay, points),
    where((n) => n.value.x > 0.5),
    map(
      (node, i): Node<Vector2> => ({
        id: i + points.length,
        value: new Vector2(node.value.x - 1, node.value.y),
        mirror: node.id,
      }),
    ),
    toArray,
  )

  return {
    nodes: pipeInto(
      combine(
        points.map((value, id) => ({ id, value })),
        connectingNodes,
      ),
      toArray,
    ),
    triangles: pipeInto(
      combine(
        delaunayTriangles(delaunay, points),
        connectingTriangles(delaunay, points, connectingNodes),
      ),
      toArray,
    ),
  }
}

const connectingTriangles = (
  delaunay: Delaunator<Vector2>,
  uvs: Vector2[],
  connectingLeftNodes: Node<Vector2>[],
) => {
  const convexLeftNodes = pipeInto(
    convexHull(delaunay, uvs),
    where((n1) => n1.value.x < 0.5),
  )
  const nodes = pipeInto(combine(connectingLeftNodes, convexLeftNodes), toArray)

  const connectingDelaunay = Delaunator.from(
    nodes,
    (p) => p.value.x,
    (p) => p.value.y,
  )
  const baseTriangleSize = delaunayTriangleSize(delaunay)

  return pipeInto(
    range({ size: delaunayTriangleSize(connectingDelaunay) }),
    map(
      (id): Triangle<Vector2> => ({
        id,
        nodes: pipeInto(
          pointIdsOfTriangle(connectingDelaunay, id),
          map((i) => nodes[i]),
          toArray,
        ),
      }),
    ),
    where((triangle) => triangle.nodes.some((n) => connectingLeftNodes.some((o) => o.id === n.id))),
    map((triangle, i): Triangle<Vector2> => ({ id: i + baseTriangleSize, nodes: triangle.nodes })),
  )
}
const convexHull = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    delaunay.hull,
    map((id): Node<Vector2> => ({ id, value: uvs[id] })),
  )

const delaunayTriangles = <T>(delaunay: Delaunator<T>, uvs: T[]) =>
  pipeInto(
    range({ size: delaunayTriangleSize(delaunay) }),
    map(
      (id): Triangle<T> => ({
        id,
        nodes: pipeInto(
          pointIdsOfTriangle(delaunay, id),
          map((id) => ({ id, value: uvs[id] })),
          toArray,
        ),
      }),
    ),
  )

export const pointIdsOfTriangle = <T>(delaunay: Delaunator<T>, triangleId: number) =>
  pipeInto(
    edgesOfTriangle(triangleId),
    map((edgeId) => delaunay.triangles[edgeId]),
  )

export const edgesOfTriangle = (triangleId: number) => [
  3 * triangleId,
  3 * triangleId + 1,
  3 * triangleId + 2,
]

export const triangleOfEdge = (edge: number) => Math.floor(edge / 3)

export const delaunayTriangleSize = <T>(delaunay: Delaunator<T>) =>
  Math.floor(delaunay.triangles.length / 3)

export const nextHalfEdge = (edge: number) => (edge % 3 === 2 ? edge - 2 : edge + 1)
export const prevHalfEdge = (edge: number) => (edge % 3 === 0 ? edge + 2 : edge - 1)

export function* allEdges<T>(delaunay: Delaunator<T>, points: T[]) {
  for (let index = 0; index < delaunay.triangles.length; index++) {
    if (index > delaunay.halfedges[index]) {
      const startPoint = points[delaunay.triangles[index]]
      const endPoint = points[delaunay.triangles[nextHalfEdge(index)]]
      yield { index, startPoint, endPoint }
    }
  }
}

export const trianglesAdjacentToTriangle = <T>(delaunay: Delaunator<T>, triangleIndex: number) =>
  edgesOfTriangle(triangleIndex)
    .map((edge) => delaunay.halfedges[edge])
    .filter((opposite) => opposite >= 0)
    .map(triangleOfEdge)

export function* edgesAroundPoint<T>(delaunay: Delaunator<T>, pointIndex: number) {
  let incoming = pointIndex
  do {
    yield incoming
    const outgoing = nextHalfEdge(incoming)
    incoming = delaunay.halfedges[outgoing]
  } while (incoming !== -1 && incoming !== pointIndex)
}
