export const getMaskedTerrain = (terrain: ImageData, mask: ImageData, maskColor: number) => {
  const data = terrain.data.map((v, i) => (mask.data[i] === maskColor ? v : 0))
  return new ImageData(data, terrain.width, terrain.height)
}

export const nextImageData = (source: ImageData) => {
  const data = new Uint8ClampedArray(source.width * source.height * 4)

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const i = (y * source.width + x) * 4
      if (i + 1 < data.length - 1) data[i + 1] = source.data[i]
    }
  }
  return new ImageData(data, source.width, source.height)
}
