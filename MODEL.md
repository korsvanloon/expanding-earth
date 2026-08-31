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
that hole does to the answer is what matters:

<!-- from-the-run: bounds -->
Counting it as continent gives R(200 Ma) = 4042 km, counting it as ocean gives 3905 km &mdash; the entire ambiguity is worth 3.5% of the radius.
<!-- /from-the-run -->

Three classification variants are carried through the pipeline and shown as the
band on the radius chart. Only one of them is ever solved, so how much the fits,
the folding and the strain depend on that choice is not known &mdash; see Known
weaknesses.

The grey ramp is calibrated on one identifiable landmark: the oldest value, 254,
sits at 34 degrees N, 21 degrees E in the Herodotus Basin of the eastern
Mediterranean, which is the oldest oceanic crust on Earth at about 280 Ma. If
that reading is wrong, every date in the model scales with it.

As an independent check, the radius curve derived from the 81,920-triangle mesh
agrees with the same measurement taken at full raster resolution to within 1.1%.

## Where the plates come from

Nowhere. No plate map is used and none is needed.

Remove the crust younger than *t* and the shell closes by itself: the mid-ocean
ridges are where the youngest crust is, so they are the first thing to go, and
their edges are collapsed out of the mesh rather than stretched. Where two
pieces then have to slide past one another the triangulation is redrawn, and
that is allowed only in crust weak enough to fault — sea floor and thinned
margins redraw, a shield has to carry the deformation instead. The blocks that
move as units are read back out of the resulting motion: points whose velocity
one rotation explains to within a few km/Myr.

<!-- from-the-run: blocks -->
The run finds 125 blocks at its most divided and 2 at 200 Ma.
<!-- /from-the-run -->

### Why it ends with one block, and why that is not welding

A block count near one at the end of the run looked like the failure mode this
solver was built to avoid: one rigid sheet, which cannot change curvature
without absurd strain. It is not that. It is the record running out.

The only thing that makes this model move is crust leaving it, and the sea floor
does not go back far enough to keep that up:

<!-- from-the-run: reach -->
Over the last 20 Myr of the run the age grid takes away 0.03% of the globe in total &mdash; 0.002% per Myr, against a peak of 0.66%. The median surface speed falls from a peak of 16 km/Myr to 2.5, the block count from as many as 125 to 2, and the biggest block grows to 96% of the shell.
<!-- /from-the-run -->

So the last stretch of the run is the solver settling, not history. Nothing is being taken away, nothing is being driven, and the block
finder — which grows a region over every point one rotation explains to within
a few km/Myr — cannot tell a rigid shell from a still one. Below that tolerance
everything joins a single block turning at almost nothing. The finder is not
wrong; it has nothing to see.

The fits say the same: between 180 and 200 Ma no scored pair moves by more than
three kilometres. **The model reaches 180 Ma.** Frames past it are kept because
they cost nothing and because the flatline is worth looking at, but no figure
should be quoted from them, and the one fit whose target date lies past the
edge — North America against Africa at 190 Ma — is being asked a question the
data cannot answer.

### What the block count says where it can see

| what it could be | what would show |
|---|---|
| a welded shell | few blocks, the biggest covering most of the crust |
| a shattered shell | many blocks, none of them large |
| plates | a dozen-odd blocks, the biggest a fifth of the surface |

<!-- from-the-run: motion -->
| time | crust removed | median speed | blocks | biggest block | island shape |
|---|---|---|---|---|---|
| 5 Ma | 0.620%/Myr | 5.1 km/Myr | 76 | 26% | 0.3% |
| 30 Ma | 0.644%/Myr | 13.6 km/Myr | 125 | 3% | 0.7% |
| 60 Ma | 0.448%/Myr | 13.0 km/Myr | 103 | 4% | 1.0% |
| 120 Ma | 0.256%/Myr | 12.7 km/Myr | 57 | 6% | 2.1% |
| 200 Ma | 0.000%/Myr | 2.5 km/Myr | 2 | 96% | 2.9% |
<!-- /from-the-run -->

The middle of the run is the second row. The crust moves as scores of patches of
a few percent each, where the Earth has about fifteen plates and the Pacific
alone is a fifth of the surface. The deformation is spread evenly through every
piece of crust weak enough to take it instead of concentrating into belts, so no
piece large enough to be a plate turns out to be moving as one. That is the open
problem in this reconstruction, and it is the reason a margin can come to rest
against its conjugate with only a fifth of its length in contact.

The islands hold, which is the one part of this that works as intended: the
shields and platforms keep their own shape to a few percent for the whole run,
measured as the change in distance between pairs of their own points rather than
as area strain. Area strain cannot answer this question at all — shear preserves
area exactly, and a per-face figure is blind to a shield bent in half — which is
why `cratonStrain` reported 0.7% while a continent-sized box lost a third of its
shape.

