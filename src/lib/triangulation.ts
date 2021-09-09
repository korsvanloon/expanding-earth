import { Float32BufferAttribute, Vector2 } from 'three'
import Delaunator from 'delaunator'
import { GeometryData } from './EarthGeometry'
import { range } from './math'
import { uvToPoint } from './sphere'

export const initializeProgression = (vertexLength: number, steps = 10) =>
  range(steps).map(() => new Float32BufferAttribute(vertexLength * 2, 2))

export const getVertexInTime = (index: number, time: number) => {}

export type Polygon = {
  points: Vector2[]
  color?: string
}

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
  const indices = [
    ...Delaunator.from(
      polygons.flatMap(({ points }) => points),
      (p) => p.x,
      (p) => p.y,
    ).triangles,
  ]

  return {
    uvs,
    vertices,
    normals: vertices,
    indices,
  }
}
