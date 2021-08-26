import { getPixelColor, loadImageData, PixelColor, pixelsInRange, setPixelColor } from './image'
import convert from 'color-convert'

const { abs, round } = Math

export type Props = {
  canvas: HTMLCanvasElement
  height: number
}

export type AgeEarth = {
  update: (age: number) => void
}

async function createAgeEarth({ height, canvas }: Props): Promise<AgeEarth> {
  const [crustalAgeMap, ageMap, heightMap] = await Promise.all([
    // loadImageData('textures/a-map.jpg', 800, 400),
    loadImageData('textures/crustal-age-map.jpg', 800, 400),
    loadImageData('textures/age-map.png', 800, 400),
    loadImageData('textures/earth-relief-map.jpg', 800, 400),
  ])
  canvas.width = height * 2
  canvas.height = height
  const context = canvas.getContext('2d')!

  return {
    /**
     * @param age a number from [0..1]
     */
    update(age: number) {
      const imageData = imageForAge({ age, crustalAgeMap, ageMap, heightMap, height })
      context.putImageData(imageData, 0, 0)
    },
  }
}

export default createAgeEarth

function imageForAge({
  age,
  crustalAgeMap,
  ageMap,
  heightMap,
  height,
}: {
  age: number
  crustalAgeMap: ImageData
  ageMap: ImageData
  heightMap: ImageData
  height: number
}) {
  const result = new ImageData(height * 2, height)

  for (const pixel of pixelsInRange({ height, width: height * 2 })) {
    // const crustalColor = getPixelColor(crustalAgeMap, pixel)
    const ageColor = getPixelColor(ageMap, pixel)
    const heightColor = getPixelColor(heightMap, pixel)

    const crustalColor = [...convert.hsl.rgb([round(age * 255), 100, 50]), 255] as PixelColor

    const color = age < 0.99 && abs(round(age * 255) - ageColor[0]) < 3 ? crustalColor : heightColor

    setPixelColor(result, color, pixel)
  }
  return result
}
