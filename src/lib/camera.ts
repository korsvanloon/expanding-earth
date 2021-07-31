import { PerspectiveCamera, Vector3 } from 'three'

const CENTER = new Vector3(0, 0, 0)
const CAMERA_POSITION = new Vector3(0, 0, 500)
const VIEW_ANGLE = 45
const NEAR = 0.1
const FAR = 10000
const DEFAULT_ASPECT = 1

const createCamera = () => {
  const camera = new PerspectiveCamera(VIEW_ANGLE, DEFAULT_ASPECT, NEAR, FAR)
  const { x, y, z } = CAMERA_POSITION
  camera.position.set(x, y, z)
  // camera.lookAt(CENTER)

  return camera
}

export default createCamera
