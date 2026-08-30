import { PERMANENT_MA, REGIONS } from '@shared/model'
import { directionToUv } from '@shared/sphere'
import type { Dataset } from '@/data'

/**
 * Rotations that hold one continent still while the rest of the world moves
 * around it.
 *
 * Which continent is fixed changes nothing about the reconstruction -- it is a
 * choice of viewpoint, the same way plate tectonics quotes motions relative to
 * Africa or to the hotspots. It changes a great deal about what can be seen:
 * spread the same motion evenly over every plate, as no-net-rotation does, and
 * a continent that travelled four thousand kilometres looks like it barely
 * moved.
 *
 * Each frame's rotation is fitted from the one before it, so every fit is a
 * small angle and the cheap least-squares step is exact enough.
 */
export type Rotations = Float32Array

export function buildReferenceRotations(data: Dataset, regionId: string): Rotations {
  const { meta, vertexCount, dirs, vertexAge, frames } = data
  const region = REGIONS.find((r) => r.id === regionId)
  const out = new Float32Array(meta.frameCount * 9)
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  out.set(identity, 0)
  if (!region) {
    for (let f = 0; f < meta.frameCount; f++) out.set(identity, f * 9)
    return out
  }

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
  if (members.length < 8) {
    for (let f = 0; f < meta.frameCount; f++) out.set(identity, f * 9)
    return out
  }

  const k = 1 / 32767
  const unit = (frame: number, v: number, into: number[]) => {
    const b = (frame * vertexCount + v) * 3
    const x = frames[b] * k, y = frames[b + 1] * k, z = frames[b + 2] * k
    const length = Math.hypot(x, y, z) || 1
    into[0] = x / length; into[1] = y / length; into[2] = z / length
  }

  const rotation = [...identity]
  const from: number[] = [0, 0, 0]
  const to: number[] = [0, 0, 0]

  for (let f = 1; f < meta.frameCount; f++) {
    for (let pass = 0; pass < 6; pass++) {
      let axx = 0, ayy = 0, azz = 0, axy = 0, axz = 0, ayz = 0
      let bx = 0, by = 0, bz = 0
      for (const v of members) {
        unit(f, v, from)
        unit(0, v, to)
        const qx = rotation[0] * from[0] + rotation[1] * from[1] + rotation[2] * from[2]
        const qy = rotation[3] * from[0] + rotation[4] * from[1] + rotation[5] * from[2]
        const qz = rotation[6] * from[0] + rotation[7] * from[1] + rotation[8] * from[2]
        const dx = to[0] - qx, dy = to[1] - qy, dz = to[2] - qz
        const q2 = qx * qx + qy * qy + qz * qz
        axx += q2 - qx * qx; ayy += q2 - qy * qy; azz += q2 - qz * qz
        axy -= qx * qy; axz -= qx * qz; ayz -= qy * qz
        bx += qy * dz - qz * dy
        by += qz * dx - qx * dz
        bz += qx * dy - qy * dx
      }
      const omega = solve3([axx, axy, axz, axy, ayy, ayz, axz, ayz, azz], [bx, by, bz])
      if (!omega) break
      const angle = Math.hypot(omega[0], omega[1], omega[2])
      if (angle < 1e-9) break
      compose(rotation, omega[0] / angle, omega[1] / angle, omega[2] / angle, Math.min(angle, 0.3))
    }
    out.set(rotation, f * 9)
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

function solve3(m: number[], v: number[]): [number, number, number] | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  return [
    inv * ((e * i - f * h) * v[0] + (c * h - b * i) * v[1] + (b * f - c * e) * v[2]),
    inv * ((f * g - d * i) * v[0] + (a * i - c * g) * v[1] + (c * d - a * f) * v[2]),
    inv * ((d * h - e * g) * v[0] + (b * g - a * h) * v[1] + (a * e - b * d) * v[2]),
  ]
}
