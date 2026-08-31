import { create } from 'zustand'
import { DEFAULT_SURFACE_MAP } from '@shared/maps'

export type ViewMode = 'surface' | 'age' | 'strain' | 'rigidity' | 'islands'

/**
 * A point of crust the user has picked off the globe.
 *
 * `vertex` is the whole point of this. Longitude and latitude are for reading;
 * the index is what identifies a piece of crust across every frame and every
 * run, so an expectation written about two picked points can be turned into a
 * measurement the solver reports for ever after.
 */
export interface Pick {
  vertex: number
  /** Where this crust sits today, degrees. Its identity; never changes. */
  todayLon: number
  todayLat: number
  /** Where the reconstruction puts it at the moment it was picked. */
  timeMa: number
  thenLon: number
  thenLat: number
  /** Age of the crust, or null for continental crust the grid does not date. */
  ageMa: number | null
  island: number
  block: number
  /** Which continent was being held still, if any, when it was read. */
  referenceFrame: string
}

/**
 * Playback time lives here rather than in React state on purpose: it changes
 * every frame, and pushing 60 renders a second through the tree just to move a
 * globe is wasted work. The render loop reads and writes it directly; the
 * read-outs poll it a few times a second.
 */
export const clock = { timeMa: 0 }

let wake: (() => void) | null = null

/**
 * Let the renderer be told when the clock moves.
 *
 * The canvas only draws when something asks it to -- a globe nobody is touching
 * should cost nothing, and it used to cost a full redraw and three quarters of a
 * megabyte of buffer uploads sixty times a second. That means every write to
 * the clock from outside the render loop has to say so, which is why they go
 * through `setTimeMa` rather than assigning to the field.
 */
export function onClockMoved(fn: () => void): () => void {
  wake = fn
  return () => {
    if (wake === fn) wake = null
  }
}

export function setTimeMa(ma: number): void {
  clock.timeMa = ma
  wake?.()
}

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
  /** Points picked off the globe, oldest first; see Pick. */
  picks: Pick[]
  addPick: (pick: Pick) => void
  clearPicks: () => void
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

/**
 * The picks as text, ready to be pasted into a sentence about them.
 *
 * Written for a person to read and for a machine to parse back, because that
 * is the whole journey: it is read in a chat window and it ends up as a fit
 * target in shared/model.ts. The vertex index leads, since that is the part
 * that survives; the degrees are there so a person can tell Namibia from
 * Uruguay without loading anything.
 */
export function describePicks(picks: Pick[]): string {
  if (!picks.length) return ''
  const held = picks[picks.length - 1].referenceFrame
  const place = (lon: number, lat: number) => `${lon.toFixed(1)}, ${lat.toFixed(1)}`
  return [
    `picked on the Expanding Earth globe -- lon, lat in degrees; reconstructed `
      + `coordinates ${held ? `with ${held} held still` : 'in the no-net-rotation frame'}`,
    ...picks.map((p) =>
      `#${p.vertex}  today (${place(p.todayLon, p.todayLat)})`
      + `  at ${p.timeMa.toFixed(0)} Ma (${place(p.thenLon, p.thenLat)})`
      + `  ${p.ageMa === null ? 'continental' : `sea floor ${p.ageMa.toFixed(0)} Ma`}`
      + `  island ${p.island}  block ${p.block}`),
  ].join('\n')
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
  picks: [],
  // Six is enough for a claim about a handful of points and few enough that the
  // list stays readable; the oldest falls off rather than the newest being
  // refused, because the newest is the one just clicked.
  addPick: (pick) => set((s) => ({ picks: [...s.picks, pick].slice(-6) })),
  clearPicks: () => set({ picks: [] }),
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
