/**
 * Crust that has not been made yet goes back into the mantle, not out of
 * existence.
 *
 * Running the Earth backwards, every step reaches a moment before some piece of
 * sea floor erupted. Until now the model dealt with that by deleting it: an
 * edge with un-erupted crust on both sides was collapsed, its two ends merged
 * into one, and the triangle between them ceased to be. That is a legitimate
 * way to shrink a sphere and it paid for itself in trouble:
 *
 * - 46,408 collapses a run were refused, because collapsing them would have
 *   torn the surface, so the dead crust stayed on the shell and held the ocean
 *   open. That is the "empty triangles" visible at 200 Ma.
 * - 164,175 edges were flipped to keep the survivors from becoming needles, and
 *   a flip hands its new edge whatever length it finds. Three quarters of all
 *   the residual stretch along the traced fracture zones happened on ground a
 *   flip had just redrawn.
 * - A collapse renames a triangle's corners, so by 120 Ma 21.5% of the shell
 *   was being painted from crust more than 300 km away, and 43% of the track
 *   points and 55% of the conjugate pair ends were stored in triangles that had
 *   come apart -- the two things the model is scored on.
 *
 * None of that is the hypothesis. On an expanding Earth new crust arrives from
 * below, so run backwards it should return below: the ridge does not zip shut,
 * it swallows. This file does that instead. The triangle stays in the mesh, its
 * corners keep their names, nothing is renamed and nothing is refused; the
 * un-erupted crust is simply pulled down inside the shell, where -- as the
 * hypothesis has it and as the user put it -- it counts for no force at all and
 * may be crumpled.
 *
 * **How far down.** A vertex hangs by however much crust lies between it and
 * the nearest crust that exists at this moment, measured through the mesh along
 * present-day rest lengths. So the curtain is as long as the sea floor it is
 * made of, which is the only length it could honestly be.
 *
 * **What still closes the ocean.** A dead triangle deep inside the shell is
 * crumpled and carries no force -- there is nothing there to carry one. But a
 * dead triangle at the top of the curtain has two of its corners still on the
 * surface, one either side of the ridge, and what it says about them is not
 * nothing: the crust between them does not exist yet, so they belong in the
 * same place. That is the closure. The collapse used to make it happen by
 * merging the two points; here the same triangle asks for the same thing as a
 * spring of rest length zero, and gets it or does not depending on what the
 * crust around it can bear. The two flanks come together, the surplus goes
 * down, and nothing is deleted.
 *
 * It is also why "no force at all" cannot be the whole rule. Run with the dead
 * crust simply switched out of every spring, the ridge never shuts: over 20 Myr
 * the surviving crust covered 95.7% of the sphere it was supposed to tile and
 * the continents barely moved, because a uniform shrink moves the flanks and
 * the gap between them by the same factor and closes nothing.
 *
 * **The lip.** The crust either side of a closing ridge does not have to stay
 * flat on the shell while the gap between it shuts. If it may tip down into the
 * slot as it comes together -- which is what a real convergence looks like, and
 * what the user drew -- then nothing has to be squashed: the triangles rotate
 * instead of deforming. Pinned hard to the sphere they have no such freedom,
 * and the closure has to come out of their own length. So the pull back onto
 * the shell is released near the rim and full strength away from it, and it
 * stays one-sided everywhere: crust may dip below the shell, because there is
 * somewhere for it to go, and may never sit above it, because there is nothing
 * holding it up there.
 *
 * **Where that stops working.** The curtain has to fit inside the Earth and
 * eventually cannot. Taking today's 60,000 km of ridge, the crust that has not
 * formed yet needs a curtain 542 km deep at 10 Ma, 2,844 at 60, and 4,496 at
 * 120 Ma against a radius of 4,373 -- past roughly 100 Ma there is not enough
 * Earth to hang it in. So the depth is compressed towards the centre,
 *
 *     radius = R * exp(-depth / R)
 *
 * which is exactly the hanging length for a shallow curtain (the slope at zero
 * is one), asymptotes to the centre instead of reaching it, and turns the
 * excess into crumpling rather than into an error. That crumple self-intersects
 * and is allowed to: it is inside the Earth, it carries no force, and no
 * measurement in this model reads it.
 *
 * **This is off by default.** Measured against the collapse on the held-out
 * conjugate pairs it is better out to 20 Ma (159 km against 169) and a fifth to
 * a half worse from 40 on (238 against 187, 274 against 228 at 60), because a
 * collapse removes a degree of freedom and a spring can be argued with: a ridge
 * shuts while the plate behind it stays put. The full table, and what would have
 * to change, is in MODEL.md under "Swallowing the crust instead of deleting it".
 */


