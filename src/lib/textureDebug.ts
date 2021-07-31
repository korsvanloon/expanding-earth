import * as THREE from 'three'
import atmosphereVertexShader from '../shaders/atmosphere-vertex.glsl'
import atmosphereFragmentShader from '../shaders/atmosphere-fragment.glsl'
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
    position: new THREE.Vector3(0, -200, -100),
  })

  const [sphere, atmosphere] = createSphereWithGlow({
    radius: 100,
    globeTexture: colorAgeMap,
  })

  const camera = createCamera()
  const scene = createScene(camera, backgroundPlane, canvasPlane, sphere, atmosphere)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  createControls(camera, renderer.domElement)

  const origins = [
    new THREE.Vector2(0, 1),
    new THREE.Vector2(0, 0.25),
    new THREE.Vector2(0, 0.5),
    new THREE.Vector2(0, 0.75),
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

  // Animation Loop
  async function update() {
    const age = earthAge(nextEarthAnimation(earth))
    updatePlaneMaterial(canvasPlane.material, age)
    updateSphereMaterial(sphere.material, age, origins)

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

function updatePlaneMaterial(material: THREE.MeshBasicMaterial, age: number) {
  const offset = -0.6 * age + 0.6
  const repeat = 1.2 * age - 0.2
  material.alphaTest = Math.max(0, 1 - (age - 0.5) * 2)
  material.map?.offset.set(offset, offset)
  material.map?.repeat.set(repeat, repeat)
}

function updateSphereMaterial(
  material: THREE.ShaderMaterial,
  age: number,
  origins: THREE.Vector2[],
) {
  material.uniforms.age.value = age
  material.uniforms.origins.value = origins
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
  background.position.copy(position)

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  )
  plane.position.copy(position)
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

const createSphereWithGlow = ({
  radius,
  position = new THREE.Vector3(0, 0, 0),
  globeTexture,
}: {
  position?: THREE.Vector3
  globeTexture: THREE.Texture
  radius: number
}) => {
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 50, 50),
    new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        globeTexture: { value: globeTexture },
        age: { value: 0 },
        origins: {
          value: [
            new THREE.Vector2(0.25, 0.25),
            new THREE.Vector2(0.25, 0.5),
            new THREE.Vector2(0.25, 0.75),
            new THREE.Vector2(0.5, 0.25),
            new THREE.Vector2(0.5, 0.5),
            new THREE.Vector2(0.5, 0.75),
            new THREE.Vector2(0.75, 0.25),
            new THREE.Vector2(0.75, 0.5),
            new THREE.Vector2(0.75, 0.75),
          ],
        },
      },
    }),
  )
  sphere.position.copy(position)

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 50, 50),
    new THREE.ShaderMaterial({
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
