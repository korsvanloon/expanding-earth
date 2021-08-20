import { Vector2 } from 'three'

export type PixelColor = readonly [number, number, number, number]

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

export const pixelColorToHex = ([r, g, b]: PixelColor) =>
  '#' +
  r.toString(16).padStart(2, '0') +
  g.toString(16).padStart(2, '0') +
  b.toString(16).padStart(2, '0')
