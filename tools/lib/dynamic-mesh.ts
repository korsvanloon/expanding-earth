/**
 * A triangulation of the sphere that is allowed to lose vertices.
 *
 * Every version of this model until now kept one fixed triangulation for all
 * time, which is the wrong shape for the problem. Wind the clock back to 200 Ma
 * and 61% of today's crust has not been made yet, but the mesh still carries
 * 57% of its vertices for it -- points belonging to sea floor that does not
 * exist, which have to be crumpled in somewhere. That crumpling is almost the
 * whole of what the diagnostics report as unaccounted area and folded crust. It
 * is not the physics failing. It is a mesh with no way to get rid of what is
 * gone.
 *
 * So: when the crust under a triangle un-forms, the triangle goes. Collapsing
 * an edge merges its two ends into one point and removes the two triangles
 * along it, which run forwards is a ridge splitting a vertex in two and making
 * new sea floor between them. That is what a ridge does.
 *
 * Nothing here decides which crust belongs to which plate, because nothing
 * should: North America holds together as one piece for a long while and then
 * the Gulf of Mexico shuts as South America comes up against it. A fixed set of
 * plates cannot say that. A mesh that closes what has closed says it by itself,
 * and the plates are read back out afterwards.
 *
 * Every vertex keeps a pointer to whichever surviving vertex swallowed it, so
 * the present-day mesh can still be drawn: crust that has been collapsed away
 * simply sits on top of the crust it merged into, and the ocean reads as
 * zipped shut rather than as a hole.
 */

/** The most neighbours a point may end up with; a good triangulation averages six. */
const MAX_NEIGHBOURS = 11

/**
 * Below this quality a triangle counts as a needle. Quality is one for an
 * equilateral triangle and falls to zero as one is drawn out; a quarter is
 * about a smallest angle of eight degrees.
 */
const SLIVER = 0.25

/** How far a point's neighbour count is from the six a surface wants. */
function spread(valence: number): number {
  return Math.abs(valence - 6)
}

export interface CollapseResult {
  /** Edges collapsed. */
  collapsed: number
  /** Edges that were dead but could not be collapsed without tearing. */
  refused: number
}

export class DynamicMesh {
  /** Three vertex indices per face; a removed face reads -1. */
  readonly faceVerts: Int32Array
  readonly faceAlive: Uint8Array
  readonly vertexAlive: Uint8Array
  /** Which surviving vertex each original vertex has been merged into. */
  readonly mergedInto: Int32Array
  private readonly incident: Set<number>[]

  liveVertices: number
  liveFaces: number

  constructor(
    readonly vertexCount: number,
    readonly faceCount: number,
    indices: Uint32Array,
  ) {
    this.faceVerts = Int32Array.from(indices)
    this.faceAlive = new Uint8Array(faceCount).fill(1)
    this.vertexAlive = new Uint8Array(vertexCount).fill(1)
    this.mergedInto = new Int32Array(vertexCount)
    for (let v = 0; v < vertexCount; v++) this.mergedInto[v] = v
    this.incident = Array.from({ length: vertexCount }, () => new Set<number>())
    for (let f = 0; f < faceCount; f++) {
      for (let k = 0; k < 3; k++) this.incident[indices[f * 3 + k]].add(f)
    }
    this.liveVertices = vertexCount
    this.liveFaces = faceCount
  }

  /** Where a vertex of the present-day mesh has ended up. */
  survivor(v: number): number {
    let root = v
    while (this.mergedInto[root] !== root) root = this.mergedInto[root]
    // Flatten, so this stays cheap over thousands of steps.
    let walk = v
    while (this.mergedInto[walk] !== root) {
      const next = this.mergedInto[walk]
      this.mergedInto[walk] = root
      walk = next
    }
    return root
  }

  facesAt(v: number): Set<number> {
    return this.incident[v]
  }

  /** The vertices one edge away from v. */
  ring(v: number, into: Set<number>): Set<number> {
    into.clear()
    for (const f of this.incident[v]) {
      for (let k = 0; k < 3; k++) {
        const u = this.faceVerts[f * 3 + k]
        if (u !== v) into.add(u)
      }
    }
    return into
  }

