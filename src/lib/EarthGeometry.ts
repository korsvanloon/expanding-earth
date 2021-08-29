import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from 'three'
import { sum, sqrt } from './math'
import { pointToUv } from './sphere'

type EarthParameters = {
  size: number
  resolution: number
}

class EarthGeometry extends BufferGeometry {
  parameters: EarthParameters
  constructor(resolution: number, size = 1) {
    super()
    if (!Number.isInteger(resolution)) {
      throw new Error(`resolution ${resolution} must be an integer`)
    }

    this.type = 'EarthGeometry'

    this.parameters = { resolution, size }

    const planeVertexLength = resolution ** 2 * 4

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []

    const buildPlane = (faceConfig: PlaneConfig, planeIndexOffset: number) => {
      for (const { points, faces } of planeSquares(resolution)) {
        const vectors = points.map(toVector(faceConfig, this.parameters))
        const faceUvs = vectors.map(pointToUv)
        fixEdgeUvs(faceUvs)

        for (let i = 0; i < points.length; i++) {
          const vector = vectors[i]
          const uv = faceUvs[i]
          vertices.push(vector.x, vector.y, vector.z)
          normals.push(vector.x, vector.y, vector.z)
          uvs.push(uv.x, uv.y)
        }
        for (const face of faces) {
          indices.push(...face.map((i) => i + planeIndexOffset))
        }
      }
    }

    // build each side of the box geometry
    for (let i = 0; i < 6; i++) {
      buildPlane(faceConfigs[i], planeVertexLength * i)
    }

    this.setIndex(indices)
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  }

  static fromJSON(data: { resolution: number }) {
    return new EarthGeometry(data.resolution)
  }
}

export default EarthGeometry

// const buildPlane = (
//   parameters: EarthParameters,
//   faceConfig: FaceConfig,
//   planeIndexOffset: number,
// ) => {
//   for (const { points, faces } of planeSquares(parameters.resolution)) {
//     const vectors = points.map(toVector(faceConfig, parameters))
//     const faceUvs = vectors.map(pointToUv)
//     fixEdgeUvs(faceUvs)

//     for (let i = 0; i < points.length; i++) {
//       const vector = vectors[i]
//       const uv = faceUvs[i]
//       vertices.push(vector.x, vector.y, vector.z)
//       normals.push(vector.x, vector.y, vector.z)
//       uvs.push(uv.x, uv.y)
//     }
//     for (const face of faces) {
//       indices.push(...face.map((i) => i + planeIndexOffset))
//     }
//   }
// }

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

const faceConfigs: PlaneConfig[] = [
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
        faces: [
          [a, c, b],
          [b, c, d],
        ],
      }
    }
  }
}
