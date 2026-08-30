import { create } from 'zustand'
import { DEFAULT_SURFACE_MAP } from '@shared/maps'

export type ViewMode = 'surface' | 'age' | 'strain' | 'rigidity' | 'plates'

/**
 * Playback time lives here rather than in React state on purpose: it changes
 * every frame, and pushing 60 renders a second through the tree just to move a
 * globe is wasted work. The render loop reads and writes it directly; the
 * read-outs poll it a few times a second.
 */
export const clock = { timeMa: 0 }

interface State {
  playing: boolean
  /** Myr of model time per second of wall clock. */
  speed: number
  mode: ViewMode
  /** Which surface map is painted on the crust; see shared/maps.ts. */
  surfaceMap: string
  /** Region held still while the rest of the world moves; '' for no-net-rotation. */
  referenceFrame: string
  showGrid: boolean
  /** Draw the shell as glass with its triangles on top; see src/scene/Globe.tsx. */
  showMesh: boolean
  endTimeMa: number
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setMode: (mode: ViewMode) => void
  setSurfaceMap: (surfaceMap: string) => void
  setReferenceFrame: (referenceFrame: string) => void
  setShowGrid: (showGrid: boolean) => void
  setShowMesh: (showMesh: boolean) => void
  setEndTime: (endTimeMa: number) => void
  seek: (timeMa: number) => void
}

export const useStore = create<State>((set) => ({
  playing: false,
  speed: 25,
  mode: 'surface',
  surfaceMap: DEFAULT_SURFACE_MAP,
  referenceFrame: 'africa',
  showGrid: false,
  showMesh: false,
  endTimeMa: 200,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setSurfaceMap: (surfaceMap) => set({ surfaceMap }),
  setReferenceFrame: (referenceFrame) => set({ referenceFrame }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMesh: (showMesh) => set({ showMesh }),
  setEndTime: (endTimeMa) => set({ endTimeMa }),
  seek: (timeMa) => {
    clock.timeMa = timeMa
  },
}))
