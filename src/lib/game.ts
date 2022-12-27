import { MovementPathObject, MovementPath, Nuke } from 'data'
import { Ensure, hasProperty } from './iterable'
import {
  getDistance,
  latLngToPoint3D,
  getPointOnCircle,
  point3DToLatLng,
  inRange,
  vec3,
  vec2,
  getIntersections,
  EARTH_RADIUS,
} from './lat-lng'
import { abs, acos } from './math'
import { LatLng, Point3D } from './type'

export const withPosition = <T extends {}>(
  objects: MovementPathObject<T>[],
  time: number,
): WithPosition<T>[] =>
  objects
    .map((mo) => ({
      ...mo,
      currentPosition: vehiclePositionAt(mo.movementPath, time),
    }))
    .filter(hasProperty('currentPosition'))

export type WithPosition<T extends {} = {}> = Ensure<
  {
    currentPosition: LatLng | undefined
    movementPath: MovementPath
    object: T
  },
  'currentPosition'
>

export const awayFrom = <T extends {}, S extends {}>(
  objects: WithPosition<T>[],
  enemies: WithPosition<S>[],
  time: number,
) =>
  objects.map((mo) => ({
    ...mo,
    nearbySaucer: enemies.some((enemy) => inRange(mo.currentPosition, enemy.currentPosition, 100)),
  }))

/** In hours */
export const MINUTES = 1 / 60
const detonationDuration = 5 * MINUTES

export const hasCaptured = (
  attacker: WithPosition,
  defender: WithPosition<Nuke>,
  range: number,
  time: number,
) => {
  const [intersection1, intersection2] = getIntersections(
    latLngToPoint3D(attacker.movementPath.origin),
    latLngToPoint3D(attacker.movementPath.destination),
    latLngToPoint3D(defender.movementPath.origin),
    latLngToPoint3D(defender.movementPath.destination),
  )

  const lineCrossingTime =
    getCrossingTime(attacker, defender, intersection1, range) ??
    getCrossingTime(attacker, defender, intersection2, range)

  if (!lineCrossingTime || lineCrossingTime > time) {
    return false
  }

  return true

  // const afterDetonationTime = lineCrossingTime + 0.1 * defender.object.amount * MINUTES
  // const attackerAfterDetonationPosition = vehiclePositionAt(
  //   attacker.movementPath,
  //   afterDetonationTime,
  // )

  // const subjectAfterDetonationPosition = vehiclePositionAt(
  //   defender.movementPath,
  //   afterDetonationTime,
  // )

  // return (
  //   attackerAfterDetonationPosition &&
  //   subjectAfterDetonationPosition &&
  //   inRange(attackerAfterDetonationPosition, subjectAfterDetonationPosition, range)
  // )
}

/**
 *
 */
export const getIntersection = (movement1: MovementPath, movement2: MovementPath) => {
  const [intersection1, intersection2] = getIntersections(
    latLngToPoint3D(movement1.origin),
    latLngToPoint3D(movement1.destination),
    latLngToPoint3D(movement2.origin),
    latLngToPoint3D(movement2.destination),
  )

  const time1to1 = getTimeToPoint(movement1, intersection1)
  const time2to1 = getTimeToPoint(movement2, intersection1)

  if (abs(time1to1 - time2to1) < 0.01) {
    return point3DToLatLng(intersection1)
  }

  const time1to2 = getTimeToPoint(movement1, intersection2)
  const time2to2 = getTimeToPoint(movement2, intersection2)

  if (abs(time1to2 - time2to2) < 0.01) {
    return point3DToLatLng(intersection2)
  }
}

/**
 * We assume point should be on the movement path.
 */
const getTimeToPoint = (movement: MovementPath, point: Point3D) =>
  (acos(vec3(latLngToPoint3D(movement.origin)).dot(vec3(point))) * EARTH_RADIUS) / movement.speed +
  movement.startTime

// gravity bombs by strategic or fighter bombers

export const vehiclePositionAt = (vehicle: MovementPath, time: number) => {
  const deltaTime = time - vehicle.startTime

  if (deltaTime < 0) return

  const totalDistance = getDistance(vehicle.origin, vehicle.destination)
  const distance = vehicle.speed * deltaTime
  const destination = latLngToPoint3D(vehicle.destination)

  if (distance >= totalDistance) {
    return vehicle.destination
  }

  const origin = latLngToPoint3D(vehicle.origin)
  const current = getPointOnCircle(origin, destination, distance)

  return point3DToLatLng(current)
}

const getCrossingTime = (
  attacker: WithPosition<{}>,
  defender: WithPosition<Nuke>,
  intersection: Point3D,
  range: number,
) => {
  const defenderArrivalTime = getTimeToPoint(defender.movementPath, intersection)

  const attackerPosition = vehiclePositionAt(attacker.movementPath, defenderArrivalTime)

  if (attackerPosition && inRange(attackerPosition, point3DToLatLng(intersection), range)) {
    return defenderArrivalTime
  }
}
