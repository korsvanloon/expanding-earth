import * as THREE from 'three'
import atmosphereVertexShader from '../shaders/atmosphere.vert.glsl'
import atmosphereFragmentShader from '../shaders/atmosphere.frag.glsl'
import vertexShader from '../shaders/vertex.glsl'
import fragmentShader from '../shaders/fragment.glsl'
import { createScene, createCamera, createControls } from './threejs'
import EarthGeometry from './EarthGeometry'
import { createMultiMaterialObject } from 'vendor/SceneUtils'

const earth = {
  animate: 1,
  autoanimaterate: 0.05,
  animate_dir: 1,
  scaleA: 0.5,
  scaleB: 1,
}

type Earth = typeof earth

async function main(onUpdate?: (age: number) => void) {
  const ageMap = new THREE.TextureLoader().load('textures/age-map.png')
  const heightMap = new THREE.TextureLoader().load('textures/height-map.jpg')
  const platesMap = new THREE.TextureLoader().load('textures/plates.png')
  const colorMap = new THREE.TextureLoader().load('textures/earth-relief-map.jpg')
  // const colorMap = new THREE.TextureLoader().load('textures/crustal-age-map.jpg')

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

  const [sphere, atmosphere] = createSphereWithGlow({
    radius: 100,
    shader,
  })

  const axesHelper = new THREE.AxesHelper(5)

  const camera = createCamera()
  const scene = createScene(axesHelper, camera, sphere, atmosphere)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  createControls(camera, renderer.domElement)

  // Animation Loop
  async function update() {
    const age = earthAge(nextEarthAnimation(earth))
    updateSphereMaterial(shader, age, [])
    renderer.render(scene, camera)

    onUpdate?.(age)

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
  onWindowResize()
  window.addEventListener('resize', onWindowResize, false)

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
    // const intersects = raycaster.intersectObjects(originSpheres)
    // if (intersects.length > 0) {
    //   console.log(intersects[0].object.position)
    // }
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
  // material.uniforms.plates.value = plates
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

const createSphereWithGlow = ({
  radius,
  position = new THREE.Vector3(0, 0, 0),
  shader,
}: {
  position?: THREE.Vector3
  radius: number
  shader: THREE.ShaderMaterial
}) => {
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
  })
  // const multiMaterial = [shader]
  const multiMaterial = [shader, wireframeMaterial]

  const sphere = createMultiMaterialObject(new EarthGeometry(20), multiMaterial)
  sphere.scale.set(radius, radius, radius)
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
