/**
 * Grooves in the crustal fabric, found by the rule a reader uses to find them.
 *
 * The reader who can tell a good conjugate pair from a bad one said how they do
 * it: *in the crustal fabric you can identify grooves as light bands with a
 * dark blue centre line.* That is a rule about a profile, and the existing
 * fracture-zone detector does not use it. It scores how line-like a
 * neighbourhood is, which is highest on a groove's two flanks and lowest along
 * the very line the reader traces, and which cannot separate a groove from a
 * one-sided scarp or from abyssal-hill corrugation at all.
 *
 * The rule has a reason. The fabric is the size of the gravity gradient's own
 * gradient, so it is small wherever the field turns round. A fracture zone is a
 * trough: steep on both walls, flat along the floor. Bright, dark, bright,
 * measured across the line -- and nothing else in the sea floor has that shape.
 * A scarp is bright then dark once. Abyssal hills are bright and dark in stripes
 * with no wall, and they run across the travelled direction, not along it.
 *
 * So: at every cell, try every direction, and ask how well the profile across
 * that direction reads bright-dark-bright when averaged along it. Keep the best
 * direction, suppress everything that is not a local darkest point across its
 * own line, and walk what is left into curves.
 *
 * This works on the published fabric raster rather than on the gravity grid, on
 * purpose. It is the picture the reader judged, so a groove they can see is a
 * groove this can be asked about, and the loop takes seconds rather than a
 * build.
 */

import { apartKm, axisDiff, axisMedian } from './bearing.js'

const RAD = Math.PI / 180
const EARTH_KM = 6371
const KM_PER_DEG = (Math.PI * EARTH_KM) / 180

export interface Fabric {
  width: number
  height: number
  /** Encoded roughness, 1..255, or 0 where the survey has nothing. */
  at: (column: number, row: number) => number
}

export interface GrooveOptions {
  /** How far along the line the profile is averaged when scoring, km. */
  alongKm?: number
  /** How far along it is averaged when only the direction is wanted, km. */
  scoutKm?: number
  /** How far apart the samples along the line are, km. */
  alongStepKm?: number
  /**
   * How long a stretch is -- the length over which the shape has to hold at
   * once, km.
   *
   * With `alongKm`, this is what decides how long a groove has to be to be
   * seen at all, and it turned out to matter far more than any threshold: the
   * run has to fit `minStretches` stretches, so 240 over 60 could only see a
   * groove clear for the better part of two hundred kilometres, and the reader
   * kept pointing at shorter ones that are perfectly plain to the eye.
   */
  stretchKm?: number
  /** How far out the walls are looked for, km. Tried in turn; the best wins. */
  wallsKm?: number[]
  /** How much darker the floor has to be than the darker wall, in ramp steps. */
  minContrast?: number
  /** Where a walk lets go of a groove, in ramp steps. Below minContrast. */
  holdContrast?: number
  /** How many poor steps running a walk will bridge before it gives up. */
  bridgeSteps?: number
  /**
   * Which quantile of the scouting score is worth measuring properly.
   *
   * Low, because the scout is a sixty-kilometre run and is meant to be noisy:
   * it is there to point the real measurement in the right direction, and a
   * bar high enough to be selective throws away grooves the long run would
   * have found. Selectivity belongs in `minContrast`, where it is measured.
   */
  scoutQuantile?: number
  /** How bright the darker wall has to be, in ramp steps, so flat crust is not a groove. */
  minWall?: number
  /** How far the walk steps, km. */
  stepKm?: number
  /** How far a walk may look sideways for the line, km. */
  driftKm?: number
  /** How sharply a groove may turn, degrees per step. */
  turnDeg?: number
  /** Shortest curve worth reporting, km. */
  minLengthKm?: number
  /** How long a gap between two segments may be for them to be one groove, km. */
  maxGapKm?: number
  /** How far two segments and the gap between them may disagree, degrees. */
  linkDeg?: number
  /** How long a gap may be, as a multiple of the shorter segment it joins. */
  gapReach?: number
  /** How near an across-grain line a bridge may pass, km. */
  clearKm?: number
  /**
   * Cells not worth measuring, by their place in the fabric's grid.
   *
   * For the whole globe rather than a window this is most of the saving there
   * is, and it costs nothing real: continental crust did not come out of a
   * ridge, so a line found on it is not a flow line and would be dropped
   * afterwards anyway. Paying to find it first is the only waste.
   */
  skip?: (column: number, row: number) => boolean
}

export interface GrooveField {
  /** The window in the fabric's own cells. */
  x0: number
  y0: number
  width: number
  height: number
  /** The weakest stretch of the run through here, in ramp steps. */
  score: Float32Array
  /** Which way the line runs, degrees east of north, folded onto 0..180. */
  axis: Float32Array
  /** Which wall spacing won, km -- the groove's half-width. */
  walls: Float32Array
  /** The score with everything that is not darkest across its own line removed. */
  ridge: Float32Array
}

export interface GroovePoint {
  lon: number
  lat: number
  /**
   * Whether the groove was actually read here, or only carried through.
   *
   * The reader: *sometimes the trough fades or you cannot see it at all, but
   * you could extrapolate the line.* So a groove may be reported through crust
   * where it was not measured -- and everything that treats a groove as
   * evidence has to be able to tell the two apart, or the extrapolation
   * becomes evidence for itself.
   */
  measured: boolean
}

export interface Groove {
  /** The centre line, in order, as longitude and latitude. */
  points: GroovePoint[]
  lengthKm: number
  /** Mean of the walk's own weakest-stretch scores along it, in ramp steps. */
  score: number
}

/** A cell's height and width in km, the width shrinking with the cosine. */
function cellSize(fabric: Fabric, row: number) {
  const lat = 90 - ((row + 0.5) / fabric.height) * 180
  return {
    lat,
    heightKm: (180 / fabric.height) * KM_PER_DEG,
    widthKm: Math.max(0.01, (360 / fabric.width) * KM_PER_DEG * Math.cos(lat * RAD)),
  }
}

