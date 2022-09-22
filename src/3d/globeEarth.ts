import atmosphereVertexShader from '../shaders/atmosphere.vert.glsl'
import atmosphereFragmentShader from '../shaders/atmosphere.frag.glsl'
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  RawShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { createScene, createCamera, createControls, createStarField } from './threejs'
import { createMultiMaterialObject } from 'vendor/SceneUtils'
import EarthGeometry from '../lib/EarthGeometry'

export type Props = {
  geometry: EarthGeometry
  container: HTMLDivElement
  // height: number
}

export type GlobeEarth = {
  cleanUp: () => void
  updateColorTexture: (texture: Texture) => void
}

async function createGlobeEarth({ geometry, container }: Props): Promise<GlobeEarth> {
  const [sphere, atmosphere, updateColorTexture] = createSphereWithGlow({
    geometry,
    radius: 100,
  })

  const starField = createStarField()

  const ambientLight = new AmbientLight(0x888888)
  const spotLight = new DirectionalLight(0xffffff, 1)
  const camera = createCamera()
  const scene = createScene(ambientLight, spotLight, camera, starField, sphere, atmosphere)
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
    spotLight.position.copy(camera.position)

    renderer.render(scene, camera)
    requestAnimationFrame(update)
  }
  requestAnimationFrame(update)

  return {
    cleanUp: () => {
      container.removeChild(renderer.domElement)
    },
    updateColorTexture,
  }
}

export default createGlobeEarth

// function updateSphereMaterial(material: ShaderMaterial, age: number) {
//   material.uniforms.age.value = age
// }

const createSphereWithGlow = ({
  geometry,
  radius,
  position = new Vector3(0, 0, 0),
}: // shader,
{
  geometry: BufferGeometry
  position?: Vector3
  radius: number
  // shader: ShaderMaterial
}) => {
  const wireframeMaterial = new MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
  })
  const linesMaterial = new MeshBasicMaterial({
    map: new TextureLoader().load('/textures/lines.png'),
  })
  const color = new MeshPhongMaterial({
    map: new TextureLoader().load('/textures/color-map.jpg'),
    bumpMap: new TextureLoader().load('/textures/height-map.jpg'),
    specularMap: new TextureLoader().load('/textures/specular-map.jpg'),
    specular: 0x222222,
    shininess: 25,
    bumpScale: 15,
  })
  // const multiMaterial = [color]
  const multiMaterial = [
    //
    color,
    // linesMaterial,
    wireframeMaterial,
  ]

  // const geometry = new SphereGeometry(radius, 10, 10)
  const sphere = createMultiMaterialObject(geometry, multiMaterial)

  sphere.scale.set(radius, radius, radius)
  sphere.position.copy(position)
  sphere.castShadow = true
  sphere.receiveShadow = true
  color.needsUpdate = true

  const atmosphere = new Mesh(
    new SphereGeometry(radius, 50, 50),
    new RawShaderMaterial({
      transparent: true,
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      blending: AdditiveBlending,
      side: BackSide,
    }),
  )
  atmosphere.scale.set(1.1, 1.1, 1.1)
  atmosphere.position.copy(position)

  function updateColorTexture(texture: Texture) {
    color.map = texture
  }

  return [sphere, atmosphere, updateColorTexture] as const
}