import type { DynamicMesh } from './dynamic-mesh.js'

export interface FoldResult {
  /** Vertices pulled below the shell. */
  sunk: number
  /** The deepest of them, km below the shell. */
  deepestKm: number
  /**
   * The deepest one's hanging length, km -- what it would be without the
   * compression. The gap between this and `deepestKm` is the crumple.
   */
  hangingKm: number
}

export interface FoldScratch {
  /** Crust km from each vertex to the nearest crust that exists, -1 unreached. */
  depth: Float64Array
  /** Whether each vertex is on the shell, i.e. touches crust that exists. */
  onShell: Uint8Array
  /** What radius each point off the shell is being pulled to, km. */
  target: Float64Array
  /**
   * How hard each point on the shell is held out at the shell's radius: one
   * away from any closing ridge, nought at the lip of one. See **The lip**.
   */
  hold: Float64Array
  /**
   * Which point on the surface each sunk point hangs from, or -1.
   *
   * The nearest one through the crust, which is the fold line it went over.
   * Without this the curtain only knows how *deep* it belongs and keeps
   * whatever sideways position the shrink left it with, so it slopes away from
   * the ridge at about forty-five degrees instead of turning down at it. With
   * it the curtain hangs straight below the line it folded at, and the fold at
   * the surface is a right angle.
   */
  root: Int32Array
}

export function newFoldScratch(vertexCount: number): FoldScratch {
  return {
    depth: new Float64Array(vertexCount),
    onShell: new Uint8Array(vertexCount),
    target: new Float64Array(vertexCount),
    hold: new Float64Array(vertexCount),
    root: new Int32Array(vertexCount).fill(-1),
  }
}

/**
 * Mark which faces are crust at `timeMa`, and which vertices touch some.
 *
 * `crustHere` is what everything else in the solver should use in place of
 * `faceAlive`: a face whose crust has not erupted is still in the mesh, still
 * drawn, and must be in no spring, no fold guard, no island and no area.
 */
export function markCrust(
  mesh: DynamicMesh,
  faceAge: Float32Array,
  timeMa: number,
  /** 1 where the triangle's crust exists at `timeMa`. */
  crustHere: Uint8Array,
  /**
   * 1 where it does not and the triangle still has a corner on the surface.
   *
   * These are the top of the curtain: the triangles whose job is to bring the
   * two flanks of a ridge into the same place, because the crust that used to
   * be between them is not there yet.
   */
  closing: Uint8Array,
  scratch: FoldScratch,
  /**
   * Ask the whole curtain to shut, not only its rim.
   *
   * The rim alone is the reading the user gave -- a triangle inside the Earth
   * counts for no force -- and it closes a ridge locally without moving the
   * plate behind it: the crust beside the ridge is crushed instead. The whole
   * curtain contracting is the same statement made at the scale of the ocean
   * that has gone, and it is what a collapse used to do by removing the points
   * outright. Measured both ways; see MODEL.md.
   */
  whole = false,
): void {
  const { onShell } = scratch
  onShell.fill(0)
  for (let f = 0; f < mesh.faceCount; f++) {
    if (!mesh.faceAlive[f] || faceAge[f] < timeMa) { crustHere[f] = 0; continue }
    crustHere[f] = 1
    for (let k = 0; k < 3; k++) onShell[mesh.faceVerts[f * 3 + k]] = 1
  }
  for (let f = 0; f < mesh.faceCount; f++) {
    closing[f] = 0
    if (crustHere[f] || !mesh.faceAlive[f]) continue
    if (whole) { closing[f] = 1; continue }
    for (let k = 0; k < 3; k++) {
      if (onShell[mesh.faceVerts[f * 3 + k]]) { closing[f] = 1; break }
    }
  }
}

/**
 * Work out how far below the shell each un-erupted point belongs.
 *
 * Call `markCrust` first; this reads its `onShell`. Once a step, because it
 * walks the whole mesh; the pull itself (`pullInward`) is a radial constraint
 * and runs every sweep beside `relaxToSphere`, or the closing rim would haul
 * the top of the curtain straight back out to the surface.
 *
 */
