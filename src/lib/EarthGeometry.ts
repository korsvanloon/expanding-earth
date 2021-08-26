import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from 'three'
import { pointToUv } from './sphere'

type VecProp = 'x' | 'y' | 'z'

export class EarthGeometry extends BufferGeometry {
  parameters: {
    resolution: number
  }
  constructor(resolution: number) {
    super()

    this.type = 'BoxGeometry'

    this.parameters = {
      resolution,
    }

    const scope = this

    // segments

    const depth = 1
    const height = 1
    const width = 1
    const widthSegments = Math.floor(resolution)
    const heightSegments = Math.floor(resolution)
    const depthSegments = Math.floor(resolution)

    // buffers

    const indices: number[] = []
    const vertices: number[] = []
    const normals: number[] = []
    const uvs: number[] = []

    // helper variables

    let numberOfVertices = 0
    let groupStart = 0

    // build each side of the box geometry

    buildPlane('z', 'y', 'x', -1, -1, depth, height, width, depthSegments, heightSegments, 0) // px
    buildPlane('z', 'y', 'x', 1, -1, depth, height, -width, depthSegments, heightSegments, 1) // nx
    buildPlane('x', 'z', 'y', 1, 1, width, depth, height, widthSegments, depthSegments, 2) // py
    buildPlane('x', 'z', 'y', 1, -1, width, depth, -height, widthSegments, depthSegments, 3) // ny
    buildPlane('x', 'y', 'z', 1, -1, width, height, depth, widthSegments, heightSegments, 4) // pz
    buildPlane('x', 'y', 'z', -1, -1, width, height, -depth, widthSegments, heightSegments, 5) // nz

    // build geometry

    this.setIndex(indices)
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    this.setAttribute('normal', new Float32BufferAttribute(normals, 3))
    this.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    // this.setAttribute('indices', new Float32BufferAttribute(indices, 3))

    function buildPlane(
      u: VecProp,
      v: VecProp,
      w: VecProp,
      udir: number,
      vdir: number,
      width: number,
      height: number,
      depth: number,
      gridX: number,
      gridY: number,
      materialIndex: number,
    ) {
      const segmentWidth = width / gridX
      const segmentHeight = height / gridY

      const widthHalf = width / 2
      const heightHalf = height / 2
      const depthHalf = depth / 2

      const gridX1 = gridX + 1
      const gridY1 = gridY + 1

      let vertexCounter = 0
      let groupCount = 0

      // generate vertices, normals and uvs

      for (let iy = 0; iy < gridY1; iy++) {
        const y = iy * segmentHeight - heightHalf

        for (let ix = 0; ix < gridX1; ix++) {
          const x = ix * segmentWidth - widthHalf

          const vector = new Vector3()
          vector[u] = x * udir
          vector[v] = y * vdir
          vector[w] = depthHalf
          vector.normalize()

          vertices.push(vector.x, vector.y, vector.z)
          normals.push(vector.x, vector.y, vector.z)

          // uvs
          const uv = pointToUv(vector)
          uvs.push(uv.x, uv.y)

          vertexCounter += 1
        }
      }

      // indices

      // 1. you need three indices to draw a single face
      // 2. a single segment consists of two faces
      // 3. so we need to generate six (2*3) indices per segment

      for (let iy = 0; iy < gridY; iy++) {
        for (let ix = 0; ix < gridX; ix++) {
          const a = numberOfVertices + ix + gridX1 * iy
          const b = numberOfVertices + ix + gridX1 * (iy + 1)
          const c = numberOfVertices + (ix + 1) + gridX1 * (iy + 1)
          const d = numberOfVertices + (ix + 1) + gridX1 * iy

          // faces

          indices.push(a, b, d)
          indices.push(b, c, d)

          // increase counter

          groupCount += 6
        }
      }

      // add a group to the geometry. this will ensure multi material support

      scope.addGroup(groupStart, groupCount, materialIndex)

      // calculate new start value for groups

      groupStart += groupCount

      // update total number of vertices

      numberOfVertices += vertexCounter
    }
  }

  static fromJSON(data: { resolution: number }) {
    return new EarthGeometry(data.resolution)
  }
}
