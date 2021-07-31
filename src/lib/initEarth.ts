import * as THREE from 'three'
import { Position } from '../data/position'
import { Earth } from './earth'
import { OrbitControls } from '../vendor/OrbitControls.js'
import { GUI } from 'dat.gui'

const initEarth = (start_data: Position[], end_data: Position[], scale_min: number) => {
  const earth = new THREE.Group() as Earth

  earth.name = 'earth'
  earth.start_data = start_data
  earth.end_data = end_data
  earth.scaleA = scale_min
  earth.scaleB = 1
  earth.timeline = 'B'
  earth.animate = 100
  earth.spin = true
  earth.age_data = false
  earth.spinrate = 0.005
  earth.autoanimate = true
  earth.autoanimaterate = 0.05
  earth.animate_dir = 1
  earth.plate_selected = 'africa'
  earth.link = 'test'
  earth.position.x = 0
  earth.position.y = 0
  earth.position.z = 0

  return earth
}

export default initEarth

export const createStarField = () => {
  const starGeometry = new THREE.SphereGeometry(1200, 50, 50)
  const starMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('textures/eso0932a.jpg'),
    side: THREE.DoubleSide,
  })
  const starField = new THREE.Mesh(starGeometry, starMaterial)
  starField.visible = true
  starField.rotation.x = (-60 / 180) * Math.PI

  return starField
}

export const createControls = (camera: THREE.PerspectiveCamera, element: HTMLCanvasElement) => {
  const controls = new OrbitControls(camera, element)
  controls.enableDamping = true // an animation loop is required when either damping or auto-rotation are enabled
  controls.dampingFactor = 1
  controls.enableKeys = false
  controls.enableZoom = false
  controls.screenSpacePanning = false
  controls.minDistance = 10
  controls.maxDistance = 900
  controls.autoRotateSpeed = 0.2
  controls.autoRotate = false
  controls.update()
  return controls
}

type Callbacks = {
  updatePositions: (value?: any) => void
  animate: (value?: any) => void
  updateUvTransform: (value?: any) => void
}

type LandData = Position & {
  filename: string
  rotationx: number
  rotationy: number
  repeatx: number
  repeaty: number
  offsetx: number
  offsety: number
  visible: boolean
}

export const initGui = (
  earth: Earth,
  landObj: LandData[],
  { updatePositions, animate, updateUvTransform }: Callbacks,
) => {
  const gui = new GUI({ width: 350 })

  gui.add(earth, 'timeline', ['A', 'B']).name('Position').onFinishChange(updatePositions).listen()
  gui.add(earth, 'animate', 1, 100).name('Animate').onChange(animate).listen()
  gui.add(earth, 'spin').name('Spin').listen()
  gui.add(earth, 'autoanimate').name('Auto-animate').listen()
  gui.add(earth, 'spinrate').name('Spin Rate')
  gui.add(earth, 'autoanimaterate').name('Auto-animate Rate')
  gui.add(earth, 'link').name('Link').listen()

  for (const obj of [...landObj].sort((a, b) =>
    a.name.toUpperCase().localeCompare(b.name.toUpperCase()),
  )) {
    const folder = gui.addFolder(obj.name)
    folder.add(obj, 'x', -5.0, 5.0).name('x').onChange(updateUvTransform)
    folder.add(obj, 'y', -5.0, 5.0).name('y').onChange(updateUvTransform)
    folder.add(obj, 'z', -5.0, 5.0).name('z').onChange(updateUvTransform)
    folder.add(obj, 'visible').name('Visibility').onChange(updateUvTransform)
  }
  return gui
}
