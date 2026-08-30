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

/** How much of the crust survives in the mesh view. Enough to read, not to hide. */
const GLASS_OPACITY = 0.55

export function Globe({ data }: { data: Dataset }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  // Every map is loaded up front. They are a few megabytes together, and
  // switching between them should be instant rather than a visible reload.
  const maps = useLoader(
    THREE.TextureLoader,
    SURFACE_MAPS.map((m) => asset(m.file)),
  )

  const mode = useStore((s) => s.mode)
  const showGrid = useStore((s) => s.showGrid)
  const showMesh = useStore((s) => s.showMesh)
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

  // Built here rather than declared in JSX so the wireframe overlay can draw
  // the very same geometry. three derives the edge list from the index once and
  // caches it, so the second draw costs no extra work per frame.
  const geometry = useMemo(() => {
    const dynamic = (array: Float32Array, size: number) =>
      new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', dynamic(buffers.positions, 3))
    g.setAttribute('aStrain', dynamic(buffers.strain, 1))
    g.setAttribute('aDir', new THREE.BufferAttribute(data.dirs, 3))
    g.setAttribute('aAge', new THREE.BufferAttribute(data.vertexAge, 1))
    g.setAttribute('aRigidity', new THREE.BufferAttribute(data.rigidity, 1))
    g.setAttribute('aPlate', new THREE.BufferAttribute(plateAttribute, 1))
    g.setIndex(new THREE.BufferAttribute(data.indices, 1))
    // The globe never leaves the unit sphere, and recomputing this every frame
    // over forty thousand moving vertices is work for nothing.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    return g
  }, [data, buffers, plateAttribute])

  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uTimeMa: { value: 0 },
      uMaxAgeMa: { value: data.meta.maxAgeMa },
      uMode: { value: 0 },
      uGrid: { value: 0 },
      uOpacity: { value: 1 },
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
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aStrain.needsUpdate = true
    if (material.current) {
      material.current.uniforms.uMap.value = map
      material.current.uniforms.uTimeMa.value = clock.timeMa
      material.current.uniforms.uMode.value = MODES[mode]
      material.current.uniforms.uGrid.value = showGrid ? 1 : 0
      material.current.uniforms.uOpacity.value = showMesh ? GLASS_OPACITY : 1
      // A light just off the camera's shoulder: everything you turn towards is
      // lit, but the sphere still reads as a sphere.
      material.current.uniforms.uLight.value
        .copy(camera.position)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4)
        .normalize()
    }
  })

  return (
    <>
      <mesh geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          glslVersion={THREE.GLSL3}
          transparent={showMesh}
          // Glass has to let the far side through, which means drawing the
          // triangles that face away and not stamping the depth buffer on the
          // way past. Opaque, neither applies and both cost fill rate.
          depthWrite={!showMesh}
          side={showMesh ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {showMesh && (
        <mesh geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial
            color="#bcd8ff"
            wireframe
            transparent
            // Eighty thousand triangles at a hundred kilometres across: any
            // heavier than this and the mesh stops being a grid over the world
            // and becomes fog in front of it. The fragment boundaries still
            // stand out, because cutting doubled the edges along them.
            opacity={0.12}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  )
}
