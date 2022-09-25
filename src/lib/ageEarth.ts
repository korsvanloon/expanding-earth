import { getPixelColor, loadImageData, PixelColor, pixelsInRange, setPixelColor } from './image'
import convert from 'color-convert'
import { abs, round } from './math'

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

function imageForAge({ age, ageMap, height }: { age: number; ageMap: ImageData; height: number }) {
  const result = new ImageData(height * 2, height)

  for (const pixel of pixelsInRange({ height, width: height * 2 })) {
    const ageColor = getPixelColor(ageMap, pixel)
    const crustalColor = [...convert.hsl.rgb([round(age * 255), 100, 50]), 255] as PixelColor
    const color =
      age < 0.99 && abs(round(age * 255) - ageColor[0]) < 3
        ? crustalColor
        : ([0, 0, 0, 0] as PixelColor)

    setPixelColor(result, color, pixel)
  }
  return result
}
