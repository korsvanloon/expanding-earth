import { Vector2, Vector3 } from 'three'
import {
  getPixelColor,
  loadImageData,
  pixelColorToHex,
  pixelsInRange,
  pixelToUv,
  setPixelColor,
  uvToPixel,
} from './image'
import { getIntermediatePoint, uvToPoint, pointToUv } from './sphere'

export type PlateMovement = {
  name: string
  color: string
  originUV: Vector2
  destination: Vector3
  rotation: number
}

export type Props = {
  plates: PlateMovement[]
  canvas: HTMLCanvasElement
  height: number
}

export type PlatesEarth = {
  update: (age: number) => void
}

async function createPlatesEarth({ plates, height, canvas }: Props): Promise<PlatesEarth> {
  const [
    platesMap,
    colorMap,
    // ageMap,
    // heightMap
  ] = await Promise.all([
    loadImageData('textures/plates.png', 800, 400),
    loadImageData('textures/crustal-age-map.jpg', 800, 400),
    // loadImageData('textures/age-map.png', 800, 400),
    // loadImageData('textures/height-map.jpg', 800, 400),
  ])
  canvas.width = height * 2
  canvas.height = height
  const context = canvas.getContext('2d')!

  const badPixels = checkBadPixels(platesMap, plates)
  if (badPixels.length) {
    console.log(badPixels)
    context.putImageData(platesMap, 0, 0)

    for (const pixel of badPixels) {
      context.fillStyle = pixel.c
      context.beginPath()
      context.ellipse(pixel.p.x, pixel.p.y, 10, 10, 0, 0, 2 * Math.PI)
      context.fill()
    }

    throw new Error(`There are badPixels ${badPixels.length}`)
  }

  return {
    /**
     * @param age a number from [0..1]
     */
    update(age: number) {
      const imageData = imageForAge(age, colorMap, platesMap, plates, height)
      context.putImageData(imageData, 0, 0)
    },
  }
}

export default createPlatesEarth

function imageForAge(
  age: number,
  imageData: ImageData,
  platesMap: ImageData,
  plates: PlateMovement[],
  height: number,
) {
  const result = new ImageData(height * 2, height)

  for (const pixel of pixelsInRange({ height, width: height * 2 })) {
    const continentColor = pixelColorToHex(getPixelColor(platesMap, pixel))
    const origin = plates.find((p) => p.color === continentColor)?.originUV
    if (!origin) {
      throw new Error(`No plate for ${pixel.x} ${pixel.y} ${continentColor}`)
    }

    const nextPixel = getAgePixel(pixel, origin, age, height)

    const color = getPixelColor(imageData, nextPixel)

    setPixelColor(result, color, pixel)
  }
  return result
}

const getAgePixel = (pixel: Vector2, origin: Vector2, age: number, height: number) => {
  const uv = pixelToUv(pixel, height)
  const point = uvToPoint(uv)
  const agePoint = getIntermediatePoint(point, uvToPoint(origin), age / 2).normalize()
  const ageUv = pointToUv(agePoint)
  const agePixel = uvToPixel(ageUv, height)
  return agePixel
}

const checkBadPixels = (imageData: ImageData, plates: PlateMovement[]) =>
  [...pixelsInRange({ height: imageData.height, width: imageData.width })]
    .map((p) => ({
      p,
      c: pixelColorToHex(getPixelColor(imageData, p)),
    }))
    .filter(({ c }) => !plates.some((p) => p.color === c))
