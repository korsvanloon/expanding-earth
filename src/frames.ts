import { PERMANENT_MA, REGIONS } from '@shared/model'
import { directionToUv } from '@shared/sphere'
import type { Dataset } from '@/data'

/**
 * Holding one continent still, which on this hypothesis can only be done by
 * pinning a point of it.
 *
 * Which continent is held changes nothing about the reconstruction -- it is a
 * choice of viewpoint, the same way plate tectonics quotes motions relative to
 * Africa or to the hotspots. It changes a great deal about what can be seen:
 * spread the same motion evenly over every plate, as no-net-rotation does, and
 * a continent that travelled four thousand kilometres looks like it barely
 * moved.
 *
 * **Why one point and not the whole continent.** There used to be a second
 * frame here that fitted a rotation to every point of the region at once, and
 * it was the default. It cannot work, and the reason is the hypothesis itself.
 * A rigid plate on a smaller globe covers a *larger* angular fraction of it:
 * the arc length in kilometres is fixed and the radius shrank. Africa spans 42
 * degrees of today's globe, and the same rigid crust spans 68 degrees of the
 * 3,926 km globe at 200 Ma. No rotation maps one onto the other, so the fit was
 * chasing a target it could not reach, and what was left over was not the world
 * turning around Africa. Measured on the shipped run, the residual after the
 * fit was 998 km rms for Africa where a *perfectly rigid* plate would leave
 * 1,029 -- so the residual was the radius, with no signal under it.
 *
 * Pinning is immune: one point can always be matched, whatever the radius does.
 * What is left on screen is then the plate's own turn plus its change of
 * angular size, and the second of those is a real prediction of the model
 * rather than an artefact of the fit.
 *
 * Each frame's rotation is the smallest one that puts the pinned point back
 * where it sits today, because any rotation through that point leaves it
 * pinned and the one that turns least about it adds no spin of its own.
 */
export type Rotations = Float32Array

export function buildReferenceRotations(data: Dataset, regionId: string): Rotations {
  const { meta, vertexCount, dirs, vertexAge, frames } = data
  const region = REGIONS.find((r) => r.id === regionId)
  const out = new Float32Array(meta.frameCount * 9)
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let f = 0; f < meta.frameCount; f++) out.set(identity, f * 9)
  if (!region) return out

  const members: number[] = []
  for (let v = 0; v < vertexCount; v++) {
    if (vertexAge[v] < PERMANENT_MA) continue
    const [u, w] = directionToUv(dirs[v * 3], dirs[v * 3 + 1], dirs[v * 3 + 2])
    const lon = (u - 0.5) * 360
    const lat = (w - 0.5) * 180
    if (
      lat >= region.latMin && lat <= region.latMax &&
      lon >= region.lonMin && lon <= region.lonMax
    ) {
      members.push(v)
    }
  }
  if (members.length < 8) return out

  const k = 1 / 32767
  const unit = (frame: number, v: number, into: number[]) => {
    const b = (frame * vertexCount + v) * 3
    const x = frames[b] * k, y = frames[b + 1] * k, z = frames[b + 2] * k
    const length = Math.hypot(x, y, z) || 1
    into[0] = x / length; into[1] = y / length; into[2] = z / length
  }

  // The member nearest the region's own middle. A corner of the box would pin
  // the continent by its edge and swing the rest of it across the screen.
  let mx = 0, my = 0, mz = 0
  for (const v of members) {
    mx += dirs[v * 3]; my += dirs[v * 3 + 1]; mz += dirs[v * 3 + 2]
  }
  const ml = Math.hypot(mx, my, mz) || 1
  mx /= ml; my /= ml; mz /= ml
  let pin = members[0]
  let best = -2
  for (const v of members) {
    const dot = dirs[v * 3] * mx + dirs[v * 3 + 1] * my + dirs[v * 3 + 2] * mz
    if (dot > best) { best = dot; pin = v }
  }

  const from: number[] = [0, 0, 0]
  const to: number[] = [0, 0, 0]
  for (let f = 1; f < meta.frameCount; f++) {
    unit(f, pin, from)
    unit(0, pin, to)
    let ax = from[1] * to[2] - from[2] * to[1]
    let ay = from[2] * to[0] - from[0] * to[2]
    let az = from[0] * to[1] - from[1] * to[0]
    const sin = Math.hypot(ax, ay, az)
    const cos = Math.min(1, Math.max(-1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]))
    const turn = [...identity]
    if (sin > 1e-9) {
      ax /= sin; ay /= sin; az /= sin
      compose(turn, ax, ay, az, Math.atan2(sin, cos))
    }
    out.set(turn, f * 9)
  }
  return out
}

function compose(m: number[], ax: number, ay: number, az: number, angle: number) {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = 1 - c
  const r = [
    c + ax * ax * k, ax * ay * k - az * s, ax * az * k + ay * s,
    ay * ax * k + az * s, c + ay * ay * k, ay * az * k - ax * s,
    az * ax * k - ay * s, az * ay * k + ax * s, c + az * az * k,
  ]
  const before = [...m]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      m[i * 3 + j] =
        r[i * 3] * before[j] + r[i * 3 + 1] * before[3 + j] + r[i * 3 + 2] * before[6 + j]
    }
  }
}
