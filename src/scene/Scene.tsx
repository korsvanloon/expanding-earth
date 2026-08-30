import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Suspense, useEffect, useRef } from 'react'
import { MathUtils, type Mesh, type PerspectiveCamera } from 'three'
import { R0_KM } from '@shared/model'
import { radiusAt, type Dataset } from '@/data'
import { clock } from '@/store'
import { Globe } from './Globe'

export function Scene({ data }: { data: Dataset }) {
  return (
    // A near plane close to the camera is what wrecks depth precision, and the
    // globe is never nearer than the orbit limit below, so it can sit well out.
    <Canvas camera={{ position: [0.6, 1.2, 3.2], fov: 42, near: 0.4, far: 40 }} dpr={[1, 2]}>
      <color attach="background" args={['#05070c']} />
      <Stars radius={40} depth={30} count={3000} factor={3} fade speed={0} />
      <YoungCrust data={data} />
      <Suspense fallback={null}>
        <Globe data={data} />
      </Suspense>
      <PresentDayOutline />
      <Framing />
      <OrbitControls
        enablePan={false}
        minDistance={1.5}
        maxDistance={16}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
      />
    </Canvas>
  )
}

/**
 * The surface of the Earth at time t, drawn just inside the crust.
 *
 * Where the reconstruction leaves a gap it is showing something real: crust
 * that had not been made yet. Drawn against empty space those gaps read as
 * holes in the planet, which is the wrong reading -- there was a surface there,
 * it just was not this crust. Filling them with fresh sea floor says what the
 * model actually claims, and the diagnostics still report the gap as a number
 * rather than letting this hide it.
 */
function YoungCrust({ data }: { data: Dataset }) {
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    if (!mesh.current) return
    // A whisker inside the crust, so the two never fight over the same pixels
    // and a crack reads as a crack rather than as a pit. It can sit this close
    // only because the near plane above leaves the depth buffer some precision
    // to work with.
    const r = (radiusAt(data, clock.timeMa) / R0_KM) * 0.997
    mesh.current.scale.setScalar(r)
  })
  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[1, 96, 48]} />
      <meshBasicMaterial color="#2a1408" toneMapped={false} />
    </mesh>
  )
}

/** Height of the timeline bar plus its margin, which the globe must clear. */
const TIMELINE_HEIGHT = 110

/**
 * Pull the camera back far enough that today's Earth fits, whatever shape the
 * window is.
 *
 * A field of view is quoted vertically, so on a portrait phone the horizontal
 * angle is a fraction of the vertical one and a distance that frames the globe
 * on a laptop cuts it off at both edges. Framing on whichever angle is tighter
 * fixes that, but only the bottom of the screen is actually spoken for -- the
 * timeline sits there -- so the vertical angle is measured against the height
 * left over rather than padding both axes and leaving the globe small.
 *
 * Today's Earth is the largest it ever gets, so framing it here is enough.
 */
function Framing() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)

  useEffect(() => {
    const vertical = MathUtils.degToRad(camera.fov) / 2
    const usable = Math.max(height - TIMELINE_HEIGHT, 120) / height
    const half = Math.min(
      Math.atan(Math.tan(vertical) * usable),
      Math.atan(Math.tan(vertical) * camera.aspect),
    )
    camera.position.setLength(1.08 / Math.sin(half))
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  return null
}

/**
 * A ghost of today's Earth at radius 1. The camera does not follow the globe as
 * it shrinks -- that is the whole point -- and this gives the eye something
 * fixed to measure the growth against.
 */
function PresentDayOutline() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 16]} />
      <meshBasicMaterial color="#7cb0ff" wireframe transparent opacity={0.045} depthWrite={false} />
    </mesh>
  )
}