export function measureFold(
  mesh: DynamicMesh,
  restEdge: Float64Array,
  crustHere: Uint8Array,
  closing: Uint8Array,
  vertexCount: number,
  /** The shell's radius at this step, km. */
  r: number,
  /**
   * How far back from a closing ridge the crust is free to tip into the slot,
   * km of crust. See **The lip**.
   */
  lipKm: number,
  scratch: FoldScratch,
): FoldResult {
  const { depth, onShell, target, hold, root } = scratch
  depth.fill(-1)
  root.fill(-1)
  const queue: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v] || !onShell[v]) continue
    depth[v] = 0
    root[v] = v
    queue.push(v)
  }
  // Dijkstra would be the exact answer and a heap of forty thousand entries the
  // price. This is the plain queue, re-visiting a vertex whenever a shorter way
  // to it turns up, which on a mesh whose edges are all within a few percent of
  // each other settles after a handful of extra rounds.
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]
    // Read fresh, not as enqueued: a vertex queued twice does its second visit
    // with whatever the shorter answer turned out to be.
    const here = depth[v]
    for (const f of mesh.facesAt(v)) {
      if (!mesh.faceAlive[f]) continue
      // Only through crust that is not there yet: a face that exists has all
      // three corners on the shell, so it can carry nothing.
      if (crustHere[f]) continue
      let k = -1
      for (let c = 0; c < 3; c++) if (mesh.faceVerts[f * 3 + c] === v) { k = c; break }
      if (k < 0) continue
      for (const step of [1, 2]) {
        const w = mesh.faceVerts[f * 3 + ((k + step) % 3)]
        if (w < 0 || !mesh.vertexAlive[w] || onShell[w]) continue
        // restEdge[f*3 + c] is the edge from corner c to corner c+1.
        const rest = step === 1 ? restEdge[f * 3 + k] : restEdge[f * 3 + ((k + 2) % 3)]
        const through = here + rest
        if (depth[w] >= 0 && depth[w] <= through) continue
        depth[w] = through
        root[w] = root[v]
        queue.push(w)
      }
    }
  }

  let sunk = 0
  let deepestKm = 0
  let hangingKm = 0
  for (let v = 0; v < vertexCount; v++) {
    target[v] = r
    if (!mesh.vertexAlive[v] || onShell[v]) continue
    // Crust cut off from every living shore -- a whole ocean gone at once, with
    // no rim to hang from. It goes as deep as the compression allows.
    const hang = depth[v] < 0 ? 8 * r : depth[v]
    const to = r * Math.exp(-hang / r)
    target[v] = to
    sunk++
    if (r - to > deepestKm) deepestKm = r - to
    if (hang > hangingKm) hangingKm = hang
  }
  // And back the other way: how far each piece of surviving crust is from the
  // nearest ridge that is shutting, walked through the crust that exists. The
  // same queue, the same rest lengths, the other set of faces.
  hold.fill(lipKm)
  const lipQueue: number[] = []
  for (let f = 0; f < mesh.faceCount; f++) {
    if (!closing[f]) continue
    for (let k = 0; k < 3; k++) {
      const v = mesh.faceVerts[f * 3 + k]
      if (v < 0 || !onShell[v] || hold[v] === 0) continue
      hold[v] = 0
      lipQueue.push(v)
    }
  }
  for (let head = 0; head < lipQueue.length; head++) {
    const v = lipQueue[head]
    const here = hold[v]
    if (here >= lipKm) continue
    for (const f of mesh.facesAt(v)) {
      if (!crustHere[f]) continue
      let k = -1
      for (let c = 0; c < 3; c++) if (mesh.faceVerts[f * 3 + c] === v) { k = c; break }
      if (k < 0) continue
      for (const step of [1, 2]) {
        const w = mesh.faceVerts[f * 3 + ((k + step) % 3)]
        if (w < 0 || !mesh.vertexAlive[w]) continue
        const rest = step === 1 ? restEdge[f * 3 + k] : restEdge[f * 3 + ((k + 2) % 3)]
        const through = here + rest
        if (hold[w] <= through) continue
        hold[w] = through
        lipQueue.push(w)
      }
    }
  }
  for (let v = 0; v < vertexCount; v++) hold[v] = lipKm > 0 ? Math.min(1, hold[v] / lipKm) : 1

  return { sunk, deepestKm, hangingKm }
}

