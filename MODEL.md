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

## What the crust is made of

Two datasets say what the shell is, as against where it is.

ECM1 gives a crustal type and a thickness for every square degree, and the model
reads strength off the type: shields and platforms are the strongest crust there
is, orogens and thinned margins the weakest. That is the field the solver holds
the continents together with. Its limit is its resolution &mdash; one name per
square degree, out of eleven &mdash; so it calls the whole Canadian Shield one
thing and cannot see the suture through the middle of it.

The vertical gravity gradient can. It is the second derivative of the geoid,
derived from satellite altimetry, and it responds to density contrasts a few
kilometres down: a fracture zone, a failed rift, a buried suture and a mountain
root all show up in it. `data-src/vgg.grid` holds it at a tenth of a degree,
covering 98.5% of the globe by area &mdash; everything but the ice caps above
about 81 degrees, where the altimetry stops. Over land as much as over sea,
which is the point: this is the one structure map the model has that does not
run out at the coastline.

What the model reads off it is not the field but how fast it changes, in Eotvos
per 100 km, over a disc the width of half a mesh spacing around every vertex.
Flat means crust that has been left alone; busy means crust that has been worked.
Against ECM1's own classification of the same ground:

<!-- from-the-run: fabric -->
| crustal type | roughness | within the type |
|---|---|---|
| Platform | 37 | 7 &ndash; 92 |
| Basin | 45 | 19 &ndash; 139 |
| Normal ocean | 53 | 18 &ndash; 145 |
| Shield | 60 | 28 &ndash; 156 |
| Extended crust | 60 | 7 &ndash; 224 |
| Mid-ocean ridge | 62 | 22 &ndash; 154 |
| Oceanic plateau | 78 | 23 &ndash; 201 |
| Continental margin | 82 | 36 &ndash; 200 |
| Island arc | 181 | 91 &ndash; 318 |
| Orogen | 196 | 61 &ndash; 542 |
| Continental arc | 307 | 142 &ndash; 627 |
<!-- /from-the-run -->

The medians separate by a factor of eight from a platform to a continental arc,
in the order they should, which is the check that the grid is saying something
real. The spread inside each type is the part that matters: an orogen runs from
quiet to violent across its own extent, and no classification with eleven names
in it can say which end of that range a given triangle is at.

The table is read at the mesh's vertices, and the mesh is the coarser
instrument by far: a hundred and twelve kilometres between points against
eleven to the grid cell. Measured against the raw field, the vertices keep 54%
of its variation. Subdividing the shell once more &mdash; four times the points,
four times the length of every run, and the triangulation's corner indices
widened past sixteen bits &mdash; would take that to 64%. Ten points for four
times the cost is not a resolution problem worth solving that way.

So the picture is not read through the vertices at all. `public/data/fabric.jpg`
is the roughness at the grid's own eleven kilometres, painted on the crust like
any other surface map, sampled by the crust's own direction so that it deforms
with the reconstruction and keeps every cell. The per-vertex numbers stay for
what needs a number at a point: the table above, and what a right-click reports.

The roughness itself is a measurement in the viewer &mdash; the *Crustal fabric*
mode &mdash; and nothing else. Using it to decide where deformation is allowed
to go is the obvious next thing to try, and it is not tried here, because a
strength field is a claim about the present strength of rock and this is a
record of what has already happened to it. A shield reads rougher than a
platform, and a shield is stronger.

### Which way the lineaments run, and what that is worth

The same grid answers a second question, and this one is used. A structure
tensor &mdash; the gradient's outer product, averaged over a window &mdash;
returns not how much the field varies but along what line, because gradients on
the two flanks of a trough cancel while their outer products add. That gives
every point an axis and a coherence, and the tracer mixes the axis into the age
gradient at every step, weighted by coherence.

Two things had to be right before it was worth anything, and neither was
obvious.

The abyssal hills had to go. Sea floor is corrugated at a few tens of
kilometres, and those corrugations run *along* the isochrons, square across the
direction the crust travelled. They are also the most coherent thing in the
grid, so widening the tensor's window does not dilute them &mdash; every hill
points the way the next one does and their outer products add. They come out
only by low-passing the field before differentiating it, which is a different
operation from averaging the tensor afterwards. Doing it moved the median angle
between the lineaments and the traced paths from 39 degrees to 28, where 45 is
what a coin would give.

And the bearing had to be a bearing. The eigenvector's angle is measured from
east; what is stored is measured from north. Read as-is the axis came out square
to the truth, and a lineament field that is ninety degrees wrong is
indistinguishable on real data from one that has nothing to say: it measured 47
degrees against the paths, which is a coin. Only a stripe whose direction is
known by construction shows it, which is why there is now a test made of stripes.

