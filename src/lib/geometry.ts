import { Vector3, Mesh, PlaneGeometry, Material, Vector2 } from 'three'

export const createPlane = <TMaterial extends Material | Material[] = Material | Material[]>({
  width,
  height,
  material: shader,
  position = new Vector3(0, 0, 0),
}: {
  width: number
  height: number
  position?: Vector3
  material: TMaterial
}) => {
  const plane = new Mesh(new PlaneGeometry(width, height), shader)
  plane.position.copy(position)
  return plane
}
