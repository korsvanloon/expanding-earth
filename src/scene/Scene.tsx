import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { Suspense } from 'react'
import type { Dataset } from '@/data'
import { Globe } from './Globe'

export function Scene({ data }: { data: Dataset }) {
  return (
    <Canvas camera={{ position: [0.6, 1.2, 3.2], fov: 42, near: 0.01, far: 100 }} dpr={[1, 2]}>
      <color attach="background" args={['#05070c']} />
      <Stars radius={40} depth={30} count={3000} factor={3} fade speed={0} />
      <Suspense fallback={null}>
        <Globe data={data} />
      </Suspense>
      <PresentDayOutline />
      <OrbitControls
        enablePan={false}
        minDistance={1.2}
        maxDistance={9}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
      />
    </Canvas>
  )
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
