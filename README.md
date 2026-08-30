# Expanding Earth

An interactive reconstruction of the Expanding Earth hypothesis, driven by the
sea-floor age grid rather than by hand-placed continents. Drag the timeline back
and the planet shrinks while the continents close up; press play and it grows
again with the oceans opening out of their ridges.

```bash
npm install
npm run dev      # generates the reconstruction on first run, then serves it
```

The first `npm run dev` spends about three minutes building the data from
`public/textures/age-map.png`, then caches it. `npm run data` rebuilds it.

## What it does

Everything rests on a single assumption: **no crust is ever destroyed**. The
Earth at time *t* is exactly the crust that already existed then. That makes the
planet's past size a measurement rather than a parameter:

```
A(t) = area of all crust already present at t      (from the age grid)
R(t) = sqrt( A(t) / 4pi )
```

which gives R(200 Ma) = 4006 km, 63% of today.

Nothing tells the model what a plate is. Take away the crust younger than *t*
and the shell falls apart on its own along the mid-ocean ridges; sharp steps in
the age field cut it further along fracture zones. The blocks that move as units
are simply whatever stays connected, so the plate boundaries come out of the
magnetic anomaly pattern.

Five surface maps are selectable, all of which ride along with the crust. The
last of them paints the sea-floor age grid the model is built from, which makes
a useful check: the coloured bands are the data, and the black gaps are where
the reconstruction says no crust existed yet.

The reconstruction is then integrated backwards a million years at a time.
Surviving crust keeps its present-day size because rock does not stretch;
vanished crust pulls its two margins together but can never push them apart. See
[MODEL.md](MODEL.md) for the method and for what to distrust in it.

## Layout

```
tools/build-data.ts   age grid -> triangulated shell + radius curve
tools/solve.ts        backward integration -> keyframes + diagnostics
shared/model.ts       the assumptions, shared by pipeline and app
src/                  React + three.js viewer
legacy/               the earlier hand-keyframed prototype, kept for reference
```

Generated data lands in `public/data/` and is not committed: it is reproducible
from the textures in this repository.

## Scripts

| | |
|---|---|
| `npm run dev` | generate data if stale, then serve |
| `npm run data` | rebuild the reconstruction |
| `npm run build` | production build |
| `npm run artifact` | build a single self-contained HTML file |
| `npm run test` | unit tests |
| `npm run typecheck` | app and pipeline |

## A necessary disclaimer

Expanding Earth is not accepted geology. Geodesy limits any change in the
Earth's radius to well under a millimetre per year, and no mechanism supplies
the required mass or energy. This is a model of the idea, built so that its
failures are visible and measurable, not an argument that it is true.