/**
 * How well the fabric reads bright-dark-bright across `axis`, stretch by stretch.
 *
 * The profile is measured every few kilometres along a long straight run and
 * the results are gathered into stretches of sixty kilometres, because the
 * score that matters is not how strong the shape is anywhere but how weak it
 * gets somewhere. Amplitude alone finds the wrong things: the highest-contrast
 * bright-dark-bright profiles in the South Atlantic belong to seamounts, whose
 * rings are bright and whose middles are dark, and whose contrast is a hundred
 * at the centre and minus fifty a hundred and fifty kilometres along. A groove
 * is a line. Its weakest stretch is still a groove.
 *
 * Unsurveyed crust costs the sample it falls on and nothing more. Poisoning the
 * whole stretch instead, which is what this did first, looks careful and is
 * ruinous: only 2.7% of cells in the South Atlantic window are unsurveyed, but
 * a stretch is eighteen reads, so two stretches in five contained one, and 45%
 * of the window could not be measured at all. A stretch needs half its samples;
 * a run needs `minStretches` of its stretches.
 */
const STRETCH_KM = 40
const MIN_STRETCHES = 3

function profile(
  fabric: Fabric, column: number, row: number, axis: number, wallKm: number,
  alongKm: number, alongStepKm: number, stretchKm: number,
  read: (c: number, r: number) => number,
  /**
   * How many stretches must survive. Three for a measurement; one for the
   * scout, whose run is one stretch long and which only wants the mean.
   */
  minStretches = MIN_STRETCHES,
): { weakest: number; mean: number; wall: number } {
  const { heightKm, widthKm } = cellSize(fabric, row)
  const sin = Math.sin(axis * RAD)
  const cos = Math.cos(axis * RAD)
  // A kilometre along the line, and a kilometre across it, in cells.
  const alongC = sin / widthKm
  const alongR = -cos / heightKm
  const acrossC = cos / widthKm
  const acrossR = sin / heightKm

  const steps = Math.max(1, Math.round(alongKm / (2 * alongStepKm)))
  const perStretch = Math.max(2, Math.round(stretchKm / alongStepKm))
  let weakest = Infinity
  let mean = 0
  let wall = 0
  let seen = 0
  let stretches = 0
  let inStretch = 0
  let stretchSum = 0
  let holed = 0
  for (let s = -steps; s <= steps; s++) {
    const t = s * alongStepKm
    const cc = column + alongC * t
    const cr = row + alongR * t
    const floor = read(cc, cr)
    const plus = read(cc + acrossC * wallKm, cr + acrossR * wallKm)
    const minus = read(cc - acrossC * wallKm, cr - acrossR * wallKm)
    if (!floor || !plus || !minus) {
      holed++
    } else {
      const weaker = Math.min(plus, minus)
      stretchSum += weaker - floor
      mean += weaker - floor
      wall += weaker
      seen++
      inStretch++
    }
    if (inStretch + holed >= perStretch) {
      if (inStretch * 2 >= perStretch) {
        weakest = Math.min(weakest, stretchSum / inStretch)
        stretches++
      }
      inStretch = 0
      stretchSum = 0
      holed = 0
    }
  }
  if (stretches < minStretches || !seen) {
    return { weakest: NaN, mean: NaN, wall: NaN }
  }
  return { weakest, mean: mean / seen, wall: wall / seen }
}

/**
 * The groove field over one window of the fabric.
 *
 * Three passes, because the honest measurement is too dear to make everywhere.
 * A short scout at every cell over a coarse fan of directions says roughly
 * which way any line here runs and whether there is anything to look at; the
 * quarter of cells that pass are then measured properly, over the long baseline
 * and a fine fan around the scout's answer; and what survives is thinned to one
 * cell across each line, because a groove is one line and every cell within a
 * wall's reach of it can otherwise claim to be one.
 */
export function grooveField(
  fabric: Fabric,
  window: { lonFrom: number; lonTo: number; latFrom: number; latTo: number },
  options: GrooveOptions = {},
): GrooveField {
  const alongKm = options.alongKm ?? 120
  const scoutKm = options.scoutKm ?? 60
  const alongStepKm = options.alongStepKm ?? 10
  const stretchKm = options.stretchKm ?? STRETCH_KM
  const wallsKm = options.wallsKm ?? [12, 20, 30]
  const minContrast = options.minContrast ?? 6
  const minWall = options.minWall ?? 40
  const scoutQuantile = options.scoutQuantile ?? 0.2

  const x0 = Math.floor(((window.lonFrom + 180) / 360) * fabric.width)
  const y0 = Math.floor(((90 - window.latTo) / 180) * fabric.height)
  const width = Math.round(((window.lonTo - window.lonFrom) / 360) * fabric.width)
  const height = Math.round(((window.latTo - window.latFrom) / 180) * fabric.height)

  const nearest = (c: number, r: number) =>
    fabric.at(
      ((Math.round(c) % fabric.width) + fabric.width) % fabric.width,
      Math.min(fabric.height - 1, Math.max(0, Math.round(r))),
    )

  const skip = options.skip
  const score = new Float32Array(width * height)
  const axis = new Float32Array(width * height)
  const walls = new Float32Array(width * height)

  // The scout. One wall spacing and twelve directions, only to rank cells and
  // to point the real measurement in roughly the right direction.
  const scout = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y0 + y
    for (let x = 0; x < width; x++) {
      if (skip?.(x0 + x, row)) continue
      let best = -Infinity
      let bestAxis = 0
      for (let a = 0; a < 180; a += 15) {
        const { mean } = profile(
          fabric, x0 + x, row, a, wallsKm[1], scoutKm, alongStepKm, scoutKm, nearest, 1,
        )
        if (mean > best) {
          best = mean
          bestAxis = a
        }
      }
      if (!Number.isFinite(best)) continue
      scout[y * width + x] = best
      axis[y * width + x] = bestAxis
    }
  }

  const ranked = Array.from(scout).filter((v) => v > 0).sort((a, b) => a - b)
  const bar = ranked.length
    ? ranked[Math.floor(scoutQuantile * (ranked.length - 1))]
    : 0

  // The measurement. Long baseline, fine fan about the scout's direction.
  for (let y = 0; y < height; y++) {
    const row = y0 + y
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      // At or above the bar, not above it: on a synthetic fabric every groove
      // cell scouts exactly the same and a strict test throws all of them out.
      if (!(scout[i] >= bar)) continue
      let best = -Infinity
      for (let d = -12; d <= 12; d += 3) {
        const a = ((axis[i] + d) % 180 + 180) % 180
        for (const wallKm of wallsKm) {
          const at = profile(
            fabric, x0 + x, row, a, wallKm, alongKm, alongStepKm, stretchKm, nearest,
          )
          if (at.weakest > best && at.wall >= minWall) {
            best = at.weakest
            axis[i] = a
            walls[i] = wallKm
          }
        }
      }
      if (Number.isFinite(best) && best >= minContrast) score[i] = best
    }
  }

  // Thin to one cell across each line, over a wall and a half either side,
  // which is far enough out to be off the groove altogether.
  const ridge = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const here = score[i]
      if (!here) continue
      const { heightKm, widthKm } = cellSize(fabric, y0 + y)
      const cos = Math.cos(axis[i] * RAD)
      const sin = Math.sin(axis[i] * RAD)
      const reach = Math.round((1.5 * walls[i]) / heightKm)
      let top = true
      for (let step = -reach; step <= reach && top; step++) {
        if (!step) continue
        const t = step * heightKm
        const nx = Math.round(x + (cos / widthKm) * t)
        const ny = Math.round(y + (sin / heightKm) * t)
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (score[ny * width + nx] > here) top = false
      }
      if (top) ridge[i] = here
    }
  }

  return { x0, y0, width, height, score, axis, walls, ridge }
}

