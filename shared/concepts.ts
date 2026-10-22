/**
 * Concept globes: the continents laid out by hand on the smaller Earth, at a
 * few moments, as a picture of what the solver is supposed to arrive at.
 *
 * Not a reconstruction. The solver works out where crust goes from forces; this
 * is the other way round, the way Hilgenberg, Vogel and Maxlow worked -- cut the
 * continents out, lay them on a smaller ball, and push them about until they
 * fit. It starts as judgement, informed by what RESEARCH-FINDINGS.md says the
 * literature puts against what, and it becomes a control model only once each
 * placement has a reason written next to it that someone else could check.
 *
 * **The pieces** are the model's own continental crust, not a coastline: every
 * cell the age grid does not date and that sits above the shelf break, the same
 * rule `classify` in tools/build-data.ts uses for permanent crust. It is cut
 * into pieces along the outlines below. A cell belongs to the first piece whose
 * outline holds it, so the small pieces come first and the large ones can be
 * drawn generously round them. Longitudes may run past +-180 where an outline
 * crosses the date line.
 *
 * **A placement** is where a piece's centre goes on the smaller globe and how
 * far it is turned, clockwise seen from above. The piece keeps its area: each
 * point keeps its bearing from the centre and its distance is mapped so that
 * area is preserved (a Lambert azimuthal map about the centre, read back onto
 * the smaller sphere). Today's shape cannot lie on a smaller ball without some
 * distortion, and this puts all of it in the outer edge of each piece, which is
 * why the larger continents are cut into several.
 *
 * Every piece is also shrunk a little at each moment, by the same factor for
 * all of them: whatever the model's own area budget says the stretched margins
 * gave back by then. Without it the crust at today's size is 103% of the 180 Ma
 * sphere and the puzzle cannot close at all.
 */

export interface ConceptPiece {
  id: string
  name: string
  /** Outline that claims the continental cells inside it, [lon, lat] in degrees. */
  outline: [number, number][]
}

export interface Placement {
  /** Where the piece's centre lies on the smaller globe, degrees. */
  lat: number
  lon: number
  /** Turn about its own centre, degrees clockwise seen from outside. */
  spin?: number
  /** Why it goes there. */
  why?: string
}

export interface ConceptMoment {
  ma: number
  /** What this globe is meant to show, in a sentence or two. */
  note: string
  /** Pieces left out stay where they are today. */
  place: Record<string, Placement>
}