/**
 * Hang every point that is not on the shell below the fold line it went over.
 *
 * The target is the direction of its root -- the nearest point still on the
 * surface -- at its own hanging depth, so the curtain is a vertical sheet under
 * the ridge that swallowed it and the crust turns down at a right angle instead
 * of sloping away. Read live rather than stored, because the root moves: the
 * flanks are closing while this runs, and the curtain is meant to follow them.
 *
 * One-sided in depth: a point the crumple has already carried deeper than its
 * hanging length is not lifted back up.
 */
export function pullInward(
  pos: Float64Array,
  vertexCount: number,
  scratch: FoldScratch,
  stiffness: number,
  /**
   * How far below the surface, in km of crust, a point is held directly under
   * the line it folded over. Nought pins nothing; Infinity pins the whole
   * curtain.
   *
   * Only the top of the curtain needs it, and pinning more than the top is what
   * kept the gaps open. The right angle at the surface is a property of the
   * *first* ring of sunk crust: hold that under its own shore and the fold is
   * sharp. Hold all of it and the curtain becomes kinematics rather than rock
   * -- every sunk point's position is dictated by the nearest shore, the
   * springs that ask the vanished ocean to shut have their answer overwritten
   * at the end of every step, and the curtain spans the open ocean for as long
   * as the ocean is open. Measured with the flips off: pinning everything left
   * 28.75% of the sphere bare at 200 Ma against 20.23% for pinning nothing, and
   * the share under an unshut ridge 48.08% against 22.46%.
   *
   * Below the pin the depth alone is applied and the crust is free to be
   * crumpled anywhere, which is what a reader asked for in the first place:
   * *als een driehoek binnen de aarde zit, telt hij voor de alle kracht
   * berekening niet meer mee en mag het opgepropt worden.*
   */
  underTheFoldKm = Infinity,
  /**
   * How much of the pin the shore feels back, 0 to 1.
   *
   * Newton's third law, and without it the pin is a leak. Holding the top of
   * the curtain under its own shore is a constraint between two pieces of rock,
   * but it was being applied to one of them: the sunk point was moved and the
   * shore was left where it was, as though the shore had infinite mass. So
   * every sweep the curtain's own contraction -- the springs asking the
   * vanished ocean to shut -- was written into the sunk points and then thrown
   * away by the pin, and none of it ever reached the crust that had to move.
   *
   * A reader watching the gaps stay open guessed exactly this: *extra
   * horizontale kracht toekennen aan vertices met 90 graden.* This is where it
   * belongs. Each shore point is pushed by the mean of what its own hanging
   * crust is pulling at, so a shore with a wide curtain under it feels no more
   * than one with a narrow one -- otherwise the Pacific would drag its own
   * margins about by sheer weight of numbers.
   */
  shoreShare = 0,
  /** Scratch for the shore pushes: 3 numbers and a count per vertex. */
  shorePush?: Float64Array,
  shoreCount?: Float64Array,
): void {
  const { onShell, target, root, depth } = scratch
  const sharing = shoreShare > 0 && shorePush !== undefined && shoreCount !== undefined
  if (sharing) { shorePush!.fill(0); shoreCount!.fill(0) }
  for (let v = 0; v < vertexCount; v++) {
    if (onShell[v]) continue
    const i = v * 3
    const length = Math.hypot(pos[i], pos[i + 1], pos[i + 2])
    if (length < 1e-9) continue
    const at = depth[v] >= 0 && depth[v] <= underTheFoldKm ? root[v] : -1
    const deep = Math.min(length, target[v])
    if (at < 0) {
      // No shore to hang from: straight down, as before.
      const s = 1 + stiffness * (deep / length - 1)
      pos[i] *= s; pos[i + 1] *= s; pos[i + 2] *= s
      continue
    }
    const j = at * 3
    const rl = Math.hypot(pos[j], pos[j + 1], pos[j + 2]) || 1
    const ux = pos[j] / rl, uy = pos[j + 1] / rl, uz = pos[j + 2] / rl
    if (sharing) {
      // Which way this hanging point is asking its shore to move, as a
      // direction on the sphere. Collected now, applied once each below.
      shorePush![at * 3] += pos[i] / length - ux
      shorePush![at * 3 + 1] += pos[i + 1] / length - uy
      shorePush![at * 3 + 2] += pos[i + 2] / length - uz
      shoreCount![at]++
    }
    pos[i] += stiffness * (ux * deep - pos[i])
    pos[i + 1] += stiffness * (uy * deep - pos[i + 1])
    pos[i + 2] += stiffness * (uz * deep - pos[i + 2])
  }
  if (!sharing) return
  for (let v = 0; v < vertexCount; v++) {
    const n = shoreCount![v]
    if (!n) continue
    const i = v * 3
    const length = Math.hypot(pos[i], pos[i + 1], pos[i + 2])
    if (length < 1e-9) continue
    const w = (shoreShare * stiffness) / n
    let nx = pos[i] / length + w * shorePush![i]
    let ny = pos[i + 1] / length + w * shorePush![i + 1]
    let nz = pos[i + 2] / length + w * shorePush![i + 2]
    const nl = Math.hypot(nx, ny, nz)
    if (nl < 1e-9) continue
    nx /= nl; ny /= nl; nz /= nl
    // Along the sphere only: the shore's radius is the shell's business.
    pos[i] = nx * length; pos[i + 1] = ny * length; pos[i + 2] = nz * length
  }
}