/**
 * Walk the surviving lines into curves.
 *
 * Started from the strongest cell left and followed both ways, re-reading the
 * direction at every step and allowed to drift a little sideways to stay on the
 * floor, because a groove bends. It may only bend slowly: the reader says a
 * flow line runs an S over thousands of kilometres and is straight over
 * hundreds, so a walk free to turn sharply is a walk free to follow noise, and
 * five degrees per twenty kilometres is the licence that says so.
 *
 * It ends where the shape gives out for three steps running, and the three is
 * there because a groove crossed by a seamount or an unsurveyed strip is still
 * one groove -- the reader said as much: the line *should be able to be carried
 * on*, since there is ocean crust either side that is disappearing, but the
 * groove is not so clear there.
 */
export function walkGrooves(
  fabric: Fabric, field: GrooveField, options: GrooveOptions = {},
): Groove[] {
  const alongKm = options.alongKm ?? 120
  const alongStepKm = options.alongStepKm ?? 10
  const stretchKm = options.stretchKm ?? STRETCH_KM
  const stepKm = options.stepKm ?? 20
  const driftKm = options.driftKm ?? 6
  const turnDeg = options.turnDeg ?? 5
  const minLengthKm = options.minLengthKm ?? 80
  /**
   * Where the walk lets go, as against where it starts.
   *
   * A groove is picked up at its clearest and followed until it is not there at
   * all, which is one threshold for two different questions: it takes a good
   * stretch to be worth starting on and only a poor one to be worth carrying
   * on along. Without the gap every groove is reported as the few hundred
   * kilometres where it happens to be clearest. Which cell is worth starting
   * on was decided by `minContrast` when the field was measured; only the
   * letting go is decided here.
   */
  const holdContrast = options.holdContrast ?? 4
  const bridgeSteps = options.bridgeSteps ?? 8

  const { x0, y0, width, height } = field
  const taken = new Uint8Array(width * height)
  const order = Array.from({ length: width * height }, (_, i) => i)
    .filter((i) => field.ridge[i] > 0)
    .sort((a, b) => field.ridge[b] - field.ridge[a])

  const read = (c: number, r: number) => fabric.at(
    ((Math.round(c) % fabric.width) + fabric.width) % fabric.width,
    Math.min(fabric.height - 1, Math.max(0, Math.round(r))),
  )
  /** Longitude and latitude of a point given in the fabric's cells. */
  const place = (c: number, r: number, measured: boolean): GroovePoint => ({
    lon: (c / fabric.width) * 360 - 180,
    lat: 90 - (r / fabric.height) * 180,
    measured,
  })

  const grooves: Groove[] = []
  for (const seed of order) {
    if (taken[seed]) continue
    const sx = x0 + (seed % width)
    const sy = y0 + Math.floor(seed / width)
    const seedAxis = field.axis[seed]
    const seedWall = field.walls[seed] || 20

    /** One direction from the seed, as cell coordinates in walking order. */
    const arm = (sign: number) => {
      const path: { c: number; r: number; score: number }[] = []
      let c = sx
      let r = sy
      let heading = seedAxis
      let missed = 0
      for (let n = 0; n < 300; n++) {
        const { heightKm, widthKm } = cellSize(fabric, r)
        // Re-read the direction here, taking the nearest turn to the heading:
        // the axis is folded onto 0..180, so a line running north-north-west is
        // stored as 170 and must not read as a 170-degree turn.
        const x = Math.round(c) - x0
        const y = Math.round(r) - y0
        let localAxis = heading
        if (x >= 0 && y >= 0 && x < width && y < height && field.score[y * width + x]) {
          const a = field.axis[y * width + x]
          localAxis = [a, a + 180, a - 180].reduce(
            (p, q) => (Math.abs(q - heading) < Math.abs(p - heading) ? q : p), a,
          )
        }
        heading += Math.max(-turnDeg, Math.min(turnDeg, localAxis - heading))
        const along = heading + (sign > 0 ? 0 : 180)
        c += (Math.sin(along * RAD) / widthKm) * stepKm
        r += (-Math.cos(along * RAD) / heightKm) * stepKm

        // Slide across the line onto the darkest floor within the drift, so a
        // bend does not walk off the groove and onto its wall.
        let bestOff = 0
        let best = -Infinity
        const cos = Math.cos(heading * RAD)
        const sin = Math.sin(heading * RAD)
        for (let offset = -driftKm; offset <= driftKm; offset += 2) {
          const oc = c + (cos / widthKm) * offset
          const or = r + (sin / heightKm) * offset
          const ox = Math.round(oc) - x0
          const oy = Math.round(or) - y0
          const wallKm = ox >= 0 && oy >= 0 && ox < width && oy < height && field.walls[oy * width + ox]
            ? field.walls[oy * width + ox] : seedWall
          const { weakest } = profile(
            fabric, oc, or, ((heading % 180) + 180) % 180, wallKm, alongKm, alongStepKm,
            stretchKm, read,
          )
          if (weakest > best) {
            best = weakest
            bestOff = offset
          }
        }
        // Take the sideways correction only where there is a groove to correct
        // onto. Where the shape has gone the line is carried straight on
        // instead, which is what the reader does: *the line should be able to
        // be carried on, because there is ocean crust either side that is
        // disappearing, but the groove is not so clear there.* A walk that
        // drifts through the unclear part has nothing to drift towards, and
        // ends up on whichever noise is darkest.
        const held = best >= holdContrast
        if (held) {
          c += (cos / widthKm) * bestOff
          r += (sin / heightKm) * bestOff
        }
        const x2 = Math.round(c) - x0
        const y2 = Math.round(r) - y0
        if (x2 < 0 || y2 < 0 || x2 >= width || y2 >= height) break
        if (!held) {
          missed++
          if (missed >= bridgeSteps) break
        } else {
          missed = 0
        }
        path.push({ c, r, score: held ? best : 0 })
      }
      // Drop the tail the walk only kept to bridge a gap it never crossed.
      while (path.length && path[path.length - 1].score < holdContrast) path.pop()
      return path
    }

    const back = arm(-1).reverse()
    const forward = arm(1)
    const cells = [...back, { c: sx, r: sy, score: field.ridge[seed] }, ...forward]
    // Claim a groove's whole width, or the next seed walks its wall and reports
    // the same feature again a few cells to the side. Only where the groove was
    // actually there, though: a walk carried straight through an unclear
    // stretch crosses other grooves, and claiming that stretch quietly deletes
    // whichever of them had not been walked yet.
    for (const { c, r, score: held } of cells) {
      if (!held) continue
      const x = Math.round(c) - x0
      const y = Math.round(r) - y0
      const reach = Math.round((1.5 * seedWall) / cellSize(fabric, r).heightKm)
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          taken[ny * width + nx] = 1
        }
      }
    }
    if (cells.length < 3) continue

    const points = cells.map(({ c, r, score: held }) => place(c, r, held > 0))
    let lengthKm = 0
    for (let i = 1; i < points.length; i++) {
      const dLat = (points[i].lat - points[i - 1].lat) * KM_PER_DEG
      const dLon = (points[i].lon - points[i - 1].lon) * KM_PER_DEG
        * Math.cos(((points[i].lat + points[i - 1].lat) / 2) * RAD)
      lengthKm += Math.hypot(dLat, dLon)
    }
    if (lengthKm < minLengthKm) continue
    grooves.push({
      points,
      lengthKm,
      score: cells.reduce((s, p) => s + p.score, 0) / cells.length,
    })
  }
  return grooves.sort((a, b) => b.lengthKm - a.lengthKm)
}