A third thing was wrong and only showed against a picked point. The pull was
scaled by coherence, which sounds careful and is self-defeating: a path that
drifts off a fracture zone lands on featureless abyssal plain, where coherence
is low by definition, so exactly when the correction is most needed there is
almost none of it. On the flank east of the Mid-Atlantic Ridge at 24 degrees
north the gravity axis holds at 87 to 97 degrees over the whole stretch while
the traced path wanders between 73 and 117 &mdash; and over the worst of that
wandering the coherence is 0.24, which under a proportional rule bought a tenth
of the correction it needed. The weight ramps from a floor instead.

Two measures say what it is worth and they do not agree, which is the honest
part. The first is geometric and is what a reader sees: the median angle between
the traced path and the gravity axis beneath it, taken only where there is a
line to follow at all. It falls from 25 degrees to 18. The second is the
conjugate score, which is the model's:

| | 20 Ma | 40 Ma | 60 Ma | 90 Ma | 120 Ma |
|---|---|---|---|---|---|
| age grid alone | 173 km | 246 km | 374 km | 558 km | 1073 km |
| with the lineaments | 176 km | 228 km | 320 km | 507 km | 998 km |

Better at 40, 60, 90 and 120; a hair worse at 20. Turning the weight up to 0.7
gets the geometric measure to 14 degrees and the residual to 437 km at 90 Ma and
900 at 120, better still &mdash; and moves the median track end 497 km, with a
ninety-fifth percentile of 12,815. That is not a refinement, it is a different
set of paths, and no aggregate can tell which of them are right. At 0.4 the
median end moves 36 km and the ninety-fifth 538.

The two measures answer different questions and the difference matters. The
score asks whether the model can bring a pair back together; the angle asks
whether the pair was read off the right line in the first place. A tracer that
followed the true lineament exactly would hand the model *truer* targets, and
truer targets can be harder to hit &mdash; so a slightly worse residual is not
by itself evidence of a worse tracer. Where they disagree, this takes the
geometric measure, because that is the one a reader can check against the
picture, and it keeps the weight low enough that the paths are the same paths.

### Following the crest, and why it is switched off

Eighteen degrees of median wander around an axis stable to a few degrees is
still wander, and the reason is structural: aligning the step's *direction* with
the line never says whether you are *on* the line. A path a hundred kilometres
off a fracture zone runs exactly parallel to it for ever, perfectly aligned and
perfectly wrong. So the offset was measured and the path pulled onto it. The
mechanism is in the code, it is tested, and it is off. This is what it cost to
find that out.

Steering does not work at all. Turning the heading two degrees buys 1.4 km
sideways over a forty-kilometre step, so closing a thirty-kilometre offset takes
eight hundred kilometres of walking, by which time the line has moved. The path
has to be shifted, not aimed. Shifting works, bounded by a fraction of the
offset per step and a hard cap of eight kilometres so that no single step can
carry a path onto the next fracture zone.

Finding the line needs a different scale from following its bearing, and that
is the interesting part. The smoothing that makes the bearing usable is the
smoothing that destroys the crest: at 100 km, a point picked at random already
carries 89% of the strongest line-strength within sixty kilometres of it, so
there is nothing to aim at and switching the pull on moved nothing measurable.
At 25 km that share is 71% and the strong ridges come 133 km apart, which is
fracture-zone spacing. Two fields, then: the blurred one for which way, the
sharp one for where.

With both, the pull does what it says. The median distance from a path to the
strongest line beside it falls from 31 km to 23, and the line-strength a path
sits on rises from 0.70 of the best nearby to 0.77.

And the reconstruction gets worse.

| | 20 Ma | 40 Ma | 60 Ma | 90 Ma | 120 Ma |
|---|---|---|---|---|---|
| age grid alone | 173 km | 246 km | 374 km | 558 km | 1073 km |
| bearing only | 176 km | 228 km | 320 km | 507 km | 998 km |
| pulled onto the crest | 178 km | 215 km | 364 km | 615 km | 1062 km |

Better at 40 Ma and worse everywhere else, on the same number of pairs, and at
90 Ma worse than using no gravity data at all. The median track end moved 2,724
km, which is the tell: these are not the same paths corrected, they are
different paths.

So the sharp field's strong ridges are not all flow lines. At 25 km they include
abyssal-hill fabric, seamount chains and ridge segments, and none of those is a
path the crust took &mdash; and a path pulled onto one of them follows the wrong
thing for thousands of kilometres. Nor can a better smoothing fix it, because
the two requirements pull opposite ways: removing the hills from the bearing is
what flattens the crest away.

What this needs is a field containing flow-line features and nothing else, which
means telling a fracture zone from an abyssal hill before following either. That
is a detector, not a filter.

### The detector

