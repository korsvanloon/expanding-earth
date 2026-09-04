import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { DEFAULT_SURFACE_MAP, SURFACE_MAPS } from '@shared/maps'
import { REGIONS } from '@shared/model'

export type ViewMode =
  | 'surface' | 'age' | 'strain' | 'rigidity' | 'islands' | 'fabric' | 'thickness' | 'crust'

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
  /**
   * How thick the crust is here, km, from ECM1.
   *
   * Reported because it is a solver input that had no way of being checked. A
   * reader comparing the strength map against a published thickness map asked
   * whether ours was right -- Arabia looked thicker than the Himalaya -- and
   * the answer was that they were reading strength, where an orogen is
   * deliberately weak despite being the thickest crust on the planet. Fair
   * question to have no way of settling. Now there is a number.
   */
  thicknessKm: number
  /** Which rigid block it belongs to, or null before the plate map arrives. */
  block: number | null
  /**
   * The conjugate pair this click landed on, if it landed on one.
   *
   * Worth reporting separately from the point because a pair is a different
   * kind of claim: not "here is some crust" but "these two pieces were one
   * piece at this age". Since the solver started pulling on them, judging a
   * pair is the most useful thing anyone can do to this model -- a wrong one no
   * longer merely mis-scores the answer, it drags the crust.
   */
  pair?: {
    ageMa: number
    gapKm: number
    /** Whether it pulls on the crust, or was held back to score it. */
    pulls: boolean
    otherLon: number
    otherLat: number
  }
  /**
   * How worked the crust is here, Eotvos per 100 km of the gravity gradient.
   * A platform reads under 40, an orogen over 200. It is in a pick because it
   * is the number that says whether a point is allowed to move relative to its
   * neighbours, and picks are how expectations about points get written down.
   */
  fabric: number
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
  /**
   * Cut the half of the Earth nearest the reader away.
   *
   * The only way to see crust that is not on the surface. A run that folds its
   * un-erupted crust inside the shell instead of collapsing it away hangs a
   * fifth of the mesh below the surface by 200 Ma, and the surface is opaque.
   */
  showSection: boolean
  /**
   * Draw the conjugate pairs due to meet at the moment on screen.
   *
   * Each is two points that were one point, and the line between them is what
   * the reconstruction owes: at their own age it should be nothing. This used to
   * draw the traced flow lines beside them, in pink, and no longer does -- a
   * track is the path one piece of crust took away from its ridge and the pairs
   * are the two ends of that same path, so it was one claim told twice, and the
   * pink half was the half that cannot fail a check. See shared/tracks.ts.
   */
  showTracks: boolean
  /**
   * Every pair, rather than only the ones due at the moment on screen.
   *
   * Two different pictures, and a reader comparing the globe against the flat
   * map ran straight into it. Due-now draws the residual: these should be
   * closed by this moment, and the leftover is what the model is scored on, so
   * the lines are short. All of them at 0 Ma draws the claim instead -- the
   * whole ocean each pair has to close, hundreds to thousands of kilometres
   * wide -- which is the flat map, on the sphere.
   */
  /**
   * Whether the whole path each pair sits on is drawn, with its ridge point.
   *
   * These were taken off the globe once, on a reader's own observation that a
   * path and its pairs were one claim told twice. A path carries more now --
   * the point where its two halves were one point, and a run of pairs along it
   * in their own colours -- and it is the form the paths are being read and
   * corrected in, so it is worth having back. Off by default: the pairs are
   * the measurement and the paths are the context for it.
   */
  /**
   * Paint the fracture zones the gravity grid was searched for.
   *
   * Not the same thing as showTracks, and the pair of them is the point. Those
   * are inference: where the model believes one piece of crust went. These are
   * evidence: scarps a fracture zone left in an independent dataset, sparse,
   * broken where nothing was left behind, and observed. Putting the two on the
   * same crust is how a reader judges whether the inference matches the
   * evidence -- and it is the check that matters most, because the pairs are
   * traced along these and inherit whatever the detection gets wrong. See
   * fractureZones in tools/lib/structure.ts.
   */
  showZones: boolean
  /**
   * Fracture zones the reader has picked, newest last, by id.
   *
   * Kept apart from `picks`, which are pieces of crust. A zone is a claim the
   * detector made and the useful thing to do with it is agree or disagree, so
   * it is selected rather than sampled: it lights up along its whole length and
   * stays in a list until it is dismissed.
   */
  pickedZones: number[]
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
  setShowSection: (showSection: boolean) => void
  setShowTracks: (showTracks: boolean) => void
  setShowZones: (showZones: boolean) => void
  toggleZone: (id: number) => void
  clearZones: () => void
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
      + `  crust ${p.thicknessKm.toFixed(0)} km`
      + `  island ${p.island}  block ${p.block ?? 'not fetched yet'}`
      + `  fabric ${p.fabric.toFixed(0)}`
      + (p.pair
        ? `\n        ^ on a conjugate pair: was one point at ${p.pair.ageMa.toFixed(0)} Ma `
          + `with (${place(p.pair.otherLon, p.pair.otherLat)}); `
          + `${p.pair.gapKm.toFixed(0)} km apart in this frame; `
          + `${p.pair.pulls ? 'pulls on the crust' : 'held back to score the model'}`
        : '')),
  ].join('\n')
}

