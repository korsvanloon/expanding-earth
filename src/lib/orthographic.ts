import { Vector2 } from 'three'
import { sqrt, pow, asin, atan2, sin, cos } from './math'
import { Point, LatLng, UV } from './type'

const radius = 0.5 // float

export const orthographicPointToLatLng = (point: Point, centerLatLng: LatLng): LatLng => {
  const x = point.x - 0.5
  const y = 0.5 - point.y

  const ro = sqrt(pow(x, 2.0) + pow(y, 2.0)) // float
  const c = asin(ro / radius) // float

  return {
    x:
      centerLatLng.x +
      atan2(x * sin(c), ro * cos(c) * cos(centerLatLng.y) - y * sin(c) * sin(centerLatLng.y)),
    y: asin(cos(c) * sin(centerLatLng.y) + (y * sin(c) * cos(centerLatLng.y)) / ro),
  }
}

export const latLngToOrthographicPoint = (latLng: LatLng, centerLatLng: LatLng): Point => {
  return {
    x: radius * cos(latLng.y) * sin(latLng.x - centerLatLng.x) + 0.5,
    y:
      1 -
      (radius *
        (cos(centerLatLng.y) * sin(latLng.y) -
          sin(centerLatLng.y) * cos(latLng.y) * cos(latLng.x - centerLatLng.x)) +
        0.5),
  }
}

export const uvToPixel = (uv: UV) => {
  return new Vector2(uv.x - 0.5, uv.y - 0.5)
}

export const circleCenter: UV = {
  x: 0.5,
  y: 0.5,
}
export const withinCircle = (uv: UV) => {
  const d = sqrt(pow(uv.x - circleCenter.x, 2.0) + pow(uv.y - circleCenter.y, 2.0))
  return d <= radius
}
