/**
 * Geodesic sphere built by recursively subdividing an icosahedron.
 *
 * Chosen over the cube-sphere the earlier prototype used because the physical
 * relaxation in tools/solve.ts is sensitive to mesh anisotropy: a cube-sphere
 * varies by ~1.4x in triangle area between face centre and cube corner, which
 * shows up as artificially stiff and slack regions in the solution. An
 * icosphere at subdivision 6 stays within ~1.2x, and has no UV seam to patch.
 */
export interface Mesh {
  /** Unit direction per vertex, xyz interleaved. */
  positions: Float64Array
  /** Triangle corner indices, 3 per face. */
  indices: Uint32Array
}

const PHI = (1 + Math.sqrt(5)) / 2

export function buildIcosphere(subdivision: number): Mesh {
  let vertices: number[][] = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ].map(normalise)

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]

  // Stable key base for the midpoint cache. It must not depend on the current
  // vertex count: that grows while we subdivide, so a count-based key both
  // fails to find existing midpoints and, worse, collides onto unrelated ones.
  const KEY_BASE = 1 << 20

  for (let level = 0; level < subdivision; level++) {
    const midpoints = new Map<number, number>()
    const midpoint = (a: number, b: number) => {
      const key = a < b ? a * KEY_BASE + b : b * KEY_BASE + a
      const cached = midpoints.get(key)
      if (cached !== undefined) return cached
      const [ax, ay, az] = vertices[a]
      const [bx, by, bz] = vertices[b]
      const index = vertices.length
      vertices.push(normalise([ax + bx, ay + by, az + bz]))
      midpoints.set(key, index)
      return index
    }
    const next: [number, number, number][] = []
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }

  const positions = new Float64Array(vertices.length * 3)
  vertices.forEach(([x, y, z], i) => {
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
  })
  const indices = new Uint32Array(faces.length * 3)
  faces.forEach(([a, b, c], i) => {
    indices[i * 3] = a
    indices[i * 3 + 1] = b
    indices[i * 3 + 2] = c
  })
  return { positions, indices }
}

function normalise([x, y, z]: number[]): number[] {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}

/** Unique undirected edges of a mesh, as a flat [a0,b0, a1,b1, ...] array. */
export function buildEdges(indices: Uint32Array, vertexCount: number): Uint32Array {
  const seen = new Set<number>()
  const edges: number[] = []
  const add = (a: number, b: number) => {
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const key = lo * vertexCount + hi
    if (seen.has(key)) return
    seen.add(key)
    edges.push(lo, hi)
  }
  for (let f = 0; f < indices.length; f += 3) {
    add(indices[f], indices[f + 1])
    add(indices[f + 1], indices[f + 2])
    add(indices[f + 2], indices[f])
  }
  return new Uint32Array(edges)
}

/** Solid angle of a spherical triangle on the unit sphere (van Oosterom-Strackee). */
export function sphericalTriangleArea(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const numerator = Math.abs(
    ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx),
  )
  const ab = ax * bx + ay * by + az * bz
  const bc = bx * cx + by * cy + bz * cz
  const ca = cx * ax + cy * ay + cz * az
  const denominator = 1 + ab + bc + ca
  return 2 * Math.atan2(numerator, denominator)
}