/**
 * Join segments that continue each other into one groove, across the gap.
 *
 * The reader, on the first picture: *the lines run right across the ridge and
 * are about equally long either side of it; sometimes the trough fades or you
 * cannot see it at all, but you could extrapolate the line.* Detection cannot
 * do that -- a stretch where the trough is not there scores nothing, whatever
 * it is a stretch of -- so it is a second step, and it is a step about
 * geometry rather than about the fabric: two segments belong to one groove
 * when each points at the other and both point along the line between them.
 *
 * Greedy, taking the closest admissible join first, so a short segment between
 * two long ones is picked up by whichever it actually continues rather than by
 * whichever is considered first. The carried-through part is interpolated and
 * marked unmeasured, because it is a claim about crust nothing was read on.
 */
export function linkGrooves(
  grooves: Groove[],
  options: GrooveOptions = {},
  /**
   * Lines running across the grain, which a bridge may not cross.
   *
   * The reader: *you do not need to show the yellow dashes between the red
   * ones.* Which is a statement about the crust, not about the drawing. Where
   * the fabric between two segments carries structure running the other way,
   * the groove is not merely faint there -- something else is going on in that
   * crust -- and carrying a line straight through it is the one kind of
   * extrapolation with positive evidence against it.
   */
  crossGrain: Groove[] = [],
): Groove[] {
  const maxGapKm = options.maxGapKm ?? 600
  const linkDeg = options.linkDeg ?? 10
  /**
   * How far a gap may be carried, as a multiple of the shorter segment it joins.
   *
   * A seven-hundred-kilometre bridge between two eighty-kilometre segments is
   * not a groove with a fade in it, whatever the angles say, and once the
   * detector was finding hundreds of segments there were enough of them lying
   * around for the angles to say it often. What a segment has earned the right
   * to claim is bounded by how much of it was actually read.
   */
  const reach = options.gapReach ?? 3
  const stepKm = options.stepKm ?? 20

  /**
   * The course from `a` to `b`, kept over the whole circle rather than folded.
   *
   * Folded to an axis, as a bearing is everywhere else here, this cannot tell
   * a segment that continues the line from one that lies back along it: both
   * read the same, and the linker happily doubled a groove back on itself and
   * reported six thousand kilometres of line in a window four thousand across.
   * A join has a direction even though a groove does not.
   */
  const course = (a: GroovePoint, b: GroovePoint) => {
    const dl = (b.lon - a.lon) * RAD
    const p1 = a.lat * RAD
    const p2 = b.lat * RAD
    const t = Math.atan2(
      Math.sin(dl) * Math.cos(p2),
      Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl),
    )
    return (((t / RAD) % 360) + 360) % 360
  }
  /** How far two courses differ, 0 to 180, keeping which way round they are. */
  const apart = (p: number, q: number) => {
    const d = Math.abs(p - q) % 360
    return d > 180 ? 360 - d : d
  }
  const away = (a: GroovePoint, b: GroovePoint) => {
    const dLat = (b.lat - a.lat) * KM_PER_DEG
    const dLon = (b.lon - a.lon) * KM_PER_DEG * Math.cos(((a.lat + b.lat) / 2) * RAD)
    return Math.hypot(dLat, dLon)
  }
  /**
   * The course a segment is travelling in at one of its ends, going forwards.
   *
   * At the far end that is the course out of the segment; at the near end it is
   * the course into it, which is the same line read the same way round.
   */
  const tangent = (points: GroovePoint[], atEnd: boolean) => {
    const n = points.length
    const reach = Math.min(n - 1, 5)
    return atEnd
      ? course(points[n - 1 - reach], points[n - 1])
      : course(points[0], points[reach])
  }
  /** Straight points across a gap, at the walk's own spacing. */
  const across = (from: GroovePoint, to: GroovePoint): GroovePoint[] => {
    const steps = Math.max(1, Math.round(away(from, to) / stepKm))
    const filled: GroovePoint[] = []
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      filled.push({
        lon: from.lon + (to.lon - from.lon) * t,
        lat: from.lat + (to.lat - from.lat) * t,
        measured: false,
      })
    }
    return filled
  }

  /**
   * Every admissible join, collected once and then taken shortest first.
   *
   * Re-scanning all the pairs after each merge is the obvious way to be greedy
   * and it is cubic in the number of segments, which stopped being affordable
   * the moment the detector started finding hundreds of them. Collecting the
   * candidates once is quadratic, and taking them shortest first with each end
   * usable once gives the same answer: a merge can only ever remove candidates
   * from consideration, never create a shorter one.
   */
  const ends = grooves.map((g) => ({
    head: g.points[0],
    tail: g.points[g.points.length - 1],
    intoHead: tangent(g.points, false),
    outOfTail: tangent(g.points, true),
  }))
  interface Join { i: number; atTailOfI: boolean; j: number; atHeadOfJ: boolean; gap: number }
  const joins: Join[] = []
  // Only segments whose ends are within reach of each other are considered.
  // Every pair of segments was, once, which is fine for the hundreds in one
  // window and not for the tens of thousands over a globe.
  const SIZE = Math.max(1, Math.ceil(maxGapKm / 100))
  const key = (lon: number, lat: number) =>
    `${Math.floor(lon / SIZE)},${Math.floor(lat / SIZE)}`
  const nearby = new Map<string, number[]>()
  ends.forEach((end, i) => {
    for (const point of [end.head, end.tail]) {
      const at = key(point.lon, point.lat)
      const there = nearby.get(at)
      if (there) {
        if (there[there.length - 1] !== i) there.push(i)
      } else nearby.set(at, [i])
    }
  })
  const candidates = (i: number) => {
    const out = new Set<number>()
    for (const point of [ends[i].head, ends[i].tail]) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        for (let dLat = -1; dLat <= 1; dLat++) {
          for (const j of nearby.get(key(point.lon + dLon * SIZE, point.lat + dLat * SIZE)) ?? []) {
            if (j > i) out.add(j)
          }
        }
      }
    }
    return out
  }
  for (let i = 0; i < grooves.length; i++) {
    for (const j of candidates(i)) {
      for (const atTailOfI of [true, false]) {
        for (const atHeadOfJ of [true, false]) {
          const from = atTailOfI ? ends[i].tail : ends[i].head
          const to = atHeadOfJ ? ends[j].head : ends[j].tail
          const gap = away(from, to)
          if (gap > maxGapKm) continue
          if (gap > reach * Math.min(grooves[i].lengthKm, grooves[j].lengthKm)) continue
          // The course each segment travels in as it reaches the join. At its
          // own tail that is the way it leaves; at its head, reversed.
          const leaving = atTailOfI ? ends[i].outOfTail : (ends[i].intoHead + 180) % 360
          const arriving = atHeadOfJ ? ends[j].intoHead : (ends[j].outOfTail + 180) % 360
          const line = course(from, to)
          if (apart(line, leaving) > linkDeg) continue
          if (apart(line, arriving) > linkDeg) continue
          if (apart(leaving, arriving) > linkDeg) continue
          joins.push({ i, atTailOfI, j, atHeadOfJ, gap })
        }
      }
    }
  }
  joins.sort((a, b) => a.gap - b.gap)

  /** Points of the across-grain lines, in two-degree buckets to look up by. */
  const clearKm = options.clearKm ?? 60
  const bucketOf = (p: GroovePoint) => `${Math.floor(p.lon / 2)},${Math.floor(p.lat / 2)}`
  const obstacles = new Map<string, GroovePoint[]>()
  for (const line of crossGrain) {
    for (const point of line.points) {
      const key = bucketOf(point)
      const at = obstacles.get(key)
      if (at) at.push(point)
      else obstacles.set(key, [point])
    }
  }
  /** Whether the straight line from `from` to `to` passes one of them. */
  const blocked = (from: GroovePoint, to: GroovePoint) => {
    if (!obstacles.size) return false
    const steps = Math.max(1, Math.round(away(from, to) / 30))
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const at = {
        lon: from.lon + (to.lon - from.lon) * t,
        lat: from.lat + (to.lat - from.lat) * t,
        measured: false,
      }
      for (let dLon = -2; dLon <= 2; dLon += 2) {
        for (let dLat = -2; dLat <= 2; dLat += 2) {
          const near = obstacles.get(bucketOf({ ...at, lon: at.lon + dLon, lat: at.lat + dLat }))
          if (!near) continue
          for (const point of near) if (away(at, point) < clearKm) return true
        }
      }
    }
    return false
  }

  const open: (Groove | null)[] = grooves.map((g) => ({ ...g, points: [...g.points] }))
  /** Which chain a segment has ended up in, and whether its ends are spoken for. */
  const chain = grooves.map((_, i) => i)
  const used = grooves.map(() => ({ head: false, tail: false }))
  const rootOf = (i: number): number => (chain[i] === i ? i : (chain[i] = rootOf(chain[i])))
  for (const join of joins) {
    if (join.atTailOfI ? used[join.i].tail : used[join.i].head) continue
    if (join.atHeadOfJ ? used[join.j].head : used[join.j].tail) continue
    const left = rootOf(join.i)
    const right = rootOf(join.j)
    // A join back into the chain a segment is already in would close a loop,
    // which a fracture zone does not do.
    if (left === right) continue
    const a = open[left]
    const b = open[right]
    if (!a || !b) continue
    if (blocked(
      join.atTailOfI ? ends[join.i].tail : ends[join.i].head,
      join.atHeadOfJ ? ends[join.j].head : ends[join.j].tail,
    )) continue
    // Put the two chains the right way round for each other: the end of the
    // one being joined has to finish at the join, and the other start there.
    const aPoints = a.points[a.points.length - 1] === (join.atTailOfI ? ends[join.i].tail : ends[join.i].head)
      ? a.points : [...a.points].reverse()
    const bPoints = b.points[0] === (join.atHeadOfJ ? ends[join.j].head : ends[join.j].tail)
      ? b.points : [...b.points].reverse()
    open[left] = {
      points: [...aPoints, ...across(aPoints[aPoints.length - 1], bPoints[0]), ...bPoints],
      lengthKm: a.lengthKm + join.gap + b.lengthKm,
      score: (a.score + b.score) / 2,
    }
    open[right] = null
    chain[right] = left
    if (join.atTailOfI) used[join.i].tail = true
    else used[join.i].head = true
    if (join.atHeadOfJ) used[join.j].head = true
    else used[join.j].tail = true
  }
  return open.filter((g): g is Groove => !!g && g.points.length > 0)
    .sort((a, b) => b.lengthKm - a.lengthKm)
}

