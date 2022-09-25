import { PI } from 'lib/math'
import { AmbientLight, DirectionalLight, Texture, Vector, Vector2, WebGLRenderer } from 'three'
import { createScene, createCamera, createOrthographicMap } from './threejs'

export type Props = {
  container: HTMLDivElement
  centerLatLng: Vector2
}

export type GameMap = {
  cleanUp: () => void
  updateColorTexture: (texture: Texture) => void
  setCenter: (latLng: Vector2) => void
}

export const NORTH_POLE = new Vector2(0, 0.5 * PI)
export const SOUTH_POLE = new Vector2(0, -0.5 * PI)

async function createGame({ container, centerLatLng }: Props): Promise<GameMap> {
  const spotLight = new DirectionalLight(0xffffff, 1)
  const camera = createCamera()
  const ambientLight = new AmbientLight(0x888888)

  const { image, updateColorTexture, setCenter } = createOrthographicMap(centerLatLng)
  const scene = createScene(ambientLight, camera, image)

  const renderer = new WebGLRenderer({ antialias: true })

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
    setCenter,
  }
}

export default createGame
