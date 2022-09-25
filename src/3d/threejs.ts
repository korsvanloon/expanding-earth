import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three'
import { OrbitControls } from '../vendor/OrbitControls'
import vertexShader from '../shaders/worldmap.vert.glsl'
import fragmentShader from '../shaders/worldmap.frag.glsl'

export const createScene = (...children: Object3D[]) => {
  const scene = new Scene()
  scene.background = new Color(0x000000)

  scene.add(...children)

  return scene
}

const CAMERA_POSITION = new Vector3(0, 0, 300)
const VIEW_ANGLE = 45
const NEAR = 0.1
const FAR = 10000
const DEFAULT_ASPECT = 1

export const createCamera = () => {
  const camera = new PerspectiveCamera(VIEW_ANGLE, DEFAULT_ASPECT, NEAR, FAR)
  camera.position.set(...CAMERA_POSITION.toArray())

  return camera
}

export const createStarField = () => {
  const starGeometry = new SphereGeometry(1200, 50, 50)
  const starMaterial = new MeshBasicMaterial({
    map: new TextureLoader().load('textures/eso0932a.jpg'),
    side: DoubleSide,
  })
  const starField = new Mesh(starGeometry, starMaterial)
  starField.visible = true
  starField.rotation.x = (-60 / 180) * Math.PI

  return starField
}

export const createControls = (camera: PerspectiveCamera, element: HTMLCanvasElement) => {
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

export const createOrthographicMap = (centerLatLng: Vector2) => {
  const shader = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      topographicTexture: { value: new TextureLoader().load('textures/topographic-map.jpg') },
      densityTexture: { value: new TextureLoader().load('textures/population-density-map.png') },
      centerLatLng: { value: centerLatLng },
    },
  })
  const size = 200
  const plane = new PlaneGeometry(size, size)

  return {
    image: new Mesh(plane, shader),
    updateColorTexture: (texture: Texture) => {
      shader.uniforms.globeTexture.value = texture
    },
    setCenter: (latLng: Vector2) => {
      shader.uniforms.centerLatLng.value = latLng
    },
  }
}
