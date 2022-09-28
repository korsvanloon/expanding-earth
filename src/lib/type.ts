export type UV = {
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
   * left...right: 0...2H
   */
  x: number
  /** Y
   *
   * top...bottom: 0...H
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
