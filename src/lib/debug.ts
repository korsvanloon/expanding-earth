import { Vector2, Vector3 } from 'three'
import { getPixelColor, pixelColorToHex, pixelToUv, setPixelColor, uvToPixel } from './pixel'
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

async function createEarth({ plates, height, canvas }: Props) {
  // const ageMap = await loadImageData('textures/age-map.png', 800, 400)
  // const heightMap = await loadImageData('textures/height-map.jpg', 800, 400)
  const platesMap = await loadImageData('textures/plates.png', 800, 400)
  const colorMap = await loadImageData('textures/crustal-age-map.jpg', 800, 400)
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

  /**
   * @param age a number from [0..1]
   */
  function update(age: number) {
    const imageData = imageForAge(age, colorMap, platesMap, plates, height)
    context.putImageData(imageData, 0, 0)

    // for (const plate of plates) {
    //   const pixel = uvToPixel(plate.originUV, height)

    //   context.fillStyle = plate.color
    //   context.beginPath()
    //   context.ellipse(pixel.x, pixel.y, 10, 10, 0, 0, 2 * Math.PI)
    //   context.fill()
    // }
  }

  return { update }
}

type Unwrap<T> = T extends Promise<infer U>
  ? U
  : T extends (...args: any) => Promise<infer U>
  ? U
  : T extends (...args: any) => infer U
  ? U
  : T
export type Earth = Unwrap<ReturnType<typeof createEarth>>

export default createEarth

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

export const loadImageData = async (src: string, width: number, height: number) =>
  new Promise<ImageData>((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    context.imageSmoothingEnabled = false

    const img = new Image()
    img.src = src
    img.onload = () => {
      context.drawImage(img, 0, 0, width, height)
      resolve(context.getImageData(0, 0, width, height))
    }
  })

export function* pixelsInRange({
  height,
  width,
  startY,
  startX,
}: {
  height?: number
  width?: number
  startY?: number
  startX?: number
}) {
  for (let y = startY ?? 0; y < (height ?? width ?? 0); y++) {
    for (let x = startX ?? 0; x < (width ?? height ?? 0); x++) {
      yield new Vector2(x, y)
    }
  }
}
