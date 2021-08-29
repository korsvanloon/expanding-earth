import atmosphereVertexShader from '../shaders/atmosphere.vert.glsl'
import atmosphereFragmentShader from '../shaders/atmosphere.frag.glsl'
import vertexShader from '../shaders/vertex.glsl'
import fragmentShader from '../shaders/fragment.glsl'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  RawShaderMaterial,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { createScene, createCamera, createControls } from './threejs'
import { createMultiMaterialObject } from 'vendor/SceneUtils'
import EarthGeometry from './EarthGeometry'

export type Props = {
  geometry: EarthGeometry
  container: HTMLDivElement
  height: number
}

export type GlobeEarth = {
  update: (age: number) => void
  cleanUp: () => void
}

const state = { age: 0 }

async function createGlobeEarth({ geometry, container }: Props): Promise<GlobeEarth> {
  const colorMap = new TextureLoader().load('textures/earth-relief-map.jpg')
  const shader = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      globeTexture: { value: colorMap },
      age: { value: 0 },
    },
  })

  const [sphere, atmosphere] = createSphereWithGlow({
    geometry,
    radius: 100,
    shader,
  })

  const camera = createCamera()
  const scene = createScene(camera, sphere, atmosphere)
  const renderer = new WebGLRenderer({ antialias: true })
  createControls(camera, renderer.domElement)

  container.appendChild(renderer.domElement)

  const width = container.clientWidth
  const height = container.clientHeight

  function onWindowResize() {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  onWindowResize()

  async function update() {
    updateSphereMaterial(shader, state.age)
    renderer.render(scene, camera)
    requestAnimationFrame(update)
  }
  requestAnimationFrame(update)

  return {
    /**
     * @param age a number from [0..1]
     */
    update(age: number) {
      state.age = age || 0.001
      // updateSphereMaterial(shader, age)
      // renderer.render(scene, camera)
    },
    cleanUp: () => {
      container.removeChild(renderer.domElement)
    },
  }
}

export default createGlobeEarth

function updateSphereMaterial(material: ShaderMaterial, age: number) {
  material.uniforms.age.value = age
}

const createSphereWithGlow = ({
  geometry,
  radius,
  position = new Vector3(0, 0, 0),
  shader,
}: {
  geometry: BufferGeometry
  position?: Vector3
  radius: number
  shader: ShaderMaterial
}) => {
  const wireframeMaterial = new MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
  })
  // const color = new MeshBasicMaterial({
  //   map: new TextureLoader().load('textures/crustal-age-map.jpg'),
  // })
  // const multiMaterial = [shader]
  const multiMaterial = [shader, wireframeMaterial]

  const sphere = createMultiMaterialObject(geometry, multiMaterial)
  sphere.scale.set(radius, radius, radius)
  sphere.position.copy(position)

  const atmosphere = new Mesh(
    new SphereGeometry(radius, 50, 50),
    new RawShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: AdditiveBlending,
      side: BackSide,
    }),
  )
  atmosphere.scale.set(1.1, 1.1, 1.1)
  atmosphere.position.copy(position)

  return [sphere, atmosphere]
}