/**
 * How sharp the fold is, and whether the surface has sagged.
 *
 * Two numbers a reader asked for by name: the crust should turn down at a right
 * angle where it folds, and the surface should not dish in around it.
 *
 * `tiltDeg` is the median angle between the shell's own radial direction and
 * the edges that cross the fold line -- from a point on the surface to a point
 * hanging below it. Nought is a perfect right-angle fold, straight down;
 * ninety is crust lying flat and not folding at all.
 *
 * `pitKm` is how far the deepest point *still on the surface* has dropped below
 * the shell's radius, and `pitShare` how many of them are more than a tenth of
 * a mesh spacing down. Both should be near nothing: a surface point that has
 * sunk is a dent in the sea floor that no data asked for.
 */
export function foldShape(
  pos: Float64Array,
  mesh: DynamicMesh,
  vertexCount: number,
  r: number,
  scratch: FoldScratch,
): { tiltDeg: number; pitKm: number; pitShare: number } {
  const { onShell } = scratch
  const tilts: number[] = []
  const seen = new Set<number>()
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v] || !onShell[v]) continue
    const i = v * 3
    const rl = Math.hypot(pos[i], pos[i + 1], pos[i + 2]) || 1
    for (const f of mesh.facesAt(v)) {
      if (!mesh.faceAlive[f]) continue
      for (let k = 0; k < 3; k++) {
        const w = mesh.faceVerts[f * 3 + k]
        if (w < 0 || w === v || onShell[w] || !mesh.vertexAlive[w]) continue
        const key = Math.min(v, w) * vertexCount + Math.max(v, w)
        if (seen.has(key)) continue
        seen.add(key)
        const j = w * 3
        const dx = pos[j] - pos[i], dy = pos[j + 1] - pos[i + 1], dz = pos[j + 2] - pos[i + 2]
        const dl = Math.hypot(dx, dy, dz)
        if (dl < 1e-9) continue
        // The edge against the inward radial. Straight down is nought degrees.
        const dot = -(dx * pos[i] + dy * pos[i + 1] + dz * pos[i + 2]) / (dl * rl)
        tilts.push((Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI)
      }
    }
  }
  tilts.sort((a, b) => a - b)
  let pitKm = 0
  let pits = 0
  let surface = 0
  for (let v = 0; v < vertexCount; v++) {
    if (!mesh.vertexAlive[v] || !onShell[v]) continue
    surface++
    const i = v * 3
    const down = r - Math.hypot(pos[i], pos[i + 1], pos[i + 2])
    if (down > pitKm) pitKm = down
    if (down > 13) pits++
  }
  return {
    tiltDeg: tilts.length ? tilts[tilts.length >> 1] : NaN,
    pitKm,
    pitShare: surface ? pits / surface : 0,
  }
}

/**
 * How deep each point ended up, for the viewer: 255 at the shell's radius, 0 at
 * the centre.
 *
 * Read off the finished positions rather than off the targets, because two
 * different things put a point below the shell and the picture wants both: the
 * curtain of un-erupted crust hanging under a ridge, and the crust either side
 * of it tipping into the slot as the ridge shuts. The frames carry unit
 * directions and nothing else, so without this both are drawn flat on the
 * sphere -- which is the one picture that is not true.
 */
export function readSink(
  pos: Float64Array,
  vertexCount: number,
  r: number,
  sink: Uint8Array,
): void {
  for (let v = 0; v < vertexCount; v++) {
    const at = Math.hypot(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
    sink[v] = Math.max(0, Math.min(255, Math.round((at / r) * 255)))
  }
}
