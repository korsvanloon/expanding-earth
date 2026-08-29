import { Vector2 } from 'three'
import { pixelToUv, uvToPixel } from '../src/lib/image'

/**
 * UV goes from bottom-left to top-right (like math xy-axis, unlike pixels)
 */

describe('symmetry', () => {
  test.each([
    new Vector2(0.5, 0.5), //
    new Vector2(0.4, 0.7),
    new Vector2(0.6, 0.7),
  ])('pixel:($x, $y)', (uv) => {
    const height = 400
    const result = pixelToUv(uvToPixel(uv, height), height)
    expect({ x: result.x, y: result.y }).toEqual({ x: uv.x, y: uv.y })
  })
})
