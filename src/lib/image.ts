import { Vector2 } from 'three'

export type PixelColor = readonly [number, number, number, number]

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

export function setPixelColor(imageData: ImageData, [r, g, b, a]: PixelColor, { x, y }: Vector2) {
  const index = x + y * imageData.width
  imageData.data[index * 4 + 0] = r
  imageData.data[index * 4 + 1] = g
  imageData.data[index * 4 + 2] = b
  imageData.data[index * 4 + 3] = a
}

export const getPixelColor = (imageData: ImageData, { x, y }: Vector2): PixelColor => {
  const index = x + y * imageData.width
  return [
    imageData.data[index * 4 + 0],
    imageData.data[index * 4 + 1],
    imageData.data[index * 4 + 2],
    imageData.data[index * 4 + 3],
  ]
}

export const uvToPixel = (uv: Vector2, height: number) =>
  new Vector2(Math.round(uv.x * height * 2), Math.round(uv.y * height))

export const pixelToUv = (pixel: Vector2, height: number) =>
  new Vector2(pixel.x / (height * 2), pixel.y / height)

export const alpha = ([r, g, b]: PixelColor, a: number): PixelColor => [r, g, b, a]

export const pixelColorToHex = ([r, g, b]: PixelColor) =>
  '#' +
  r.toString(16).padStart(2, '0') +
  g.toString(16).padStart(2, '0') +
  b.toString(16).padStart(2, '0')

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

export function* equirectangularUVs(resolution = 16) {
  yield new Vector2(0.5, 0)
  for (const pixel of pixelsInRange({
    startX: 1,
    startY: 1,
    height: resolution,
    width: resolution * 2,
  })) {
    yield pixel.divideScalar(resolution).setX(pixel.x / 2)
  }
  yield new Vector2(0.5, 1)
}

export function* equirectangularUVLines(resolution = 16) {
  yield new Vector2(0.5, 0)
  for (const pixel of pixelsInRange({
    startX: 1,
    startY: 1,
    height: resolution,
    width: resolution * 2,
  })) {
    yield pixel.divideScalar(resolution).setX(pixel.x / 2)
  }
  yield new Vector2(0.5, 1)
}