/**
 * Drop the segments that run across the grain of the ones around them.
 *
 * The reader, on a window of the South Atlantic: *all the short segments here
 * should be more or less parallel, with a small swing here and there.* They
 * are -- the median bearing is 81 degrees and half of them are within 11
 * degrees of it -- but about a tenth sit sixty or seventy degrees off, which
 * is not a swing, and those are near the continental margins where the fabric
 * is structured by something other than spreading.
 *
 * This is the same idea as the bearing test in ./bearing.ts, which was
 * withdrawn because it was asked to judge *pairs*: there are a couple of
 * thousand of those over the whole Earth, so the neighbourhood had to be
 * fifteen hundred kilometres wide and it smeared away the real swing it was
 * supposed to tolerate. Segments are twenty times denser, so the same test can
 * be taken over a few hundred kilometres, where a swing survives it. The
 * primitives are shared with that module; the claim is not.
 */
/**
 * How much of a groove was actually read, in km.
 *
 * Not its length: a linked groove can be mostly bridge, and for anything that
 * treats a groove as evidence the bridges do not count. `stepKm` is the walk's
 * own spacing, which is what the points are.
 */
export function readKm(groove: Groove, stepKm = 20): number {
  return groove.points.filter((point) => point.measured).length * stepKm
}

/** A segment's own axis, folded to 0..180, and where its middle is. */
export function axisOf(groove: Groove): { at: GroovePoint; axis: number } {
  const a = groove.points[0]
  const b = groove.points[groove.points.length - 1]
  const dLat = b.lat - a.lat
  const dLon = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD)
  return {
    at: groove.points[Math.floor(groove.points.length / 2)],
    axis: (((Math.atan2(dLon, dLat) * 180) / Math.PI % 180) + 180) % 180,
  }
}