An earlier version cut the shell wherever the age field stepped by more than
20 Ma, treating fracture zones and transform faults as faults the crust could
slide along, with continental crust left out of the test so that a passive
margin like the Brazilian coast — undated continent against 120 Ma ocean — was
not mistaken for a plate boundary. That rule is gone; the strength test on
redrawn edges does the same work without needing a threshold in Ma.

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

Four numbers per frame, none of them tuned:

- **bare sphere** — how much of the sphere no surviving crust covers. It should
  be zero; whatever is left is surface the reconstruction has failed to
  account for. This document described it backwards for a long time, as sphere
  *occupied* by crust that did not exist yet, and it is also the one figure
  here that is not currently trustworthy — see Known weaknesses.
- **covered twice** — how much of the sphere lies under more than one triangle
  at once, which a merely crumpled shell does as readily as a folded one.
- **inside out** — the share of the rock whose outward face points at the core.
  Reported apart from the overlap because edge-length springs cannot see it: a
  triangle and its mirror image measure the same.
- **strain** — how much the model has to deform the crust, from the area change
  of each triangle against its present-day area, split by how strong that crust
  is.

<!-- from-the-run: reports -->
| time | radius | bare sphere | covered twice | inside out | craton strain | weak strain |
|---|---|---|---|---|---|---|
| 5 Ma | 6272 km | 0.00% | 0.00% | 0.00% | 0.06% | 1.2% |
| 30 Ma | 5728 km | 0.00% | 0.00% | 0.00% | 0.21% | 5.2% |
| 60 Ma | 5197 km | 0.00% | 0.00% | 0.02% | 0.29% | 7.4% |
| 120 Ma | 4373 km | 0.00% | 0.03% | 0.14% | 0.50% | 9.6% |
| 200 Ma | 3905 km | 0.00% | 0.46% | 0.42% | 0.70% | 17.1% |
<!-- /from-the-run -->

Splitting strain by strength is the point. Thick cratons now stay within a
couple of percent of rigid all the way back, and the deformation the model
cannot avoid has moved into thin necks, shelves and island arcs, which is where
it belongs. Whether that much is tolerable there is a separate question, and
the answer is probably not everywhere.

### Whether it lands where it should

<!-- from-the-run: fits -->
| pair | joined by | margin in contact today | then | gain | apart then | closest anywhere |
|---|---|---|---|---|---|---|
| South America &ndash; Africa | 180 Ma | 0% | 21% | +21 | 0 km | 0 km at 120 Ma |
| Australia &ndash; Antarctica | 100 Ma | 0% | 16% | +16 | 71 km | 21 km at 165 Ma |
| India &ndash; Africa | 120 Ma | 0% | 9% | +9 | 96 km | 79 km at 105 Ma |
| Greenland &ndash; North America | 60 Ma | 38% | 36% | -2 | 0 km | 0 km at 10 Ma |
| North America &ndash; Africa | 190 Ma | 0% | 9% | +9 | 96 km | 94 km at 180 Ma |
| Antarctica &ndash; South America | watched | 0% | 17% | +17 | 0 km | 0 km at 120 Ma |
| Australia &ndash; North America | watched | 0% | 0% | +0 | 2689 km | 2689 km at 200 Ma |
<!-- /from-the-run -->

Only fits with independent support are scored, and only ones plate tectonics and
Expanding Earth agree on. Reconstructions puzzled together by hand are
deliberately excluded: whether Australia or Antarctica ends up against the west
coast of South America is something the model should be allowed to answer.

A fit is a length of coastline in contact, not a distance, and this table used
to report only the distance. A closest approach of zero says the two touched
somewhere; it says nothing about whether the margins nest. South America against
Africa is exactly that case — 0 km apart with a fifth of the shorter margin
against the other, and visibly wrong on the globe. Contact is counted where two
margins come within 200 km, about two triangles of this mesh, below which the
resolution cannot tell touching from adjacent.

Two things in that table matter more than the levels.

**Nothing here can reach 100%.** The west coast of South America can never lie
against Africa, so only the part of a margin that faces the other continent is
ever available. Read the gain, not the level.

**One of the five scored fits proves nothing.** Greenland and North America are
already in contact along 38% of Greenland's margin today and the run ends at
36%, so no reconstruction can fail it. It has been carried as a success for a
long time on the strength of a 0 km closest approach that was already 0 km
before the solver started. There are four independent checks, not five.

