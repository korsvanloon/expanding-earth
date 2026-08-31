# Expanding Earth

An interactive reconstruction of the Expanding Earth hypothesis, driven by the
sea-floor age grid rather than by hand-placed continents. Drag the timeline back
and the planet shrinks while the continents close up; press play and it grows
again with the oceans opening out of their ridges.

```bash
pnpm install
pnpm dev         # generates the reconstruction on first run, then serves it
```

The first `pnpm dev` spends two to four minutes building the data from
`public/textures/age-map.png`, then caches it. `pnpm data` rebuilds it, and
notices when any file under `tools/` or `shared/` has changed. The spread in
that figure is the machine, not the run: the same two hundred steps measured
155 s and 213 s on two containers of the same shape on the same day, so treat
any timing here as an order of magnitude.

While tweaking the solver, `SUBDIV=5 pnpm data` does the whole two hundred
million years in forty seconds on a quarter of the triangles. It is a different
model rather than a cheaper view of the same one — its fits are its own, so use
it to see which way a parameter moves things and not for a number worth
quoting.

## What this is, in the words the field uses

A **model**, not a simulation and not an algorithm — those are parts of it.
Precisely: a *kinematic reconstruction* of the crust, solved as an *inverse
problem*.

- **Reconstruction**, because the output is where the crust was, frame by frame.
- **Kinematic**, because nothing here is a force. There is no mantle, no
  viscosity, no driving stress. Motion follows from geometry: crust that did not
  exist yet is taken out, the rest is carried along the spreading field, and the
  sphere it sits on is the size its own area budget says.
- **Inverse**, because it runs from the observation to the cause. The usual
  method is the other way round: a plate map and a hierarchy of Euler rotation
  poles, fitted by hand, played forwards. Here the age grid is the input and the
  plates are an *output* — read back out of the answer.
- Geologists would call the operation **retrodeformation**: undoing deformation
  to recover an earlier state. This is a whole-shell one.
- The **algorithm** inside it is a position-based constraint relaxation
  (Gauss–Seidel) on a triangulation that changes its own topology as crust
  disappears. That is the solver, one component of the model.

"Simulation" is the word to avoid. Nothing evolves forward under its own physics
here; a geometric problem is solved at each step. And nothing is fitted to a
hand-assembled reconstruction — the fits in the scorecard are scored against
independent evidence, never used as a target.

## What it does

Everything rests on a single assumption: **no crust is ever destroyed**. The
Earth at time *t* is exactly the crust that already existed then. That makes the
planet's past size a measurement rather than a parameter:

```
A(t) = area of all crust already present at t      (from the age grid)
R(t) = sqrt( A(t) / 4pi )
```

which gives

<!-- from-the-run: radius -->
R(200 Ma) = 3905 km, 61.3% of today.
<!-- /from-the-run -->

Nothing tells the model what a plate is. Take away the crust younger than *t*
and the shell closes on its own along the mid-ocean ridges, and where two
pieces have to slide past each other the triangulation is redrawn — but only in
crust weak enough to fault. The blocks that move as units are read back out of
the resulting motion rather than assumed, so the plate boundaries come out of
the magnetic anomaly pattern.

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

The package manager is pnpm, pinned in `package.json` so corepack picks up the
right version. `pnpm-workspace.yaml` approves esbuild's install script, which
pnpm blocks by default and vite needs to build.

## Scripts

| | |
|---|---|
| `pnpm dev` | generate data if stale, then serve |
| `pnpm data` | rebuild the reconstruction and the figures in these docs (~3 min) |
| `SUBDIV=5 pnpm data` | coarse draft for tweaking (~40 s) |
| `pnpm build` | production build |
| `pnpm artifact` | build a single self-contained HTML file |
| `pnpm docs` | rewrite the generated figures from the run on disk |
| `pnpm test` | unit tests, and whether the docs match the run |
| `pnpm typecheck` | app and pipeline |

## A necessary disclaimer

Expanding Earth is not accepted geology. Geodesy limits any change in the
Earth's radius to well under a millimetre per year, and no mechanism supplies
the required mass or energy. This is a model of the idea, built so that its
failures are visible and measurable, not an argument that it is true.
