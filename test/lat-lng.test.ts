import { PI } from '../src/lib/math'
import { point3DToLatLng, latLngToPoint3D } from '../src/lib/lat-lng'

describe('symmetry', () => {
  test.each([
    { x: 0, y: 0 }, //
    // new Vector2(0.4, 0.7),
    { x: -PI, y: 0 },
  ])('latLng:($x, $y)', (latLng) => {
    const result = point3DToLatLng(latLngToPoint3D(latLng))
    expect({ x: result.x, y: result.y }).toEqual({ x: latLng.x, y: latLng.y })
  })
})
