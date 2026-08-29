import { create } from 'zustand'

export type ViewMode = 'surface' | 'age' | 'strain'

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
  showGrid: boolean
  endTimeMa: number
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setMode: (mode: ViewMode) => void
  setShowGrid: (showGrid: boolean) => void
  setEndTime: (endTimeMa: number) => void
  seek: (timeMa: number) => void
}

export const useStore = create<State>((set) => ({
  playing: false,
  speed: 25,
  mode: 'surface',
  showGrid: false,
  endTimeMa: 200,
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setEndTime: (endTimeMa) => set({ endTimeMa }),
  seek: (timeMa) => {
    clock.timeMa = timeMa
  },
}))
