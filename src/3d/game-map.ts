import { PI } from 'lib/math'
import { LatLng, UV } from 'lib/type'
import { AmbientLight, DirectionalLight, Texture, Vector2, WebGLRenderer } from 'three'
import { createScene, createCamera, createOrthographicMap } from './threejs'

export type Props = {
  container: HTMLDivElement
  centerLatLng: Vector2
}

export type GameMap = {
  cleanUp: () => void
  updateColorTexture: (texture: Texture) => void
  setCenter: (latLng: LatLng) => void
  setMouse: (latLng: LatLng) => void
  update: () => void
}

export const NORTH_POLE = new Vector2(0.0, 0.5 * PI)
export const SOUTH_POLE = new Vector2(0.0, -0.5 * PI)
export const ATLANTIC = new Vector2(-0.25 * PI, 0.125 * PI)

async function createGame({ container, centerLatLng }: Props): Promise<GameMap> {
  const spotLight = new DirectionalLight(0xffffff, 1)
  const camera = createCamera()
  const ambientLight = new AmbientLight(0x888888)

  const { image, updateColorTexture, setCenter, setMouse } = createOrthographicMap({
    centerLatLng,
    onLoad: update,
  })
  const scene = createScene(ambientLight, camera, image)

  const renderer = new WebGLRenderer({ antialias: true })

  container.appendChild(renderer.domElement)

  function onWindowResize() {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    update()
  }
  onWindowResize()
  window.addEventListener('resize', onWindowResize)

  async function update() {
    spotLight.position.copy(camera.position)

    renderer.render(scene, camera)
    // requestAnimationFrame(update)
  }
  requestAnimationFrame(update)

  return {
    cleanUp: () => {
      container.removeChild(renderer.domElement)
      window.removeEventListener('resize', onWindowResize)
    },
    updateColorTexture,
    setCenter,
    setMouse,
    update,
  }
}

export default createGame