export const CONCEPT_PIECES: ConceptPiece[] = [
  {
    id: 'iberia',
    name: 'Iberia',
    outline: [[-13, 45], [-1.5, 44.2], [3.3, 42.6], [4.6, 40.5], [4.6, 38.6], [0.5, 38.2],
      [-1.8, 36.5], [-5, 36.2], [-13, 36.2]],
  },
  {
    id: 'arabia',
    name: 'Arabië',
    outline: [[34.7, 29.5], [35.4, 31.5], [35.6, 33], [36.2, 34.5], [36.4, 36.6], [38, 37.4],
      [40, 38], [42, 38.2], [44, 37.2], [45.5, 35.5], [47.5, 33.5], [48.5, 31.5], [50.5, 29.6],
      [51.5, 28], [53, 27.2], [55, 26.7], [56.3, 27.1], [56.8, 26.2], [57.5, 25.4], [60.5, 24],
      [62, 22], [60, 16], [57, 14.6], [54, 13.9], [51, 13.3], [47, 12.4], [44, 12.4],
      [43.3, 12.8], [41.8, 15], [40, 17.5], [38.5, 20], [37.5, 22], [36.3, 24], [35, 26.5],
      [34.2, 27.8], [34.5, 28.5]],
  },
  {
    id: 'madagascar',
    name: 'Madagaskar',
    outline: [[42.3, -11], [51, -11], [52, -16], [48, -27.5], [42.3, -27]],
  },
  {
    id: 'india',
    name: 'India',
    outline: [[66.4, 24.6], [67.2, 27], [68.2, 29.5], [69.6, 31.5], [71, 33], [72.8, 33.8],
      [74.5, 33], [76, 32.3], [77.5, 30.6], [79.2, 29.4], [80.5, 28.8], [82, 28.2], [84, 27.6],
      [86, 27], [88.2, 26.9], [90, 26.8], [92, 27], [94, 27.5], [95.5, 28], [94, 25],
      [93.2, 23], [92.6, 21], [91.5, 17], [88, 10], [83, 5], [80, 2], [75, -1], [72, -1],
      [71, 4], [70, 10], [68, 16], [66, 20], [65.5, 23.5]],
  },
  {
    id: 'kerguelen',
    name: 'Kerguelen',
    outline: [[62, -45], [85, -45], [85, -63], [62, -63]],
  },
  {
    id: 'australia',
    name: 'Australië',
    outline: [[100, -50], [100, -12], [118, -11.6], [121, -10], [124, -8.6], [127.5, -8],
      [128.5, -8.5], [128.5, -9.9], [134, -9.6],
      [141, -9.6], [143.5, -9.9], [146, -11.5], [151, -12.5], [156.5, -14], [156.5, -25],
      [154.5, -30], [152, -50]],
  },
  {
    id: 'newguinea',
    name: 'Nieuw-Guinea',
    outline: [[128.5, 1], [128.5, -9.9], [134, -9.6], [141, -9.6], [143.5, -9.9], [146, -11.5],
      [151, -12.5], [156, -12], [162, -11], [162, -5], [155, 0], [140, 1.5]],
  },
  {
    id: 'zealandia',
    name: 'Zealandia',
    outline: [[155.5, -17], [168.5, -17], [170.5, -23], [176, -28], [183, -36], [188, -42],
      [188, -50], [180, -57], [160, -57], [155.5, -48]],
  },
  {
    id: 'japan',
    name: 'Japan',
    outline: [[122.8, 24], [127, 26], [129, 31], [128.6, 33.6], [129.4, 35], [133, 36.5],
      [138.5, 40.5], [140.5, 45.8], [142, 45.8], [146, 44.2], [148, 43], [146, 40],
      [142.5, 34], [140, 30], [131, 25], [123, 23.5]],
  },
  {
    id: 'greenland',
    name: 'Groenland',
    outline: [[-73, 76], [-72.5, 78.3], [-68, 80], [-63, 81.5], [-58, 82.3], [-50, 84],
      [-60, 90], [-10, 90], [-10, 84], [-5, 80], [-12, 75], [-20, 70], [-28, 68], [-33, 65.5], [-38, 64],
      [-42, 59.5], [-48, 59], [-54, 63], [-59, 66.5], [-63, 72], [-68, 75]],
  },
  {
    id: 'peninsula',
    name: 'Antarctisch Schiereiland',
    outline: [[-80, -60.5], [-53, -60.5], [-53, -75], [-80, -75]],
  },
  {
    id: 'westantarctica',
    name: 'West-Antarctica',
    outline: [[163, -60], [163, -76], [168, -80], [172, -84], [190, -86.5], [240, -87],
      [300, -84], [335, -80.5], [330, -77], [330, -60]],
  },
  {
    id: 'middleeast',
    name: 'Turkije–Iran',
    outline: [[26, 34.5], [26, 41], [29, 41.3], [32, 42.2], [36, 42], [41.5, 41.6], [44, 42.6],
      [47, 41.8], [50, 42], [53, 45.5], [58, 47.5], [66, 47.5], [72, 43], [74.5, 40], [75, 37],
      [73, 33.5], [69, 29], [66.5, 24], [57, 24.5], [56, 26], [50, 29], [48, 30], [44, 33],
      [36, 36], [34, 35], [30, 35]],
  },
  {
    id: 'africa',
    name: 'Afrika',
    outline: [[-26, 37], [-6.6, 36], [-2, 35.9], [0, 36.3], [5, 37.2], [9, 37.7], [11.5, 37.6],
      [12.6, 37.3], [14.4, 36.5], [15.5, 36], [19, 35], [23, 34.5], [26.5, 34.5], [29, 33.8],
      [32, 33.5], [34.6, 33.9], [36.5, 36.7], [40, 30], [44, 20], [52, 14], [56, 13], [56, 10],
      [52, 0], [46, -10], [46, -30], [35, -38], [25, -42], [15, -42], [5, -35], [-10, -20],
      [-26, 0]],
  },
  {
    id: 'europe',
    name: 'Europa',
    outline: [[-25, 58], [-14, 64], [-2, 66], [3, 72], [8, 79], [-10, 85], [-10, 90], [66, 90],
      [66, 76], [61, 69], [59.7, 60], [59.7, 51], [55, 50.5], [52, 47.6], [50, 46.5], [49, 44],
      [47, 41], [40, 36], [30, 33], [20, 33], [10, 36], [-10, 36], [-12, 43], [-12, 48],
      [-17, 51], [-20, 55]],
  },
  {
    id: 'siberia',
    name: 'Siberië',
    outline: [[59.7, 51], [59.7, 60], [61, 69], [66, 76], [66, 90], [190, 90], [190, 66],
      [180, 63], [178, 61.5], [172, 58], [163, 51], [157, 47.5], [150, 43.5], [146, 42.5],
      [141, 45.8], [140.5, 48], [139, 52], [135, 55], [120, 53.5], [110, 51.5], [100, 51.5],
      [90, 49.5], [80, 45.5], [70, 46], [60, 46.5], [52, 46.5], [52, 47.6], [55, 50.5]],
  },
  {
    id: 'china',
    name: 'China',
    outline: [[70, 46], [80, 45.5], [90, 49.5], [100, 51.5], [110, 51.5], [120, 53.5],
      [135, 55], [139, 52], [140.5, 48], [141, 45.8], [139, 42], [130, 34], [130, 32],
      [128.5, 28], [125, 24.5], [122.5, 22], [120.5, 21.5], [118, 21], [114, 21], [111, 18],
      [108, 18], [108, 19.5], [106.5, 21.5], [104, 22.8], [102, 22.4], [100, 22], [98.5, 24.5],
      [97.8, 28], [96, 28.5], [94, 27], [90, 26.4], [85, 26.8], [80, 28.4], [77, 30],
      [75.5, 31.8], [73.5, 33.2], [75, 37], [74.5, 40], [72, 43]],
  },
  {
    id: 'sundaland',
    name: 'Zuidoost-Azië',
    outline: [[92, 25], [98, 29], [106, 23], [110, 19], [118, 22], [124, 20], [127, 19],
      [128, 10], [129.5, 3], [129, -1.5], [126, -6], [121, -7.5], [122, -9.5], [115, -9.5],
      [105, -8], [100, -5], [95, 0], [93.5, 4], [91.5, 10], [92, 15]],
  },
  {
    id: 'alaska',
    name: 'Alaska',
    outline: [[-188, 50], [-188, 58], [-182, 61.5], [-180, 63], [-170, 66], [-170, 76],
      [-141, 76], [-141, 60], [-136, 56], [-140, 55], [-160, 52], [-175, 50]],
  },
  {
    id: 'centralamerica',
    name: 'Midden-Amerika',
    outline: [[-94.5, 14.5], [-94.8, 18.3], [-91, 21.8], [-86.5, 22.5], [-83, 23.3],
      [-80, 23.4], [-77, 22.5], [-74, 21], [-72, 20.3], [-70, 20.2], [-65, 18.9],
      [-64.5, 17.5], [-72, 17], [-76, 16.5], [-80, 13.5], [-83, 10], [-77.2, 9], [-77.5, 7.5],
      [-82, 5], [-92, 11]],
  },
  {
    id: 'northamerica',
    name: 'Noord-Amerika',
    outline: [[-188, 50], [-188, 58], [-182, 61.5], [-180, 63], [-170, 66], [-170, 90],
      [-60, 90], [-45, 60], [-44, 47], [-55, 40], [-65, 33], [-70, 26], [-64.5, 19],
      [-64.5, 17.5], [-72, 17], [-76, 16.5], [-80, 13.5], [-83, 10], [-77.2, 9], [-77.5, 7.5],
      [-82, 5], [-92, 11], [-106, 19], [-118, 29], [-122, 34], [-126, 40], [-128, 45],
      [-133, 52], [-139, 57], [-150, 57], [-160, 53], [-170, 51], [-180, 50.5]],
  },
  {
    id: 'southamerica',
    name: 'Zuid-Amerika',
    outline: [[-77.5, 7.5], [-77.2, 9], [-73, 12.8], [-65, 13], [-64, 18.6], [-59, 18.6],
      [-56, 10], [-45, 3], [-36, -3], [-30, -8], [-34, -20], [-28, -32], [-40, -40],
      [-40, -50], [-33, -53], [-33, -57], [-68, -57], [-80, -55], [-78, -45], [-75, -35],
      [-73, -25], [-74, -18], [-80, -10], [-83, -5], [-81.5, 1], [-79.5, 4], [-78.2, 6.5]],
  },
  {
    id: 'eastantarctica',
    name: 'Oost-Antarctica',
    outline: [[-180, -55], [180, -55], [180, -90], [-180, -90]],
  },
]