  /** The faces along the edge ab, of which a closed surface has exactly two. */
  facesAlong(a: number, b: number, into: number[]): number[] {
    into.length = 0
    for (const f of this.incident[a]) {
      const i = f * 3
      if (this.faceVerts[i] === b || this.faceVerts[i + 1] === b || this.faceVerts[i + 2] === b) {
        into.push(f)
      }
    }
    return into
  }

  /**
   * Whether collapsing ab keeps this a surface.
   *
   * The link condition: the vertices reachable from both ends must be exactly
   * the two opposite the edge. One more and the collapse would pinch the
   * surface into itself at that vertex, which no amount of relaxation
   * afterwards can undo -- the mesh would stop being a sphere and every area
   * the diagnostics measure would quietly become nonsense.
   */
  canCollapse(
    a: number, b: number, ringA: Set<number>, ringB: Set<number>,
    /** Positions, to refuse a collapse that would turn a triangle inside out. */
    pos?: Float64Array,
  ): boolean {
    if (a === b || !this.vertexAlive[a] || !this.vertexAlive[b]) return false
    if (this.liveVertices <= 4) return false
    const along = this.facesAlong(a, b, [])
    if (along.length !== 2) return false
    this.ring(a, ringA)
    this.ring(b, ringB)
    let shared = 0
    for (const u of ringA) if (ringB.has(u)) shared++
    if (shared !== 2) return false
    // The merged point inherits both neighbourhoods. Let that run and a few
    // points end up with thirty neighbours each, with long thin triangles
    // fanning out from them across the ocean -- the mesh stops being a grid and
    // becomes a spider's web, and every triangle in the fan is one nudge from
    // turning inside out.
    if (ringA.size + ringB.size - shared - 2 > MAX_NEIGHBOURS) return false
    // A triangle with all three corners on the ring of the other end would be
    // turned inside out rather than removed.
    for (const f of along) {
      const i = f * 3
      const opposite = this.faceVerts[i] !== a && this.faceVerts[i] !== b
        ? this.faceVerts[i]
        : this.faceVerts[i + 1] !== a && this.faceVerts[i + 1] !== b
          ? this.faceVerts[i + 1]
          : this.faceVerts[i + 2]
      if (this.incident[opposite].size <= 3) return false
    }
    if (pos) {
      // Where b is going to end up. A triangle that would be turned inside out
      // by the move is a fold, and a fold is not something relaxation can undo
      // afterwards -- it has to be refused now.
      const mx = (pos[a * 3] + pos[b * 3]) * 0.5
      const my = (pos[a * 3 + 1] + pos[b * 3 + 1]) * 0.5
      const mz = (pos[a * 3 + 2] + pos[b * 3 + 2]) * 0.5
      for (const end of [a, b]) {
        for (const f of this.incident[end]) {
          if (f === along[0] || f === along[1]) continue
          const v = [this.faceVerts[f * 3], this.faceVerts[f * 3 + 1], this.faceVerts[f * 3 + 2]]
          const p = v.map((u) =>
            u === a || u === b ? [mx, my, mz] : [pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]])
          if (!outward(p[0], p[1], p[2])) return false
        }
      }
    }
    return true
  }

  /**
   * Whether the edge ab can be redrawn as cd, where c and d are the corners
   * opposite it.
   *
   * This is the one operation that lets the mesh take a large motion without
   * the triangles being drawn out into needles: instead of stretching, the
   * triangulation changes which piece of crust lies against which. Which is
   * also what it means physically -- two pieces of rock that were not touching
   * come into contact, and the one that used to be between them has gone. It is
   * a fault, drawn where the mesh says one is needed.
   */
  canFlip(a: number, b: number, pos: Float64Array, along: number[], ring: Set<number>): number[] | null {
    if (!this.vertexAlive[a] || !this.vertexAlive[b]) return null
    this.facesAlong(a, b, along)
    if (along.length !== 2) return null
    const opposite = along.map((f) => {
      for (let k = 0; k < 3; k++) {
        const u = this.faceVerts[f * 3 + k]
        if (u !== a && u !== b) return u
      }
      return -1
    })
    const [c, d] = opposite
    if (c < 0 || d < 0 || c === d) return null
    // Already joined: flipping would put two triangles on the same edge.
    this.ring(c, ring)
    if (ring.has(d)) return null
    // A vertex needs at least three neighbours to stay part of a surface.
    if (this.incident[a].size <= 3 || this.incident[b].size <= 3) return null

    const p = (u: number) => [pos[u * 3], pos[u * 3 + 1], pos[u * 3 + 2]]
    const pa = p(a), pb = p(b), pc = p(c), pd = p(d)
    if (!outward(pc, pd, pa) || !outward(pd, pc, pb)) return null
    // Only when it makes the pair of triangles rounder. The measure is the
    // smallest angle in the pair, which is what goes to zero as a triangle
    // turns into a needle.
    const before = Math.min(quality(pa, pb, pc), quality(pb, pa, pd))
    const after = Math.min(quality(pc, pd, pa), quality(pd, pc, pb))
    // Either the pair gets rounder, or the neighbourhoods get more even without
    // the pair getting worse. Six neighbours is what a triangulation of a
    // surface wants on average, and evening the count out is what stops one
    // point collecting a fan of slivers while the points around it are starved.
    // A needle is worth redrawing for any improvement at all. Demanding five
    // percent is right for a mesh that is already decent -- it stops the flips
    // churning -- but in ground that has been sheared badly every triangulation
    // is poor and no single flip clears the bar, so nothing was ever done and
    // two fifths of the sea floor ended up as needles.
    const desperate = before < SLIVER
    const rounder = after > before * (desperate ? 1.0005 : 1.05)
    const evener =
      spread(this.incident[a].size - 1) + spread(this.incident[b].size - 1) +
        spread(this.incident[c].size + 1) + spread(this.incident[d].size + 1) <
      spread(this.incident[a].size) + spread(this.incident[b].size) +
        spread(this.incident[c].size) + spread(this.incident[d].size)
    if (!rounder && !(evener && after > before * 0.9)) return null
    return [c, d, along[0], along[1]]
  }

  /**
   * Redraw the edge ab as cd.
   *
   * The rest lengths travel with the crust they describe. Four of the six edges
   * around the pair are the same rock as before and keep what they measured;
   * the new one is a contact that did not exist, so it is born at the length it
   * finds itself, which is the model saying that nothing was stretched to make
   * it -- the crust that used to be in the way simply is not there any more.
   */
  flip(a: number, b: number, c: number, d: number, f: number, g: number, restEdge: Float64Array,
    pos: Float64Array): void {
    const lengthOf = (x: number, y: number) =>
      Math.hypot(pos[x * 3] - pos[y * 3], pos[x * 3 + 1] - pos[y * 3 + 1],
        pos[x * 3 + 2] - pos[y * 3 + 2])
    const rest = new Map<number, number>()
    const width = this.vertexCount
    for (const face of [f, g]) {
      for (let k = 0; k < 3; k++) {
        const x = this.faceVerts[face * 3 + k]
        const y = this.faceVerts[face * 3 + ((k + 1) % 3)]
        rest.set(Math.min(x, y) * width + Math.max(x, y), restEdge[face * 3 + k])
      }
    }
    rest.set(Math.min(c, d) * width + Math.max(c, d), lengthOf(c, d))

    const write = (face: number, x: number, y: number, z: number) => {
      const before = [this.faceVerts[face * 3], this.faceVerts[face * 3 + 1],
        this.faceVerts[face * 3 + 2]]
      for (const u of before) this.incident[u].delete(face)
      const after = [x, y, z]
      for (let k = 0; k < 3; k++) {
        this.faceVerts[face * 3 + k] = after[k]
        this.incident[after[k]].add(face)
        const p = after[k]
        const q = after[(k + 1) % 3]
        restEdge[face * 3 + k] = rest.get(Math.min(p, q) * width + Math.max(p, q)) ?? lengthOf(p, q)
      }
    }
    write(f, c, d, a)
    write(g, d, c, b)
  }

  /** Merge b into a, dropping the two triangles along the edge. */
  collapse(a: number, b: number): void {
    const along = this.facesAlong(a, b, [])
    for (const f of along) {
      this.faceAlive[f] = 0
      this.liveFaces--
      for (let k = 0; k < 3; k++) {
        const v = this.faceVerts[f * 3 + k]
        this.incident[v].delete(f)
        this.faceVerts[f * 3 + k] = -1
      }
    }
    for (const f of this.incident[b]) {
      for (let k = 0; k < 3; k++) {
        if (this.faceVerts[f * 3 + k] === b) this.faceVerts[f * 3 + k] = a
      }
      this.incident[a].add(f)
    }
    this.incident[b].clear()
    this.vertexAlive[b] = 0
    this.mergedInto[b] = a
    this.liveVertices--
  }

  /** V - E + F, which is 2 for anything that is still a sphere. */
  eulerCharacteristic(): number {
    const edges = new Set<number>()
    for (let f = 0; f < this.faceCount; f++) {
      if (!this.faceAlive[f]) continue
      for (let k = 0; k < 3; k++) {
        const x = this.faceVerts[f * 3 + k]
        const y = this.faceVerts[f * 3 + ((k + 1) % 3)]
        edges.add(Math.min(x, y) * this.vertexCount + Math.max(x, y))
      }
    }
    return this.liveVertices - edges.size + this.liveFaces
  }
}

