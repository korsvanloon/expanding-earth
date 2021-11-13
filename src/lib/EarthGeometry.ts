import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from 'three'
import { sum, sqrt, range } from './math'
import { pointToUv } from './sphere'

type EarthParameters = {
  size: number
  resolution: number
}

class EarthGeometry extends BufferGeometry {
  constructor({ vertices, normals, indices, uvs }: GeometryData) {
    super()

    this.type = 'EarthGeometry'

    this.setIndex(indices)
    this.setAttribute('position', toBufferAttribute(vertices))
    this.setAttribute('normal', toBufferAttribute(normals))
    this.setAttribute('uv', toBufferAttribute(uvs))
  }

  setUv(uvs: Vector2[]) {
    const buffer = new Float32BufferAttribute(uvs.length * 2, 2)
    uvs.forEach(({ x, y }, i) => buffer.setXY(i, x, y))
    this.setAttribute('uv', buffer)
  }
  setPoints(points: Vector3[]) {
    const buffer = new Float32BufferAttribute(points.length * 3, 3)
    points.forEach(({ x, y, z }, i) => buffer.setXYZ(i, x, y, z))
    this.setAttribute('position', buffer)
    this.setAttribute('normal', buffer)
  }
}

export default EarthGeometry

export type GeometryData = {
  indices: number[]
  normals: Vector3[]
  vertices: Vector3[]
  uvs: Vector2[]
}

export const buildCubeSphere = (parameters: EarthParameters): GeometryData => {
  if (!Number.isInteger(parameters.resolution)) {
    throw new Error(`resolution ${parameters.resolution} must be an integer`)
  }
  const planeVertexLength = parameters.resolution ** 2 * 4

  return range(6)
    .map((i) => buildPlane(parameters, planeConfigs[i], planeVertexLength * i))
    .reduce(
      (result, plane) => ({
        indices: [...result.indices, ...plane.indices],
        normals: [...result.normals, ...plane.normals],
        vertices: [...result.vertices, ...plane.vertices],
        uvs: [...result.uvs, ...plane.uvs],
      }),
      {
        indices: [] as number[],
        normals: [] as Vector3[],
        vertices: [] as Vector3[],
        uvs: [] as Vector2[],
      },
    )
}

const buildPlane = (
  parameters: EarthParameters,
  faceConfig: PlaneConfig,
  planeIndexOffset: number,
) => {
  const vertices: Vector3[] = []
  const normals: Vector3[] = []
  const uvs: Vector2[] = []
  const indices: number[] = []

  for (const { points, triangles } of planeSquares(parameters.resolution)) {
    const vectors = points.map(toVector(faceConfig, parameters))
    const faceUvs = vectors.map(pointToUv)
    fixEdgeUvs(faceUvs)

    for (let i = 0; i < points.length; i++) {
      const vector = vectors[i]
      const uv = faceUvs[i]
      vertices.push(vector)
      normals.push(vector)
      uvs.push(uv)
    }
    for (const triangle of triangles) {
      for (const index of triangle) {
        indices.push(index + planeIndexOffset)
      }
    }
  }
  return {
    vertices,
    normals,
    uvs,
    indices,
  }
}

function fixEdgeUvs(faceUvs: Vector2[]) {
  for (const uv of faceUvs) {
    // Triangles on the right side should have x = 1 instead of x = 0
    if (uv.x === 0 && faceUvs.some((u) => u.x > 0.5)) {
      uv.x = 1
    }
    // Triangles on the left side should have x = 0 instead of x = 1
    else if (uv.x === 1 && faceUvs.some((u) => u.x < 0.5)) {
      uv.x = 0
    }
  }
  for (const uv of faceUvs) {
    // Triangles on the north pole should have x = average of the other uv x's
    if (uv.y === 0 || uv.y === 1) {
      uv.x = sum(faceUvs.filter((u) => u !== uv).map((u) => u.x)) / 3
    }
  }
}

type PlaneConfig = {
  u: 'x' | 'y' | 'z'
  v: 'x' | 'y' | 'z'
  w: 'x' | 'y' | 'z'
  uDir: 1 | -1
  vDir: 1 | -1
  wDir: 1 | -1
}

const planeConfigs: PlaneConfig[] = [
  { u: 'z', v: 'y', w: 'x', uDir: -1, vDir: -1, wDir: 1 },
  { u: 'z', v: 'y', w: 'x', uDir: 1, vDir: -1, wDir: -1 },
  { u: 'x', v: 'z', w: 'y', uDir: 1, vDir: 1, wDir: 1 },
  { u: 'x', v: 'z', w: 'y', uDir: 1, vDir: -1, wDir: -1 },
  { u: 'x', v: 'y', w: 'z', uDir: 1, vDir: -1, wDir: 1 },
  { u: 'x', v: 'y', w: 'z', uDir: -1, vDir: -1, wDir: -1 },
]

const toVector =
  ({ u, v, w, uDir, vDir, wDir }: PlaneConfig, { size, resolution }: EarthParameters) =>
  ({ x, y }: { x: number; y: number }) => {
    const segmentSize = size / resolution
    const halfSize = size / 2

    const vector = new Vector3()
    vector[u] = uDir * (x * segmentSize - halfSize)
    vector[v] = vDir * (y * segmentSize - halfSize)
    vector[w] = wDir * halfSize

    const x2 = vector.x ** 2
    const y2 = vector.y ** 2
    const z2 = vector.z ** 2

    vector.x *= sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3)
    vector.y *= sqrt(1 - x2 / 2 - z2 / 2 + (x2 * z2) / 3)
    vector.z *= sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3)
    vector.normalize()

    return vector
  }

function* planeSquares(resolution: number) {
  let i = 0
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const a = i++
      const b = i++
      const c = i++
      const d = i++

      yield {
        points: [
          { x, y },
          { x: x + 1, y },
          { x, y: y + 1 },
          { x: x + 1, y: y + 1 },
        ],
        triangles: [
          [a, c, b],
          [b, c, d],
        ],
      }
    }
  }
}

const toBufferAttribute = (vertices: (Vector2 | Vector3)[]) =>
  new Float32BufferAttribute(
    vertices.flatMap((v) => v.toArray()),
    vertices[0]?.toArray().length ?? 2,
  )

export function* geometryUvs(geometry: EarthGeometry) {
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.array.length; i += 2) {
    yield new Vector2(uv.array[i], uv.array[i + 1])
  }
}

export function* geometryVertices(geometry: EarthGeometry) {
  const vertices = geometry.getAttribute('position')
  for (let i = 0; i < vertices.array.length; i += 3) {
    yield new Vector3(vertices.array[i], vertices.array[i + 1], vertices.array[i + 2])
  }
}

export function* geometryFaces(geometry: EarthGeometry) {
  const index = geometry.index!.array
  for (let i = 0; i < index.length; i += 3) {
    yield [index[i], index[i + 1], index[i + 2]] as [number, number, number]
  }
}
