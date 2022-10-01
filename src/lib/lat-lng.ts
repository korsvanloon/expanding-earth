import { Vector2, Vector3 } from 'three'
import { sin, cos, atan2, sqrt, PI, acos, sign } from './math'
import { LatLng, Point3D } from './type'

/** Earth radius in km */
const R = 6371

/** Earth distance (in km if r = R) */
export const getDistance = (latLng1: LatLng, latLng2: LatLng, r = R) => {
  const deltaY = latLng2.y - latLng1.y
  const deltaX = latLng2.x - latLng1.x

  const a =
    sin(deltaY * 0.5) * sin(deltaY * 0.5) +
    cos(latLng1.y) * cos(latLng2.y) * sin(deltaX * 0.5) * sin(deltaX * 0.5)

  const c = 2 * atan2(sqrt(a), sqrt(1 - a))

  return r * c
}

export const vec2 = ({ x, y }: { x: number; y: number }) => new Vector2(x, y)
export const vec3 = ({ x, y, z }: { x: number; y: number; z: number }) => new Vector3(x, y, z)

export const latLngToPoint3D = (latLng: LatLng) => {
  const flipLat = 0.5 * PI - latLng.y
  return vec3({
    x: sin(flipLat) * sin(latLng.x),
    y: cos(flipLat),
    z: sin(flipLat) * cos(latLng.x),
  }) as Point3D
}

export const point3DToLatLng = (point3D: Point3D) => {
  const vector3 = vec3(point3D).normalize()

  //longitude = angle of the vector around the Y axis
  //-( ) : negate to flip the longitude (3d space specific)
  //- PI / 2 to face the Z axis
  let lng = -atan2(-vector3.z, -vector3.x) - 0.5 * PI

  //to bind between -PI / PI
  if (lng < -PI) lng += 2 * PI

  //latitude : angle between the vector & the vector projected on the XZ plane on a unit sphere

  //project on the XZ plane
  const p = vec3({ ...vector3, y: 0 }).normalize()

  //compute the angle ( both vectors are normalized, no division by the sum of lengths )
  let lat = acos(p.dot(vector3))

  //invert if Y is negative to ensure the latitude is comprised between -0.5 PI & 0.5 PI
  if (vector3.y < 0) lat *= -1

  return { x: lng, y: lat } as LatLng
}

const northPole = vec3({ x: 0, y: -1, z: 0 })

export const getBearing = (from: Point3D, to: Point3D) => {
  const c1 = vec3(from).cross(vec3(to))
  const c2 = vec3(from).cross(northPole)

  return atan2(
    vec3(c1).cross(c2).length() * sign(vec3(c1).cross(c2).dot(vec3(from))),
    vec3(c1).dot(c2),
  )
}

export const getPointOnLine = (startPoint: Point3D, bearing: number, distance: number) => {
  const de = vec3(northPole).cross(vec3(startPoint))
  const dn = vec3(startPoint).cross(de)
  const d = vec3(dn)
    .multiplyScalar(cos(bearing))
    .add(vec3(de).multiplyScalar(sin(bearing)))

  return vec3(startPoint)
    .multiplyScalar(cos(distance))
    .add(vec3(d).multiplyScalar(sin(distance)))
}

export const getAngle = (distance: number, r = R) => distance / r

export const getPointOnCircle = (p1: Point3D, p2: Point3D, distance: number) => {
  const pointsAngle = acos(vec3(p1).dot(vec3(p2)))
  const newAngle = getAngle(distance)

  return vec3(p1)
    .multiplyScalar(sin(pointsAngle - newAngle))
    .add(vec3(p2).multiplyScalar(sin(newAngle)))
    .divideScalar(sin(pointsAngle))
}