/**
 * Keep the segments that run along a reference direction, drop the rest.
 *
 * `reference` returns the direction the crust here should have a groove in, or
 * null where it has no opinion, in which case the segment is kept: a segment
 * nothing can judge is not thereby condemned.
 */
export function trimAgainst(
  grooves: Groove[],
  reference: (at: GroovePoint) => number | null,
  toleranceDeg = 30,
): { kept: Groove[]; dropped: Groove[] } {
  const kept: Groove[] = []
  const dropped: Groove[] = []
  for (const groove of grooves) {
    const mine = axisOf(groove)
    const should = reference(mine.at)
    if (should === null || axisDiff(mine.axis, should) <= toleranceDeg) kept.push(groove)
    else dropped.push(groove)
  }
  return { kept, dropped }
}

/**
 * Keep a segment that either reference passes, and drop only what both reject.
 *
 * Neither reference is sound everywhere and they fail in different places, so
 * the reader's suggestion -- take a combination -- is the right shape. The
 * neighbours' grain assumes most of what is detected nearby is a groove, which
 * is false in the Pacific where most of it is abyssal-hill fabric. The
 * spreading direction assumes the age grid knows which way the crust went,
 * which is weakest in exactly the old, thinly-surveyed sea floor where the
 * grid is mostly interpolation between a few identified isochrons.
 *
 * Requiring both would keep only what the weaker one happens to allow. Taking
 * either lets some rubbish through, and that is the cheaper mistake here: the
 * reader can see a wrong line in a picture, and cannot see a right line that
 * was never drawn.
 */
export function trimEither(
  grooves: Groove[],
  references: ((at: GroovePoint) => number | null)[],
  toleranceDeg = 30,
): { kept: Groove[]; dropped: Groove[] } {
  const kept: Groove[] = []
  const dropped: Groove[] = []
  for (const groove of grooves) {
    const mine = axisOf(groove)
    const verdicts = references.map((of) => of(mine.at))
    const passes = verdicts.some(
      (should) => should === null || axisDiff(mine.axis, should) <= toleranceDeg,
    )
    if (passes) kept.push(groove)
    else dropped.push(groove)
  }
  return { kept, dropped }
}

/**
 * The neighbours' grain as a reference, for use beside any other.
 *
 * Null where a segment has too few neighbours to have a grain: nothing to have
 * run across, and a lone groove is not evidence against itself.
 */
