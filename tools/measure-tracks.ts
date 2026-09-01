/**
 * Do the traced fracture zones stay smooth while the crust carries them back?
 *
 * A fracture zone is a path one piece of crust actually took, so it bends over
 * hundreds of kilometres and never corners. The tracer enforces that on the way
 * out -- no more than six degrees per forty-kilometre step -- so a drawn track
 * is smooth today by construction. If it has corners in it at 13 or 38 Ma, they
 * were not traced: the solver put them there, and a kink in a material line is
 * a kink in the crust.
 *
 * So this is a check on the reconstruction disguised as a check on a drawing.
 * It measures the turn at every point of every drawn track, per frame, against
 * the six degrees the tracer allows.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pairPulls, readTracks } from '../shared/tracks.js'
import { applyTopology, readTopology } from '../shared/topology.js'
import { R0_KM, sampleCurve, type Meta } from '../shared/model.js'
import { anchorPoint } from '../shared/anchor.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')

const read = (name: string) => {
  const b = readFileSync(resolve(OUT, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/**
 * Where a track point sits at a frame.
 *
 * Set ANCHOR=1 to read it through the fallback in shared/anchor.ts, which uses
 * the heaviest corner alone once the stored triangle has come apart, instead of
 * blending three vertices that are no longer near each other.
 */
const ANCHORED = process.env.ANCHOR === '1'