/**
 * Close up every triangle whose crust has not been made yet.
 *
 * Only an edge with dead triangles on both sides may go: collapsing one that
 * still has live crust along it would delete rock that exists. That leaves a
 * rim of dead triangles one wide against the surviving crust, which is the
 * front the ocean is closing along and which disappears at the next step as its
 * neighbours die in turn.
 *
 * Youngest first, so a ridge zips shut from its axis outwards the way it opened
 * from its axis outwards.
 */
export function collapseVanished(
  mesh: DynamicMesh,
  faceAge: Float32Array,
  pos: Float64Array,
  timeMa: number,
): CollapseResult {
  const ringA = new Set<number>()
  const ringB = new Set<number>()
  const along: number[] = []
  let collapsed = 0
  let refused = 0

  for (let pass = 0; pass < 12; pass++) {
    // Every edge with dead crust on both sides, youngest crust first.
    const candidates: { a: number; b: number; age: number }[] = []
    const seen = new Set<number>()
    for (let f = 0; f < mesh.faceCount; f++) {
      if (!mesh.faceAlive[f] || faceAge[f] >= timeMa) continue
      for (let k = 0; k < 3; k++) {
        const x = mesh.faceVerts[f * 3 + k]
        const y = mesh.faceVerts[f * 3 + ((k + 1) % 3)]
        const key = Math.min(x, y) * mesh.vertexCount + Math.max(x, y)
        if (seen.has(key)) continue
        seen.add(key)
        mesh.facesAlong(x, y, along)
        if (along.length !== 2) continue
        if (faceAge[along[0]] >= timeMa || faceAge[along[1]] >= timeMa) continue
        candidates.push({ a: x, b: y, age: Math.max(faceAge[along[0]], faceAge[along[1]]) })
      }
    }
    if (!candidates.length) break
    candidates.sort((p, q) => p.age - q.age)

    let did = 0
    for (const { a, b } of candidates) {
      if (!mesh.vertexAlive[a] || !mesh.vertexAlive[b]) continue
      // Deadness has to be asked again here, not just when the candidate was
      // found: every collapse changes which triangles lie along the edges still
      // waiting their turn, and one of them may by now be live crust.
      mesh.facesAlong(a, b, along)
      if (along.length !== 2) continue
      if (faceAge[along[0]] >= timeMa || faceAge[along[1]] >= timeMa) continue
      // Keep whichever end has fewer neighbours, so the merged point does not
      // become a hub.
      const [keep, drop] = mesh.facesAt(a).size <= mesh.facesAt(b).size ? [a, b] : [b, a]
      if (!mesh.canCollapse(keep, drop, ringA, ringB, pos)) {
        refused++
        continue
      }
      // The two sides meet in the middle, which is where the crust between them
      // erupted.
      for (let c = 0; c < 3; c++) {
        pos[keep * 3 + c] = (pos[keep * 3 + c] + pos[drop * 3 + c]) * 0.5
      }
      mesh.collapse(keep, drop)
      collapsed++
      did++
    }
    if (!did) break
  }
  return { collapsed, refused }
}