Three properties separate a fracture zone from everything else that makes a line
in a gravity grid, and each removes a different impostor.

It runs *across the isochrons*, because it is the trace of a transform offset
and so lies along the direction the crust travelled. Abyssal hills are the
opposite: frozen ridge topography, running along the isochrons. The travelled
direction comes from the age grid smoothed to 250 km, which is a regional
spreading direction rather than a local reading &mdash; and that is also what
keeps the test from being circular, since the age grid's fine detail is the very
thing the tracer is being corrected for.

It is *continuous* over hundreds of kilometres. Averaging along the lineament's
own bend rewards a feature that keeps going and dilutes one that does not: a
seamount is a point and a chain of them is a dotted line, and both fade against
a scarp that runs unbroken. Following the *blurred* axis for that walk, not the
sharp one &mdash; the sharp axis is too noisy to walk along, and following it
averages together cells that have nothing to do with each other, which destroys
the continuity it is meant to test.

And it is *narrow*: only cells that are a maximum across their own line survive,
which thins the result to a curve a cell wide.

A fourth property had to be added after the other three were built, measured,
and found to be finding nothing. Every one of them is a test of *shape*, and
shape without scale finds shapes in noise: non-maximum suppression keeps a local
maximum whatever its size, so a whisper of anisotropic noise pointing the right
way survived exactly as a scarp did. The profile taken across the detected lines
came back dead flat &mdash; no trough, no bright flank, nothing &mdash; on
ground of merely median roughness, which is precisely what a reader looking at
the fabric map reported before the measurement was taken. With a strength cut
the same profile peaks where it should: the roughness on the line is at the 76th
percentile of all sea floor against the 71st forty kilometres off it, and at a
harder cut the 83rd against the 76th.

Alignment gates rather than weights, and that is the difference between working
and not. Multiplying strength by alignment lets a loud half-aligned feature
outrank a quiet perfectly aligned one, and ranked that way the strongest
detections came out at 44 degrees to the flow &mdash; worse than picking at
random, because the loudest lines in a gravity grid are seamount chains and
plateau edges. Gated at twenty degrees and ranked on strength alone, the
detector keeps lines that run a median 13 degrees from the direction the crust
travelled, against 28 to 34 for the ungated lineaments they were picked out of.

Two more things had to change before it produced lines rather than confetti, and
both were about order rather than about thresholds. The gate was a cliff, and a
cliff flickers: the guide axis is itself only good to a few tens of degrees and
a real scarp wanders, so a yes-or-no test per cell switched on and off along one
feature and chopped it into dashes. It ramps now &mdash; full marks inside
fifteen degrees, nothing beyond thirty-five. And the strength cut came *before*
the averaging along the line, so a scarp that dipped below the bar for fifty
kilometres was cut in two and zeroed, and the averaging that would have carried
it across the dip had nothing left to carry. Averaged first, cut last.

Then the lit cells are linked into curves: walk the strongest unclaimed cell
outwards along the guide axis, look a little to either side at each step, allow
a few empty cells to be crossed, and measure how far you got. Anything under 400
km is discarded, which is the test that removes a seamount &mdash; round, so it
lights a cell or two and stops. What comes out is 1,622 fracture zones, median
566 km long, over 1.4% of the sea floor. Curves, not pixels, which is also the
form a flow field wants to be fitted through.

The strength cut is deliberately loose. At a stricter setting it gives 970 zones
over 0.8% of the sea floor on ground at the 68th percentile of roughness against
the 62nd to either side, which is the better *detector*; loose it gives the 1,622
on ground at the 60th against the 55th, which is the better *anchor set*. A flow
field fitted through these is constrained by all of them at once, so a few soft
calls are outvoted, while a gap between anchors is filled by nothing but the
smoothness of the fit.

They are spread, which is worth stating because a screenshot of one ocean
suggests otherwise: by share of its own area, the South Atlantic gets 2.0%, the
two Pacific basins 1.1% each, the North Atlantic 0.8%, the Southern Ocean 0.8%
and the Indian 0.7%. A factor of three between the densest and the thinnest, not
a factor of twenty. Crust younger than 8 Ma is skipped
outright: at a spreading centre the age rises in both directions, so the
travelled direction computed from it is whatever the two sides fail to cancel,
and the detector was lighting up lengths of the Mid-Atlantic Ridge axis in
consequence &mdash; the one line on the sea floor that is certainly not a path
the crust took.

So the detector works. What it is *for* is still open, because pulling the
traced paths onto its lines makes the reconstruction worse:

| | 20 Ma | 40 Ma | 60 Ma | 90 Ma | 120 Ma |
|---|---|---|---|---|---|
| bearing only | 176 km | 228 km | 320 km | 507 km | 998 km |
| pulled onto detected zones | 181 km | 228 km | 374 km | 543 km | 1129 km |

