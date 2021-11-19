import { Vector2 } from 'three'
import Delaunator from 'delaunator'
import { bufferCount, compare, map, toArray, where } from './iterable'
import { pipeInto } from 'ts-functional-pipe'
import { getPixelColor, uvToPixel } from './image'
import { average, nearest, range } from './math'

export type Node<T> = {
  id: number
  value: T
}

export type Triangle<T> = {
  id: number
  /** counter clock-wise */
  nodes: Node<T>[]
}

export const convexHull = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    delaunay.hull,
    map((id): Node<Vector2> => ({ id, value: uvs[id] })),
  )

const convexHullEdges = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(convexHull(delaunay, uvs), bufferCount(2, 1))

const convexLeftHullEdges = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    convexHullEdges(delaunay, uvs),
    where(([n1, n2]) => n1.value.x < 0.5 && n2.value.x < 0.5),
  )

const convexRightHullNodes = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    convexHull(delaunay, uvs),
    where((n) => n.value.x > 0.5),
  )

/**
 * Connects the left edge of the convex hull to the nearest points
 *
 * @return the triangles on the opposite of the convex hull to make the mesh cylindrical.
 */
export const connectingTriangles = (delaunay: Delaunator<Vector2>, uvs: Vector2[]) =>
  pipeInto(
    convexLeftHullEdges(delaunay, uvs),
    map(
      ([p1, p2]): Triangle<Vector2> => ({
        id: 0,
        nodes: [
          p1,
          pipeInto(
            convexRightHullNodes(delaunay, uvs),
            compare(nearest(average([p1.value.y, p2.value.y]), (uv) => uv.value.y)),
          )!,
          p2,
        ],
      }),
    ),
  )

export const delaunayTriangles = <T>(delaunay: Delaunator<T>, uvs: T[]) =>
  pipeInto(
    range(Math.floor(delaunay.triangles.length / 3)),
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

const a = (uvs: Vector2[], ageData: ImageData, height: number) => {
  const delaunator = Delaunator.from(
    uvs,
    (p) => p.x,
    (p) => p.y,
  )
  return pipeInto(
    delaunator.halfedges,
    map((i1, i2) => ({
      from: uvs[i1],
      to: uvs[i2],
      fromAge: getPixelColor(ageData, uvToPixel(uvs[i1], height))[0],
      toAge: getPixelColor(ageData, uvToPixel(uvs[i2], height))[0],
    })),
    toArray,
  )
}

export const triangleOfEdge = (edge: number) => Math.floor(edge / 3)

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
