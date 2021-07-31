import * as THREE from 'three'
import vertexShader from '../shaders/vertex.glsl'
import fragmentShader from '../shaders/fragment.glsl'
import createCamera from './camera'
import { createControls } from './initEarth'
import { nextImageData } from './plate'

const earth = {
  animate: 1,
  autoanimaterate: 0.05,
  animate_dir: 1,
  scaleA: 0.5,
  scaleB: 1,
}

console.log(fragmentShader)

type Earth = typeof earth

async function main() {
  const ageMap = new THREE.TextureLoader().load('masks/agemap.png')
  const colorAgeMap = new THREE.TextureLoader().load('textures/crustal-age.jpg')
  const northAmerica = await new THREE.TextureLoader().loadAsync('masks/north_america2.png')

  const [backgroundPlane, canvasPlane] = createPlaneWithBackground({
    width: 100,
    height: 50,
    map: northAmerica,
    alphaMap: ageMap,
    backgroundColor: 0x0000dd,
    position: new THREE.Vector3(0, 0, 200),
  })

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(100, 50, 50),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
    }),
    // new THREE.MeshBasicMaterial({
    //   map: colorAgeMap,
    // }),
  )

  const camera = createCamera()
  const scene = createScene(camera, backgroundPlane, canvasPlane, sphere)
  const renderer = new THREE.WebGLRenderer()
  createControls(camera, renderer.domElement)

  // Animation Loop
  async function update() {
    updateMaterial(canvasPlane.material, earthAge(nextEarthAnimation(earth)))

    renderer.render(scene, camera)
    requestAnimationFrame(update)
  }
  requestAnimationFrame(update)

  const container = document.querySelector('#container')!
  container.appendChild(renderer.domElement)

  // Listeners
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onWindowResize, false)
  onWindowResize()

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    earth.animate += event.deltaY / 50
  }
  renderer.domElement.addEventListener('wheel', onWheel, false)

  return () => {
    // Cleanup
    window.removeEventListener('resize', onWindowResize)
    renderer.domElement.removeEventListener('wheel', onWheel)
    container.removeChild(renderer.domElement)
  }
}

export default main

function updateMaterial(material: THREE.MeshBasicMaterial, age: number) {
  const offset = -0.6 * age + 0.6
  const repeat = 1.2 * age - 0.2
  material.alphaTest = Math.max(0, 1 - (age - 0.5) * 2)
  material.map?.offset.set(offset, offset)
  material.map?.repeat.set(repeat, repeat)

  // if (material.map?.image) {
  //   const image = nextImageData(material.map.image)
  //   material.map.image = image
  //   material.map.needsUpdate = true
  // }
}

const earthAge = (earth: Earth) =>
  earth.scaleA + (earth.scaleB - earth.scaleA) * (earth.animate / 100)

function nextEarthAnimation(earth: Earth) {
  earth.animate += earth.autoanimaterate * earth.animate_dir
  if (earth.animate > 100) {
    earth.animate_dir = -1
    earth.animate = 100
  }
  if (earth.animate < 1) {
    earth.animate_dir = 1
    earth.animate = 1
  }
  return earth
}

const createScene = (...children: THREE.Object3D[]) => {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  scene.add(...children)

  return scene
}

const createPlaneWithBackground = ({
  width,
  height,
  map,
  alphaMap,
  backgroundColor: color,
  position = new THREE.Vector3(0, 0, 0),
}: {
  width: number
  height: number
  map: THREE.Texture
  backgroundColor?: number
  alphaMap?: THREE.Texture
  position?: THREE.Vector3
}) => {
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  )
  background.position.x = position.x
  background.position.y = position.y
  background.position.z = position.z

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  )
  plane.position.x = position.x
  plane.position.y = position.y
  plane.position.z = position.z + 1

  map.repeat.set(1, 1)
  map.wrapS = THREE.RepeatWrapping

  const material = new THREE.MeshBasicMaterial({
    map: map,
    alphaTest: 1,
    alphaMap,
    side: THREE.DoubleSide,
  })
  plane.material = material

  return [background, plane]
}
