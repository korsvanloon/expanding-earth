import { Vector2, Vector3 } from 'three'
const { PI, cos, sin, asin, acos, atan2, sign, sqrt } = Math

export const uvToPoint = (uv: Vector2) => {
  // theta is a longitude angle (around the equator) in radians.
  const theta = 2.0 * PI * uv.x
  // phi is a latitude angle (north or south of the equator) in radians.
  const phi = PI * (uv.y - 0.5)

  // This determines the radius of the ring of this line of latitude.
  // It's widest at the equator, and narrows as phi increases/decreases.
  const c = cos(phi)

  return new Vector3(-c * sin(theta), sin(phi), -c * cos(theta)).normalize()
}

export const pointToUv = (p: Vector3) =>
  new Vector2(
    0.5 + atan2(p.x, p.z) / (2.0 * PI), //
    0.5 + asin(p.y) / PI, //
  )

export const greatCircleAngle = (n1: Vector3, n2: Vector3) => acos(n1.dot(n2))

export const nextAngle = (d: number) => asin(d / 2.0)

// export const getBearing = (from: Vector3, to: Vector3) => {
//   const c1 = from.clone().cross(to)
//   const c2 = from.clone().cross(northPole)

//   return atan2(
//     c1.clone().cross(c2).length() * sign(c1.clone().cross(c2).dot(from)),
//     c1.clone().dot(c2),
//   )
// }

// // export const bearing2 = (a: Vector3, b: Vector3) => {
// //   const y = sin(λ2 - λ1) * cos(φ2)
// //   const x = cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(λ2 - λ1)
// //   return atan2(y, x)
// // }

// export const destinationPoint = (start_point: Vector3, bearing: number, distance: number) => {
//   const de = northPole.clone().cross(start_point)
//   const dn = start_point.clone().cross(de)
//   const d = dn
//     .clone()
//     .multiplyScalar(cos(bearing))
//     .add(de.clone().multiplyScalar(sin(bearing)))

//   return start_point
//     .clone()
//     .multiplyScalar(cos(distance))
//     .add(d.clone().multiplyScalar(sin(distance)))
// }

export const toRadians = (degrees: number) => (degrees * PI) / 180
export const toDegrees = (radians: number) => (radians * 180) / PI

/*

uv 0.5, 0.5 == latlng 0,0
uv 0.5, 0.0 == latlng 90,0
uv 0,0
*/

/**
 * ```
 * (1-t) * start + (t) * end
 * ```
 */
export const getIntermediatePoint = (start: Vector3, end: Vector3, fraction: number) =>
  start
    .clone()
    .multiplyScalar(1 - fraction)
    .add(end.clone().multiplyScalar(fraction))

export const area = (a: Vector3, b: Vector3, c: Vector3) =>
  angle(a, b, c) + angle(b, a, c) + angle(b, c, a) - PI

/**
 * Calculates angle B between AB and BC.
 */
export const angle = (a: Vector3, b: Vector3, c: Vector3) => {
  const ab = a.clone().cross(b)
  const bc = c.clone().cross(b)
  return acos(ab.dot(bc) / (ab.length() * bc.length()))
}