export function grainReference(
  grooves: Groove[], radiusKm = 800, least = 8, capKm = 2500,
): (at: GroovePoint) => number | null {
  const each = grooves.map(axisOf)
  // Bucketed by whole degrees of latitude and longitude. Over one window this
  // was a scan of every segment for every segment and cheap enough; over the
  // globe there are tens of thousands and the scan is the whole cost.
  const SIZE = 10
  const key = (lon: number, lat: number) =>
    `${Math.floor(lon / SIZE)},${Math.floor(lat / SIZE)}`
  const buckets = new Map<string, { axis: number; at: GroovePoint }[]>()
  for (const one of each) {
    const at = key(one.at.lon, one.at.lat)
    const there = buckets.get(at)
    if (there) there.push(one)
    else buckets.set(at, [one])
  }
  /** Every segment within so many degrees of a place, by bucket. */
  const around = (at: GroovePoint, reachDeg: number) => {
    const out: { axis: number; awayKm: number }[] = []
    const rings = Math.ceil(reachDeg / SIZE)
    for (let dLon = -rings; dLon <= rings; dLon++) {
      for (let dLat = -rings; dLat <= rings; dLat++) {
        const there = buckets.get(key(at.lon + dLon * SIZE, at.lat + dLat * SIZE))
        if (!there) continue
        for (const one of there) {
          const awayKm = apartKm(at, one.at)
          if (awayKm > 1) out.push({ axis: one.axis, awayKm })
        }
      }
    }
    return out
  }
  return (at: GroovePoint) => {
    const inside = around(at, radiusKm / 100).filter((q) => q.awayKm < radiusKm)
    const near = inside.length >= least
      ? inside
      : around(at, capKm / 100)
        .filter((q) => q.awayKm < capKm)
        .sort((a, b) => a.awayKm - b.awayKm)
        .slice(0, least)
    if (near.length < 4) return null
    return axisMedian(near.map((q) => q.axis))
  }
}

export function trimAcross(
  grooves: Groove[], radiusKm = 800, toleranceDeg = 30, least = 8, capKm = 2500,
): { kept: Groove[]; dropped: Groove[] } {
  const of = (groove: Groove) => {
    const a = groove.points[0]
    const b = groove.points[groove.points.length - 1]
    const middle = groove.points[Math.floor(groove.points.length / 2)]
    const dLat = b.lat - a.lat
    const dLon = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * RAD)
    return {
      at: middle,
      axis: (((Math.atan2(dLon, dLat) * 180) / Math.PI % 180) + 180) % 180,
    }
  }
  const each = grooves.map(of)
  const kept: Groove[] = []
  const dropped: Groove[] = []
  grooves.forEach((groove, i) => {
    // Everything inside the radius, and if that is not enough of a sample, out
    // to the nearest `least` however far they are. Both halves earned their
    // place. Taking only the nearest few looks more local and is worse: eight
    // neighbours in the middle of the South Atlantic span two hundred
    // kilometres, and a clump of eight mutually parallel spurious segments
    // then certifies itself -- measured, that swap took the segments' spread
    // from half within 13 degrees of the median to half within 22. Only in the
    // sparse places, which is where the reader found it dropping good segments
    // and keeping bad ones, does the sample need widening.
    const away = each
      .map((q, j) => ({ axis: q.axis, awayKm: j === i ? Infinity : apartKm(each[i].at, q.at) }))
      .sort((a, b) => a.awayKm - b.awayKm)
    const inside = away.filter((q) => q.awayKm < radiusKm)
    const near = inside.length >= least
      ? inside
      : away.filter((q) => q.awayKm < capKm).slice(0, least)
    // Unweighted, and that is not for want of trying the alternatives. Both
    // ways of making the grain more local -- the nearest eight at any
    // distance, and a distance-weighted median over the same sample -- make
    // the test more *permissive* rather than more discerning, because a clump
    // of mutually parallel spurious segments then certifies itself. Measured
    // on the South Atlantic window, the segments' spread went from half within
    // 13 degrees of the median to 22 and 16, and in the southern band, which
    // is the band the reader says is worst and which was the reason for
    // trying, from 24 to 30. Locality is not the fix for that band; see
    // MODEL.md on what is likely to be.
    // Too few neighbours to have a grain: kept, because there is nothing to
    // have run across. A lone groove is not evidence against itself.
    if (near.length < 4
      || axisDiff(each[i].axis, axisMedian(near.map((q) => q.axis))) <= toleranceDeg) {
      kept.push(groove)
    } else {
      dropped.push(groove)
    }
  })
  return { kept, dropped }
}

/**
 * Paint grooves into a raster, the way the globe's fracture-zone view reads it.
 *
 * Strength in one channel and which groove a cell belongs to in another,
 * because a reader points at a line in the viewer and the viewer has to know
 * which one they meant: the identity travels in the picture rather than beside
 * it. Longest first, so where two widened lines overlap the longer one owns it
 * -- arbitrary, but stable, where "whichever came last" would change the
 * picture whenever the detector's ordering did.
 *
 * Carried-through stretches are painted like read ones here, and that is the
 * reader's call: on the flat test pictures the two are told apart because the
 * question there is how well the detector works, and on the globe the question
 * is where the flow lines are, so a groove is drawn as the one line it is.
 */
export function grooveRaster(
  grooves: Groove[], width: number, height: number, dilateCells = 1,
): { strength: Uint8Array; curve: Uint16Array } {
  const strength = new Uint8Array(width * height)
  const curve = new Uint16Array(width * height)
  const scores = grooves.map((g) => g.score).sort((a, b) => a - b)
  const full = scores.length ? scores[Math.floor(0.9 * scores.length)] || 1 : 1

  const order = grooves.map((_, i) => i).sort((a, b) => grooves[b].lengthKm - grooves[a].lengthKm)
  for (const index of order) {
    const groove = grooves[index]
    const level = 1 + Math.round(254 * Math.min(1, Math.max(0, groove.score) / full))
    for (let i = 1; i < groove.points.length; i++) {
      const from = groove.points[i - 1]
      const to = groove.points[i]
      // Along the segment in raster cells, so a step never leaves a gap. The
      // longitude difference is taken the short way round, or a groove ending
      // just west of the date line and carrying on just east of it is painted
      // right across the map.
      const eastward = ((to.lon - from.lon) + 540) % 360 - 180
      const steps = Math.max(1, Math.ceil(Math.max(
        Math.abs(eastward / 360) * width,
        Math.abs((to.lat - from.lat) / 180) * height,
      )))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const lon = from.lon + eastward * t
        const lat = from.lat + (to.lat - from.lat) * t
        const column = Math.floor((((lon + 180) / 360) % 1 + 1) % 1 * width)
        const row = Math.floor(((90 - lat) / 180) * height)
        for (let dr = -dilateCells; dr <= dilateCells; dr++) {
          const r = row + dr
          if (r < 0 || r >= height) continue
          for (let dc = -dilateCells; dc <= dilateCells; dc++) {
            const c = ((column + dc) % width + width) % width
            const cell = r * width + c
            if (strength[cell] >= level) continue
            strength[cell] = level
            curve[cell] = index + 1
          }
        }
      }
    }
  }
  return { strength, curve }
}