/**
 * Two margins that face each other: a point on one piece and the point on
 * another that it lay against. Each point is snapped to the nearest cell of
 * continental crust, so it can be given a little offshore and lands on the
 * shelf edge.
 *
 * How far apart they are at a moment is not chosen: it is the sea floor older
 * than that moment along today's great circle between them, read off the age
 * grid. At 0 Ma that is the whole ocean, so today's layout satisfies every join
 * by construction; at 180 Ma it is almost nothing, and the two margins touch.
 * What is chosen is only which coast faces which, and that is what each `why`
 * is for.
 */
export interface ConceptJoin {
  a: [number, number]
  b: [number, number]
  why: string
}

const BULLARD = 'Bullard, Everett & Smith 1965 fit; Maxlow: west Africa to South America'
const CENTRAL = 'Central Atlantic fit; opens first in every EE sequence (Maxlow, Owen)'
const TOUCHING = 'joined by continental crust today'
const SCALERA = 'Scalera 2007: Australia\'s east margin near western South America'

export const CONCEPT_JOINS: ConceptJoin[] = [
  // The Atlantic and the Arctic.
  { a: [-34.5, -6], b: [9, 3], why: BULLARD },
  { a: [-42, -23.5], b: [12, -11], why: BULLARD },
  { a: [-52, -34], b: [15, -29], why: BULLARD },
  { a: [-48.5, -0.5], b: [-7, 4], why: BULLARD },
  { a: [-65.5, 42.5], b: [-10, 31.5], why: CENTRAL },
  { a: [-75, 35], b: [-17.5, 20.5], why: CENTRAL },
  { a: [-78.5, 28], b: [-16.5, 12.5], why: CENTRAL },
  { a: [-49.5, 46.5], b: [-10.5, 40], why: 'Newfoundland and Iberia, conjugate margins' },
  { a: [-47, 49], b: [-9.5, 43], why: 'Flemish Cap and Galicia Bank, conjugate margins' },
  { a: [-6, 36.3], b: [-6, 35.6], why: 'Maxlow: Spain to Morocco' },
  { a: [2.5, 42.6], b: [2.5, 43], why: TOUCHING },
  { a: [-8, 44], b: [-6.5, 47.5], why: 'Bay of Biscay closed: Iberia against France' },
  { a: [-48, 60.5], b: [-55, 53.5], why: 'Maxlow: Canada to Greenland (Labrador Sea)' },
  { a: [-56, 68], b: [-62, 67], why: 'Maxlow: Canada to Greenland (Baffin Bay)' },
  { a: [-70, 79], b: [-73, 79.5], why: TOUCHING },
  { a: [-20, 72], b: [8, 66.5], why: 'Maxlow: Greenland to Norway' },
  { a: [-12, 79], b: [15, 77], why: 'Maxlow: Greenland to Norway (Svalbard)' },
  { a: [-38, 63], b: [-17, 58], why: 'Rockall against south-east Greenland' },
  { a: [130, 77], b: [-115, 79], why: 'Arctic Ocean closed: Laptev shelf against the Canadian Arctic' },
  // Gondwana.
  { a: [44, -17], b: [38.5, -16.5], why: 'Maxlow: Madagascar to Mozambique' },
  { a: [43.8, -24], b: [35.5, -24.5], why: 'Maxlow: Madagascar to Mozambique' },
  { a: [72.5, 19], b: [25, -69.5], why: 'Maxlow: India\'s west margin to Queen Maud Land' },
  { a: [75.5, 9.5], b: [40, -68], why: 'Maxlow: India\'s west margin to Queen Maud Land' },
  { a: [20, -36], b: [0, -69.5], why: 'Maxlow: South Africa to New Schwabenland' },
  { a: [33, -30], b: [15, -69.8], why: 'Maxlow: South Africa to New Schwabenland' },
  { a: [114.5, -35], b: [100, -65], why: 'Maxlow: south-west Australia to Wilkes Land' },
  { a: [132, -34], b: [125, -66], why: 'Maxlow: south-west Australia to Wilkes Land' },
  { a: [147, -45], b: [160, -70], why: 'Maxlow: Tasmania to Victoria Land' },
  { a: [78, -63], b: [78, -66], why: 'Kerguelen against the Antarctic margin it sits off' },
  { a: [170, -84], b: [175, -84.5], why: TOUCHING },
  { a: [-40, -80], b: [-30, -79], why: TOUCHING },
  { a: [-70, -75], b: [-75, -76], why: TOUCHING },
  { a: [-63, -63], b: [-66, -55.5], why: 'Drake Passage closed: the Peninsula against Tierra del Fuego' },
  { a: [172, -52], b: [-145, -76], why: 'Campbell Plateau against Marie Byrd Land' },
  { a: [160, -30], b: [154, -28], why: 'Tasman Sea closed: Lord Howe Rise against Australia' },
  // Arabia, Asia and the Tethys side.
  { a: [42.5, 15], b: [40, 15], why: 'Maxlow: Arabia to Africa (Red Sea)' },
  { a: [35.5, 27.5], b: [33.5, 27.5], why: 'Maxlow: Arabia to Africa (Red Sea)' },
  { a: [50, 14], b: [50, 11.5], why: 'Maxlow: Arabia to Africa (Gulf of Aden)' },
  { a: [48, 31], b: [49, 31.8], why: TOUCHING },
  { a: [44, 37], b: [43, 38.5], why: TOUCHING },
  { a: [30, 41], b: [28, 41.5], why: TOUCHING },
  { a: [45, 42], b: [45, 43.5], why: TOUCHING },
  { a: [70, 40], b: [76, 40], why: TOUCHING },
  { a: [62, 46], b: [62, 48], why: TOUCHING },
  { a: [60, 60], b: [61, 60], why: TOUCHING },
  { a: [12.2, 37.6], b: [11, 37], why: 'Sicily against Tunisia' },
  { a: [23, 35], b: [23, 32.5], why: 'Crete against Libya' },
  { a: [100, 51], b: [100, 50], why: TOUCHING },
  { a: [120, 53], b: [120, 52.5], why: TOUCHING },
  { a: [104, 22], b: [104, 21.5], why: TOUCHING },
  { a: [110, 20], b: [109, 19], why: TOUCHING },
  { a: [130, 34], b: [131, 34.6], why: 'Sea of Japan closed' },
  { a: [137, 44], b: [140, 43], why: 'Sea of Japan closed' },
  { a: [142, 46], b: [142, 45.5], why: TOUCHING },
  { a: [78, 30], b: [79, 31.5], why: 'Maxlow: India stays attached to Asia' },
  { a: [90, 26.8], b: [90, 28], why: 'Maxlow: India stays attached to Asia' },
  { a: [67, 27], b: [65, 27.5], why: TOUCHING },
  { a: [120, -9], b: [121, -11.5], why: 'Banda arc against the Australian margin' },
  { a: [141, -9.5], b: [141, -10], why: TOUCHING },
  { a: [128, -3], b: [131, -3], why: TOUCHING },
  // The Americas.
  { a: [-170, 66], b: [-171, 66.5], why: 'Maxlow: Siberia to Alaska' },
  { a: [-178, 62.5], b: [-176, 62], why: 'Maxlow: Siberia to Alaska' },
  { a: [-141, 65], b: [-140, 65], why: TOUCHING },
  { a: [-141, 70], b: [-140, 70], why: TOUCHING },
  { a: [-94.5, 17], b: [-95, 17.5], why: TOUCHING },
  { a: [-81, 23.5], b: [-81, 24.5], why: TOUCHING },
  { a: [-77.5, 8], b: [-77, 7.5], why: TOUCHING },
  // The Pacific.
  { a: [154, -22], b: [-71.5, -22], why: SCALERA },
  { a: [151, -34], b: [-73.5, -36], why: SCALERA },
  { a: [145, -4], b: [-118, 33.5], why: 'Scalera 2018, Brosske 1962: New Guinea over California' },
  { a: [136, -1.5], b: [-114, 28], why: 'Scalera 2018, Brosske 1962: New Guinea over California' },
  { a: [141, 36], b: [-125, 48], why: 'Maxlow: a small North Pacific basin between China and Canada' },
]

export const CONCEPT_MOMENTS: ConceptMoment[] = [
  { ma: 0, note: 'Vandaag, als maat.', place: {} },
  {
    ma: 45,
    note: 'Bedoeld: de Atlantische Oceaan nog breed, Australië net los van Antarctica, India tegen Azië.',
    place: {},
  },
  {
    ma: 90,
    note: 'Bedoeld: de Zuid-Atlantische Oceaan smal, de Tasmanzee dicht, Madagaskar net los van India.',
    place: {},
  },
  {
    ma: 135,
    note: 'Bedoeld: Zuid-Amerika tegen Afrika, de Centrale Atlantische Oceaan nog open, India tegen Queen Maud Land.',
    place: {},
  },
  {
    ma: 180,
    note: 'Bedoeld: bijna alles dicht. Alleen de oudste oceaanbodem, 1% van deze bol, is er al.',
    place: {},
  },
]