/**
 * How many picked zones are kept, and highlighted.
 *
 * Bounded because the shader compares against a fixed-size uniform array on
 * every fragment, so this is the length of that array too; keep the two equal.
 */
export const ZONE_LIMIT = 48

/** What the summary table in meta.json holds for one detected zone. */
export interface ZoneSummary {
  lengthKm: number
  lon: number
  lat: number
  ageMa: number | null
  swingE: number
  bowlMa: number
}

/**
 * The picked zones as text, ready to be pasted into a sentence about them.
 *
 * Same job as describePicks and the same reasoning: the id leads because that
 * is what survives a rebuild of the page, and the degrees follow so a person
 * can say "that one is a seamount chain" without loading anything. The em dash
 * is load-bearing -- without a separator `#1605` and `409 km` run together into
 * a number that means nothing.
 */
export function describeZones(picked: number[], zones: ZoneSummary[]): string {
  if (!picked.length) return ''
  // The place leads, because the place is what lasts.
  //
  // An id is a position in a list the pipeline rebuilds from scratch, so a
  // number written down against one build points at a different curve in the
  // next -- which has now cost two rounds of this project: a reader sent
  // twenty-seven ids, the detector was improved, and every number in the list
  // had moved. `tools/measure-zones.ts` takes a `lon,lat` for exactly this
  // reason, so that is the first thing on each line and the id trails as a
  // convenience for the build it was picked from.
  return [
    'picked fracture zones on the Expanding Earth globe. lon,lat of the '
      + "curve's centre first, because that is what survives a rebuild -- an id "
      + 'is a position in a list and moves. Then its length, the mean sea-floor '
      + 'age along it, how far the gravity swings along it (a seamount chain is '
      + 'lumpy, a scarp is not), and how far the age dips on the line against '
      + '60 km either side (positive means a spreading axis).',
    ...picked.map((id) => {
      const zone = zones[id - 1]
      return zone
        ? `${zone.lon.toFixed(1)},${zone.lat.toFixed(1)}  ${zone.lengthKm} km`
          + `; ${zone.ageMa === null ? 'undated' : `${zone.ageMa} Ma`}`
          + `, swing ${zone.swingE} E, bowl ${zone.bowlMa.toFixed(2)} Ma`
          + `  (#${id} in this build)`
        : `#${id} -- no record of this one`
    }),
  ].join('\n')
}

/**
 * What is remembered between visits.
 *
 * How the globe is set up, and nothing else. Someone comparing the crustal
 * fabric against the detected zones with Africa held still should not have to
 * put all three back after every reload, and while a run is being judged that
 * is most reloads.
 *
 * Deliberately not the picks or the picked zones. Those are a reading of one
 * particular run, and an id is a position in a list the pipeline rebuilds from
 * scratch, so restoring them after a rebuild would quietly point at different
 * crust. Deliberately not `playing` either: a page that starts animating on its
 * own is a page nobody asked to move.
 */
// Spelled out rather than picked off State, because `Pick` here is the
// interface above -- a point of crust someone clicked on -- and not the type
// operator.
interface Remembered {
  mode: ViewMode
  surfaceMap: string
  referenceFrame: string
  showGrid: boolean
  showMesh: boolean
  showSection: boolean
  showTracks: boolean
  showZones: boolean
  speed: number
}

/**
 * Every view mode, in the order the shader numbers them.
 *
 * One list, because there were two: the shader's `uMode` is an integer and the
 * renderer had its own table mapping a name to it. Two lists of the same six
 * things drift the moment a seventh is added, and the failure is silent -- a
 * mode that paints as whatever happens to share its number.
 */
export const VIEW_MODES: ViewMode[] = [
  'surface', 'age', 'strain', 'rigidity', 'islands', 'fabric', 'thickness', 'crust',
]

/**
 * Take back only what still means something.
 *
 * A stored value outlives the code that made it: a map can be renamed, a view
 * mode dropped, a region removed. Restoring one of those blind leaves a globe
 * painted with nothing and no way to tell why, so anything unrecognised falls
 * back to the default rather than being trusted.
 */