/** A triangle's roundness, for sorting the worst to the front. */
function worstAngle(mesh: DynamicMesh, pos: Float64Array, f: number): number {
  const p = (k: number) => {
    const v = mesh.faceVerts[f * 3 + k] * 3
    return [pos[v], pos[v + 1], pos[v + 2]]
  }
  return quality(p(0), p(1), p(2))
}

function outward(a: number[], b: number[], c: number[]): boolean {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  return nx * a[0] + ny * a[1] + nz * a[2] > 0
}

/**
 * How round a triangle is: one for equilateral, towards zero as it is drawn out
 * into a needle. Four root three times the area over the sum of the squared
 * sides, which is the usual measure and, unlike the smallest angle, needs no
 * trigonometry -- this is called for every candidate edge on every pass over
 * eighty thousand triangles, two hundred times, and three arc-cosines a call
 * was enough to stop the run finishing.
 */
function quality(a: number[], b: number[], c: number[]): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const twiceArea = Math.hypot(nx, ny, nz)
  const wx = c[0] - b[0], wy = c[1] - b[1], wz = c[2] - b[2]
  const sides =
    ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz + wx * wx + wy * wy + wz * wz
  return sides > 0 ? (2 * Math.sqrt(3) * twiceArea) / sides : 0
}

/**
 * Redraw the edges the motion has ruined.
 *
 * Sliding a piece of crust a long way past its neighbours leaves triangles
 * stretched into slivers, and a sliver is one nudge away from turning inside
 * out. Where redrawing the diagonal of a pair makes them rounder, redraw it.
 * The crust is unchanged; only which piece is recorded as touching which.
 */