/**
 * The grooves as a direction field, in the shape the flow-field fit wants.
 *
 * This is the seam where the grooves reach the model rather than the picture.
 * The fit takes sparse anchors -- somewhere a line was actually seen, and which
 * way it ran -- and carries a direction across the gaps by its own smoothness;
 * following that field gives the family of curves the crust travelled along,
 * and those give the conjugate pairs, half of which pull the solver. So what
 * the grooves change here is which way the mesh moves.
 *
 * Only the stretches where the trough was read become anchors. Carrying a line
 * through a fade is the right thing to draw and the wrong thing to fit: the
 * fit's whole job is to cross gaps, it does it better than a straight line
 * does, and feeding it a straight-line guess would have it agree with the guess
 * instead of with the evidence either side.
 *
 * `axis` is the along-line direction as a bearing east of north over 0 to 255,
 * which is the encoding the field reads. `ridgeness` carries the score, so a
 * clearer groove counts for more.
 */
export function grooveLineaments(
  grooves: Groove[], width: number, height: number, dilateCells = 1,
): {
  width: number
  height: number
  axis: Uint8Array
  coherence: Uint8Array
  ridgeness: Float32Array
  known: Uint8Array
} {
  const axis = new Uint8Array(width * height)
  const coherence = new Uint8Array(width * height)
  const ridgeness = new Float32Array(width * height)
  const known = new Uint8Array(width * height)

  for (const groove of grooves) {
    const strength = Math.max(0, groove.score)
    for (let i = 1; i < groove.points.length; i++) {
      const from = groove.points[i - 1]
      const to = groove.points[i]
      if (!from.measured || !to.measured) continue
      const eastward = ((to.lon - from.lon) + 540) % 360 - 180
      const middleLat = ((from.lat + to.lat) / 2) * RAD
      const bearing = (((Math.atan2(eastward * Math.cos(middleLat), to.lat - from.lat)
        * 180) / Math.PI % 180) + 180) % 180
      const encoded = Math.min(255, Math.round((bearing / 180) * 256))
      const steps = Math.max(1, Math.ceil(Math.max(
        Math.abs(eastward / 360) * width,
        Math.abs((to.lat - from.lat) / 180) * height,
      )))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const lon = from.lon + eastward * t
        const lat = from.lat + (to.lat - from.lat) * t
        const column = Math.floor((((lon + 180) / 360) % 1 + 1) % 1 * width)
        const row = Math.floor(((90 - lat) / 180) * height)
        for (let dr = -dilateCells; dr <= dilateCells; dr++) {
          const r = row + dr
          if (r < 0 || r >= height) continue
          for (let dc = -dilateCells; dc <= dilateCells; dc++) {
            const c = ((column + dc) % width + width) % width
            const cell = r * width + c
            if (ridgeness[cell] >= strength) continue
            ridgeness[cell] = strength
            axis[cell] = encoded
            coherence[cell] = 255
            known[cell] = 1
          }
        }
      }
    }
  }
  return { width, height, axis, coherence, ridgeness, known }
}

/**
 * The grooves allowed to anchor the travelled-direction field.
 *
 * Every groove is drawn; only some get a vote, because a fit takes a vote and
 * dense wrong anchors outvote sparse right ones -- giving all ten thousand a
 * vote made the model worse on every measure. So the bar is the old detector's
 * own: a long line, and within twenty degrees of the way the crust travelled.
 *
 * But length alone was a bad gate, and a reader found where it broke. In the
 * equatorial Atlantic the grooves are the cleanest anywhere -- a median
 * bearing of 84 degrees with half of them within 11 -- and *none* of them
 * qualified, because the big equatorial transforms chop the fabric into
 * stretches averaging 194 km against a 200 km bar. The region with the best
 * direction evidence on Earth contributed nothing, the field there was left
 * guessing, and it guessed 31 degrees where the answer is 90. Paths leaving
 * Brazil went north-east instead of east.
 *
 * Length was only ever a proxy for confidence. Alignment measures it directly,
 * so a short groove that agrees closely with the spreading direction is
 * admitted on that agreement instead: `keenKm` of read line within `keenDeg`.
 * A groove has to earn its vote, and there is more than one way to earn it.
 */
export function anchorGrooves(
  grooves: Groove[],
  reference: (at: GroovePoint) => number | null,
  options: {
    minReadKm?: number
    maxOffDeg?: number
    keenReadKm?: number
    keenOffDeg?: number
    stepKm?: number
  } = {},
): Groove[] {
  const minReadKm = options.minReadKm ?? 200
  const maxOffDeg = options.maxOffDeg ?? 20
  const keenReadKm = options.keenReadKm ?? 100
  const keenOffDeg = options.keenOffDeg ?? 10
  return grooves.filter((groove) => {
    const read = readKm(groove, options.stepKm)
    if (read < keenReadKm) return false
    const mine = axisOf(groove)
    const should = reference(mine.at)
    // No opinion available: not admitted. Elsewhere an unreadable reference
    // means a groove is not condemned, but a vote is a positive claim and
    // wants positive evidence.
    if (should === null) return false
    const off = axisDiff(mine.axis, should)
    return (read >= minReadKm && off <= maxOffDeg) || off <= keenOffDeg
  })
}