export function remembered(stored: unknown): Partial<Remembered> {
  if (!stored || typeof stored !== 'object') return {}
  const s = stored as Record<string, unknown>
  const flag = (
    key: 'showGrid' | 'showMesh' | 'showSection' | 'showTracks' | 'showZones',
  ) =>
    (typeof s[key] === 'boolean' ? { [key]: s[key] as boolean } : {})
  return {
    ...(VIEW_MODES.includes(s.mode as ViewMode) ? { mode: s.mode as ViewMode } : {}),
    ...(SURFACE_MAPS.some((m) => m.id === s.surfaceMap)
      ? { surfaceMap: s.surfaceMap as string }
      : {}),
    ...(s.referenceFrame === '' || REGIONS.some((r) => r.id === s.referenceFrame)
      ? { referenceFrame: s.referenceFrame as string }
      : {}),
    ...(typeof s.speed === 'number' && s.speed > 0 && s.speed <= 1000
      ? { speed: s.speed }
      : {}),
    ...flag('showGrid'),
    ...flag('showMesh'),
    ...flag('showSection'),
    ...flag('showTracks'),
    ...flag('showZones'),
  }
}

/**
 * Storage that cannot throw.
 *
 * Reading localStorage is not always allowed -- a private window, a browser set
 * to block site data, a page opened from a file -- and in some of those the
 * access itself throws rather than returning null. A viewer preference is not
 * worth a blank page.
 */
const safeStorage = {
  getItem: (name: string) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Nothing to be done, and nothing that depends on it.
    }
  },
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name)
    } catch {
      // As above.
    }
  },
}

export const useStore = create<State>()(persist((set) => ({
  playing: false,
  // One of the values the speed control offers, which 25 was not: the store
  // played at 25 while the dropdown, finding nothing to match, displayed the
  // first option and said 5.
  speed: 15,
  mode: 'surface',
  surfaceMap: DEFAULT_SURFACE_MAP,
  referenceFrame: 'africa',
  showGrid: false,
  showMesh: false,
  showSection: false,
  showTracks: false,
  showZones: false,
  pickedZones: [],
  endTimeMa: 200,
  picks: [],
  // Six is enough for a claim about a handful of points and few enough that the
  // list stays readable; the oldest falls off rather than the newest being
  // refused, because the newest is the one just clicked.
  addPick: (pick) => set((s) => ({ picks: [...s.picks, pick].slice(-6) })),
  clearPicks: () => set({ picks: [] }),
  setPlaying: (playing) => {
    set({ playing })
    // Wake the renderer, or pressing play does nothing at all.
    //
    // The canvas draws on request and the playback loop lives inside a frame,
    // so the loop can only start if something asks for a frame. Nothing here
    // subscribes to `playing`, so the store write alone changed no pixels: play
    // worked only from the present, where the rewind to the end of the run went
    // through setTimeMa and woke the canvas as a side effect. Click anywhere on
    // the timeline first and the button did nothing, which is exactly what a
    // reader reported.
    if (playing) wake?.()
  },
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setSurfaceMap: (surfaceMap) => set({ surfaceMap }),
  setReferenceFrame: (referenceFrame) => set({ referenceFrame }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowMesh: (showMesh) => set({ showMesh }),
  setShowSection: (showSection) => set({ showSection }),
  setShowTracks: (showTracks) => set({ showTracks }),
  setShowZones: (showZones) => set({ showZones }),
  // Clicking a picked zone again lets it go. The cap is ZONE_LIMIT rather
  // than a handful because judging the detector means working across a whole
  // ocean in one sitting, and a selection that silently evaporates while you
  // do that is worse than useless -- it makes the list lie.
  toggleZone: (id) => set((s) => ({
    pickedZones: s.pickedZones.includes(id)
      ? s.pickedZones.filter((z) => z !== id)
      : [...s.pickedZones, id].slice(-ZONE_LIMIT),
  })),
  clearZones: () => set({ pickedZones: [] }),
  setEndTime: (endTimeMa) => set({ endTimeMa }),
  seek: (timeMa) => {
    clock.timeMa = timeMa
  },
}), {
  name: 'expanding-earth.view',
  version: 1,
  storage: createJSONStorage(() => safeStorage),
  partialize: (s): Remembered => ({
    mode: s.mode,
    surfaceMap: s.surfaceMap,
    referenceFrame: s.referenceFrame,
    showGrid: s.showGrid,
    showMesh: s.showMesh,
    showSection: s.showSection,
    showTracks: s.showTracks,
    showZones: s.showZones,
    speed: s.speed,
  }),
  merge: (stored, current) => ({ ...current, ...remembered(stored) }),
}))
