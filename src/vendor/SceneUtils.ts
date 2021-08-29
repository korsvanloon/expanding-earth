import { BufferGeometry, Group, Material, Mesh } from 'three'

export function createMultiMaterialObject(geometry: BufferGeometry, materials: Material[]) {
  const group = new Group()
  group.add(...materials.map((m) => new Mesh(geometry, m)))
  return group
}
