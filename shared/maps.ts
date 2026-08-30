/**
 * Surface maps the globe can wear. Each one rides along with the crust, so
 * whichever is chosen ends up wherever the reconstruction moves the rock.
 *
 * The pipeline reads `public/textures/age-map.png` for the science; these are
 * only what gets painted on top. The list is shared with tools/build-artifact.ts
 * so the standalone build knows which files to carry.
 */
export interface SurfaceMap {
  id: string
  label: string
  file: string
  note: string
}

export const SURFACE_MAPS: SurfaceMap[] = [
  {
    id: 'blue-marble',
    label: 'Blue Marble',
    file: 'textures/blue-marble-map.jpg',
    note: 'Satellite imagery',
  },
  {
    id: 'natural',
    label: 'Natural colour',
    file: 'textures/color-map.jpg',
    note: 'Flatter colours, easier to read shapes against',
  },
  {
    id: 'relief',
    label: 'Relief',
    file: 'textures/earth-relief-map.jpg',
    note: 'Shaded relief, land and sea floor together',
  },
  {
    id: 'elevation',
    label: 'Elevation',
    file: 'textures/height-map.jpg',
    note: 'Height as brightness, no colour to distract',
  },
  {
    id: 'age-source',
    label: 'Age data',
    file: 'textures/crustal-age-map.jpg',
    note: 'The sea-floor age grid this model is built from, riding on the crust',
  },
]

export const DEFAULT_SURFACE_MAP = SURFACE_MAPS[0].id
