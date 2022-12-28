import {
  getPixelColor,
  loadImageData,
  PixelColor,
  pixelsInRange,
  pixelToUv,
  setPixelColor,
  uvToPixel,
} from './image'
import convert from 'color-convert'
import { abs, round } from './math'
import { uvToPoint3D } from './sphere'
import { vec2, vec3 } from './lat-lng'
import { Vector3 } from 'three'

export type Props = {
  canvas: HTMLCanvasElement
  height: number
}

export type AgeEarth = {
  update: (age: number) => void
}

async function createAgeEarth({ height, canvas }: Props): Promise<AgeEarth> {
  const [ageMap] = await Promise.all([loadImageData('textures/age-map.png', 800, 400)])
  canvas.width = height * 2
  canvas.height = height
  const context = canvas.getContext('2d')!

  return {
    /**
     * @param age a number from [0..1]
     */
    update(age: number) {
      const imageData = imageForAge({ age, ageMap, height })
      context.putImageData(imageData, 0, 0)
    },
  }
}

export default createAgeEarth

const bounds = [
  vec2({ x: -1.0, y: 1.0 }), // topLeft
  vec2({ x: 0.0, y: 1.0 }), // topMiddle
  vec2({ x: 1.0, y: 1.0 }), // topRight
  vec2({ x: -1.0, y: 0.0 }), // middleLeft
  vec2({ x: 1.0, y: 0.0 }), // middleRight
  vec2({ x: -1.0, y: -1.0 }), // bottomLeft
  vec2({ x: 0.0, y: -1.0 }), // bottomMiddle
  vec2({ x: 1.0, y: -1.0 }), // bottomRight
].map((v) => v.normalize())

function imageForAge({ age, ageMap, height }: { age: number; ageMap: ImageData; height: number }) {
  const result = new ImageData(height * 2, height)

  for (const pixel of pixelsInRange({ height, width: height * 2 })) {
    const uv = pixelToUv(pixel, height)
    const point = uvToPoint3D(uv)
      .normalize()
      .add(vec3({ x: 1, y: 1, z: 1 }))
      .divideScalar(2)
    const ageColor = getPixelColor(ageMap, pixel)
    const age = ageColor[0]
    const crustalColor = [...convert.hsl.rgb([round(age * 255), 100, 50]), 255] as const

    let direction = new Vector3()
    for (const bound of bounds) {
      const boundUv = vec2(uv).addScaledVector(bound, 0.005)
      const boundPixel = uvToPixel(boundUv, height)
      const boundAge = getPixelColor(ageMap, boundPixel)[0]
      const difference = boundAge - age
      if (boundAge > age) {
        const boundPoint = uvToPoint3D(boundUv)
        direction.add(vec3(point).sub(vec3(boundPoint).multiplyScalar(difference)))
      }
    }
    direction.normalize()

    // const color =
    //   age < 0.99 && abs(round(age * 255) - ageColor[0]) < 3
    //     ? crustalColor
    //     : ([0, 0, 0, 0] as const)
    if (pixel.x % (height * 0.25) === 0 && pixel.y % (height * 0.25) === 0) {
      console.log(pixel, [...vec3(point).multiplyScalar(255).round().toArray(), 0])
    }
    const color = [...vec3(direction).multiplyScalar(255).round().toArray(), 255] as const
    setPixelColor(result, color, pixel)
  }
  return result
}
