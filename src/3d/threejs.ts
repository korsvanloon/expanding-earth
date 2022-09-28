import {
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
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
import { LatLng } from 'lib/type'

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

export const createOrthographicMap = ({
  centerLatLng,
  onLoad,
}: {
  centerLatLng: Vector2
  onLoad: () => void
}) => {
  const loader = new TextureLoader()
  let textureLoaded = 0
  const checkOnLoad = () => {
    textureLoaded++
    if (textureLoaded === 2) {
      onLoad()
    }
  }

  const topographicTexture = loader.load('textures/topographic-map.jpg', checkOnLoad)

  const densityTexture = loader.load('textures/population-density-map.png', checkOnLoad)

  const areaTexture = loader.load('textures/areas-map.png', checkOnLoad)
  areaTexture.magFilter = NearestFilter
  areaTexture.minFilter = NearestFilter

  const shader = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      topographicTexture: { value: topographicTexture },
      densityTexture: { value: densityTexture },
      areaTexture: { value: areaTexture },
      centerLatLng: { value: centerLatLng },
      mouseLatLng: { value: new Vector2() },
    },
  })
  const size = 248
  const plane = new PlaneGeometry(size, size)

  return {
    image: new Mesh(plane, shader),
    updateColorTexture: (texture: Texture) => {
      shader.uniforms.globeTexture.value = texture
    },
    setCenter: (latLng: LatLng) => {
      shader.uniforms.centerLatLng.value = new Vector2(latLng.x, latLng.y)
    },
    setMouse: (latLng: LatLng) => {
      shader.uniforms.mouseLatLng.value = new Vector2(latLng.x, latLng.y)
    },
    onLoad,
  }
}