function pointAt(
  frames: Int16Array, base: number, verts: Uint32Array, weights: Float32Array, i: number,
): [number, number, number] {
  let x = 0, y = 0, z = 0
  if (ANCHORED) {
    // The frames are quantised to a unit sphere times 32767, so one of their
    // units is that fraction of the Earth's radius.
    const p = anchorPoint(
      frames.subarray(base, base + frames.length - base), verts, weights, i, R0_KM / 32767,
    )
    x = p.x; y = p.y; z = p.z
  } else {
    for (let k = 0; k < 3; k++) {
      const v = verts[i * 3 + k]
      const w = weights[i * 3 + k]
      x += frames[base + v * 3] * w
      y += frames[base + v * 3 + 1] * w
      z += frames[base + v * 3 + 2] * w
    }
  }
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

function main() {
  const meta = JSON.parse(readFileSync(resolve(OUT, 'meta.json'), 'utf8')) as Meta
  const frames = new Int16Array(read('frames.bin'))
  const tracks = readTracks(read('tracks.bin'))
  const mesh = read('mesh.bin')
  const [vertexCount] = new Uint32Array(mesh, 0, 4)
  const radiusKm = meta.crustModels[0].radiusKm

  // The same split the solver uses: a track it was told to keep smooth is no
  // evidence that the crust stayed smooth, so the two halves are reported
  // apart. If only the held half improves, the lines were moved and nothing
  // else; if the free half improves too, the crust did.
  const trackPulls = new Uint8Array(Math.max(0, tracks.offsets.length - 1))
  for (let i = 0; i < tracks.pairAgeMa.length; i++) {
    const t = tracks.pairTrack[i]
    if (t < trackPulls.length && pairPulls(tracks, i)) trackPulls[t] = 1
  }

  /**
   * Is a kink a length problem?
   *
   * Two adjacent points of a track are two pieces of crust forty kilometres
   * apart, and the crust between them is older than both -- along a flow line
   * the age rises away from the ridge, so if both ends still exist so does
   * everything in between. No crust is ever destroyed in this model. The
   * distance between them therefore has to stay forty kilometres for ever,
   * whatever the globe does around them.
   *
   * So the ratio of a segment's length now to its length today is along-flow
   * strain on a real fracture zone, read straight off the reconstruction. If
   * the corners sit on the segments that have been squeezed, they are the line
   * buckling because it has nowhere to go, and smoothing it was never going to
   * help. If the squeezed segments and the corners have nothing to do with each
   * other, the kinks are shear and the diagnosis was wrong.
   */
  /**
   * Is the triangle a track point lives in still there?
   *
   * A point is not a vertex. It is a place inside a triangle -- three mesh
   * vertices and the weights that mix them -- chosen when the path was traced
   * through today's mesh. That was done so the line would sit where the walk
   * actually went instead of on a staircase of nearest vertices, and it works
   * as long as the three corners go on being a triangle.
   *
   * They do not have to. The mesh redraws itself as it runs: 164,175 edges
   * flipped over this run and twenty-five thousand points collapsed away. Once
   * the stored triple has been flipped apart, its three vertices are three
   * unrelated places and the weighted blend of them is not where the crust
   * went, it is somewhere in the middle of nothing. The same representation
   * carries the conjugate pairs, which are the model's headline score.
   */
  {
    console.log('track points whose triangle still exists, and pair ends')
    console.log('  Ma   points intact   pair ends intact')
    const mesh2 = read('mesh.bin')
    const [vc, fc] = new Uint32Array(mesh2, 0, 4)
    const indices = new Uint32Array(mesh2, 16 + vc * 12, fc * 3)
    const deltas = readTopology(read('topology.bin'), fc)
    const working = new Int32Array(fc * 3)
    const out = new Uint32Array(fc * 3)
    const key = (a: number, b: number, c: number) => {
      const s = [a, b, c].sort((x, y) => x - y)
      return `${s[0]},${s[1]},${s[2]}`
    }
    for (const timeMa of [0, 13, 20, 38, 60, 90, 120]) {
      const frame = Math.round(timeMa / meta.frameStepMa)
      if (frame >= meta.frameCount) continue
      applyTopology(indices, deltas, frame, working, out)
      const live = new Set<string>()
      for (let f = 0; f < fc; f++) {
        if (working[f * 3] < 0) continue
        live.add(key(working[f * 3], working[f * 3 + 1], working[f * 3 + 2]))
      }
      let intact = 0, total = 0
      for (let i = 0; i < tracks.ageMa.length; i++) {
        if (tracks.ageMa[i] < timeMa) continue
        total++
        if (live.has(key(tracks.pointVerts[i * 3], tracks.pointVerts[i * 3 + 1],
          tracks.pointVerts[i * 3 + 2]))) intact++
      }
      let pairIntact = 0, pairTotal = 0
      for (let i = 0; i < tracks.pairAgeMa.length; i++) {
        if (tracks.pairAgeMa[i] < timeMa) continue
        for (const [v] of [[tracks.pairAVerts], [tracks.pairBVerts]] as const) {
          pairTotal++
          if (live.has(key(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]))) pairIntact++
        }
      }
      console.log(
        `${String(timeMa).padStart(4)}   ${(100 * intact / (total || 1)).toFixed(1)}% of ${total}`
        + `        ${(100 * pairIntact / (pairTotal || 1)).toFixed(1)}% of ${pairTotal}`,
      )
    }
    console.log()
  }

  /**
   * Does a broken triple actually give a worse answer?
   *
   * The share of them is only alarming if it costs something, and that is
   * measurable without any guessing: a conjugate pair's two ends were one point
   * at its own age, so the separation there has a right answer of zero. Split
   * the pairs by whether both ends' triangles still exist and compare.
   */
  {
    const mesh3 = read('mesh.bin')
    const [vc3, fc3] = new Uint32Array(mesh3, 0, 4)
    const indices3 = new Uint32Array(mesh3, 16 + vc3 * 12, fc3 * 3)
    const deltas3 = readTopology(read('topology.bin'), fc3)
    const working3 = new Int32Array(fc3 * 3)
    const out3 = new Uint32Array(fc3 * 3)
    const key = (a: number, b: number, c: number) => {
      const s2 = [a, b, c].sort((x, y) => x - y)
      return `${s2[0]},${s2[1]},${s2[2]}`
    }
    console.log('conjugate pairs at their own age: separation when the triple holds, and when it does not')
    console.log('  Ma   intact pairs  median km      broken pairs  median km')
    for (const timeMa of [20, 40, 60, 90, 120]) {
      const frame = Math.round(timeMa / meta.frameStepMa)
      if (frame >= meta.frameCount) continue
      applyTopology(indices3, deltas3, frame, working3, out3)
      const live = new Set<string>()
      for (let f = 0; f < fc3; f++) {
        if (working3[f * 3] < 0) continue
        live.add(key(working3[f * 3], working3[f * 3 + 1], working3[f * 3 + 2]))
      }
      const base = frame * vertexCount * 3
      const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
      const good: number[] = []
      const bad: number[] = []
      for (let i = 0; i < tracks.pairAgeMa.length; i++) {
        if (Math.round(tracks.pairAgeMa[i] / meta.frameStepMa) !== frame) continue
        const whole = (v: Uint32Array) =>
          live.has(key(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]))
        const a = pointAt(frames, base, tracks.pairAVerts, tracks.pairAWeights, i)
        const b = pointAt(frames, base, tracks.pairBVerts, tracks.pairBWeights, i)
        const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
        const km = Math.acos(dot) * radius
        ;(whole(tracks.pairAVerts) && whole(tracks.pairBVerts) ? good : bad).push(km)
      }
      good.sort((x, y) => x - y)
      bad.sort((x, y) => x - y)
      const med = (v: number[]) => (v.length ? v[v.length >> 1].toFixed(0) : '--')
      console.log(
        `${String(timeMa).padStart(4)}${String(good.length).padStart(14)}`
        + `${med(good).padStart(11)}${String(bad.length).padStart(18)}${med(bad).padStart(11)}`,
      )
    }
    console.log()
  }

  console.log('how long a 40 km piece of fracture zone stays, as a share of its length today')
  console.log('  Ma   segments   p10    median    p90     share under 0.8')
  const restKm: number[] = []
  {
    const base0 = 0
    for (let i = 0; i + 1 < tracks.ageMa.length; i++) restKm.push(0)
    for (let t = 0; t + 1 < tracks.offsets.length; t++) {
      for (let i = tracks.offsets[t]; i + 1 < tracks.offsets[t + 1]; i++) {
        const a = pointAt(frames, base0, tracks.pointVerts, tracks.pointWeights, i)
        const b = pointAt(frames, base0, tracks.pointVerts, tracks.pointWeights, i + 1)
        const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
        restKm[i] = Math.acos(dot) * radiusKm[0]
      }
    }
  }
  /** Segment length ratios at a frame, and which segments they belong to. */
  const squeeze = (frame: number, timeMa: number, radius: number) => {
    const base = frame * vertexCount * 3
    const ratio = new Float64Array(tracks.ageMa.length).fill(NaN)
    for (let t = 0; t + 1 < tracks.offsets.length; t++) {
      for (let i = tracks.offsets[t]; i + 1 < tracks.offsets[t + 1]; i++) {
        if (tracks.ageMa[i] < timeMa || tracks.ageMa[i + 1] < timeMa) continue
        if (restKm[i] < 1) continue
        const a = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i)
        const b = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i + 1)
        const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
        ratio[i] = (Math.acos(dot) * radius) / restKm[i]
      }
    }
    return ratio
  }
  for (const timeMa of [0, 13, 20, 38, 60, 90, 120]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
    const ratio = squeeze(frame, timeMa, radius)
    const live = [...ratio].filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
    if (live.length < 10) continue
    const q = (p: number) => live[Math.min(live.length - 1, Math.floor(p * live.length))]
    console.log(
      `${String(timeMa).padStart(4)}${String(live.length).padStart(11)}`
      + `${q(0.1).toFixed(2).padStart(7)}${q(0.5).toFixed(2).padStart(10)}`
      + `${q(0.9).toFixed(2).padStart(7)}`
      + `${(100 * live.filter((v) => v < 0.8).length / live.length).toFixed(1).padStart(15)}%`,
    )
  }
  console.log()

  // And the question the two halves were built for: do the corners sit on the
  // squeezed segments or the stretched ones?
  /**
   * Where along a track the stretching is.
   *
   * The solver drives only the crust that is about to un-form: driveByField
   * pushes a vertex along the flow field while its age is between t and
   * t + flowWindowMa, and everything behind that band is left to be dragged
   * after it by the edge springs. A real plate translates as a body. An elastic
   * sheet pulled by its leading edge stretches, most of all just behind the
   * edge -- so if that is what is happening, the stretch should be worst on the
   * youngest crust still alive and fade with age behind it.
   */
  console.log('stretch by how long the crust has left before it un-forms')
  console.log('  Ma    0-10 Myr   10-25    25-50    50-100    over 100  (median length ratio)')
  for (const timeMa of [13, 20, 38, 60, 90]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
    const ratio = squeeze(frame, timeMa, radius)
    const cuts = [10, 25, 50, 100, Infinity]
    const buckets: number[][] = cuts.map(() => [])
    for (let i = 0; i < ratio.length; i++) {
      if (!Number.isFinite(ratio[i])) continue
      const behind = tracks.ageMa[i] - timeMa
      const b = cuts.findIndex((c) => behind < c)
      buckets[b < 0 ? cuts.length - 1 : b].push(ratio[i])
    }
    const med = (v: number[]) => {
      if (v.length < 8) return '  --  '
      const sorted = [...v].sort((a, b) => a - b)
      return `${sorted[sorted.length >> 1].toFixed(2)} (${String(v.length).padStart(4)})`
    }
    console.log(`${String(timeMa).padStart(4)}  ${buckets.map(med).join('  ')}`)
  }
  console.log()

  console.log('the segments a corner sits on, against the segments it does not')
  console.log('  Ma   corners   their length ratio (p10/median/p90)   everyone else')
  for (const timeMa of [13, 20, 38, 60, 90]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
    const base = frame * vertexCount * 3
    const ratio = squeeze(frame, timeMa, radius)
    const sharp: number[] = []
    const calm: number[] = []
    for (let t = 0; t + 1 < tracks.offsets.length; t++) {
      for (let i = tracks.offsets[t] + 1; i + 1 < tracks.offsets[t + 1]; i++) {
        if (!Number.isFinite(ratio[i - 1]) || !Number.isFinite(ratio[i])) continue
        const a = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i - 1)
        const b = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i)
        const c = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i + 1)
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
        const vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2]
        const ul = Math.hypot(ux, uy, uz), vl = Math.hypot(vx, vy, vz)
        if (ul < 1e-9 || vl < 1e-9) continue
        const cos = (ux * vx + uy * vy + uz * vz) / (ul * vl)
        const turn = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
        const mean = (ratio[i - 1] + ratio[i]) / 2
        ;(turn > 30 ? sharp : calm).push(mean)
      }
    }
    if (sharp.length < 5 || calm.length < 5) continue
    sharp.sort((a, b) => a - b)
    calm.sort((a, b) => a - b)
    const q = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]
    console.log(
      `${String(timeMa).padStart(4)}${String(sharp.length).padStart(10)}`
      + `      ${q(sharp, 0.1).toFixed(2)} / ${q(sharp, 0.5).toFixed(2)} / ${q(sharp, 0.9).toFixed(2)}`
      + `            ${q(calm, 0.1).toFixed(2)} / ${q(calm, 0.5).toFixed(2)} / ${q(calm, 0.9).toFixed(2)}`,
    )
  }
  console.log()

  console.log('turn per step along the drawn tracks, degrees -- the tracer allows 6')
  console.log('  Ma   R km  held/free  points   median    p90    p99    max   over 30 deg')
  for (const timeMa of [0, 13, 20, 38, 60, 90, 120, 160, 200]) {
    const frame = Math.round(timeMa / meta.frameStepMa)
    if (frame >= meta.frameCount) continue
    const base = frame * vertexCount * 3
    const radius = sampleCurve(radiusKm, timeMa, meta.radiusStepMa)
    for (const group of [1, 0]) {
    const turns: number[] = []
    let degenerate = 0
    for (let t = 0; t + 1 < tracks.offsets.length; t++) {
      if (trackPulls[t] !== group) continue
      const from = tracks.offsets[t]
      const to = tracks.offsets[t + 1]
      // Only the stretch of the track whose crust exists at this time. A point
      // on sea floor younger than the frame has been collapsed out of the mesh,
      // so its three corners have been merged into their neighbours and it
      // reads wherever they ended up -- which is not a place, and the turn
      // through it is noise. Measuring those was the first version of this and
      // it reported a quarter of the track reversing on itself at 13 Ma, which
      // was a measurement of the collapse, not of the crust.
      const live: number[] = []
      for (let i = from; i < to; i++) if (tracks.ageMa[i] >= timeMa) live.push(i)
      // Three points make a turn, so n points give n-2 of them.
      for (let j = 1; j + 1 < live.length; j++) {
        const i = live[j]
        // Consecutive in the surviving stretch, not in the original walk: a gap
        // where the crust has gone is not a corner.
        const before = live[j - 1]
        const after = live[j + 1]
        if (after - before > 4) continue
        const a = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, before)
        const b = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, i)
        const c = pointAt(frames, base, tracks.pointVerts, tracks.pointWeights, after)
        // The turn is the angle between the two chords at b, in the tangent
        // plane; on a sphere of any radius the chords' directions are what
        // matter and the radius cancels.
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
        const vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2]
        const ul = Math.hypot(ux, uy, uz)
        const vl = Math.hypot(vx, vy, vz)
        // Two track points landing on the same spot say nothing about a turn,
        // and they are not rare: a point sits inside a triangle, and once the
        // collapse has merged that triangle's corners the point reads wherever
        // they ended up. Consecutive points then land within a few kilometres
        // of each other and the direction between them is rounding error, which
        // shows up as a reversal. The floor is a tenth of the forty kilometres
        // the tracer stepped.
        const floor = (4 / radius) * 2
        if (ul < floor || vl < floor) { degenerate++; continue }
        const cos = (ux * vx + uy * vy + uz * vz) / (ul * vl)
        turns.push((Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI)
      }
    }
    turns.sort((a, b) => a - b)
    // Past about 180 Ma the sea floor runs out and there is no track left to
    // measure, which is the record ending rather than a perfect answer.
    if (turns.length < 10) {
      console.log(
        `${String(timeMa).padStart(4)}          ${group ? 'held' : 'free'}`
        + `   ${turns.length} turns left to measure`,
      )
      continue
    }
    const q = (p: number) => turns[Math.min(turns.length - 1, Math.floor(p * turns.length))]
    const sharp = turns.filter((v) => v > 30).length
    console.log(
      `${String(timeMa).padStart(4)} ${radius.toFixed(0).padStart(6)}`
      + `       ${group ? 'held' : 'free'}`
      + `${String(turns.length).padStart(8)}`
      + `${q(0.5).toFixed(1).padStart(9)}${q(0.9).toFixed(1).padStart(7)}`
      + `${q(0.99).toFixed(1).padStart(7)}${q(1).toFixed(1).padStart(7)}`
      + `   ${(100 * sharp / turns.length).toFixed(2)}%`
      + `   ${(100 * degenerate / (degenerate + turns.length)).toFixed(0)}% squashed`,
    )
    }
  }
}

main()
