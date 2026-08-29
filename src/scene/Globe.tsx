import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { asset } from '@/assets'
import { sampleFrame, type Dataset } from '@/data'
import { clock, useStore } from '@/store'
import { fragmentShader, vertexShader } from './shaders'

const MODES = { surface: 0, age: 1, strain: 2 } as const

export function Globe({ data }: { data: Dataset }) {
  const geometry = useRef<THREE.BufferGeometry>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const map = useLoader(THREE.TextureLoader, asset('textures/blue-marble-map.jpg'))

  const mode = useStore((s) => s.mode)
  const showGrid = useStore((s) => s.showGrid)

  useEffect(() => {
    map.colorSpace = THREE.SRGBColorSpace
    map.wrapS = THREE.RepeatWrapping
    map.anisotropy = 8
  }, [map])

  const buffers = useMemo(() => {
    const count = data.meta.vertexCount
    return {
      positions: new Float32Array(count * 3),
      strain: new Float32Array(count),
    }
  }, [data])

  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uTimeMa: { value: 0 },
      uMaxAgeMa: { value: data.meta.maxAgeMa },
      uMode: { value: 0 },
      uGrid: { value: 0 },
      uLight: { value: new THREE.Vector3(1, 0.4, 1) },
    }),
    [data, map],
  )

  // Fill the buffers before the first render, so nothing is drawn at the origin.
  useMemo(() => sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain), [data, buffers])

  useFrame(({ camera }, delta) => {
    const { playing, speed } = useStore.getState()
    if (playing) {
      // Playback runs the way history does: from the deep past towards today.
      clock.timeMa -= speed * Math.min(delta, 0.1)
      if (clock.timeMa <= 0) {
        clock.timeMa = 0
        useStore.getState().setPlaying(false)
      }
    }

    sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain)
    const g = geometry.current
    if (g) {
      g.attributes.position.needsUpdate = true
      g.attributes.aStrain.needsUpdate = true
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    }
    if (material.current) {
      material.current.uniforms.uTimeMa.value = clock.timeMa
      material.current.uniforms.uMode.value = MODES[mode]
      material.current.uniforms.uGrid.value = showGrid ? 1 : 0
      // A light just off the camera's shoulder: everything you turn towards is
      // lit, but the sphere still reads as a sphere.
      material.current.uniforms.uLight.value
        .copy(camera.position)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4)
        .normalize()
    }
  })

  return (
    <mesh frustumCulled={false}>
      <bufferGeometry ref={geometry}>
        <bufferAttribute
          attach="attributes-position"
          args={[buffers.positions, 3]}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute attach="attributes-aDir" args={[data.dirs, 3]} />
        <bufferAttribute attach="attributes-aAge" args={[data.vertexAge, 1]} />
        <bufferAttribute
          attach="attributes-aStrain"
          args={[buffers.strain, 1]}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute attach="index" args={[data.indices, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        glslVersion={THREE.GLSL3}
      />
    </mesh>
  )
}
