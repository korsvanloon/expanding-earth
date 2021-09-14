import { Vector2 } from 'three'
import Delaunator from 'delaunator'
import { GeometryData } from './EarthGeometry'
import { uvToPoint } from './sphere'
import { flat, makePocketsOf, map, toArray } from './iterable'
import { pipeInto } from 'ts-functional-pipe'
import { Polygon } from './polygon'

export const getHull = (points: Vector2[]) =>
  [
    ...Delaunator.from(
      points,
      (p) => p.x,
      (p) => p.y,
    ).hull,
  ].map((i) => points[i])

export const toGeometryData = (polygons: Polygon[]): GeometryData => {
  const uvs = polygons.flatMap((p) => p.points)
  const vertices = uvs.map(uvToPoint)

  const indices = pipeInto(
    Delaunator.from(
      polygons.flatMap(({ points }) => points),
      (p) => p.x,
      (p) => p.y,
    ).triangles,
    makePocketsOf(3),
    map(([c, b, a]) => [a, b, c]),
    flat,
    toArray,
  ) as number[]

  return {
    uvs,
    vertices,
    normals: vertices,
    indices,
  }
}