The distances are also less certain than a figure in kilometres suggests. Two
runs of the same model that differ only in the last bit of a floating-point
length -- one using `Math.hypot`, one using the square root of the sum of
squares -- disagree by up to 300 km after 200 Myr, because the solver decides
discrete things along the way and a last-bit difference can tip one of them.
These are three-digit numbers at best.

## The other reading of the same number

Hold the radius at today's value and the same crust budget cannot cover the
sphere.

<!-- from-the-run: shortfall -->
At 200 Ma it falls short by 62%.
<!-- /from-the-run -->

On a non-expanding Earth that shortfall
is not a gap — it is the area subduction has to have destroyed. The same
measurement is the case for expansion or the measure of subduction, depending on
which you already believe. The model does not settle that, and does not pretend
to.

## Cutting the shell into fragments, and why it is gone

An earlier pipeline cut the shell along its weak crust and held each fragment
rigid, so pieces slid and rode over one another instead of deforming — an orange
peel put back on a smaller orange cracks, it does not stretch. Weak crust alone
left only ten fragments, and a rigid piece thousands of kilometres across cannot
lie on a sphere of different curvature, so oversized fragments were cut down
further. Sweeping the target size gave the finding worth keeping:

| target size | fragments | uncovered | folded | strain | S America – Africa at 180 Ma |
|---|---|---|---|---|---|
| weak crust only | 10 | 25.3% | 2.2% | 1.6% | 5126 km |
| 2500 km | 30 | 20.9% | 1.1% | 0.8% | 2298 km |
| 1800 km | 56 | 17.5% | 1.0% | 0.5% | 3434 km |
| 1200 km | 119 | 14.9% | 3.3% | 0.2% | **1117 km** |
| 800 km | 257 | 11.3% | 0.9% | 0.1% | 5858 km |
| 500 km | 654 | 7.1% | 0.7% | 0.0% | 5741 km |

Closure and strain both keep improving as the pieces get smaller, and both are
misleading at the bottom: a mosaic of 500 km tiles can take any shape at all, so
its near-zero strain says nothing about whether continents are rigid. The fits
to known geology are the honest guide, and they do not improve monotonically —
they are best in the middle. That is the lesson: a diagnostic that improves
without limit as you add freedom is not measuring what you think it is.

The mechanism itself has been replaced. This solver collapses dead crust out of
the mesh rather than pre-cutting the shell, and it threw an error on any cut
mesh handed to it, so the cutting had been unreachable for some time; the code
and its knobs have been deleted rather than left to describe a path that could
not run. **The table above belongs to that older pipeline and is not comparable
with the figures in this document.**

## Known weaknesses

- **The crust tiles, and this is now evidence rather than an artefact.** An
  earlier solver left roughly 15% of the sphere uncovered, spread between
  fragments, so the reconstruction read as a cracked eggshell rather than
  continents on an ocean. That is fixed, but the figure could not be trusted
  either, because every probe direction was a vertex of the mesh — the one place
  the test cannot fail. With a hundred thousand generic directions and a
  measure that demonstrably sees a single missing triangle in five thousand, the
  bare figure is 0.0000% at every frame, and the present-day overlap has gone
  from 1.836% to exactly zero, which is what an untouched icosphere must read.
  Collapsing dead crust out of the mesh instead of crumpling it into a corner
  does what it was meant to do.

- **Only one of the three classifications is ever solved.** The 2.8% of the
  globe the age grid leaves undated is handled three ways, and all three radius
  curves are computed and drawn as the band on the chart — but the
  reconstruction is only ever run on one of them, `nearest-age`, and there is no
  switch to run the others. So the ambiguity has been quantified through the
  radius and nowhere else: whether the fits, the folding or the strain would
  survive treating that deep water as continent instead is simply unknown. A run
  now takes minutes, so this is affordable to answer and has not been.

- **The scorecard has one fewer check than it appears to.** Greenland against
  North America is in contact along 38% of Greenland's margin today and 36% at
  60 Ma, so it cannot be failed and never could be. Four of the five scored
  fits are real tests. The measure itself is now a length of margin in contact
  rather than a closest approach, which is what exposed this.

- **The conjugate-margin pairing is gone, and with it a known pathology.**
  Letting the fronts run without limit closed better and did Gondwana well, yet
  sent North America and Eurasia to opposite sides of the planet, because at
  200 Ma the fronts crossed the whole Pacific at once and the line where they
  met was an artefact of the shape of the hole rather than a ridge. Limiting
  their reach to about 660 km removed that at the cost of closure, and neither
  setting was right. The mechanism has since been replaced by collapsing dead
  crust out of the mesh outright. Whether the northern hemisphere assembles any
  better for it has not been re-measured.
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
