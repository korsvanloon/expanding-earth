import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SURFACE_MAPS } from '@shared/maps'
import { asset } from '@/assets'
import { sampleFrame, type Dataset } from '@/data'
import { buildReferenceRotations } from '@/frames'
import { clock, useStore } from '@/store'
import { fragmentShader, vertexShader } from './shaders'

const MODES = { surface: 0, age: 1, strain: 2, rigidity: 3, plates: 4 } as const

export function Globe({ data }: { data: Dataset }) {
  const geometry = useRef<THREE.BufferGeometry>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  // Every map is loaded up front. They are a few megabytes together, and
  // switching between them should be instant rather than a visible reload.
  const maps = useLoader(
    THREE.TextureLoader,
    SURFACE_MAPS.map((m) => asset(m.file)),
  )

  const mode = useStore((s) => s.mode)
  const showGrid = useStore((s) => s.showGrid)
  const surfaceMap = useStore((s) => s.surfaceMap)
  const referenceFrame = useStore((s) => s.referenceFrame)
  // Fitting the rotations walks every frame once; cache them per continent.
  const rotations = useMemo(
    () => (referenceFrame ? buildReferenceRotations(data, referenceFrame) : undefined),
    [data, referenceFrame],
  )
  const map = maps[Math.max(0, SURFACE_MAPS.findIndex((m) => m.id === surfaceMap))]

  useEffect(() => {
    for (const texture of maps) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.wrapS = THREE.RepeatWrapping
      texture.anisotropy = 8
    }
  }, [maps])

  // Plate ids arrive as bytes; the shader wants floats.
  const plateAttribute = useMemo(() => Float32Array.from(data.plates), [data])

  const buffers = useMemo(() => {
    const count = data.vertexCount
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uMap is swapped in useFrame
    [data],
  )

  // Fill the buffers before the first render, so nothing is drawn at the origin.
  useMemo(
    () => sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain, rotations),
    [data, buffers, rotations],
  )

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

    sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain, rotations)
    const g = geometry.current
    if (g) {
      g.attributes.position.needsUpdate = true
      g.attributes.aStrain.needsUpdate = true
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    }
    if (material.current) {
      material.current.uniforms.uMap.value = map
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
        <bufferAttribute attach="attributes-aRigidity" args={[data.rigidity, 1]} />
        <bufferAttribute attach="attributes-aPlate" args={[plateAttribute, 1]} />
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
