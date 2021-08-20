import * as THREE from 'three'
import atmosphereVertexShader from '../shaders/atmosphere.vert.glsl'
import atmosphereFragmentShader from '../shaders/atmosphere.frag.glsl'
import vertexShader from '../shaders/vertex.glsl'
import fragmentShader from '../shaders/fragment.glsl'
import createCamera from './camera'
import { createControls } from './initEarth'

const earth = {
  animate: 1,
  autoanimaterate: 0.05,
  animate_dir: 1,
  scaleA: 0.5,
  scaleB: 1,
}

const plates: PlateMovement[] = [
  {
    name: 'Old world',
    color: new THREE.Vector3(0xff, 0x00, 0x00),
    origin: new THREE.Vector3(0, 0, 1),
    destination: new THREE.Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'New world',
    color: new THREE.Vector3(0, 0x0f, 0xff),
    origin: new THREE.Vector3(-1, 0, 0),
    destination: new THREE.Vector3(0, 0, 0),
    rotation: 0,
  },
  {
    name: 'Antarctica',
    color: new THREE.Vector3(0xd6, 0xd6, 0xd6),
    origin: new THREE.Vector3(0, -1, 0),
    destination: new THREE.Vector3(0, 0, 0),
    rotation: 0,
  },
]

type Earth = typeof earth

const origins = [
  new THREE.Vector2(0, 0.5),
  new THREE.Vector2(0.25, 0.25),
  new THREE.Vector2(0.25, 0.5),
  new THREE.Vector2(0.25, 0.75),
  new THREE.Vector2(0.5, 0.25),
  new THREE.Vector2(0.5, 0.5),
  new THREE.Vector2(0.5, 0.75),
  new THREE.Vector2(0.75, 0.25),
  new THREE.Vector2(0.75, 0.5),
  new THREE.Vector2(0.75, 0.75),
  new THREE.Vector2(1, 0.25),
  new THREE.Vector2(1, 0.5),
  new THREE.Vector2(1, 0.75),
]

async function main(onUpdate?: (age: number) => void) {
  const ageMap = new THREE.TextureLoader().load('textures/age-map.png')
  const heightMap = new THREE.TextureLoader().load('textures/height-map.jpg')
  const platesMap = new THREE.TextureLoader().load('textures/plates.png')
  const colorMap = new THREE.TextureLoader().load('textures/crustal-age-map.jpg')

  const shader = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: { value: colorMap },
      platesMap: { value: platesMap },
      age: { value: 0 },
      plates: { value: [] },
      origins: { value: [] },
      origins_size: { value: 0 },
    },
  })

  const canvasPlane = createPlane({
    width: 100,
    height: 50,
    shader,
    position: new THREE.Vector3(0, -200, -100),
  })

  const [sphere, atmosphere] = createSphereWithGlow({
    radius: 100,
    shader,
  })

  const originSpheres = plates.map((plate) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(3, 5, 5),
      new THREE.MeshBasicMaterial({
        color: plate.color.x * 256 * 256 + plate.color.y * 256 + plate.color.z,
      }),
    )
    s.position.copy(plate.origin.multiplyScalar(100))
    return s
  })

  const camera = createCamera()
  const scene = createScene(camera, canvasPlane, sphere, atmosphere, ...originSpheres)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  createControls(camera, renderer.domElement)

  // Animation Loop
  async function update() {
    const age = earthAge(nextEarthAnimation(earth))
    // updatePlaneMaterial(canvasPlane.material, age)
    updateSphereMaterial(canvasPlane.material as THREE.ShaderMaterial, age, origins)
    updateSphereMaterial(sphere.material, age, origins)

    onUpdate?.(age)

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

  // See https://stackoverflow.com/questions/12800150/catch-the-click-event-on-a-specific-mesh-in-the-renderer
  // Handle all clicks to determine of a three.js object was clicked and trigger its callback
  function onDocumentMouseDown(event: MouseEvent) {
    event.preventDefault()

    const mouse = new THREE.Vector2(
      (event.clientX / renderer.domElement.clientWidth) * 2 - 1,
      -(event.clientY / renderer.domElement.clientHeight) * 2 + 1,
    )

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(originSpheres)

    if (intersects.length > 0) {
      console.log(intersects[0].object.position)
    }
  }
  renderer.domElement.addEventListener('mousedown', onDocumentMouseDown, false)

  return () => {
    // Cleanup
    window.removeEventListener('resize', onWindowResize)
    renderer.domElement.removeEventListener('wheel', onWheel)
    renderer.domElement.removeEventListener('mousedown', onDocumentMouseDown)
    container.removeChild(renderer.domElement)
  }
}

export default main

function updateSphereMaterial(
  material: THREE.ShaderMaterial,
  age: number,
  origins: THREE.Vector2[],
) {
  material.uniforms.age.value = age
  material.uniforms.origins_size.value = origins.length
  material.uniforms.origins.value = origins
  material.uniforms.plates.value = plates
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

type PlateMovement = {
  name: string
  color: THREE.Vector3
  origin: THREE.Vector3
  destination: THREE.Vector3
  rotation: number
}

const createPlane = ({
  width,
  height,
  shader,
  position = new THREE.Vector3(0, 0, 0),
}: {
  width: number
  height: number
  position?: THREE.Vector3
  shader: THREE.ShaderMaterial
}) => {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), shader)
  plane.position.copy(position)

  return plane
}

const createSphereWithGlow = ({
  radius,
  position = new THREE.Vector3(0, 0, 0),
  shader,
}: {
  position?: THREE.Vector3
  radius: number
  shader: THREE.ShaderMaterial
}) => {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 50, 50), shader)
  sphere.position.copy(position)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 50, 50),
    new THREE.RawShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    }),
  )
  atmosphere.scale.set(1.1, 1.1, 1.1)
  atmosphere.position.copy(position)

  return [sphere, atmosphere]
}

const toSpherePoint = (uv: THREE.Vector2, radius: number) => {
  const theta = 2.0 * Math.PI * (uv.x - 0.75)
  const phi = Math.PI * uv.y

  return new THREE.Vector3(
    Math.cos(theta) * Math.sin(phi) * radius, // [1,0] * [0,1]
    Math.cos(phi) * radius, // [1,0]
    -Math.sin(theta) * Math.sin(phi) * radius, // [0,-1] * [0,1]
    // cos(phi) * cos(theta) * radius,
    // sin(phi) * radius,
    // cos(phi) * sin(theta) * radius
  )
}