The obvious explanation is wrong, and it was worth checking rather than
assuming: a fracture zone is not an age discontinuity here. The age step across
a detected line is a median 1.1 Ma over 80 km, the same as across sea floor the
detector rejected, and with a *smaller* tail. So the reason these paths reunite
worse is not established, and this is written down as an open question rather
than as a story. One possibility that cannot be ruled out with what is measured
here is that the pulled paths are the truer ones and the model is the thing that
cannot follow them &mdash; a truer target is harder to hit.

What ships is the bearing, with `crestPull` at zero. Nothing in the run depends
on the detector &mdash; but it is painted on the globe, as *Detected fracture
zones*, in turquoise under the magenta paths. It is drawn about three times
wider than it was measured or it would be invisible at eleven kilometres a cell,
and that is a drawing decision rather than a measurement.

It is there to be argued with. Two instruments that never saw each other's data
now sit on the same crust: the paths come from the age grid, the turquoise from
the gravity grid, and where they agree that is worth something no aggregate
number in this file can say. On the shipped run they agree well down the
south-west Atlantic, where the turquoise runs in long unbroken streaks along the
magenta; they agree poorly in the central North Atlantic, where the turquoise
breaks into blobs and dashes; and the detector plainly fires on some of the
Mid-Atlantic Ridge axis itself, which is not a flow line and is a false positive
the twenty-degree gate should have caught.

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

## The strongest check: which crust was once against which

A fracture zone is not a texture on the sea floor, it is a path. Crust leaves a
ridge along it and keeps going, so two points on opposite flanks of the same
ridge, on the same path, carrying the same age, **were the same point at that
age**. The age grid therefore already knows thousands of pairs that have to come
together at a stated time, and for most of this project's life the model was
scored against four hand-chosen continent pairs instead.

They are found by walking, not by hand: seed the ridge axis, leave it in both
directions, follow the age uphill, and pair the two flanks where their ages
match. Nothing is puzzled together — it is the same observation the solver is
already driven by, read for a different question, which is the only reason it is
allowed to be a check at all. See `tools/lib/flowlines.ts`.

<!-- from-the-run: pairs -->
| time | pairs due | median miss | reunited within 200 km | of which merged |
|---|---|---|---|---|
| 0 Ma | 60 | 80 km | 100% | 0% |
| 5 Ma | 148 | 101 km | 89% | 0% |
| 30 Ma | 115 | 214 km | 50% | 0% |
| 60 Ma | 82 | 320 km | 20% | 0% |
| 120 Ma | 38 | 998 km | 3% | 0% |
<!-- /from-the-run -->

Two things keep the figure honest.

<!-- from-the-run: floor -->
At 0 Ma the reconstruction is the present day, so the 80 km it still misses by, and the 100% it still gets, have nothing of the model in them. Most of that is the 2 Ma of slack a pair is allowed either side of the frame it is judged at &mdash; up to 2 Myr of real spreading, which at ordinary rates is a hundred kilometres or two &mdash; and the rest is what a triangle cannot resolve.
<!-- /from-the-run -->

That is the floor: at 0 Ma the reconstruction cannot be wrong, so whatever it
misses by there is the measurement, not the model.

The last column is the share of pairs whose two halves the mesh has merged into
a single point. A merge is the model closing the ocean and joining the two banks
— the right answer, and also a zero that cannot fail, so a run that merged
everything would score perfectly. It used to run to 29%. It is zero now, because
each end of a pair is a point inside a triangle rather than the nearest vertex,
and merging one takes all six corners collapsing onto the same point. Nothing in
the score is unfalsifiable any more.

That change is also why the figures improved: snapping to vertices put the
mesh's own 47 km spacing into every residual, and the model was being blamed for
it. The floor went from 115 km to 80 km and 20 Ma from 50% to 59% without the
solver changing at all.

The lines drawn on the globe are held the same way, and for a different reason.
A walk steps 40 km and the mesh has points 112 km apart, so snapping each step
to a vertex drew a staircase with the mesh's period rather than the fracture
zone's — the triangulation's shape laid over the lineament's, which is the one
thing a reader must not confuse it with. Every step of every drawn path is now a
place inside a triangle, so the line is where the walk went, and it still
deforms with the crust because its three corners do.

Read that way the result is plain: the model reunites most of what should be
reunited for the last thirty million years, and then loses it. By 120 Ma the
median pair is more than a thousand kilometres from where the age grid says it
should be.

**These pairs are a check and never a constraint.** Nothing in the solver is told
about them. A model steered by them could not then be scored on them, and the
whole point of having thousands of independent residuals is to have something
that the model has not already been fitted to.

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
