import { useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { SURFACE_MAPS } from '@shared/maps'
import { asset } from '@/assets'
import { buildIndex, fetchLayer, radiusAt, sampleFrame, type Dataset } from '@/data'
import { buildReferenceRotations } from '@/frames'
import {
  clock, describePicks, onClockMoved, useStore, VIEW_MODES, ZONE_LIMIT, type Pick,
} from '@/store'
import { ONE_SIDED, isMarked, pairAgeColour, pairPulls } from '@shared/tracks'
import { directionToUv } from '@shared/sphere'
import { PERMANENT_MA, R0_KM } from '@shared/model'
import { measureSeams } from '@shared/seams'
import { fragmentShader, vertexShader } from './shaders'


/** Bound to the fabric sampler until the raster has been fetched. */
const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
BLANK.needsUpdate = true

/** How much of the crust survives in the mesh view. Enough to read, not to hide. */
const GLASS_OPACITY = 1

/** Reused rather than allocated per frame; the light is nudged about this axis. */
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Half the thickness of the cross-section slice, in units where today's Earth
 * is one.
 *
 * About 190 km, which is three triangles at subdivision 6. Thinner and the
 * slice breaks into disconnected scraps as the triangles it cuts fall out of
 * it; thicker and the crust in front hides the fold behind it.
 */
const SLAB = 0.03

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
  const showSection = useStore((s) => s.showSection)
  const showTracks = useStore((s) => s.showTracks)
  const allPairs = useStore((s) => s.allPairs)
  const showPaths = useStore((s) => s.showPaths)
  const showZones = useStore((s) => s.showZones)
  const pickedZones = useStore((s) => s.pickedZones)
  const toggleZone = useStore((s) => s.toggleZone)
  const surfaceMap = useStore((s) => s.surfaceMap)

  /**
   * The crustal fabric, as a raster rather than a vertex attribute.
   *
   * The gravity grid is eleven kilometres to the cell against a hundred and
   * twelve between mesh points, so reading it through the vertices threw away
   * nearly half of what it says; sampled by the crust's own direction it rides
   * along with the reconstruction and keeps all of it. See
   * tools/lib/structure.ts.
   *
   * Fetched on first use rather than up front, and not through useLoader, which
   * suspends: at full resolution this is five megabytes, and making every
   * visitor wait for it before the globe appears would be paying for a view
   * most of them will never open.
   */
  const [fabric, setFabric] = useState<THREE.Texture | null>(null)
  const [zones, setZones] = useState<THREE.Texture | null>(null)
  /**
   * ECM1's crustal class and thickness, as the grid rather than as attributes.
   *
   * Both were carried per vertex, which a class cannot be: it belongs to a
   * triangle, a shared-vertex mesh has nowhere to put one, and what came out
   * was hexagons. Fetched on first use like the others -- it is 30 kB, but the
   * two views that want it are two clicks in.
   */
  const [crust, setCrust] = useState<THREE.Texture | null>(null)
  /** Fetch one of the measurement rasters, once, when something first wants it. */
  const raster = (
    file: string, wanted: boolean, held: THREE.Texture | null,
    keep: (texture: THREE.Texture) => void,
  ) => useEffect(() => {
    if (!wanted || held) return
    let live = true
    new THREE.TextureLoader().loadAsync(asset(file)).then((texture) => {
      if (!live) {
        texture.dispose()
        return
      }
      // Read raw: these are measurements encoded as bytes, not pictures, and an
      // sRGB decode would bend the scale they were written on.
      texture.colorSpace = THREE.NoColorSpace
      texture.wrapS = THREE.RepeatWrapping
      if (file.endsWith('zones.png') || file.endsWith('crust.png')) {
        // Nearest, and no mipmaps. Two of this image's channels are a curve's
        // identity number, and an identity averaged with its neighbour's is a
        // different curve or none: smoothing it would leave every line fringed
        // with a curve that does not exist.
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        texture.generateMipmaps = false
      } else {
        texture.anisotropy = 8
      }
      keep(texture)
    }).catch(() => {})
    return () => { live = false }
  }, [wanted, held, file])
  raster('data/fabric.jpg', mode === 'fabric', fabric, setFabric)
  raster('data/zones.png', showZones, zones, setZones)
  raster('data/crust.png', mode === 'crust' || mode === 'thickness', crust, setCrust)

  /**
   * The per-frame byte maps, fetched when something first wants them.
   *
   * The strain belongs to one view mode and the plate map to a right-click, and
   * between them they were a third of what a visitor waited for before the
   * globe appeared. Assigned onto the dataset rather than held in state,
   * because everything that reads them reads them straight off it; `arrived`
   * is what makes React re-render once, so the buffers get re-sampled with the
   * strain in place.
   */
  const [arrived, setArrived] = useState(0)
  useEffect(() => {
    if (mode !== 'strain' || data.strain) return
    let live = true
    void fetchLayer('strain').then((bytes) => {
      if (!live || !bytes) return
      data.strain = bytes
      sampledTime.current = Number.NaN
      setArrived((n) => n + 1)
    })
    return () => { live = false }
  }, [mode, data])
  useEffect(() => { void arrived }, [arrived])

  /**
   * The zone image again, on the processor's side, so a click can be answered.
   *
   * The texture lives on the graphics card and cannot be read back cheaply, so
   * the same picture is decoded once into an array and the curve number is
   * looked up there. It is only the two identity channels that are wanted, but
   * a canvas hands over all four and sorting that out costs less than a second
   * request would.
   */
  const [zoneIds, setZoneIds] = useState<{
    width: number; height: number; data: Uint8ClampedArray
  } | null>(null)
  useEffect(() => {
    if (!showZones || zoneIds) return
    let live = true
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (!live) return
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: false })
      if (!context) return
      context.drawImage(image, 0, 0)
      const { data } = context.getImageData(0, 0, image.width, image.height)
      setZoneIds({ width: image.width, height: image.height, data })
    }
    image.src = asset('data/zones.png')
    return () => { live = false }
  }, [showZones, zoneIds])
  useEffect(() => () => fabric?.dispose(), [fabric])
  useEffect(() => () => zones?.dispose(), [zones])
  useEffect(() => () => crust?.dispose(), [crust])
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
      /**
       * How far a vertex's triangles reach across crust that is gone, 0 to 1.
       *
       * The mesh removes crust that has not been made yet, but the triangles
       * left behind bridge the seam and still carry their corners' present-day
       * directions -- so the fragment shader interpolates between them and
       * paints the inside of a bridging triangle with every scrap of sea floor
       * that used to lie between its corners, ridge included. Watching the East
       * Pacific Rise close, the ridge stays there in the middle, growing and
       * blurring as the triangles around it grow. It is gone from the model and
       * still on the picture.
       *
       * At 38 Ma that is 3.7% of what you see painted from crust more than 300
       * km wide, and at 200 Ma it is 24.6%. This says where, so the shader can
       * stop painting sea floor there. See tools/measure-mesh.ts.
       */
      seam: new Float32Array(count),
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
  /**
   * How many straight pieces a pair's join is drawn as.
   *
   * A segment is a chord in three dimensions, and a chord between two points a
   * few thousand kilometres apart on a sphere passes *through* it. Which is
   * what a hundred-kilometre residual never revealed: the join follows the
   * sphere instead, in eight pieces, each short enough that its own sag is well
   * under a kilometre on the longest pair there is.
   */
  const ARC = 8
  /**
   * A cross at each end of a pair, in pieces, so a nearly closed one can be
   * seen at all.
   *
   * One-pixel lines are what plain line segments give, and a residual of a
   * hundred kilometres is four pixels long: at the very moment a pair is being
   * scored it is at its least visible. The ends get a small cross apiece, which
   * reads at one pixel where a four-pixel line cannot be had.
   */
  const TICK = 4
  /** How big that cross is, as a fraction of the globe's radius. */
  const TICK_SIZE = 0.013
  const size = useThree((state) => state.size)
  const overlay = useMemo(() => {
    const t = data.tracks
    if (!t) return null
    /**
     * Hairlines, and why they are not the fat quads they were.
     *
     * WebGL draws every GL_LINE one pixel wide whatever a material asks for, so
     * this used LineSegments2, which builds each segment as a screen-facing quad
     * and can be four pixels thick. That worked while it drew the sixty-odd
     * pairs due at one frame and stopped the moment it was asked for all 2,283:
     * with eighteen thousand instanced quads it drew a handful, and nothing
     * could be found that said why. instanceCount, both interleaved buffers and
     * the draw range all reported the full count; every position was on the
     * shell; turning off the depth test changed nothing; and tripling the width
     * made the *smaller* set brighter and the larger set dimmer.
     *
     * So it went back to plain line segments, which have no instancing and
     * nothing to go wrong. A one-pixel line is the cost and it is barely one:
     * two thousand fat joins across the oceans is a solid mat, and thin ones can
     * be read.
     */
    const line = (count: number, color: string) => {
      const geometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        depthWrite: false,
        toneMapped: false,
        // One hue per pair, so the two ends of one claim are findable among its
        // neighbours -- and are the same colour here as on the flat map, which
        // is what sharing the colour rule is for. The material colour multiplies these
        // and so stays white.
        vertexColors: true,
      })
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
      geometry.setDrawRange(0, 0)
      const object = new THREE.LineSegments(geometry, material)
      object.frustumCulled = false
      // Drawn after the globe, whatever the depth sorting decides.
      //
      // An opaque object that writes no depth is at the mercy of render order,
      // and the order is near-to-far: a line lifted off the crust is nearer
      // than the crust, so it went down first and the globe painted straight
      // over it. Only the parts hanging past the silhouette survived, which
      // looks exactly like a depth bug and is not one.
      object.renderOrder = 2
      return {
        geometry,
        material,
        object,
        points: geometry.getAttribute('position').array as Float32Array,
        colours: geometry.getAttribute('color').array as Float32Array,
      }
    }
    // Every pair gets room; only the ones due at the drawn frame are written.
    //
    // The paths were taken out of here once, on the reader's own observation
    // that they told the same claim twice: a track is the path one piece of
    // crust took away from its ridge, and the pairs *are* two ends of that
    // path at an age, so the line was the half with no partner to fail to
    // meet. That was true of what a track was then. It is not true now -- a
    // path carries the point where its two halves were one point, and a run of
    // pairs along it in their own colours, and the reader has been reading and
    // correcting them in that form. So they are back, deliberately, and this
    // note is here so the reversal reads as a decision rather than as having
    // forgotten what they said.
    let segments = 0
    for (let k = 0; k + 1 < t.offsets.length; k++) {
      segments += Math.max(0, t.offsets[k + 1] - t.offsets[k] - 1)
    }
    return {
      gapLine: line(t.pairAgeMa.length * 2 * (ARC + TICK), '#ffffff'),
      pathLine: line(segments * 2, '#ffffff'),
      ridgeLine: line((t.offsets.length - 1) * 4, '#ffffff'),
    }
  }, [data])

  useEffect(() => () => {
    for (const l of [overlay?.gapLine, overlay?.pathLine, overlay?.ridgeLine]) {
      l?.geometry.dispose()
      l?.material.dispose()
    }
  }, [overlay])

  /**
   * Draw each conjugate pair as an arc on the shell, in its own colour.
   *
   * Both ends are places inside a triangle, so each is mixed from that
   * triangle's three corners by weight -- the point the residual is measured
   * at, rather than the nearest vertex, which used to put the visible gap up to
   * a triangle's width from the one being scored. The corners carry the shell's
   * radius, because the globe shrinks by having its points moved inward and not
   * by being scaled: a line put back at radius one on a planet at two thirds of
   * it floats a thousand kilometres over its own crust.
   */
  const drawPairs = (
    line: { geometry: THREE.BufferGeometry; points: Float32Array; colours: Float32Array },
    wanted: (i: number) => boolean,
  ) => {
    const t = data.tracks
    let at = 0
    const a: [number, number, number] = [0, 0, 0]
    const b: [number, number, number] = [0, 0, 0]
    const place = (
      into: [number, number, number], verts: Uint32Array, weights: Float32Array, i: number,
    ) => {
      let x = 0
      let y = 0
      let z = 0
      for (let k = 0; k < 3; k++) {
        const v = verts[i * 3 + k] * 3
        const w = weights[i * 3 + k]
        x += buffers.positions[v] * w
        y += buffers.positions[v + 1] * w
        z += buffers.positions[v + 2] * w
      }
      const corner = verts[i * 3] * 3
      const shell = Math.hypot(
        buffers.positions[corner], buffers.positions[corner + 1], buffers.positions[corner + 2],
      )
      const scale = (LIFT * shell) / (Math.hypot(x, y, z) || 1)
      into[0] = x * scale
      into[1] = y * scale
      into[2] = z * scale
    }
    for (let i = 0; t && i < t.pairAgeMa.length; i++) {
      if (!wanted(i)) continue
      place(a, t.pairAVerts, t.pairAWeights, i)
      place(b, t.pairBVerts, t.pairBWeights, i)
      // Orange where the crust is young, blue where it is old, so the ladder
      // of ages along a path reads at a glance.
      const [red, green, blue] = pairAgeColour(t.pairAgeMa[i], data.meta.endTimeMa)
      const radius = (Math.hypot(a[0], a[1], a[2]) + Math.hypot(b[0], b[1], b[2])) / 2
      for (let piece = 0; piece < ARC; piece++) {
        for (const step of [piece, piece + 1]) {
          if ((at + 1) * 3 > line.points.length) break
          const f = step / ARC
          const x = a[0] + (b[0] - a[0]) * f
          const y = a[1] + (b[1] - a[1]) * f
          const z = a[2] + (b[2] - a[2]) * f
          // Straight in, then back out to the shell: a chord's midpoint pushed
          // to the right radius is the arc, to well under a pixel.
          const scale = radius / (Math.hypot(x, y, z) || 1)
          line.points[at * 3] = x * scale
          line.points[at * 3 + 1] = y * scale
          line.points[at * 3 + 2] = z * scale
          line.colours[at * 3] = red
          line.colours[at * 3 + 1] = green
          line.colours[at * 3 + 2] = blue
          at++
        }
      }
      // Two short strokes across each end, square to the join and to the
      // surface, so the pair is findable when the join itself is a few pixels.
      for (const end of [a, b]) {
        const out = [end[0] / radius, end[1] / radius, end[2] / radius]
        let along = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const dot = along[0] * out[0] + along[1] * out[1] + along[2] * out[2]
        along = [along[0] - dot * out[0], along[1] - dot * out[1], along[2] - dot * out[2]]
        const l = Math.hypot(along[0], along[1], along[2]) || 1
        along = [along[0] / l, along[1] / l, along[2] / l]
        const across = [
          out[1] * along[2] - out[2] * along[1],
          out[2] * along[0] - out[0] * along[2],
          out[0] * along[1] - out[1] * along[0],
        ]
        for (const axis of [along, across]) {
          for (const side of [-1, 1]) {
            if ((at + 1) * 3 > line.points.length) break
            line.points[at * 3] = end[0] + axis[0] * side * TICK_SIZE * radius
            line.points[at * 3 + 1] = end[1] + axis[1] * side * TICK_SIZE * radius
            line.points[at * 3 + 2] = end[2] + axis[2] * side * TICK_SIZE * radius
            line.colours[at * 3] = red
            line.colours[at * 3 + 1] = green
            line.colours[at * 3 + 2] = blue
            at++
          }
        }
      }
    }
    // Written straight into the attributes' own arrays, so all that is left is
    // to say how much of them is live and that the GPU copy is stale.
    line.geometry.getAttribute('position').needsUpdate = true
    line.geometry.getAttribute('color').needsUpdate = true
    line.geometry.setDrawRange(0, at)
  }

  /**
   * Draw every path, and mark the point on each where its halves were one.
   *
   * The same mixing as the pairs -- a point inside a triangle, carried by that
   * triangle's three corners -- so a path deforms with the crust it is drawn
   * on rather than sliding over it. A path is one line of magenta; the
   * coincidence point is a red cross, because a ring cannot be had from line
   * segments and a cross reads at one pixel where a ring would not.
   */
  const drawPaths = () => {
    const t = data.tracks
    if (!overlay?.pathLine || !overlay.ridgeLine || !t) return
    const at: [number, number, number] = [0, 0, 0]
    const on: [number, number, number] = [0, 0, 0]
    const place = (into: [number, number, number], i: number) => {
      let x = 0
      let y = 0
      let z = 0
      for (let k = 0; k < 3; k++) {
        const v = t.pointVerts[i * 3 + k] * 3
        const w = t.pointWeights[i * 3 + k]
        x += buffers.positions[v] * w
        y += buffers.positions[v + 1] * w
        z += buffers.positions[v + 2] * w
      }
      const corner = t.pointVerts[i * 3] * 3
      const shell = Math.hypot(
        buffers.positions[corner], buffers.positions[corner + 1], buffers.positions[corner + 2],
      )
      const scale = (LIFT * shell) / (Math.hypot(x, y, z) || 1)
      into[0] = x * scale
      into[1] = y * scale
      into[2] = z * scale
    }
    const path = overlay.pathLine
    let n = 0
    for (let k = 0; k + 1 < t.offsets.length; k++) {
      // Magenta for a path with a flank either side of a ridge; orange for a
      // one-sided one, which pulls the crust onto a margin and is never scored.
      const oneSided = t.trackKind[k] === ONE_SIDED
      for (let i = t.offsets[k] + 1; i < t.offsets[k + 1]; i++) {
        place(at, i - 1)
        place(on, i)
        for (const end of [at, on]) {
          path.points[n * 3] = end[0]
          path.points[n * 3 + 1] = end[1]
          path.points[n * 3 + 2] = end[2]
          path.colours[n * 3] = oneSided ? 1 : 0.85
          path.colours[n * 3 + 1] = oneSided ? 0.59 : 0.25
          path.colours[n * 3 + 2] = oneSided ? 0.16 : 0.72
          n++
        }
      }
    }
    path.geometry.getAttribute('position').needsUpdate = true
    path.geometry.getAttribute('color').needsUpdate = true
    path.geometry.setDrawRange(0, n)

    const marks = overlay.ridgeLine
    let m = 0
    for (let k = 0; k + 1 < t.offsets.length; k++) {
      place(at, t.ridge[k])
      const radius = Math.hypot(at[0], at[1], at[2]) || 1
      // Two strokes square to each other and to the radius here, which is what
      // a cross on a sphere is.
      const up: [number, number, number] = Math.abs(at[1] / radius) < 0.9
        ? [0, 1, 0]
        : [1, 0, 0]
      const across: [number, number, number] = [
        up[1] * at[2] - up[2] * at[1],
        up[2] * at[0] - up[0] * at[2],
        up[0] * at[1] - up[1] * at[0],
      ]
      const acrossLength = Math.hypot(across[0], across[1], across[2]) || 1
      const along: [number, number, number] = [
        at[1] * across[2] - at[2] * across[1],
        at[2] * across[0] - at[0] * across[2],
        at[0] * across[1] - at[1] * across[0],
      ]
      const alongLength = Math.hypot(along[0], along[1], along[2]) || 1
      for (const axis of [
        [across[0] / acrossLength, across[1] / acrossLength, across[2] / acrossLength],
        [along[0] / alongLength, along[1] / alongLength, along[2] / alongLength],
      ]) {
        for (const side of [-1, 1]) {
          marks.points[m * 3] = at[0] + axis[0] * side * TICK_SIZE * radius * 1.6
          marks.points[m * 3 + 1] = at[1] + axis[1] * side * TICK_SIZE * radius * 1.6
          marks.points[m * 3 + 2] = at[2] + axis[2] * side * TICK_SIZE * radius * 1.6
          marks.colours[m * 3] = 1
          marks.colours[m * 3 + 1] = t.trackKind[k] === ONE_SIDED ? 0.59 : 0.16
          marks.colours[m * 3 + 2] = 0.16
          m++
        }
      }
    }
    marks.geometry.getAttribute('position').needsUpdate = true
    marks.geometry.getAttribute('color').needsUpdate = true
    marks.geometry.setDrawRange(0, m)
  }

  const refreshOverlay = () => {
    if (!overlay || !data.tracks) return
    const frameMa = Math.round(clock.timeMa / data.meta.frameStepMa) * data.meta.frameStepMa
    // Every pair, or only the ones whose crust formed at the moment on screen.
    // Due-now is the error: these should be closed by now and what is left of
    // each is the residual the model is scored on. All of them at 0 Ma is the
    // other picture entirely -- the whole ocean each pair has to close, which is
    // what tools/draw-pairs.ts draws flat.
    // Thinned when all of them are asked for, the way tools/draw-pairs.ts
    // thins its own subset: two thousand joins across the oceans is a mat, and
    // the point of a colour per pair is that one can be followed.
    const stride = allPairs ? Math.max(1, Math.round(data.tracks.pairAgeMa.length / 400)) : 1
    drawPairs(
      overlay.gapLine,
      (i) => (allPairs
        ? isMarked(data.tracks!.pairAgeMa[i]) && i % stride === 0
        : data.tracks!.pairAgeMa[i] === frameMa),
    )
    if (showPaths) drawPaths()
    else {
      overlay.pathLine?.geometry.setDrawRange(0, 0)
      overlay.ridgeLine?.geometry.setDrawRange(0, 0)
    }
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
    g.setAttribute('aSeam', dynamic(buffers.seam, 1))
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
      // Swapped in useFrame once the raster has arrived; a one-pixel stand-in
      // until then, because a sampler with nothing bound to it is undefined.
      uFabric: { value: BLANK },
      uZones: { value: BLANK },
      uZonesOn: { value: 0 },
      uCrust: { value: BLANK },
      uCrustSize: { value: new THREE.Vector2(1, 1) },
      uPickedZones: { value: new Float32Array(ZONE_LIMIT) },
      uPickedCount: { value: 0 },
      uTimeMa: { value: 0 },
      uMaxAgeMa: { value: data.meta.maxAgeMa },
      uMode: { value: 0 },
      uGrid: { value: 0 },
      uOpacity: { value: 1 },
      uCut: { value: new THREE.Vector3() },
      uSlab: { value: 0 },
      uShell: { value: 1 },
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
  // A one-pixel line needs no viewport size, but a resize still has to redraw.
  useEffect(() => invalidate(), [overlay, size, invalidate])
  useEffect(
    () => invalidate(),
    [invalidate, mode, showGrid, showMesh, showTracks, allPairs, showPaths,
      surfaceMap, referenceFrame, data],
  )
  // Turning the overlay on has to fill it: the positions are only rewritten
  // when the clock moves, and the clock has not.
  useEffect(() => {
    if (showTracks) refreshOverlay()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads live buffers
  }, [showTracks, allPairs, showPaths, overlay, rotations])

  const drawnFrame = useRef(-1)
  /** The clock reading the vertex buffers currently hold. */
  const sampledTime = useRef(Number.NaN)
  const retopo = () => {
    /**
     * The triangulation lags rather than rounds.
     *
     * Positions are interpolated between keyframes five million years apart;
     * the triangulation cannot be, so it has to change at some instant. It used
     * to change at the nearest keyframe, which put the change in the middle of
     * the gap -- and at 117.5 Ma a face that will be collapsed away at 120 is
     * only half closed, so removing it there is a triangle popping out of
     * existence at half its size. Whole patches appeared and disappeared over a
     * single million years.
     *
     * Taking the keyframe behind instead means a face is not removed until the
     * moment its own points have finished merging: at 119.9 Ma they are 98% of
     * the way together, the face is nearly degenerate, and it vanishes without
     * being seen to. A flip pops either way -- it swaps a diagonal, and there
     * is no moment at which that is free -- but a flip changes two triangles
     * and a collapse changes a neighbourhood.
     */
    const frame = Math.min(
      Math.floor(clock.timeMa / data.meta.frameStepMa),
      data.meta.frameCount - 1,
    )
    if (frame === drawnFrame.current) return
    drawnFrame.current = frame
    const count = buildIndex(data, frame, buffers.working, buffers.index)
    const index = geometry.getIndex()
    if (index) index.needsUpdate = true
    geometry.setDrawRange(0, count)
    measureSeams(data.dirs, buffers.index, count, buffers.seam)
    geometry.attributes.aSeam.needsUpdate = true
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

    /**
     * If the click landed on a yellow segment, say which pair it was.
     *
     * Only the pairs drawn at this moment are considered, because those are the
     * ones a reader can see and therefore the ones they can be pointing at. The
     * reach is generous -- a segment is a few pixels wide and a click is not
     * surgery -- and the nearest end wins.
     */
    // A click on a fracture zone selects it rather than sampling the crust: the
    // useful thing to do with a detector's claim is to agree or disagree with
    // it, so it lights up along its whole length and joins a list.
    if (showZones && zoneIds) {
      const l = Math.hypot(event.point.x, event.point.y, event.point.z) || 1
      const [u, v] = directionToUv(event.point.x / l, event.point.y / l, event.point.z / l)
      const column = Math.min(zoneIds.width - 1, Math.max(0, Math.floor(u * zoneIds.width)))
      const row = Math.min(zoneIds.height - 1, Math.max(0, Math.floor((1 - v) * zoneIds.height)))
      const at = (row * zoneIds.width + column) * 4
      const id = zoneIds.data[at + 1] + zoneIds.data[at + 2] * 256
      if (id > 0) {
        toggleZone(id)
        return
      }
    }

    const t = data.tracks
    let pair: Pick['pair']
    if (t) {
      const frameMa = Math.round(clock.timeMa / data.meta.frameStepMa) * data.meta.frameStepMa
      const shell = Math.hypot(
        buffers.positions[vertex * 3],
        buffers.positions[vertex * 3 + 1],
        buffers.positions[vertex * 3 + 2],
      ) || 1
      const spot = (verts: Uint32Array, weights: Float32Array, i: number) => {
        let x = 0, y = 0, z = 0
        for (let k = 0; k < 3; k++) {
          const v = verts[i * 3 + k] * 3
          const w = weights[i * 3 + k]
          x += buffers.positions[v] * w
          y += buffers.positions[v + 1] * w
          z += buffers.positions[v + 2] * w
        }
        const l = Math.hypot(x, y, z) || 1
        return [x / l, y / l, z / l] as const
      }
      let best = Infinity
      for (let i = 0; i < t.pairAgeMa.length; i++) {
        if (t.pairAgeMa[i] !== frameMa) continue
        const a = spot(t.pairAVerts, t.pairAWeights, i)
        const b = spot(t.pairBVerts, t.pairBWeights, i)
        for (const [near, far] of [[a, b], [b, a]] as const) {
          const d = (near[0] * shell - event.point.x) ** 2
            + (near[1] * shell - event.point.y) ** 2
            + (near[2] * shell - event.point.z) ** 2
          if (d >= best) continue
          best = d
          const gap = Math.acos(Math.min(1, Math.max(-1,
            a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * radiusAt(data, clock.timeMa)
          const [otherLon, otherLat] = degrees(far[0], far[1], far[2])
          pair = { ageMa: t.pairAgeMa[i], gapKm: gap, pulls: pairPulls(t, i), otherLon, otherLat }
        }
      }
      // A click well away from every segment is a click on the crust, not on a
      // pair. Two degrees of arc, which is about how wide the drawn line is.
      if (Math.sqrt(best) > 0.035 * shell) pair = undefined
    }

    const pick: Pick = {
      vertex,
      todayLon,
      todayLat,
      timeMa: clock.timeMa,
      thenLon,
      thenLat,
      ageMa: age >= PERMANENT_MA ? null : age,
      island: data.islands[vertex],
      thicknessKm: data.thickness[vertex],
      // Null until the plate map has been asked for. It is only wanted here,
      // on a right-click, so the first one starts the fetch and the next one
      // has an answer.
      block: data.plates ? data.plates[frame * data.vertexCount + vertex] : null,
      fabric: data.gravityRoughness[vertex],
      pair,
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
      material.current.uniforms.uFabric.value = fabric ?? BLANK
      material.current.uniforms.uZones.value = zones ?? BLANK
      material.current.uniforms.uZonesOn.value = showZones && zones ? 1 : 0
      material.current.uniforms.uCrust.value = crust ?? BLANK
      const grid = material.current.uniforms.uCrustSize.value as THREE.Vector2
      const image = crust?.image as { width?: number; height?: number } | undefined
      grid.set(image?.width ?? 1, image?.height ?? 1)
      const held = material.current.uniforms.uPickedZones.value as Float32Array
      for (let i = 0; i < ZONE_LIMIT; i++) held[i] = pickedZones[i] ?? 0
      material.current.uniforms.uPickedCount.value = Math.min(ZONE_LIMIT, pickedZones.length)
      material.current.uniforms.uTimeMa.value = clock.timeMa
      material.current.uniforms.uMode.value = VIEW_MODES.indexOf(mode)
      material.current.uniforms.uGrid.value = showGrid ? 1 : 0
      material.current.uniforms.uOpacity.value = GLASS_OPACITY
      // The slice lies in the plane of the screen, so it is seen face-on: a
      // ring of shell with the fold hanging inside it, which is the shape the
      // section is for. Its normal is the direction of the camera, so it turns
      // with the globe and always faces the reader.
      const cut = material.current.uniforms.uCut.value as THREE.Vector3
      cut.copy(camera.position).normalize()
      material.current.uniforms.uSlab.value = showSection ? SLAB : 0
      material.current.uniforms.uShell.value = radiusAt(data, clock.timeMa) / R0_KM
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
          // Both sides once the near half is cut away: what the section is for
          // is the inside of the shell, and the inside is a back face.
          side={showSection ? THREE.DoubleSide : THREE.FrontSide}
        />
      </mesh>
      {showTracks && overlay && (
        <>
          {/* The whole path each pair sits on, in magenta because nothing in
              the age ramp or the satellite imagery is, with a red cross where
              its two halves were one point. Drawn under the pairs, which are
              the measurement. */}
          <primitive object={overlay.pathLine.object} />
          <primitive object={overlay.ridgeLine.object} />
          {/* One segment per pair that was a single point at this moment, so its
              length is the model's error, drawn. */}
          <primitive object={overlay.gapLine.object} />
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
