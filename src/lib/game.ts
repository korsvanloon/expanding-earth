import { MovementPathObject, Nuke, MovementPath } from 'data'
import { hasProperty } from './iterable'
import { getDistance, latLngToPoint3D, getPointOnCircle, point3DToLatLng } from './lat-lng'

export const nukesWithPosition = (scenario: MovementPathObject<Nuke>[], time: number) =>
  scenario
    .map((mo) => ({ ...mo, currentPosition: currentVehiclePosition(mo.movementPath, time) }))
    .filter(hasProperty('currentPosition'))

// gravity bombs by strategic or fighter bombers

const currentVehiclePosition = (vehicle: MovementPath, time: number) => {
  const deltaTime = time - vehicle.startTime

  if (deltaTime < 0) return

  const totalDistance = getDistance(vehicle.origin, vehicle.destination)
  const distance = vehicle.speed * deltaTime

  if (distance >= totalDistance) return

  const origin = latLngToPoint3D(vehicle.origin)
  const destination = latLngToPoint3D(vehicle.destination)
  const current = getPointOnCircle(origin, destination, distance)

  return point3DToLatLng(current)
}
