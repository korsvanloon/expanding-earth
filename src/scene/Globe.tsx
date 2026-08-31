import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SURFACE_MAPS } from '@shared/maps'
import { asset } from '@/assets'
import { buildIndex, sampleFrame, type Dataset } from '@/data'
import { buildReferenceRotations } from '@/frames'
import { clock, describePicks, onClockMoved, useStore, type Pick } from '@/store'
import { directionToUv } from '@shared/sphere'
import { PERMANENT_MA } from '@shared/model'
import { fragmentShader, vertexShader } from './shaders'

const MODES = { surface: 0, age: 1, strain: 2, rigidity: 3, islands: 4 } as const

/** How much of the crust survives in the mesh view. Enough to read, not to hide. */
const GLASS_OPACITY = 1

/** Reused rather than allocated per frame; the light is nudged about this axis. */
const UP = new THREE.Vector3(0, 1, 0)

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
  const showTracks = useStore((s) => s.showTracks)
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

  // Island ids arrive as shorts; the shader wants floats. They never change.
  const islandAttribute = useMemo(() => Float32Array.from(data.islands), [data])

  const buffers = useMemo(() => {
    const count = data.vertexCount
    return {
      positions: new Float32Array(count * 3),
      strain: new Float32Array(count),
      // Which triangles exist, rebuilt whenever the frame changes. The mesh
      // redraws itself as it runs -- points are swallowed, diagonals swapped --
      // so the triangulation is per-frame data like the positions are, not a
      // fixed thing set once at load. Drawing the fixed one was what put folds
      // in the shell and stretched single triangles across the Pacific.
      working: new Int32Array(data.indices.length),
      index: new Uint32Array(data.indices.length),
    }
  }, [data])

  /**
   * The fracture zones, and the pair of points due to meet at this moment.
   *
   * Both are lists of mesh vertices, so they need no geometry of their own
   * beyond somewhere to copy positions into: a track drawn at 120 Ma is those
   * vertices read at their 120 Ma places, which is why the lines close up as
   * the ocean does instead of sliding over a globe that moved underneath them.
   *
   * Lifted a little off the surface. Drawn exactly on it they fight the shell
   * for the same depth and come out stitched.
   */
  const LIFT = 1.004
  const overlay = useMemo(() => {
    const t = data.tracks
    if (!t) return null
    const path: number[] = []
    for (let i = 0; i < t.ridge.length; i++) {
      for (let p = t.offsets[i]; p + 1 < t.offsets[i + 1]; p++) {
        path.push(t.vertex[p], t.vertex[p + 1])
      }
    }
    const line = (count: number) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(count * 3), 3)
          .setUsage(THREE.DynamicDrawUsage),
      )
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2)
      return g
    }
    return {
      path: Int32Array.from(path),
      pathGeometry: line(path.length),
      // Every pair gets room; only the ones due at the drawn frame are ever
      // inside the draw range.
      gapGeometry: line(t.pairA.length * 2),
    }
  }, [data])

  useEffect(() => () => {
    overlay?.pathGeometry.dispose()
    overlay?.gapGeometry.dispose()
  }, [overlay])

  /** Copy the current positions of a list of vertices into a line geometry. */
  const drawLines = (
    geometry: THREE.BufferGeometry, list: ArrayLike<number>, count: number,
  ) => {
    const target = geometry.getAttribute('position') as THREE.BufferAttribute
    const out = target.array as Float32Array
    for (let i = 0; i < count; i++) {
      const v = list[i] * 3
      out[i * 3] = buffers.positions[v] * LIFT
      out[i * 3 + 1] = buffers.positions[v + 1] * LIFT
      out[i * 3 + 2] = buffers.positions[v + 2] * LIFT
    }
    geometry.setDrawRange(0, count)
    target.needsUpdate = true
  }

  /** The pairs whose crust formed at the frame being drawn, and nothing else. */
  const dueNow = useMemo(() => new Int32Array((data.tracks?.pairA.length ?? 0) * 2), [data])
  const refreshOverlay = () => {
    if (!overlay || !data.tracks) return
    drawLines(overlay.pathGeometry, overlay.path, overlay.path.length)
    const t = data.tracks
    const frameMa = Math.round(clock.timeMa / data.meta.frameStepMa) * data.meta.frameStepMa
    let n = 0
    for (let i = 0; i < t.pairA.length; i++) {
      if (t.pairAgeMa[i] !== frameMa) continue
      dueNow[n++] = t.pairA[i]
      dueNow[n++] = t.pairB[i]
    }
    drawLines(overlay.gapGeometry, dueNow, n)
  }

  // Built here rather than declared in JSX so the wireframe overlay can draw
  // the very same geometry. three derives the edge list from the index once and
  // caches it, so the second draw costs no extra work per frame.
  const geometry = useMemo(() => {
    const dynamic = (array: Float32Array, size: number) =>
      new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', dynamic(buffers.positions, 3))
    g.setAttribute('aStrain', dynamic(buffers.strain, 1))
    g.setAttribute('aIsland', new THREE.BufferAttribute(islandAttribute, 1))
    g.setAttribute('aDir', new THREE.BufferAttribute(data.dirs, 3))
    g.setAttribute('aAge', new THREE.BufferAttribute(data.vertexAge, 1))
    g.setAttribute('aRigidity', new THREE.BufferAttribute(data.rigidity, 1))
    g.setIndex(
      new THREE.BufferAttribute(buffers.index, 1).setUsage(THREE.DynamicDrawUsage),
    )
    // The globe never leaves the unit sphere, and recomputing this every frame
    // over forty thousand moving vertices is work for nothing.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    return g
  }, [data, buffers, islandAttribute])

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

  // Which frame's triangulation is currently in the index buffer. Replaying the
  // deltas costs a fraction of a millisecond, but it is per frame, not per
  // animation tick, so it is only done when the frame actually moves.
  // Anything that changes what the globe should look like has to ask for a
  // frame, because the canvas no longer draws on its own: the clock when it is
  // scrubbed, and every control that feeds a uniform.
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => onClockMoved(invalidate), [invalidate])
  useEffect(
    () => invalidate(),
    [invalidate, mode, showGrid, showMesh, showTracks, surfaceMap, referenceFrame, data],
  )
  // Turning the overlay on has to fill it: the positions are only rewritten
  // when the clock moves, and the clock has not.
  useEffect(() => {
    if (showTracks) refreshOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live buffers
  }, [showTracks, overlay, rotations])

  const drawnFrame = useRef(-1)
  /** The clock reading the vertex buffers currently hold. */
  const sampledTime = useRef(Number.NaN)
  const retopo = () => {
    const frame = Math.min(
      Math.round(clock.timeMa / data.meta.frameStepMa),
      data.meta.frameCount - 1,
    )
    if (frame === drawnFrame.current) return
    drawnFrame.current = frame
    const count = buildIndex(data, frame, buffers.working, buffers.index)
    const index = geometry.getIndex()
    if (index) index.needsUpdate = true
    geometry.setDrawRange(0, count)
  }

  // Fill the buffers before the first render, so nothing is drawn at the origin.
  useMemo(
    () => sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain, rotations),
    [data, buffers, rotations],
  )
  useMemo(() => {
    // A new dataset brings new buffers, so whatever frame was drawn into the
    // old ones says nothing about what is in these.
    drawnFrame.current = -1
    sampledTime.current = Number.NaN
    retopo()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retopo reads refs
  }, [data, buffers, geometry])

  /**
   * Right-click a piece of crust to copy what it is.
   *
   * The point of this is the vertex index. Longitude and latitude are for
   * reading; the index is the same piece of crust in every frame and in every
   * run, so "these two should have been touching at 130 Ma" can be turned into
   * a number the solver reports from then on. An eye is the only instrument
   * that can say the whole thing looks wrong, and this is how what it saw
   * survives being seen once.
   */
  const pickAt = (event: ThreeEvent<MouseEvent>) => {
    event.nativeEvent.preventDefault()
    event.stopPropagation()
    const face = event.face
    if (!face) return
    // The triangle it hit has three corners; the nearest of them is the answer.
    // Anything finer would be a point between vertices, which is not a piece of
    // crust this model knows anything about.
    let vertex = face.a
    let nearest = Infinity
    for (const v of [face.a, face.b, face.c]) {
      const d = (buffers.positions[v * 3] - event.point.x) ** 2
        + (buffers.positions[v * 3 + 1] - event.point.y) ** 2
        + (buffers.positions[v * 3 + 2] - event.point.z) ** 2
      if (d < nearest) {
        nearest = d
        vertex = v
      }
    }
    const degrees = (x: number, y: number, z: number) => {
      const length = Math.hypot(x, y, z) || 1
      const [u, w] = directionToUv(x / length, y / length, z / length)
      return [(u - 0.5) * 360, (w - 0.5) * 180]
    }
    const [todayLon, todayLat] = degrees(
      data.dirs[vertex * 3], data.dirs[vertex * 3 + 1], data.dirs[vertex * 3 + 2],
    )
    const [thenLon, thenLat] = degrees(
      buffers.positions[vertex * 3],
      buffers.positions[vertex * 3 + 1],
      buffers.positions[vertex * 3 + 2],
    )
    const frame = Math.min(
      Math.round(clock.timeMa / data.meta.frameStepMa), data.meta.frameCount - 1,
    )
    const age = data.vertexAge[vertex]
    const pick: Pick = {
      vertex,
      todayLon,
      todayLat,
      timeMa: clock.timeMa,
      thenLon,
      thenLat,
      ageMa: age >= PERMANENT_MA ? null : age,
      island: data.islands[vertex],
      block: data.plates[frame * data.vertexCount + vertex],
      referenceFrame,
    }
    const { addPick, picks } = useStore.getState()
    addPick(pick)
    void navigator.clipboard?.writeText(describePicks([...picks, pick].slice(-6)))
  }

  useFrame(({ camera, invalidate }, delta) => {
    const { playing, speed } = useStore.getState()
    if (playing) {
      // Playback runs the way history does: from the deep past towards today.
      clock.timeMa -= speed * Math.min(delta, 0.1)
      if (clock.timeMa <= 0) {
        clock.timeMa = 0
        useStore.getState().setPlaying(false)
      }
      // The canvas draws on request, so a moving globe has to keep asking.
      invalidate()
    }

    retopo()
    // Interpolating forty thousand vertices and handing both buffers back to
    // the GPU is the expensive part of a frame, and it is pure waste when the
    // timeline has not moved: the same positions were uploaded sixty times a
    // second to a globe standing still. Orbiting still redraws -- the light
    // follows the camera -- it just redraws what is already there.
    if (clock.timeMa !== sampledTime.current) {
      sampledTime.current = clock.timeMa
      sampleFrame(data, clock.timeMa, buffers.positions, buffers.strain, rotations)
      geometry.attributes.position.needsUpdate = true
      geometry.attributes.aStrain.needsUpdate = true
      if (showTracks) refreshOverlay()
    }
    if (material.current) {
      material.current.uniforms.uMap.value = map
      material.current.uniforms.uTimeMa.value = clock.timeMa
      material.current.uniforms.uMode.value = MODES[mode]
      material.current.uniforms.uGrid.value = showGrid ? 1 : 0
      material.current.uniforms.uOpacity.value = GLASS_OPACITY
      // A light just off the camera's shoulder: everything you turn towards is
      // lit, but the sphere still reads as a sphere.
      material.current.uniforms.uLight.value
        .copy(camera.position)
        .applyAxisAngle(UP, 0.4)
        .normalize()
    }
  })

  return (
    <>
      <mesh geometry={geometry} frustumCulled={false} onContextMenu={pickAt}>
        <shaderMaterial
          ref={material}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          glslVersion={THREE.GLSL3}
          transparent={false}
          depthWrite
          side={THREE.FrontSide}
        />
      </mesh>
      {showTracks && overlay && (
        <>
          {/* The paths the crust took away from the ridges. Magenta because
              nothing in the age ramp or the satellite imagery is. */}
          <lineSegments geometry={overlay.pathGeometry} frustumCulled={false}>
            <lineBasicMaterial color="#ff4fa3" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
          </lineSegments>
          {/* One segment per pair that was a single point at this moment, so its
              length is the model's error, drawn. */}
          <lineSegments geometry={overlay.gapGeometry} frustumCulled={false}>
            <lineBasicMaterial color="#ffd24a" depthWrite={false} toneMapped={false} />
          </lineSegments>
        </>
      )}
      {showMesh && (
        <mesh geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial
            color="#bcd8ff"
            wireframe
            transparent
            // Drawn on a solid globe rather than through it. Letting the far
            // side show through put two hemispheres of grid on top of each
            // other and the whole thing read as fog.
            opacity={0.35}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  )
}