export function retriangulate(
  mesh: DynamicMesh,
  pos: Float64Array,
  restEdge: Float64Array,
  passes: number,
  /** Crustal strength per triangle, and the strength above which nothing gives. */
  strength?: Float32Array,
  breaksBelow = 1,
): number {
  const along: number[] = []
  const ring = new Set<number>()
  let flipped = 0
  for (let pass = 0; pass < passes; pass++) {
    let did = 0
    // Worst first. Sweeping in face order spends the pass on triangles that
    // were nearly fine and leaves the needles for a pass that never comes.
    const order: number[] = []
    for (let f = 0; f < mesh.faceCount; f++) if (mesh.faceAlive[f]) order.push(f)
    order.sort((x, y) => worstAngle(mesh, pos, x) - worstAngle(mesh, pos, y))
    for (const f of order) {
      if (!mesh.faceAlive[f]) continue
      for (let k = 0; k < 3; k++) {
        const a = mesh.faceVerts[f * 3 + k]
        const b = mesh.faceVerts[f * 3 + ((k + 1) % 3)]
        if (a < 0 || b < 0) continue
        const found = mesh.canFlip(a, b, pos, along, ring)
        if (!found) continue
        // A flip is a fault: two pieces of rock that were not touching come
        // into contact and the edge between them is born at whatever length it
        // finds, which forgets everything that was ever asked of it. Through
        // the middle of a shield that is not a fault, it is the model quietly
        // giving itself permission to deform a craton for free -- and it did,
        // until this line: the continents stopped travelling because the mesh
        // was absorbing the motion instead of passing it on.
        if (strength && Math.max(strength[found[2]], strength[found[3]]) >= breaksBelow) continue
        mesh.flip(a, b, found[0], found[1], found[2], found[3], restEdge, pos)
        flipped++
        did++
        break
      }
    }
    if (!did) break
  }
  return flipped
}
