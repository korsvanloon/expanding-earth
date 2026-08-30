# The model

## One assumption

No crust is ever destroyed. Everything below follows from it.

The sea-floor age grid dates every piece of ocean floor. If crust is never
destroyed, then the Earth at time *t* consists of exactly the crust that already
existed at *t*, and its surface area is not a free parameter:

```
A(t) = sum over crust with age >= t of its present-day area
R(t) = sqrt( A(t) / 4pi )
```

This is the whole reason the project is tractable on imperfect data. **R depends
on the square root of an area integral.** Per-pixel noise in the age grid
averages out completely, and even a 10% error in the area budget moves the
radius by only 5%. No individual pixel has to be right.

## What the data actually says

`public/textures/age-map.png` is the sea-floor age grid at 8192x4096: grey 0 at
the ridges rising with age, white where the grid does not date the crust.
Cross-tabulating it against the bathymetry in `height-map.jpg` gives:

| | share of the globe |
|---|---|
| dated, deep water — consistent | 56.1% |
| undated, land or shelf — consistent | 38.7% |
| **undated, deep water — missing data** | **2.8%** |
| dated, above sea level — mask bleed | 0.2% |

So 94.8% of the map is internally consistent and the real hole is 2.8%. What
that hole does to the answer is what matters: counting it as continent gives
R(200 Ma) = 4135 km, counting it as ocean gives 4001 km. **The entire ambiguity
is worth about 3% of the radius.** Three classification variants are carried
through the pipeline and shown as the band on the radius chart.

The grey ramp is calibrated on one identifiable landmark: the oldest value, 254,
sits at 34 degrees N, 21 degrees E in the Herodotus Basin of the eastern
Mediterranean, which is the oldest oceanic crust on Earth at about 280 Ma. If
that reading is wrong, every date in the model scales with it.

As an independent check, the radius curve derived from the 81,920-triangle mesh
agrees with the same measurement taken at full raster resolution to within 1.1%.

## Where the plates come from

Nowhere. No plate map is used and none is needed.

Remove the crust younger than *t* and the shell disconnects by itself: the
mid-ocean ridges are where the youngest crust is, so they are the first thing to
go. Fracture zones and transform faults appear in the age grid as sharp steps —
sea floor of very different ages lying side by side — and edges across a step of
more than 20 Ma are treated as faults the crust may slide along. The blocks that
move as units are the connected components that remain. There are about 90 of
them through most of the run.

Continental crust is deliberately left out of the step test. A passive margin
such as the Brazilian coast puts undated continent against 120 Ma ocean, an
enormous apparent step that is not a plate boundary at all — the two ride
together, and cutting there would be wrong.

## The integration

One million years per step, backwards from today, which is the only moment we
know. Each step:

1. shrink the shell to R(t);
2. let every surviving block reclaim its geodesic size by dilating about its own
   centroid — rigid crust on a smaller sphere subtends a proportionally larger
   angle, and stating that in closed form is what makes the thing converge;
3. relax, with surviving crust holding its present-day size;
4. remove the net rotation of the whole shell, the same no-net-rotation
   convention plate tectonics uses.

Two choices in step 3 took several rewrites to get right, and both are load
bearing:

**Vanished crust pulls but never pushes.** The pull is what actually moves the
continents: an ocean that has not opened yet draws its two margins together
across however many cells of vanished sea floor lie between them. Nothing local
can close an Atlantic, whose margins at 60 Ma are a thousand cells apart. But
letting that crust push as well welds the blocks either side into a single rigid
sheet, and a sheet that large cannot change its curvature without absurd strain.
An earlier version did exactly this and reported 20% strain everywhere.

**The sphere constraint is soft.** A piece of the present-day sphere cannot lie
on a smaller sphere isometrically, because their Gaussian curvatures differ.
Pinning every vertex exactly onto R(t) leaves the crust no way to absorb that
mismatch except by straining in-plane. Letting it ride slightly off the sphere
lets rigid blocks meet at an angle instead, the way the gores of a globe do.

## What it reports about itself

Three numbers per frame, none of them tuned:

- **unaccounted for** — how much of the sphere is still occupied by crust that
  did not exist yet. It should be zero; whatever is left is surface the
  reconstruction has failed to explain.
- **folded through itself** — the area of triangles whose winding has flipped,
  meaning crust has been driven through crust.
- **strain** — how much the model has to deform the crust, from the area change
  of each triangle against its present-day area.

| time | radius | unaccounted | folded | median strain |
|---|---|---|---|---|
| 5 Ma | 6285 km | 2.4% | 0.0% | 1.1% |
| 30 Ma | 5770 km | 7.0% | 1.1% | 3.4% |
| 60 Ma | 5257 km | 8.9% | 4.6% | 3.1% |
| 120 Ma | 4460 km | 13.3% | 7.4% | 4.9% |
| 200 Ma | 4006 km | 14.1% | 9.8% | 6.4% |

The reconstruction closes well for the last 30 million years and degrades
steadily going back. That is the result, and it is reported rather than tuned
away.

## The other reading of the same number

Hold the radius at today's value and the same crust budget cannot cover the
sphere: at 200 Ma it falls short by 60%. On a non-expanding Earth that shortfall
is not a gap — it is the area subduction has to have destroyed. The same
measurement is the case for expansion or the measure of subduction, depending on
which you already believe. The model does not settle that, and does not pretend
to.

## Known weaknesses

- **Strain is dominated by the solver, not the geology.** The strain view shows
  a cellular pattern a few cells across that is an artefact of the relaxation
  finding a locally uneven solution. Moving from edge-length to area-based
  strain removed a much worse per-vertex checkerboard, but the remaining
  structure is still numerical. The reported medians should be read as an upper
  bound.
- **Blocks are not exactly rigid.** They are held together by stiff springs
  rather than being solved as rigid bodies, so they deform a little under the
  pull of their neighbours. Projecting each block onto its best-fit rotation was
  tried and made things worse, because vertices on a fault belong to two blocks
  at once and a single-owner assignment tears the mesh. Doing it properly needs
  a partition of unity across blocks.
- **Trenches are not cut.** Only ridges and age steps split the shell, so the
  Pacific stays attached to Asia. Within the theory being modelled this is
  correct — there is no subduction — but it does mean the blocks are larger, and
  therefore more strained, than a plate-tectonic reconstruction would make them.
- **Nothing before 200 Ma.** There is no ocean floor left to measure, so the
  method simply stops. No part of this is extrapolated past that.

## And the big one

Expanding Earth is not accepted geology. Space geodesy (VLBI, SLR, GNSS) limits
any change in the Earth's mean radius to a fraction of a millimetre per year,
and no mechanism supplies the mass or the energy the hypothesis needs. The point
of building it this way is that the model is made to expose its own failures
instead of hiding them.
