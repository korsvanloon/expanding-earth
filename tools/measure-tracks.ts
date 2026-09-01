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
import { sampleCurve, type Meta } from '../shared/model.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')

const read = (name: string) => {
  const b = readFileSync(resolve(OUT, name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/** Where a track point sits at a frame: its triangle's corners, mixed. */
function pointAt(
  frames: Int16Array, base: number, verts: Uint32Array, weights: Float32Array, i: number,
): [number, number, number] {
  let x = 0, y = 0, z = 0
  for (let k = 0; k < 3; k++) {
    const v = verts[i * 3 + k]
    const w = weights[i * 3 + k]
    x += frames[base + v * 3] * w
    y += frames[base + v * 3 + 1] * w
    z += frames[base + v * 3 + 2] * w
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
