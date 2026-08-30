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
 * How strongly each kind of crust resists being deformed, on a scale where a
 * shield is 1.
 *
 * These are judgements about lithospheric strength rather than measurements.
 * The ordering is the part that matters and it is not controversial: cold
 * Archean shields and platforms are the strongest crust on the planet; oceanic
 * lithosphere is thin but cold, so it is stiff for its thickness; and the weak
 * crust is everything hot, thinned or actively deforming -- ridges, island
 * arcs, stretched crust, passive margins, and orogens.
 *
 * Orogens sitting near the bottom despite being the thickest crust of all is
 * the whole point of using types instead of thickness.
 */
export const CRUST_RIGIDITY: Record<CrustType, number> = {
  SHLD: 1.0,
  PLAT: 0.9,
  BASN: 0.7,
  SOCE: 0.6,
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
