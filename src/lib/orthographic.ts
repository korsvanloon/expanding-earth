import { Vector2 } from 'three'
import { sqrt, pow, asin, atan2, sin, cos } from './math'

const radius = 0.5 // float

export const coordinateToOrthographicLatLng = (pixel: Pixel, centerLatLng: LatLng) => {
  const ro = sqrt(pow(pixel.x, 2.0) + pow(pixel.y, 2.0)) // float
  const c = asin(ro / radius) // float

  return new Vector2(
    centerLatLng.x +
      atan2(
        pixel.x * sin(c),
        ro * cos(c) * cos(centerLatLng.y) - pixel.y * sin(c) * sin(centerLatLng.y),
      ),
    asin(cos(c) * sin(centerLatLng.y) + (pixel.y * sin(c) * cos(centerLatLng.y)) / ro),
  )
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

export interface UV {
  /** U
   *
   * left...right: 0...1
   */
  x: number
  /** V
   *
   * top...bottom: 1...0
   */
  y: number
}

export type Pixel = {
  /** X
   *
   * left...right: -0.5...0.5
   */
  x: number
  /** Y
   *
   * top...bottom: 0.5...-0.5
   */
  y: number
}

export type LatLng = {
  /** Longitude λ
   *
   * left...right: -π...π
   */
  x: number
  /** Latitude φ
   *
   * top...bottom: -0.5π...0.5π
   */
  y: number
}

export type Point = {
  /** X
   *
   * left...right: 0...1
   */
  x: number
  /** Y
   *
   * top...bottom: 0...1
   */
  y: number
}
