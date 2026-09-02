/**
 * Crustal types from ECM1 (Mooney, Barrera-Lopez, Chichanov et al., 2023), a
 * 1x1 degree global crustal model. https://www.earthcrustmodel1.com/
 *
 * The classification is what makes this dataset worth more than a thickness
 * grid alone. Thickness on its own is actively misleading: the thickest crust
 * on Earth is Tibet at over 70 km, and it is also the most deformable, because
 * an orogen is hot and still shortening. A shield of 40 km is far stronger. So
 * strength is keyed on what kind of crust it is, not on how much of it there is.
 */
export const CRUST_TYPES = [
  'SOCE', 'MORB', 'LIPS', 'COMA', 'EXCT', 'SHLD', 'ORON', 'PLAT', 'BASN', 'IARC', 'COAR',
] as const

export type CrustType = (typeof CRUST_TYPES)[number]

export const CRUST_TYPE_LABELS: Record<CrustType, string> = {
  SOCE: 'Normal ocean',
  MORB: 'Mid-ocean ridge',
  LIPS: 'Oceanic plateau',
  COMA: 'Continental margin',
  EXCT: 'Extended crust',
  SHLD: 'Shield',
  ORON: 'Orogen',
  PLAT: 'Platform',
  BASN: 'Basin',
  IARC: 'Island arc',
  COAR: 'Continental arc',
}

/**
 * One colour per ECM1 class, sRGB.
 *
 * A class is an identity, not a quantity, so these are eleven separate hues
 * rather than a ramp -- and they are grouped so the eye can read the map
 * without the legend: the sea floor blue and teal, stable continent cream to
 * olive, and everything hot, thinned or actively deforming in reds and
 * purples. The shader and the panel's legend both read this, because two lists
 * of eleven colours would drift the first time one changed.
 */
export const CRUST_TYPE_COLOURS: Record<CrustType, string> = {
  SOCE: '#1f4e79',
  MORB: '#45c4d8',
  LIPS: '#2e8b78',
  SHLD: '#f0e7d3',
  PLAT: '#d6b684',
  BASN: '#8f9a5b',
  ORON: '#bf3b2b',
  COAR: '#8c5324',
  IARC: '#ec8b3c',
  EXCT: '#c96bb2',
  COMA: '#9a86c4',
}

/**
 * How strongly each kind of crust resists being deformed, on a scale where a
 * shield is 1.
 *
 * These are judgements about lithospheric strength rather than measurements,
 * and one of them was measured in the end and found wrong; see SOCE below.
 * The ordering is the part that matters and most of it is not controversial:
 * cold Archean shields and platforms are the strongest crust on the planet,
 * and the weak crust is everything hot, thinned or actively deforming --
 * ridges, island arcs, stretched crust, passive margins, and orogens.
 *
 * Orogens sitting near the bottom despite being the thickest crust of all is
 * the whole point of using types instead of thickness.
 *
 * How much the rest of this table is worth is now a measured question rather
 * than an assumed one, and the answer is uncomfortable. `FLAT_K` in
 * tools/solve.ts gives every triangle the same strength, leaving the islands
 * of strong crust as they are; at 40 Ma that moves the held-out conjugate
 * pairs from 222 km to 224. Eleven values reasoned about at length do as much
 * as one arbitrary one. What earns its place is that *some* crust is
 * deformable -- making everything rigid costs 12 km -- and, on this evidence,
 * which crust it is barely matters once the sea floor is right.
 */
export const CRUST_RIGIDITY: Record<CrustType, number> = {
  SHLD: 1.0,
  PLAT: 0.9,
  BASN: 0.7,
  // Seven kilometres of basalt, and it had been sitting between a stable basin
  // and a platform at 0.60 -- a tenth away from the 0.70 that would have made
  // the whole quiet Pacific a rigid island. It is the one number in this table
  // that was measured rather than reasoned about, and it was wrong. Every
  // closure in this model has to be absorbed by sea floor, and this was the
  // crust refusing to absorb it: at 40 Ma, taking it to 0.10 moves the held-out
  // conjugate pairs from 222 km to 183 and the share inside one triangle from
  // 44% to 54%, and takes bare sky from 3.57% to 2.75%, while the cratons stay
  // exactly as rigid as they were. 0.05 and 0.20 give the same answer to within
  // five kilometres, so this is a magnitude and not a tuning.
  SOCE: 0.1,
  LIPS: 0.45,
  COAR: 0.3,
  COMA: 0.25,
  ORON: 0.2,
  EXCT: 0.18,
  IARC: 0.1,
  MORB: 0.05,
}

/** Crust this strong is treated as an unbendable core by the solver. */
export const CRATON_RIGIDITY = 0.85

/** Crust this weak is where the shell is allowed to crack. */
export const WEAK_RIGIDITY = 0.35

/**
 * Continental crust that has not been thinned.
 *
 * These form the units that move as continents. Strength and identity are not
 * the same question: Africa is one landmass but three separate shields, welded
 * by younger orogenic belts. Seeding the units on shields alone tears it into
 * pieces that then drift independently, which is how a first attempt at using
 * this dataset made the reconstruction much worse. Orogens and basins are weak,
 * but they still hold a continent together; a thinned margin, an island arc or
 * stretched crust does not, which is why Panama, the Bering shelf, the Sinai
 * and the Indonesian arcs are left out and stay free to give way.
 */
export const CORE_TYPES: CrustType[] = ['SHLD', 'PLAT', 'BASN']

/** Types that are mountain belts today, used to test the predicted stacking. */
export const OROGEN_TYPES: CrustType[] = ['ORON', 'COAR']
