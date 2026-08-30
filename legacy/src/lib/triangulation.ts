import Delaunator from 'delaunator'
import { Vector2 } from 'three'
import { pipeInto } from 'ts-functional-pipe'
import { combine, map, range, toArray, where } from './iterable'

export type Node = {
  id: number
  mirror?: number
}

export type Triangle = {
  id: number
  /** counter clock-wise */
  nodes: Node[]
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
    map((node, i): Node & { value: Vector2 } => ({
      id: i + points.length,
      value: new Vector2(node.value.x - 1, node.value.y),
      mirror: node.id,
    })),
    toArray,
  )

  const nodes = pipeInto(
    combine(
      points.map<Node & { value: Vector2 }>((value, id) => ({ id, value })),
      connectingNodes,
    ),
    toArray,
  )

  const uvs = nodes.map((n) => n.value)

  const newDelaunay = Delaunator.from(
    nodes,
    (p) => p.value.x,
    (p) => p.value.y,
  )

  const triangles = pipeInto(
    range({ size: delaunayTriangleSize(newDelaunay) }),
    map(
      (id): Triangle => ({
        id,
        nodes: pipeInto(
          pointIdsOfTriangle(newDelaunay, id),
          map((id) => ({ id, value: nodes[id].value, mirror: nodes[id].mirror })),
          toArray,
        ),
      }),
    ),
    where((t) => !t.nodes.every((n) => n.mirror)),
    toArray,
  )

  return { nodes, triangles, uvs }
}

export type GlobeMesh = ReturnType<typeof globeMesh>

const convexHull = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    delaunay.hull,
    map((id): Node & { value: Vector2 } => ({ id, value: uvs[id] })),
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
