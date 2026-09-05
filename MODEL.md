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

`data-src/agegrid.nc` is the sea-floor age grid: Muller et al. 2019 Tectonics
v2.0 at the present day, a tenth of a degree, ages in millions of years as
floats with NaN over anything the survey does not date. Cross-tabulating it
against the bathymetry in `height-map.jpg` gives:

| | share of the globe |
|---|---|
| dated, deep water — consistent | 56.1% |
| undated, land or shelf — consistent | 38.7% |
| **undated, deep water — missing data** | **2.8%** |
| dated, above sea level — mask bleed | 0.2% |

So 94.8% of the map is internally consistent and the real hole is 2.8%. What
that hole does to the answer is what matters:

<!-- from-the-run: bounds -->
Counting it as continent gives R(200 Ma) = 4115 km, counting it as ocean gives 3926 km &mdash; the entire ambiguity is worth 4.8% of the radius.
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
conjugate score &mdash; which, as the section on the flow field below records,
measures the ruler and not the model, because the reconstruction is identical
either way:

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
lights a cell or two and stops. What comes out is 679 fracture zones, median
569 km long, on 0.96% of the dated sea floor. Curves, not pixels, which is also
the form a flow field wants to be fitted through.

A walk claims the whole band it looked at and not just the cell it stepped on,
which is a correction and not a detail. Thinning narrows a scarp but does not
reduce it to one cell everywhere along its length, so claiming only the best
cell left the rest of the band free to seed curves of its own: **54% of all
curves were shadowing a longer one**, and one physical feature came out as four
or five near-parallel lines a cell apart. A reader clicking through the layer
found five of their twelve picks centred within 0.4 degrees of each other, which
is what sent anyone to measure it. Claiming the band, plus a pass at the end
that drops a curve most of whose length runs inside an accepted one's corridor,
takes near-duplicates from 54% to none within 22 km and 12% within 56 km, and
1,622 curves to 679. Little real is lost with them: 95% of the old curves still
have a curve within three cells of most of their length, and the 5% that do not
are 40 of the 1,045 thousand km there were.

It moved the reconstruction, which was not the point of the change and is worth
stating carefully. The conjugate pairs are traced through the flow field these
anchor, so removing the duplicates changed the pair set as well as the model and
that comparison measures two things at once. The continent scorecard does not:
those pairs are hand-chosen and fixed, and on them South America and Africa
reunite 32% against 28%, Australia and Antarctica 26% against 19%, Antarctica
and South America 25% against 17%, India and Africa 9% against 6%, and North
America and Africa 9% against 11% &mdash; the one that fell, and its gap at the
moment of joining went from 111 km to zero. The shell also comes out slightly
tidier at 200 Ma: 0.15% doubled against 0.22%, 0.16% folded against 0.21%.

Two details of the walk are load-bearing and were each got wrong once. A walk
that steps a fixed distance and rounds to a cell lands on the same cell twice at
high latitude, so it must know its own claims from everyone else's or it blocks
itself, calls the step a miss and gives up five steps later &mdash; which
truncated every long line into fragments too short to keep. And a step that
finds nothing must not claim the ground it looked at, or the end of one curve
eats the start of the next.

The strength cut is deliberately loose. At a stricter setting it gives about a
third fewer zones, on ground at the 68th percentile of roughness against the
62nd to either side, which is the better *detector*; loose it gives these, on
ground at the 60th against the 55th, which is the better *anchor set*. A flow
field fitted through these is constrained by all of them at once, so a few soft
calls are outvoted, while a gap between anchors is filled by nothing but the
smoothness of the fit.

They are spread, which is worth stating because a screenshot of one ocean
suggests otherwise: by share of its own dated sea floor, the South Atlantic gets
2.31%, the South Pacific 1.22%, the North Atlantic 1.05%, the North Pacific
0.95%, the Indian 0.81% and the Southern Ocean 0.51%. A factor of four and a
half between the densest and the thinnest, not a factor of twenty. The Southern
Ocean is the one that moved when the near-duplicates went: it was 1.87% of the
old count and is 0.51% of this one, so more than half of what it had was the
same scarp counted over again. Crust younger than 8 Ma is skipped
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

It is there to be argued with, so it can be. Every curve carries its own number
in the picture &mdash; the green and blue channels of `zones.png` against the
red one that carries its strength &mdash; and a right-click on a turquoise line
selects that curve, lights it orange along its whole length, and lists it. The
list keeps forty-eight and has a copy button, because judging these means
working across an ocean in one sitting and a selection that quietly drops its
oldest entry makes the list lie. One caveat travels with the numbers: an id is a
position in a list rebuilt from scratch every run, so a number written down
against one build points at a different curve in the next. The place is the
durable identity, which is why it is listed beside the id, and
`tools/measure-zones.ts` takes a `lon,lat` as readily as an id.

Each entry carries three measurements, because a reader who worked through
twelve of them came back with *most of these are seamounts, some are ridges* and
that is not something a picture can settle. Three different things make a narrow
line in a gravity grid. A fracture zone is a step in the sea floor that runs for
hundreds of kilometres, so walking it the gravity barely changes. A seamount
chain is separate volcanoes built on top of crust that was already there, so the
same walk climbs and falls between every one of them &mdash; that is **swing**,
the 10th to 90th percentile of the reading along the curve, a median 25 Eotvos
over all of them. A ridge axis is where crust is made, so the age is at a
minimum on the line and rises on both sides &mdash; that is **bowl**, the age 60
km either side against the age on the line, a median of zero and a ninetieth
percentile of 0.8 Myr.

Neither number is yet a verdict, and it would be easy to pretend otherwise. The
bowl test does pick out younger crust &mdash; the curves above 0.7 Myr have a
median age of 43 Ma against 61 Ma for the rest, and the five near-duplicates the
reader found in the Southern Ocean all scored between 0.95 and 1.94 &mdash; but
43 Ma is not a spreading axis, so it is catching something wider than the thing
it was built for. They ship as numbers beside each zone so that a reader's
judgement can be set against something measured and a cut chosen against real
labels rather than against a story.

It is there to be argued with. Two instruments that never saw each other's data
now sit on the same crust: the paths come from the age grid, the turquoise from
the gravity grid, and where they agree that is worth something no aggregate
number in this file can say. On the shipped run they agree well down the
south-west Atlantic, where the turquoise runs in long unbroken streaks along the
magenta; they agree poorly in the central North Atlantic, where the turquoise
breaks into blobs and dashes; and the detector plainly fires on some of the
Mid-Atlantic Ridge axis itself, which is not a flow line and is a false positive
the twenty-degree gate should have caught.

## The flow field

The detector finds about seven hundred fracture zones, and a fracture zone is
a flow line that nature happened to draw. It drew perhaps one in a dozen: the
rest of the crust flowed just the same and left nothing behind. So the sparse
ones are treated as what they are, anchors, and a direction field is fitted
through them that says which way the crust travelled at every point of the
sphere &mdash; held to the scarps where scarps exist, held to the age grid's
isochrons elsewhere, and smooth in between, which is what carries it across the
gaps and under the continents.

It is stored as an axis rather than an arrow, at twice the angle. A fracture
zone knows which line the crust ran along and not which way along it, and the
two flanks of a ridge run in opposite directions along the same line &mdash; so
averaging arrows would cancel them to nothing exactly at the ridge, which is the
one place the answer is certain. At twice the angle, opposite directions land on
the same point. The sign is put back from the age grid by whoever reads it.

The tracer walks that field now instead of the local age gradient. Two
properties come with it that no amount of step-by-step steering could buy. A
single bad reading is one constraint among a quarter of a million and is
outvoted rather than followed off a cliff, which is what went wrong every time
the paths were steered or pulled a step at a time. And the answer is smooth by
construction, so the lines come out as lines.

<!-- from-the-run: pairs -->
| time | pairs due | median miss | reunited within 200 km | of which merged |
|---|---|---|---|---|
| 0 Ma | 34 | 80 km | 100% | 0% |
| 5 Ma | 75 | 64 km | 96% | 0% |
| 30 Ma | 57 | 202 km | 49% | 0% |
| 60 Ma | 30 | 263 km | 33% | 0% |
| 120 Ma | 7 | 639 km | 14% | 0% |
<!-- /from-the-run -->

### None of this changes the reconstruction, and it never could

That was the intended conclusion of a measurement, and it turned out to be the
measurement's whole finding. Scoring each model against the other's pairs was
supposed to separate a better model from an easier test. It separated nothing,
because the two models' frames came out byte for byte identical.

They had to. The conjugate pairs reach `conjugateFit` and nothing else: the
solver reads the mesh, the age grid and the radius curve, and the pairs are read
only to be measured against. The tracer produces a *yardstick*, not an input.
Everything traced here &mdash; the gravity bearing, the crest follower, the
detector, the field &mdash; has changed how the reconstruction is judged, and
has changed the reconstruction not at all.

So every table in this section reads differently from how it was written. A
lower residual after a change to the tracer does not mean the model improved; it
means the same unchanged model was measured with a different ruler. That is not
worthless &mdash; a truer ruler gives a truer reading, and if the field's paths
are the better ones then 203 km at 40 Ma and 1334 at 120 are what this
reconstruction has always been worth, and the older figures were flattering it
at depth. But it is a statement about the measurement, not about the model, and
this file said otherwise until the frames were compared.

### Feeding them in

So the pairs now pull. At every step, a pair whose crust erupted at age *A* is
drawn towards being one point: the target closes linearly from where its halves
sit today to nothing at *A*, and the stiffness does the opposite, near zero at
the present and full at formation, so most of the pull lands where the claim is
real and the straight-line guess in between is barely enforced. Each end is a
point inside a triangle, so the correction goes to that triangle's three corners
by weight, and pulling the point pulls the crust it is part of.

That destroys them as a test, so half of them are held back. Split by track and
not by pair: two pairs five million years apart on the same walk are nearly the
same claim, and a pair-by-pair split would put a near-copy of every constraint
into the test set. 1,179 pull; 1,282 are never shown to the solver and are the
only ones scored.

On those held-back pairs:

| | 20 Ma | 40 Ma | 60 Ma | 90 Ma | 120 Ma |
|---|---|---|---|---|---|
| before | 187 km, 52% | 222 km, 43% | 306 km, 27% | 506 km, 16% | 1068 km, 0% |
| pairs pulling | 151 km, 67% | 196 km, 51% | 247 km, 39% | 340 km, 22% | 441 km, 26% |

Better at every time, and not by a little at depth: 1068 km to 441 at 120 Ma,
and the share reunited within 200 km goes from none of them to a quarter. This
is the first change in a long stretch of work that moved the reconstruction
rather than the ruler, and it is measured on pairs the solver never saw.

Most of the rest of the run improved with it. Median strain falls from 3.6% to
3.1% at 200 Ma, folded crust from 0.42% to 0.21%, crust covered twice from 0.46%
to 0.22%, and the record ends on seven blocks instead of two. Craton strain does
not move.

Because they pull, judging a pair is now the most useful thing anyone can do to
this model: a wrong one no longer merely mis-scores the answer, it drags the
crust. So a right-click that lands on a yellow segment reports the pair rather
than only the point &mdash; both ends, the age they were one point, how far apart
this frame leaves them, and whether that particular pair pulls or was held back.
The held-in rule lives in one place, `pairPulls` in shared/tracks.ts, so that the
viewer and the solver cannot come to disagree about which half is which.

One thing got worse and it is not small. The worst held island loses 52% of its
own shape by 200 Ma, against 17% before. At 120 Ma it is 19% against 17%, so
this is confined to the very end of the record &mdash; and the pairs run out
around 160 Ma, so nothing is pulling there directly. It is a knock-on: the
constrained path through the middle of the record leaves the shell in a
different state by the time it arrives. Which island, and why it gives way, is
not established; the diagnostics record the worst figure but not its owner.

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
The run finds 160 blocks at its most divided and 3 at 200 Ma.
<!-- /from-the-run -->

### Why it ends with one block, and why that is not welding

A block count near one at the end of the run looked like the failure mode this
solver was built to avoid: one rigid sheet, which cannot change curvature
without absurd strain. It is not that. It is the record running out.

The only thing that makes this model move is crust leaving it, and the sea floor
does not go back far enough to keep that up:

<!-- from-the-run: reach -->
Over the last 20 Myr of the run the age grid takes away 0.29% of the globe in total &mdash; 0.014% per Myr, against a peak of 1.02%. The median surface speed falls from a peak of 25 km/Myr to 3.7, the block count from as many as 160 to 3, and the biggest block grows to 61% of the shell.
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
| 5 Ma | 1.019%/Myr | 14.9 km/Myr | 160 | 2% | 1.1% |
| 30 Ma | 0.617%/Myr | 22.5 km/Myr | 150 | 2% | 2.5% |
| 60 Ma | 0.408%/Myr | 16.3 km/Myr | 120 | 6% | 3.9% |
| 120 Ma | 0.284%/Myr | 23.8 km/Myr | 109 | 6% | 5.3% |
| 200 Ma | 0.000%/Myr | 3.7 km/Myr | 3 | 61% | 7.0% |
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
| 0 Ma | 67 | 80 km | 100% | 0% |
| 5 Ma | 158 | 96 km | 93% | 0% |
| 30 Ma | 119 | 196 km | 51% | 0% |
| 60 Ma | 91 | 385 km | 21% | 0% |
| 120 Ma | 42 | 1334 km | 2% | 0% |
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

There are a lot of these now, so before the detail: what each one is, and what
it is for. **Only the first row is the score.** The scorecard is the independent
check. Everything else is diagnosis &mdash; it can say *where* a bad score comes
from, and it can never say the model is good.

| | what it measures | good is |
|---|---|---|
| **pairs** | the conjugate pairs held back from the solver: how far apart the median one still is, and what share are back within 200 km | low, high |
| **scorecard** | the named continental joins, against dates from the geology rather than from this model's own tracing | closed at the right moment |
| **bare sphere** | share of the sphere no surviving crust covers &mdash; the gaps | 0 |
| **covered twice** | share where two pieces of crust lie on top of each other | 0 |
| **inside out** | triangles that have turned over. A defect, never a trade | 0 |
| **strain** | how far the crust has been deformed, counted separately over the shields and over the weak crust | low; shields ~0 |
| **budget** | how much deformation the radius curve leaves room for, against how much the run actually spends | x1 |
| **fold, pit** | the angle the fold turns through at the surface, and how deep the dents beside it get | 90&deg;, 0 km |
| **plates** | how many rigid blocks the motion falls into, and how big the largest are | few, large |

A **conjugate pair** is two points that were once one point. Crust erupts on a
spreading axis and goes both ways, so a point off Africa and a point off South
America were the same piece of sea floor eighty million years ago; 2,470 such
pairs are traced through the flow field. Half of them are handed to the solver
as a force and pull the crust together. Scoring with those would measure whether
the solver had done its own homework, so **the other half is never shown to it
and is the only half counted** &mdash; the pairs held back. Split by track
rather than by pair, because two pairs five million years apart on the same walk
are nearly the same claim.

Then the detail. Four numbers per frame, none of them tuned:

- **bare sphere** — how much of the sphere no surviving crust covers. It should
  be zero; whatever is left is surface the reconstruction has failed to account
  for. **It is not a hole in the mesh.** A reader asked exactly the right
  question here — *de mesh gaat toch niet open? als we vouwen blijft de mesh
  toch altijd gesloten?* — and the answer is yes, always: nothing is deleted
  under the fold, all 81,920 triangles are still there, and every run ends by
  checking that the Euler characteristic is still 2 and throwing if it is not.
  What the measure counts is directions with no *existing* crust overhead.
  Behind such a direction there is still mesh: the curtain of crust that has
  not erupted yet, hanging below. So the bare figure is the **mouth of an
  unshut slot** — look straight down at where a ridge was and you see into the
  fold instead of onto sea floor. The number beside it says so: at 200 Ma
  13.09% is bare and 15.73% lies under a triangle of un-erupted crust that
  still touches the surface. Almost all of the one is the other.
  This document described the measure backwards for a long time, as sphere
  *occupied* by crust that did not exist yet.
- **covered twice** — how much of the sphere lies under more than one triangle
  at once, which a merely crumpled shell does as readily as a folded one.
- **two islands at once** — the sharp version of that, and the one that cannot
  be excused: how much of the sphere is under two *different* islands of strong
  crust. An island is the part of the model that is not allowed to deform, so
  this is two continents in the same place rather than a mesh being clumsy, and
  the column beside it cannot see it — a triangle sliding over its own
  neighbour while an ocean closes counts there just the same. It is zero out to
  90 Ma and then 0.002% at 120, 0.009% at 160 and 0.022% at 200. Named by where
  their crust sits today, the pairs are Arabia on Africa, which starts first;
  West Australia on East Antarctica, the largest; the two Australian cratons on
  each other; the Canadian shield on the Amazon craton; and Baltica on Arabia.
  See tools/measure-islands.ts, which names the islands and locates the
  inside-out triangles as well. Nothing in the solver forbids it, and the
  section below is about finding out why forbidding it does not help.
- **inside out** — the share of the rock whose outward face points at the core.
  Reported apart from the overlap because edge-length springs cannot see it: a
  triangle and its mirror image measure the same.
- **strain** — how much the model has to deform the crust, from the area change
  of each triangle against its present-day area, split by how strong that crust
  is.

<!-- from-the-run: reports -->
| time | radius | bare sphere | covered twice | two islands at once | inside out | craton strain | weak strain |
|---|---|---|---|---|---|---|---|
| 5 Ma | 6207 km | 0.62% | 0.04% | 0.000% | 0.00% | 0.13% | 1.0% |
| 30 Ma | 5673 km | 2.21% | 0.15% | 0.000% | 0.00% | 0.35% | 2.5% |
| 60 Ma | 5152 km | 4.44% | 0.36% | 0.000% | 0.03% | 0.53% | 4.0% |
| 120 Ma | 4315 km | 9.85% | 1.67% | 0.263% | 0.57% | 1.10% | 8.0% |
| 200 Ma | 3926 km | 12.76% | 3.35% | 0.981% | 1.33% | 1.88% | 12.3% |
<!-- /from-the-run -->

Splitting strain by strength is the point. Thick cratons now stay within a
couple of percent of rigid all the way back, and the deformation the model
cannot avoid has moved into thin necks, shelves and island arcs, which is where
it belongs. Whether that much is tolerable there is a separate question, and
the answer is probably not everywhere.

### Whether it lands where it should

<!-- from-the-run: fits -->
| pair | joined by | margin in contact today | then | gain | apart then | closest anywhere |
|---|---|---|---|---|---|---|---|
| South America &ndash; Africa | 180 Ma | 0% | 0% | +0 | 391 km | 16 km at 110 Ma |
| Australia &ndash; Antarctica | 100 Ma | 0% | 33% | +33 | 36 km | 2 km at 175 Ma |
| India &ndash; Africa | 120 Ma | 0% | 0% | +0 | 1019 km | 944 km at 135 Ma |
| Greenland &ndash; North America | 60 Ma | 20% | 24% | +5 | 0 km | 0 km at 0 Ma |
| North America &ndash; Africa | 190 Ma | 0% | 0% | +0 | 1070 km | 646 km at 175 Ma |
| Antarctica &ndash; Africa | 170 Ma | 0% | 8% | +8 | 16 km | 4 km at 195 Ma |
| Antarctica &ndash; South America | watched | 0% | 18% | +18 | 4 km | 2 km at 125 Ma |
| Australia &ndash; North America | watched | 0% | 0% | +0 | 1581 km | 1473 km at 175 Ma |
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

## The seam, and the name a triangle answers to

A reader winding the East Pacific Rise back from today to 38 Ma reported the
ridge still sitting there in the middle, growing and blurring as the triangles
around it grew, and put their finger on it exactly: *eigenlijk zou het midden
helemaal verdwenen moeten zijn.* The middle should be gone.

It is gone, and so is the crust. When this was written the mesh collapsed what
had not been made yet, the triangle count fell with the shell's area, and the
live faces summed to 100.4% of the sphere at 200 Ma at about 6,000 km&sup2; of
crust per triangle &mdash; the same as today. There was no phantom area anywhere
in the run. Every triangle on that globe was carrying real crust of the right
size. The run shipped now folds that crust inside the shell instead of deleting
it, so the count no longer falls and the surviving surface covers 93.4% of the
sphere rather than all of it; the point below stands either way, because a flip
renames nothing and a collapse renamed everything.

What had gone wrong was the *name*. A collapse merges two points, and every
triangle round the one that goes has to be told to use the survivor instead, or
the springs pull on a vertex nobody is moving. But a corner is also how a
triangle knows which piece of the Earth it is: its present-day direction is what
the surface map, the age grid and the gravity are sampled at. After a chain of
thirty collapses a corner names crust four thousand kilometres from the crust
the triangle is made of, and the shader paints the triangle by interpolating
across all four thousand. That is not a smear of the ridge. It is a faithful
painting of the wrong place.

So the mesh now carries a second triangulation, `drawnVerts`, which takes the
same face removals and the same flips and skips the renaming. The drawn shape is
identical, because a merged point is moved to sit exactly on its survivor, so a
triangle drawn through the old name and one drawn through the new occupy the
same three places; per-vertex readings follow the survivor the way positions
already did. The reconstruction is untouched, and measurably so: every
diagnostic in this document is bit-for-bit what it was before the change.

Measured as the widest distance between a triangle's corners on today's sphere,
against the 129 km the icosphere's own edges span:

| | 0 Ma | 13 Ma | 38 Ma | 60 Ma | 120 Ma | 200 Ma |
|---|---|---|---|---|---|---|
| widest triangle, 99th percentile | 132 km | 216 km | 560 km | 907 km | 2684 km | 3734 km |
| &hellip; before, when corners were renamed | 132 km | 420 km | 991 km | 1694 km | 3470 km | 4269 km |
| share of the visible area painted from crust over 300 km wide | 0.0% | 0.2% | 2.0% | 4.3% | 9.2% | 21.5% |
| &hellip; before | 0.0% | 1.0% | 3.7% | 6.6% | 11.7% | 24.6% |

At the times a reader spends most of their time in, the fix is worth about five
times: 1.0% of the globe misnamed at 13 Ma becomes 0.2%, and the ghost ridge
down the middle of the closing Pacific becomes a line one triangle wide.

What is left is not renaming, and two guesses about it were both wrong, so they
are written down rather than quietly dropped.

The first guess was that those triangles are empty &mdash; that the mesh has
failed to collapse crust which has not erupted yet, and is drawing sea floor
before it exists. Measured, that is between 0.6% and 2.7% of the area at every
time, and by face index not one triangle of old crust has been collapsed away
anywhere in the run: at 200 Ma there are 32,534 live faces and 32,203 of them
are crust older than the frame. The collapse does its job. (The first attempt at
this measurement said 63%, because it read `faceAge[f]` against an array that
`applyTopology` had compacted, lining each triangle up with some other
triangle's age. A tool that agrees with a suspicion is the one to check hardest.)

The second guess was the flips &mdash; 164,175 of them, each one a fault by the
mesh's own description, whose new corner is borrowed from the neighbouring
triangle. Cutting `flipPasses` from six to two gives 27% fewer flips and does
nothing to the seam: 21.5% of the area at 200 Ma becomes 22.3%. It does plenty
to the fit, all of it bad &mdash; conjugate pairs reunited fall from 44% to 33%
at 60 Ma and 24% to 12% at 90, South America and Africa from 32% to 23%,
Australia and Antarctica from 26% to 16%, and the doubled-over area at 200 Ma
triples. The flips are load-bearing and they are not the cause.

What the numbers do say is that the *median* triangle is untouched: 130 km at
every time, the icosphere's own spacing, from 0 Ma to 200. This is a tail, not a
drift &mdash; four fifths of the shell is pristine and a fifth of it, around the
closures, is genuinely made of crust from either side of a contact. Whether a
fifth is too much is not answerable by tuning, and no knob tried moves it
without making the reconstruction worse.

Where a triangle does bridge a closed ocean, the shader stops painting sea floor
and paints a seam colour instead &mdash; deliberately neither a sea-floor colour
nor one of the overlay colours, because the one true thing about that ground is
that two pieces of crust far apart today are in contact there. The ramp runs
from 220 km, well past the widest present-day triangle, to 520 km.

One honest cost. The seam is carried per vertex, not per triangle, because the
geometry is indexed and a vertex is shared by six faces: a per-face attribute
would mean expanding the mesh threefold and writing three times as much every
frame, and WebGL2 has no `gl_PrimitiveID` in a fragment shader to avoid it. So a
corner of a bridging triangle carries the seam into its good triangles too,
which about doubles the area tinted against the area that strictly earns it
&mdash; 0.5% against 0.2% at 13 Ma, 28% against 21% at 200. `tools/measure-mesh.ts`
prints both columns.

## Fracture zones bend; they do not corner

The tracer will not turn a path more than six degrees per forty-kilometre step,
because a fracture zone is a path one piece of crust actually took and crust
does not corner. So a drawn track is smooth today by construction: the median
turn is 3.6 degrees and the largest anywhere is 12.

Carried back by the reconstruction it stops being smooth. Counting only the
stretch of each track whose crust exists at the time, and only where consecutive
points are more than 8 km apart so that a merged triangle cannot fake a
reversal:

| | 0 Ma | 13 Ma | 20 Ma | 38 Ma | 60 Ma | 90 Ma |
|---|---|---|---|---|---|---|
| median turn per step | 3.6&deg; | 3.6&deg; | 3.6&deg; | 4.3&deg; | 4.5&deg; | 5.1&deg; |
| 90th percentile | 6.0&deg; | 7.1&deg; | 7.5&deg; | 15.9&deg; | 23.2&deg; | 23.0&deg; |
| share of turns over 30&deg; | 0.00% | 1.7% | 1.1% | 4.9% | 7.9% | 7.4% |

A turn of 150 degrees between two points forty kilometres apart is the crust
doubling back on itself, and nothing on the sea floor does that. **The fold
diagnostic sees none of it** &mdash; it reads 0.05% at 60 Ma &mdash; because no
triangle is inverted; the mesh is intact and the material line running through
it is not. This is a check the model did not have.

Making the solver hold the tracks smooth does not fix it. The constraint is
written (`trackStiffness`, off by default) and works the way the conjugate pairs
do: half the tracks are held and half left free to score it, split by the same
track number, so a line the solver was told to keep smooth is not also the
evidence that the crust stayed smooth. At stiffness 0.2 the corners barely move
&mdash; 5.9% to 5.4% over 30 degrees at 38 Ma on the held half &mdash; and the
held-back conjugate pairs get worse, 24% reunited to 12% at 90 Ma. At 1.0 the
corners move about as little, 5.1%, and the pairs get *better*, 44% to 49% at 60
Ma. Non-monotonic between settings is noise, not a result, and the honest
reading is that it does none of what it was built to do.

### Where the corners come from

A kink turned out not to be a smoothness problem at all, and the first guess
about it &mdash; that the line is too long for the space and buckles &mdash; was
the wrong sign. Two adjacent points of a track are crust forty kilometres apart,
and the crust between them is older than both ends, so it survives as long as
they do and the distance between them cannot change. Measured, it does: the
median segment reads 1.04 of its present-day length at 38 Ma and 1.21 at 120.
The lines are being **stretched**, not squeezed, and a corner sits where one
segment is short and its neighbour long &mdash; a tenth percentile of 0.42
against 0.87 for everything else.

Two more guesses died before the mechanism turned up. Not the barycentric
points, though by 120 Ma 43% of track points and 55% of conjugate pair ends sit
in a triangle that has been flipped or collapsed apart: pairs with a broken
triple score no worse than pairs with an intact one, 99 km against 132 at 20 Ma
and 195 against 403 at 90, and the crude fallback of using the heaviest corner
makes the corners worse because it puts the mesh staircase back
(`shared/anchor.ts` holds it, switched off, with those numbers). Not the drift
memory either: letting the crust behind the driven band coast for twice as long
leaves the gradient exactly where it was and costs fit.

Turning knobs was not going to find it, so the solver now reads the same number
after each stage of a step, behind `STRETCH_TRACE=1`. At 60 Ma, as the median
segment's share of its present-day length:

| start | after the shrink | after the collapse | after the drive | after the sweeps |
|---|---|---|---|---|
| 1.062 | 1.058 | 1.062 | **1.071** | 1.064 |

The shrink takes 0.4% off and the collapse puts it back, which is crust keeping
its size while the sphere gets smaller and is exactly right. The flips do
nothing measurable. The drive adds 0.9%, forty Gauss-Seidel sweeps give back
0.7%, and the 0.2% left over is never recovered. Over sixty steps that is the
6%.

So the fix is not a new constraint, it is finishing the one that is already
there. Doubling the sweeps to eighty:

| | 38 Ma | 60 Ma | 90 Ma | 120 Ma |
|---|---|---|---|---|
| median stretch, 40 sweeps | 1.04 | 1.06 | 1.10 | 1.21 |
| 80 sweeps | 1.02 | 1.04 | 1.08 | 1.23 |
| 90th percentile, 40 sweeps | 1.45 | 1.81 | 2.26 | 3.52 |
| 80 sweeps | 1.41 | 1.55 | 1.85 | 3.93 |
| turns over 30&deg;, 40 sweeps | 5.0% | 8.4% | | |
| 80 sweeps | 4.4% | 6.3% | | |

and the reconstruction goes with it rather than against it: South America and
Africa reunite 37% against 32%, North America and Africa 16% against 9%, India
and Africa 12% against 9% with the gap at the moment of joining falling from 521
km to 273, and the two pieces of crust furthest apart in the whole scorecard,
Australia and North America, from 2515 km to 1007. Against that, Antarctica and
South America fall from 25% to 16% and the conjugate pairs at 90 Ma from 24% to
15%. It costs 18% of the run rather than the double one might expect, because
the sweeps are not the whole of a step.

Past 110 Ma nothing improves, which is where the sea floor is running out and
the tracks with it: 241 segments left at 120 Ma against 3,328 at 38.

Eighty is the knee and not simply as much as could be afforded. At a hundred and
sixty the stretch goes on falling a little &mdash; the median at 60 Ma from 1.04
to 1.01, the ninetieth percentile from 1.55 to 1.51 &mdash; but the corners stop
coming out, 6.3% of turns over thirty degrees at 60 Ma against 6.6%, and the
reconstruction turns back down: South America and Africa from 37% to 30%,
Greenland and North America from 37% to 34%, the folded crust at 200 Ma from
0.23% to 0.34% and the doubled from 0.11% to 0.30%. The refused collapses climb
too, 46,408 to 60,787, which is a mesh relaxed so tight that closing it tears.
Whatever the remaining stretch is, it is no longer the sweeps' to give back.

`tools/measure-tracks.ts` is the instrument, and it is the only thing in the
model that can see any of this &mdash; the fold diagnostic reads 0.05% at 60 Ma
because no triangle is inverted, and the strain diagnostic is an area, so a line
stretched along its length and squeezed across it costs it nothing.

## Two rigid blocks in one place, and why it is a suture rather than an error

A reader looking at 200 Ma saw islands of strong crust lying over one another,
Arabia onto Africa in particular, and they were right. Nothing forbade it:
`holdIslands` keeps each island's own shape with no notion of another island
being in the way, and `CONTACT_KM` is a threshold the scorecard reads rather
than a constraint the solver obeys.

So a contact constraint was built. It finds every point of one island that lies
*inside* a triangle of another — interpenetration, not proximity, because two
continents in contact have their margins within a triangle of each other and
pushing every neighbouring pair apart by a mesh spacing would open the Atlantic
back up to keep the cratons tidy — and pushes it out by the shallowest of the
three edges.

Two versions, both measured against a run with it switched off, on the figure
it exists to lower:

| two islands at once | 120 Ma | 140 Ma | 160 Ma | 200 Ma |
|---|---|---|---|---|
| **off** | **0.002%** | **0.005%** | **0.009%** | **0.022%** |
| pushing the points apart | 0.009% | 0.046% | 0.081% | 0.069% |
| moving the islands bodily, stiffness 0.35 | 0.012% | 0.035% | 0.050% | 0.047% |
| the same, stiffness 0.05 | 0.020% | 0.081% | 0.117% | 0.089% |

The first version deserved to fail. A contact between rigid bodies moves the
bodies; pushing the intruding point out and the host triangle's corners back
dents both islands exactly where they touch, and `holdIslands` then spends the
rest of every sweep undoing the dent. The tell was half a million contacts over
a run with the deepest never falling below 40 km — two constraints pulling
against each other rather than a solver settling. Resolving the contact as
impulse over mass, so each island moves as a whole and nothing is deformed,
halves the damage and is still worse than doing nothing.

**Softer is worse**, and that is the finding. Not monotonic in the stiffness
means this is not a shove that wants tuning down: a weak push does not resolve
a contact but does keep nudging islands about, so it adds noise that puts the
overlap somewhere else. The worst island's shape loss climbs with it, 32%
against 15% at 200 Ma, so the islands are being torn as they are pushed.

What the numbers say together is that the overlap is not a missing rule. It is
what this model does when rigid blocks stop fitting. At 200 Ma the sphere is 61%
of today's and 39% of the crust has to cover it exactly; seventeen rigid islands
that may not overlap, on a fixed total area, is a packing problem local
relaxation cannot solve, and pushing one out makes the overlap reappear next
door. Nearly all of it is past 160 Ma, where the sea floor has run out and the
frames are the solver settling rather than history.

The code and the knob stay (`CONTACT_K`, default zero) because the next idea
about this will need both, and so does the measurement, which is the part that
was actually missing.

### And then the measurement said why

Two numbers taken afterwards turn this from a defeat into an answer.

The first is *when* each overlapping pair was last one block, which the age grid
knows: walk the shortest path from one island to the other and take the oldest
sea floor crossed. `tools/measure-rifts.ts` does it.

| pair | dated sea floor between them | last one block | overlaps at |
|---|---|---|---|
| Arabia &ndash; Africa | none at all | always joined | 120&ndash;200 Ma |
| the two Australian cratons | none at all | always joined | 160&ndash;200 Ma |
| Baltica &ndash; Arabia | none at all | always joined | 160 Ma |
| West Australia &ndash; East Antarctica | 175 steps of 201 | before 94 Ma | 160, 200 Ma |
| Canadian shield &ndash; Amazon craton | 29 steps of 201 | before 148 Ma | 200 Ma |

**Every pair that overlaps overlaps only while the data says it was one block.**
Three of them are not separated by ocean even today: they are two rigid blocks
with a weak neck between them, the Red Sea rift and the Australian mobile belt,
and `findIslands` is right to hold them apart, since the neck is what deforms.
The other two parted at 94 and 148 Ma and overlap only further back than that.

The second number is how *deep*, which a share of the sphere cannot say and
which is now reported every frame beside it:

| | 90 Ma | 120 Ma | 140 Ma | 160 Ma | 200 Ma |
|---|---|---|---|---|---|
| share of the sphere under two islands | 0.000% | 0.002% | 0.005% | 0.009% | 0.022% |
| deepest interpenetration | 0 km | 25 km | 29 km | 25 km | 28 km |

Twenty-five to twenty-nine kilometres, on a mesh whose triangles are 129 km
across. A fifth of a triangle, and it never grows: the area rises with time
because the contacts get longer, not because they get deeper. Arabia's 12,455
km&sup2; on Africa spread along 2,500 km of Red Sea is a strip five kilometres
wide.

So this is two rigid blocks meeting along a suture, overlapping by less than the
triangulation can resolve. Which is also, in hindsight, exactly why pushing them
apart wrecked the reconstruction: a five-kilometre error being corrected by
moving whole continents on a 129 km mesh. The right response to a residual below
the resolution is to report it and leave it alone.

## The rotation nothing was measuring

A reader looking at 200 Ma said Africa stays much too far north, that southern
Africa should finish on the pole and drive Antarctica up into the Pacific, and
that Europe and Arabia are being crushed for want of the room that would make.
They had found the one join with a known date that this scorecard did not
score.

East Antarctica sat against Mozambique and Tanzania in Gondwana, and the
Mozambique Basin opened from about 165 Ma, so by 170 the two should be together.
Scored at last, it is the worst pair in the table by a factor of three: 164 km
apart, which is close, but **5% of the shorter margin in contact** against 15%
to 40% for every other pair. They touch at a point instead of lying along each
other.

And the size of what is missing, from where the continents finish against where
they sit today. Africa's centre of area goes from 7&deg;N to 1&deg;S &mdash;
eight degrees. Africa reaches about 35 degrees either side of its centre, so its
southern tip finishes near 36&deg;S; for southern Africa to sit on the pole the
centre would have to be near 55&deg;S. That is **some fifty degrees of rotation
the model does not perform**, and it is the largest motion in the southern
hemisphere. Antarctica, for its part, comes up only from 87&deg;S to 69&deg;S.

This is worth writing at length because of what it says about the day's other
results. Four constraints were built and measured and all four were rejected:
holding the traced tracks smooth, fewer retriangulation passes, pushing rigid
islands out of each other, and dropping the spreading axes from the detector.
Every one was judged on the conjugate residuals and on seven scorecard pairs
that did not include this rotation. A setting that improved the southern
hemisphere could only lose by that measure &mdash; it costs something on the
pairs being watched and earns nothing on the one that was absent. **Where a
reader's eye and the numbers keep disagreeing, the numbers are the thing to
check first.** They disagreed four times in one afternoon.

The scorecard measures rather than constrains, so nothing about the
reconstruction changed when this row was added. What changed is that the failure
now has a number, 5%, and that number is in every run from here.

It was worth the page. Two days later a change made for an entirely unrelated
reason &mdash; sending un-erupted crust down inside the shell rather than
deleting it, the next section &mdash; took this pair from 164 km to **3 km**,
lifted the margin in contact from 5% to 9%, and quadrupled Africa's rotation
from eight degrees to thirty-two. Nothing was aimed at it. Had this row still
been missing, that change would have been read as a straight loss and thrown
away, which is what happened to four constraints in one afternoon for exactly
that reason.

## Swallowing the crust instead of deleting it

A reader looking at the mesh proposed the other way of un-making sea floor:
*misschien is het beter om in plaats van driehoeken weg te gooien en opnieuw te
bouwen ze naar binnen te schuiven* &mdash; rather than throwing triangles away
and rebuilding, push them inward &mdash; with the rule that *als een driehoek
binnen de aarde zit, telt hij voor de alle kracht berekening niet meer mee en
mag het opgepropt worden*: once a triangle is inside the Earth it counts for no
force and may be crumpled.

It is the more faithful reading of the hypothesis. On an expanding Earth new
crust arrives from below, so run backwards it should return below rather than
cease to exist. And the collapse it would replace is expensive:

- **46,408 collapses a run are refused**, because collapsing them would tear the
  surface. The dead crust then stays on the shell and holds the ocean open.
- **164,175 edges are flipped**, and a flip hands its new edge whatever length
  it finds. Three quarters of all the residual stretch along the traced fracture
  zones happens on ground a flip has just redrawn.
- A collapse **renames a triangle's corners**, which is why 21.5% of the shell
  at 120 Ma was painted from crust more than 300 km away, and why 43% of the
  track points and 55% of the conjugate pair ends were stored in triangles that
  had come apart.

So it is built, in `tools/lib/fold.ts`, and it is what ships; `FOLD_IN=0` gets
the collapse back. Nothing is deleted and nothing is renamed: the triangle stays
in the mesh, keeps its corners, and is pulled down inside the shell by however
much crust lies between it and the nearest living shore, measured through the
mesh along present-day rest lengths.
The depth is compressed as `R&middot;exp(-d/R)`, which is the exact hanging
length while there is room &mdash; and there is not always room. Taking today's
60,000 km of ridge, the crust that has not formed yet needs a curtain 542 km
deep at 10 Ma, 2,844 at 60, and 4,496 at 120 Ma against a radius of 4,373. Past
roughly 100 Ma there is not enough Earth to hang it in, so the surplus turns
into crumpling, which self-intersects and is allowed to.

### What closes the ocean, and the rule that had to bend

Run with the dead crust simply switched out of every force, the ridges never
shut. A uniform shrink moves the two flanks and the gap between them by the same
factor and closes nothing, so at 20 Ma the surviving crust covered 95.7% of the
sphere it was supposed to tile and the continents crawled.

The closure has to come from somewhere, and the honest place is the top of the
curtain. A dead triangle with corners either side of a ridge is not saying
nothing: the crust between those corners does not exist yet, so they belong in
the same place. That is what a collapse used to assert by merging them, and here
it is a spring of rest length zero. **A triangle inside the Earth carries no
force; a triangle straddling the surface still does.**

That works, and then a second reading of the rule turned out to matter more. The
reader also drew the cross-section: *we kunnen het vervormen van driehoeken dus
minimaliseren als ze dus een beetje naar beneden mogen bewegen voordat ze
helemaal plat tegen elkaar aan knallen.* Two things came out of chasing that.

**The lip.** Crust either side of a shutting ridge does not have to stay flat on
the sphere while the gap closes. If it may tip down into the slot, the triangles
rotate instead of deforming. Pinned hard to the sphere they have no such
freedom and the closure has to come out of their own length. So the pull back
onto the shell is released within 400 km of a closing rim and full strength away
from it, and stays one-sided everywhere: crust may dip below the shell, never
sit above it.

**Sea floor does not shorten.** Stretching and shortening are not the same thing
to seven kilometres of basalt. It pulls apart readily &mdash; that is a rift,
and the model always allowed it &mdash; but shortening oceanic lithosphere means
subducting or folding it. Resistance had been symmetric in both directions since
the first solver, and that is precisely what the fold exposed: measured at 40 Ma
with the rim closing, the crust that exists ended up covering 93.4% of the
sphere against the 99.1% its own area asks for, and the deficit was not spread
&mdash; **young middling-strength crust lost 21.2% of its area** and old weak
crust 6.7%, while the cratons lost 0.2% and the median triangle was within 0.3%
of its rest size. The ridges themselves shut: only 0.65% of the sphere was
still under an unshut rim. The closure was being paid for by crushing the sea
floor beside the ridge instead of moving the plate behind it.

Asked to resist shortening, and with the whole curtain rather than only its rim
pulling its ends together, that mostly goes away: 98.6% covered against 99.1%
wanted, bare sky 6.69% down to 1.54%, young middling crust from &minus;21.2% to
&minus;9.3%.

### What it actually does, over the whole run

Measured to 40 and 60 Ma, the fold looked like a plain loss on the conjugate
pairs and it was written up here as one. Run to 200 Ma it is nothing of the
kind. It is a **trade, and the two sides of it are large**.

The pairs held back from the solver, median separation:

| Ma | 20 | 40 | 60 | 80 | 100 | 120 | 140 | 160 |
|---|---|---|---|---|---|---|---|---|
| collapse | 169 | **187** | **228** | 361 | 314 | **303** | **494** | **711** |
| fold | **146** | 238 | 287 | **306** | **313** | 435 | 620 | 776 |

Better early, worse in the middle, worse deep. But the named continental joins
&mdash; the ones with dates from the geology rather than from this model's own
tracing &mdash; split the other way, and they split along a line:

| pair | joined by | collapse | fold |
|---|---|---|---|
| Antarctica &ndash; Africa | 170 Ma | 164 km, 5% | **3 km, 9%** |
| Australia &ndash; Antarctica | 100 Ma | 38 km, 28% | **18 km, 35%** |
| Antarctica &ndash; S. America | *watched* | 24 km, 20% | **3 km, 23%** |
| Greenland &ndash; N. America | 60 Ma | 0 km, 36% | **0 km, 40%** |
| South America &ndash; Africa | 180 Ma | **0 km, 40%** | 10 km, 11% |
| India &ndash; Africa | 120 Ma | **184 km, 15%** | 594 km, 0% |
| North America &ndash; Africa | 190 Ma | **0 km, 15%** | 733 km, 0% |

**Every southern join improves and every Atlantic join collapses.** And the
first row is the one this document spent a page on: Antarctica against
Mozambique was the worst pair in the table by a factor of three, the join no
scorecard had been measuring, and the fold closes it from 164 km to 3.

So does the rotation behind it. Africa's centre of area, which has to travel
south for southern Africa to reach the pole, goes from 7&deg;N to 1&deg;S under
the collapse &mdash; eight degrees, against the fifty the reader's eye asked
for. Under the fold it goes to **25&deg;S: thirty-two degrees**, four times as
much, putting Africa's southern tip near 60&deg;S. India goes from 21&deg;N to
19&deg;N under the collapse, which is to say it does not move; under the fold it
crosses the equator to 13&deg;S.

That is the motion a reader identified as the model's largest missing piece, and
a change made for an unrelated reason delivers most of it. What it costs is the
Atlantic: North America and Africa finish 733 km apart instead of touching.

And it costs the tiling, which the collapse was structurally incapable of
getting wrong:

| | 60 Ma | 120 Ma | 200 Ma |
|---|---|---|---|
| bare sphere, collapse | 0.00% | 0.00% | 0.00% |
| bare sphere, fold | 2.06% | 5.13% | 6.58% |
| two islands in one place, collapse | 0.000% | 0.002% | 0.069% |
| two islands in one place, fold | 0.000% | 0.321% | 0.764% |
| weak-crust strain, collapse | 4.3% | 7.1% | 14.0% |
| weak-crust strain, fold | 7.0% | 11.2% | 16.3% |

And it costs the drawing, which is where a reader looked first: *het valt me op
dat wanneer edges flippen de driehoekjes grijs worden.* They do, and the grey is
this document's own suture colour, painted where a triangle's corners are more
than a couple of hundred kilometres apart on today's Earth &mdash; the signal
that its inside is being painted by interpolating across crust that is not
between them. Under the collapse that share was 2.0% of the shell at 13 Ma and
31% at 200. Under the fold it is **4.8% and 50.3%**.

Which is the opposite of what the fold was supposed to buy. Nothing is renamed
any more &mdash; that was the whole argument for it &mdash; but a flip carries
corners apart just as effectively as a collapse did, and with the collapse gone
the flips are the *only* mechanism and they do 1.75 times the work: 287,643 in a
run against 164,175. **Removing the renaming did not preserve the crust's
identity; it moved the loss into the one mechanism left.** The median triangle is
untouched, 129 km across at 90 Ma as it was on day one; the loss is a tail
concentrated along the closing ridges, p90 427 km at 60 Ma and p99 1,513.

The flips are not optional. Switched off entirely under the fold the closure
fails: bare sky goes from 6.58% to **20.23%** at 200 Ma, the share still under an
unshut ridge from 8.14% to **22.46%**, inside-out triangles from 0.93% to 2.92%,
and the held-out pairs at 120 Ma from 435 km to 691. A rim triangle can only
contract if its edges point across the ridge, and it is a flip that re-points
them once the crust either side has slid. Under the fold, flipping *is* the
closure.

One part of the grey was a mistake and is fixed. A single flip replaces a quad's
diagonal, and over all 122,880 interior edges of the present-day mesh that joins
two apexes **178 to 228 km** apart, median 213. The tint started at 220 &mdash;
*inside* that range &mdash; so most single flips tinted, and a single flip
bridges nothing: the quad still covers exactly the ground it covered before,
drawn the other way. Started above the widest single flip instead, at 240 km,
the figure goes from 4.8% to 4.2% at 13 Ma and 50.3% to 47.8% at 200. Which
settles what it was: a small false positive on top of a large true one.

What would actually reduce it is the graded mesh, again and for the same reason.
A triangle slivers because 129 km of crust has to absorb a closure of ten
kilometres a million years; it is flipped because it slivered.

The bare figure is not quite the same claim under the two. A closed
triangulation of a sphere covers every direction whatever shape its triangles
are, so the collapse's 0.00% was partly true by construction &mdash; its area
error went into stretched seam triangles instead, 31% of the shell by 200 Ma.
The fold has no such refuge and shows the error as sky. Eleven times the island
overlap is a real regression with no such excuse.

### Right angles, no dents, and what that costs

A reader looking at the section asked for two things by name: *de randen moeten
scherper: we moeten streven naar 90 graden vouwen op de oppervlakte en kuilen
voorkomen* &mdash; sharper edges, aim for right-angle folds at the surface, and
no pits &mdash; having already said the flips should come off *ook al geeft dat
tijdelijk een slechter resultaat*, even if the result is temporarily worse.

Both are geometry the fold was getting wrong for a reason worth naming. A sunk
point knew only how *deep* it belonged, so it kept whatever sideways position
the shrink left it with: one mesh spacing down and one mesh spacing sideways
from the shore, which is a **forty-five degree slope**, not a fold. And the lip
&mdash; releasing the pull back onto the sphere near a closing ridge, so crust
could tip into the slot rather than be squashed into it &mdash; did exactly what
it says: it dished the sea floor either side. Those are the pits.

So the BFS that measures the hanging depth now also carries the **root**: the
nearest point still on the surface, which is the line the crust folded over. The
curtain hangs under that, not under itself. And the lip is off by default.

Measured over the run, with the flips off as asked:

| | 20 Ma | 40 Ma | 80 Ma | 200 Ma |
|---|---|---|---|---|
| fold off vertical | 12&deg; | 6&deg; | 4&deg; | 3&deg; |
| deepest surface point below the shell | 0 km | 0 km | 1 km | 1 km |
| surface points more than 13 km down | 0.00% | 0.00% | 0.00% | 0.00% |

A fold of three to twelve degrees off vertical is a surface turning down at 78
to 87 degrees, and nothing dishes anywhere: not one surface point in forty
thousand is a tenth of a mesh spacing below where it belongs.

The first version of it cost dearly, and for two reasons that turned out to be
the same reason twice. Pinned, the curtain could no longer drift towards the
closing flanks: bare sky went from 20.23% to 28.75% at 200 Ma and the share
under an unshut ridge from 22.46% to **48.08%**. Half the sphere under a ridge
that had not shut.

### Closing the gaps

The reader again: *we moeten de gaten sluiten. hoe kunnen we dat doen? extra
horizontale "kracht" toekennen aan vertices met 90 graden?* Extra horizontal
force on the points at the fold. That is the right instinct and it took two
measurements to find where it belonged.

**The rim was already shutting.** Measured every frame: the median closing
triangle's edges are 57 km apart on the sphere at 10 Ma, 24 at 20, 7 at 30 and
**0 at 40** &mdash; fully shut &mdash; while the live crust beside them sits at
96 to 99% of its own rest length. So the closure was not being resisted by the
crust and the ridges were not failing to close. The gaps were somewhere else.

**They were in the pin.** Two leaks, both from applying a constraint to one of
the two pieces of rock it is between:

1. *The spring was asking for a distance.* A triangle of un-erupted crust says
   its corners belong at the same place *on the sphere*; how deep each sits is
   the fold's business. Since the curtain started hanging under its own fold
   line a great many of those edges run straight down &mdash; a shore point to
   the point pinned directly beneath it &mdash; and asking those for zero
   length pulls the shore inward, where `relaxToSphere` and the fold undo it on
   the same sweep. So the closing pull now acts along the sphere and each end
   keeps its own radius exactly. A vertical edge asks for nothing; an edge
   across a ridge asks for all of it.
2. *The pin had infinite mass on one side.* The sunk point was moved to sit
   under its shore and the shore was left where it was. Every sweep, the
   curtain's own contraction was written into the sunk points and then thrown
   away, and none of it reached the crust that had to move. Now each shore point
   feels back the mean of what its own hanging crust is pulling at &mdash; the
   mean, not the sum, or the Pacific would drag its margins about by weight of
   numbers.

And **only the top of the curtain needs pinning at all**. The right angle is a
property of the first ring of sunk crust; pin all of it and the curtain becomes
kinematics rather than rock, spanning the open ocean for as long as the ocean is
open. One mesh spacing, 150 km, tested against 80, 300 and 600.

Measured at 40 Ma, each change on top of the last, flips off throughout:

| | bare | unshut ridge | pairs | fold |
|---|---|---|---|---|
| whole curtain pinned, distance spring | 7.63% | 19.04% | 381 km | 6&deg; |
| closing pull along the sphere | 7.44% | 18.87% | 341 km | 3&deg; |
| pin only the first ring | 4.10% | 10.27% | 249 km | 3&deg; |
| shore feels the pin back | **3.57%** | **3.73%** | **222 km** | 9&deg; |

The last row is off the trade-off curve rather than on it. Pinning less buys
closure at the cost of the fold &mdash; 80 km gives 3.62% bare and 3.77% unshut
but a fold of 24&deg; &mdash; whereas letting the shore feel the pin gets the
same closure at 9&deg;. Over the whole run:

| at 200 Ma | flips on | flips off, one-way pin | flips off, shore feels it |
|---|---|---|---|
| bare sphere | 6.58% | 28.75% | **13.09%** |
| under an unshut ridge | 8.14% | 48.08% | **15.73%** |
| covered twice | 1.68% | 4.22% | 2.87% |
| fold off vertical | &mdash; | 3&deg; | 1&deg; |
| deepest surface point down | &mdash; | 1 km | 6 km |
| pairs at 40 Ma | 238 km | 381 km | **222 km** |

**The held-out pairs at 40 Ma are now better with no retriangulation at all than
they were with it.** The bare figure is still twice the flips-on run and that is
what is left to close. Every piece is a knob: `FLIP_PASSES=6`, `HANG_KM=0`,
`SHORE_SHARE=0`, `CLOSE_TANGENT=0`.

A run takes 4m17s, down from 10m23s with the flips.

### Which is shipped, and why

The fold, for now, because the join it fixes is the one with a date and the
joins it breaks are in the half of the world this model was already fitting
best. That is a judgement, not a result, and the numbers above are all here so
it can be reversed: `FOLD_IN=0` restores the collapse exactly &mdash; same
frames.bin to the byte.

The first attempt at shipping it did not ship anything, and the way it failed is
worth recording. The reconstruction is not committed; it is regenerated from the
textures by `pnpm build`, on a reader's machine and in the Pages workflow alike.
So the fold, which lived behind an environment variable that only a local shell
set, was written up, committed and deployed &mdash; and the globe on the site
was still the collapse. The check that exists precisely to catch that, *quotes
the run it ships with*, passed: `pnpm build` was calling the script that
**refills** MODEL.md's generated tables before the test compared them, so the
committed numbers were being checked against themselves. Two things are fixed.
The solver's default is now the shipped model rather than an environment
variable, and the build no longer rewrites the documents it is about to be
checked against.

A generated table is only evidence if something can fail. This one could not,
for as long as the thing that wrote it ran first.

What the trade says is that the two halves of the world are being solved by
different mechanisms, and the model has never had to choose before. The Atlantic
is fitted by ridges closing along their length, which a topological collapse does
perfectly and a spring does badly. The southern rotation needs whole plates to
swing, which the collapse's hard, local shortening prevents and the fold's softer
closure allows. Neither is wrong about its own half. The next thing to build is
not another closure but the one the same reader proposed alongside this: a mesh
graded by spreading rate, coarse where nothing deforms and fine where it does.
The closure is quantised to a 129 km triangle whatever the age grid says
vanished, and the Atlantic removes about 10 km of it in a million years &mdash;
which is exactly why a spring cannot close it and a collapse must.

## The one number in the strength table that was wrong

A reader held the globe up against a published crustal thickness map and asked
whether ours was right &mdash; in this model the Arabian Peninsula looked
thicker than the Himalaya. It is right: measured at eight places against that
map, Tibet 72 km against about 70, Arabia 42 against 38, the Altiplano 63
against 65, the central Pacific 6.9 against 7. What they were reading was the
*strength* map, where an orogen is deliberately the weakest continental crust
there is despite being the thickest on the planet.

Then the better question: *was de crustal strength onze uitvinding toch?
misschien moeten we dat laten varen.* Partly ours. The classification is ECM1's
and published; the eleven numbers this model turns each class into are ours,
reasoned about and never measured. So they were measured.

`FLAT_K` gives every triangle the same strength and leaves everything else
alone &mdash; the islands of strong crust are baked into mesh.bin and still
held. `STRENGTH=thickness` takes strength from the thickness grid instead, the
reader's own suggestion: thicker is stronger. At 40 Ma, on the pairs held back
from the solver:

| | bare sphere | unshut ridge | pairs | weak-crust strain |
|---|---|---|---|---|
| the eleven class values | 3.57% | 3.73% | 222 km, 44% | 4.7% |
| every triangle the same, 0.6 | 3.61% | 3.78% | 224 km, 44% | &mdash; |
| every triangle rigid, 1.0 | 3.91% | 4.11% | 234 km, 41% | &mdash; |
| thickness, thicker is stronger | 2.21% | 2.33% | **149 km, 57%** | 10.8% |

**Flattening the table costs two kilometres out of 222.** Eleven values
reasoned about at length do as much as one arbitrary number. Only *that* some
crust is deformable earns anything &mdash; making it all rigid costs twelve
kilometres. And the reader's suggestion beat the table outright, at every epoch:
147 km to 107 at 20 Ma, 445 to 347 at 80, 1194 to 1032 at 160.

It also doubled the strain asked of weak crust, 21.0% to 43.4% at 200 Ma, and a
model that may stretch anything can close anything. So it was split in two,
because it did two things at once: it took seven kilometres of basalt from 0.60
to 0.03, and it took shields from 1.0 to about 0.5. `OCEAN_K` does only the
first:

| at 40 Ma | bare sphere | pairs | craton strain | weak strain |
|---|---|---|---|---|
| as it was | 3.57% | 222 km, 44% | 0.2% | 4.7% |
| sea floor at 0.05 | 2.75% | **183 km, 54%** | **0.2%** | 6.7% |
| sea floor at 0.20 | 2.76% | 188 km, 54% | 0.2% | 6.7% |
| thickness everywhere | 2.21% | 149 km, 57% | 1.3% | 10.8% |

Two thirds of the gain on the pairs and most of it on the bare sky, for a third
of the strain, with the cratons left exactly as rigid as they were. And 0.05
against 0.20 is five kilometres on 183, so this is a magnitude rather than a
tuning.

Which names the mistake. **SOCE, normal ocean floor, had 0.60** &mdash; between
a stable basin and a platform, and a tenth away from the 0.70 that would have
made the quiet Pacific a rigid island. It is seven kilometres of basalt, and
every closure in this model has to be absorbed by sea floor. It is 0.10 now,
and that is what ships: the held-out pairs at 40 Ma go from 222 km to 183 and
44% to 54%, Antarctica against Mozambique from 11 km to 4, South America
against Africa from 21 km to 6, and the weak-crust strain at 200 Ma barely
moves, 21.0% to 21.6%.

What is still untested is the other half of the invention: the threshold of
0.70 that decides which crust becomes an island held rigid, and therefore the
seventeen islands themselves. The flattening test above kept them, so it says
nothing about what they are worth.

## Land crushed to a line, and the accounting that found it

A reader at 43 Ma turned the mesh on and photographed two bright seams &mdash;
one off Alaska, one through the Caribbean &mdash; where the triangulation had
been flattened until its edges piled onto each other. Then the right question:
*kun je eens kijken of het aantal samengeperste land ongeveer even groot is als
de spleten die we hebben?*

It is not about equal. It is larger, at every epoch. Rest area here is the
triangle's area on today's Earth, so the squeeze is very slightly overstated
&mdash; the solver also un-stretches rifted margins, which asks about a percent
less of the globe:

| | bare sky | squeezed out of continent | out of sea floor | stretched back in |
|---|---|---|---|---|
| 20 Ma | 4.6 Mkm&sup2; | 13.2 | 17.7 | 27.0 |
| 43 Ma | 11.8 | **19.2** | 28.3 | 33.4 |
| 80 Ma | 17.9 | 26.4 | 23.2 | 27.3 |
| 120 Ma | 23.8 | 33.5 | 11.9 | 19.4 |
| 200 Ma | 25.2 | **45.2** | 0.0 | 18.2 |

The budget closes: at 43 Ma, &minus;19.2 &minus;28.3 +33.4 is &minus;14.1
against a measured area deficit of 14.0. So these are one failure and not two.
**The model pays for a closure it cannot make by flattening continent
somewhere else**, and by 200 Ma there is no sea floor left to take any of it:
the sea-floor column reaches zero while the continental one reaches 45 million
square kilometres, a fifth of the whole shell's area.

And it was allowed to. `foldMargin` is the barrier that stops a triangle
turning inside out, and it stood at **0.08** for everything &mdash; a triangle
could be squeezed to a twelfth of its own area before anything objected. The
comment beside it said as much: low enough that badly sheared sea floor can
still be squashed nearly flat. For sea floor about to be swallowed that is
defensible. For continent it is not.

So continental crust has its own floor. Shortening continent means thickening
it, and halving a triangle's area means doubling its thickness, which is what an
orogen is; much past that is not a thing that happens. Measured at 45 Ma:

| floor on continent | under half its area | under a fifth | flattest keeps | squeezed | pairs |
|---|---|---|---|---|---|
| 0.08, as it was | 8.07% | **5.53%** | **0.0%** | 20.0 Mkm&sup2; | 193 km, 52% |
| 0.35 | 8.23% | 0.56% | 2.2% | 18.5 | 192 km, 52% |
| **0.50, shipped** | 5.46% | **0.20%** | 0.9% | 17.3 | **191 km, 52%** |
| 0.60 | 3.13% | 0.16% | 3.1% | 16.3 | 191 km, 52% |

A triangle keeping *nothing* of its area is what the bright seams were. At 0.50
the share of continent squeezed past a fifth falls by a factor of 28, and it
costs nothing at all: the held-out pairs move two kilometres the right way,
bare sky does not move, the strain asked of weak crust goes 7.3% to 7.4%.

0.60 measures marginally better still and 0.50 is the number with an argument
behind it, so 0.50 ships.

**It is overwhelmed in deep time.** The barrier is one Newton step a sweep, and
where the convergence demanded is largest it loses: at 120 Ma 2.19% of continent
is still under a fifth of its area and at 200 Ma 4.84%, with the flattest
triangle back to keeping nothing. Early on the fix is nearly complete; late on
it is a third of one. What is left is not a bad barrier but too much convergence
asked of too few triangles &mdash; the same 129 km quantisation that holds the
gaps open.

## Asking for the area, which nobody had

A reader set out how they wanted the model to work, and it turned out the model
had never been asked for the central part of it: *alles zo veel mogelijk stijf
... maar de volume van een driehoek moet zo veel mogelijk gelijk blijven over de
hele bol.* Everything as stiff as it can be, and a triangle's area kept the same
everywhere on the crust.

That statement was not in the solver. There were edge springs, which ask for
lengths and let a triangle shear its area away for nothing, and a one-sided
barrier that only stops a triangle turning inside out. **"The area of this
triangle should stay the same" was never said.** It is now, as the same Newton
step the fold guard uses, run in both directions and towards the crust's own
area rather than towards a floor beneath it.

It is the largest single improvement in a while, and it improves the two things
that had been trading against each other:

| Ma | pairs before | pairs after | strain on weak crust |
|---|---|---|---|
| 20 | 119 km, 69% | 139 km, 70% | 4.3% &rarr; **2.0%** |
| 40 | 183 km, 54% | **151 km, 59%** | 6.9% &rarr; **2.7%** |
| 60 | 276 km, 32% | **251 km, 38%** | 9.4% &rarr; **4.0%** |
| 80 | 386 km, 12% | **375 km, 18%** | 11.7% &rarr; **4.8%** |
| 120 | 761 km, 8% | **736 km, 8%** | 14.0% &rarr; **5.8%** |

Against the budget the data allows, the overspend roughly halves: ten times over
at 20 Ma becomes five, fifteen at 40 becomes nine, sixteen at 60 becomes nine.
Bare sky does not move at all (2.75% to 2.78% at 40 Ma). Australia against
Antarctica goes from 9% of its margin in contact to 27%. The Atlantic pairs give
a little ground, as they have to every time the crust is made less willing to
deform.

### What the first step says

The same reader asked for the first million years to be got exactly right before
going on to the second, which is the right way round and had never been possible
&mdash; frames are five million years apart, so a one-step run reported nothing
at all. It reports now, and two things fall out of it.

**It is not an iteration problem.** From 80 sweeps to 1200, the deformation at
step one goes from 9.79 to 10.33 million km&sup2; &mdash; slightly *worse*. The
solver is already at equilibrium; there is no answer sitting just out of reach.

**And the fold can barely act at all.** After one million years, **73 points of
40,962** hang inside the shell. That is 0.18% of the mesh, against about 3.2
million km&sup2; of crust &mdash; 0.6% of the sphere &mdash; that has to go
somewhere. The reason is exact: a triangle folds only once it is *entirely*
younger than the moment, and after a single step almost none is. Everything the
fold cannot take becomes deformation, and at step one the fold can take a
fifth of it.

Which names the next thing to build, and it is not a finer mesh. `build-data`
already takes four samples of the age grid inside every triangle and keeps one
number. Keeping the spread as well &mdash; the youngest and the oldest crust in
the face &mdash; would let a triangle fold *partly*: a face a third covered by
crust younger than the moment sinks a third of the way, instead of not at all.
That moves the quantisation from the 129 km mesh to the age grid's own tenth of
a degree, and it does not touch the triangulation.

### A triangle tips because one corner has to go

The reader drew the answer before the measurement asked for it, twice, and the
second time said it plainly: *als een driehoek gedeeltelijk weg zou moeten
(minstens 1 punt jonger) dat hij dan schuin naar binnen kan.* If part of a
triangle has to go &mdash; if even one of its corners is younger than the moment
&mdash; then it tips inward at an angle. Not the whole face at once, and not
per-face at all: **per corner**, which is why it tips rather than drops.

Expressed as edges it becomes a statement the data already supports. **The rest
length of an edge is the length of crust along it that still exists.** Age rises
linearly with distance from a spreading axis &mdash; that is what an axis is
&mdash; so along an edge the age is a straight line, and the surviving part is
the stretch of it older than the moment. An edge wholly older keeps its length,
one wholly younger goes to nothing, and one straddling shortens by exactly the
strip that has not erupted yet: kilometres a step, instead of whole triangles at
a threshold. The area follows exactly, because the age over a triangle is a
plane through its three corner ages, so the surviving crust is a polygon cut by
one straight line.

On the first step alone it does what it was meant to do. Bare sky 0.391% becomes
0.249%, the worst hundredth of triangles keeps 0.840 of its area instead of
0.780, and the overspend against the budget the radius curve allows falls from
2.4 times to 1.5.

Over the whole run it is **a trade again, and a sharper one than the fold's**:

| | 5 Ma | 30 Ma | 60 Ma | 120 Ma |
|---|---|---|---|---|
| whole faces | 70 km | **154 km** | **251 km** | **736 km** |
| per corner | **49 km** | 169 km | 273 km | 776 km |

Thirty percent better on the first frames, five to ten percent worse everywhere
after. The same split runs through the rest of the diagnostics. Crust covered
twice improves at every epoch (3.80% to 3.54% at 200 Ma, and 0.37% to 0.17% at
60), and South America against Africa closes from 22 km to 10 &mdash; 2 km at
its closest. But bare sky rises after 30 Ma (4.38% to 4.97% at 60 Ma), strain on
weak crust rises by about a tenth, and **triangles turning inside out rise from
almost nothing to 1.48% at 200 Ma**, which is the one number here that is not a
trade but a defect.

The cause is named and it is not the idea. There is no per-vertex age in the
data: the solver uses the youngest face touching each point as a stand-in, which
counts any point beside young crust as young. That removes about twice the crust
the radius curve allows &mdash; the budget at step one rises from 4.03 to 7.64
million km&sup2; &mdash; and removing too much, too early, is exactly what would
buy the first frames and cost the later ones.

`build-data` already samples the age grid at all three corners of every triangle
&mdash; three of the four samples it takes &mdash; and keeps none of them.
Keeping them is what makes this exact, and like the fold itself it does not
touch the mesh. It is shipped as it stands, because the reader asked to see it
rather than to read about it, and because the shape of the trade is the argument
for finishing it rather than for reverting it.

### Then the data was fixed, and most of the trade went with it

Keeping those samples is one lookup per vertex and it did exactly what the
measurement said it would. The deformation budget at step one falls from 7.64
back to 4.56 million km&sup2;, against 4.03 for the old face-wise rule &mdash;
so the stand-in really had been asking the model to remove about twice the crust
the radius curve allows. And the defect goes with it. Triangles turning inside
out, 1.48% of the shell at 200 Ma and 0.46% at 60 under the stand-in, are 0.00%
out to 40 Ma and 0.86% at 200, which is the figure the model had before any of
this.

With that fixed the whole sharp trade turns into a small, consistent gain. On
the scored pairs, median miss:

| | 5 Ma | 30 Ma | 60 Ma | 120 Ma |
|---|---|---|---|---|
| whole faces | 70 km | 154 km | 251 km | **736 km** |
| per corner, stand-in age | **49 km** | 169 km | 273 km | 776 km |
| per corner, the real age | 63 km | **148 km** | **248 km** | 743 km |

Better at 5, 30 and 60 Ma and a wash at 120, where before it had been better at
5 and worse everywhere after. Pairs reunited within 200 km go from 56% to 57% at
30 Ma and 38% to 40% at 60. Bare sky is unchanged to a tenth of a percent at
every epoch, and Antarctica closes on South America to 1 km against 13.

Run head to head on the same build the two rules are nearly the same model
&mdash; 131 km against 139 at 20 Ma, 152 against 151 at 40 &mdash; which is
worth saying plainly: **the large trade written up above was not the idea
working and then failing, it was an error in both directions at once.**

**And the reason the gain is small is the next thing to fix, in the same place.**
The age at a vertex is not the lowest age along an edge. Across a spreading axis
age is not linear but **V-shaped**, with its minimum in the middle of the edge
&mdash; that is what an axis is, and interpolating straight between two corner
ages steps over it. The solver steps one million years at a time, and at a half
rate of 33 km/Myr a step's worth of crust is a strip about 33 km wide against a
mesh 129 km across: a quarter of an edge. So an edge that straddles a ridge has
both its ends older than the moment while the crust between them is younger, and
neither rule can see the strip. That is why, after one step, 73 points of 40,962
hang inside the shell when 0.6% of the sphere has to go somewhere.

Which is a sampling question and not a mesh question. `build-data` can walk each
edge and each triangle through the age grid and store what actually survives, at
the grid's own five kilometres, instead of assuming the age between two corners
is a straight line. That is where the fold stops being quantised by the
triangulation, and it is the one place left where the model is asking for
something the data was never consulted about.

### Walking the edge instead of guessing across it

So it walks. Sixteen points along every edge and sixteen over every triangle,
each one a lookup in the age grid, sorted and written to `crust-age.bin` -- ten
megabytes the browser never fetches, because only the solver wants it. The
question *how much of this edge exists at 30 Ma* becomes counting how many of
the sixteen are older than 30, which assumes nothing whatever about the shape of
the age field. Eight kilometres of resolution on a 129 km edge, and the
quantisation moves off the triangulation and onto the data.

Same build, the fold read three ways, on the pairs held back from the solver:

| | 20 Ma | 40 Ma | bare at 20 Ma | bare at 40 Ma |
|---|---|---|---|---|
| per face | 139 km, 70% | 151 km, 59% | 1.42% | 2.78% |
| per corner | 131 km, 70% | 152 km, 62% | 1.41% | 2.84% |
| sampled | **127 km, 72%** | **149 km, 62%** | **1.29%** | **2.73%** |

Best on every measure, and no triangle anywhere turns inside out.

### The bias was in the ruler

Sampling the crust immediately doubled the deformation budget, 4.56 to 7.52
million km&sup2; at the first step -- the same alarm the stand-in age had raised,
and the same shape to it: two parts of the model answering one question
differently.

That number is the gap between what the crust is asked to cover and the sphere
it has to cover, and only one side of it had changed. The solver now asks each
triangle for its sampled surviving area. The sphere came from the radius curve,
which *is* the model -- **R(t) = sqrt(A(t)/4&pi;), and nothing else sets it** --
and that was still built from one median age per triangle, faded out over five
million years with a floor under it. Which is an approximation of the sampled
share, biased twice over: a triangle a ridge runs through has a median age of its
own that says nothing about the strip in the middle of it, and the fade went on
counting crust the grid says is gone.

Give the radius curve the same sixteen samples and the gap closes: **7.52
million km&sup2; to 1.61**, three tenths of one percent of the sphere, at the
first step. The Earth comes out smaller for it, by about one and a half percent
at the end of the record. `crustScale`, the fade, is deleted; nothing uses it.

And the honest number is worse than the one it replaces, which is rather the
point. The run deforms 11.8 million km&sup2; at the first step against a real
allowance of 1.6 -- a factor of seven, where the old accounting read 1.6. Part
of what the model was being credited with absorbing was its own bookkeeping.

One check disagrees, and it is worth saying why it does not decide this. The
mesh radius curve is compared every run against the same measurement taken at
full 8192x4096 raster resolution, and that agreement got worse: 1.60% to 1.91%,
one-sided and growing with time. It is not the sampling. The mesh curve counts a
stretched margin at the size it had *before* it was stretched, because that is
what the radius has to be sized for; the reference counts today's ground as it
stands and models no un-stretching at all. That correction ramps in over each
margin's own rifting, so the gap grows with time whatever the mesh does -- and
the old 1.60% was the smaller number precisely because the fade was adding area
back that the un-stretching had taken off. Two errors pointing opposite ways.
The check is worth watching for a jump. It was never a score, and it had been
read as one.

### Then the grid itself, instead of a picture of it

At which point the input was the limit. The model had been running off
`age-map.png`, a faithful but lossy rendering of the same survey: 255 grey
levels over 280 million years, **1.1 Ma to the level**. Invisible while the
fold could only take crust that was wholly gone; not invisible at all once the
fold began walking each edge, because one grey level is 36 km of
ridge-perpendicular distance at a typical spreading rate and the walk resolves
8 km.

So `data-src/agegrid.nc`: Muller et al. 2019 Tectonics v2.0, present day, a
tenth of a degree, float ages to 338.81 Ma with NaN over whatever the survey
does not date. Of the two files offered, the 7.6 MB netCDF-4 and the 25 MB
netCDF-3 are the same data -- they agree on 3,145,333 of 3,154,532 dated cells
and carry the same NaN mask cell for cell. The larger is uncompressed and
older; the smaller is the newer revision, and h5wasm already in the tree reads
it.

Three things measured independently say the precision was real:

| | picture | grid |
|---|---|---|
| depth-age regression, same fit over the same cells | r&sup2; 0.176 | **0.263** |
| radius curve against the same measurement at source resolution | 1.91% | **1.58%** |
| conjugate pairs traceable at all | 2,470 | **2,575** |

**And it makes the model's problem bigger, which is what measuring is for.** At
the first step the crust that has to go is 2.32 million km&sup2; rather than
1.61, because a one-million-year step now removes a real 33 km strip along
every ridge instead of sometimes removing nothing at all -- every sample on an
edge could sit inside a single grey level. Bare sky at that step goes from
0.331% to 0.481%. The closure is not keeping up, and nothing is hiding it now.

Over the whole record it is not one direction. On the held-back pairs the deep
end improves and the middle gives way:

| | 5 Ma | 30 Ma | 60 Ma | 120 Ma |
|---|---|---|---|---|
| picture | 61 km, 96% | **145 km**, 56% | 244 km, 38% | 752 km, 8% |
| grid | 65 km, **99%** | 174 km, **57%** | **208 km, 50%** | **499 km, 33%** |

Read the pair counts beside those before reading the numbers, because **the
pairs are traced out of the age grid, so changing the grid changes the test as
well as the model**: 82 pairs due at 5 Ma against 74, 67 at 30 against 63, and
12 at 120 against 25. Half the test set at depth is not a comparison.

The scorecard is the ruler that does not move -- named joins with dates from
the geology -- and it splits:

| pair | picture | grid |
|---|---|---|
| North America &ndash; Africa | 1137 km | **859 km** |
| South America &ndash; Africa | 34 km | **28 km** |
| Antarctica &ndash; Africa | **3 km** | 12 km |
| Australia &ndash; Antarctica | **23 km** | 30 km |
| India &ndash; Africa | **860 km** | 1128 km |

The Atlantic join the fold had collapsed comes back by 278 km, and India goes
268 km the other way. Three better, three worse, and no verdict in it.

**So this is not shipped because it scores better. It is shipped because it is
the data**, and because every argument the model makes about a 33 km strip was
being made against a grid that could not resolve one.

## Are the pairs any good?

Everything this model is scored on rests on the conjugate pairs, and a reader
put the objection better than any measurement had:

> *ik vertrouw niet dat jij goede paren kunt vinden, als je die roze lijnen niet
> goed kan tekenen, wat je niet goed kan doen omdat de fracture zones moeilijk
> te detecteren zijn nog*

Which is exactly right, and worse than it looks. The pairs come off traced flow
lines, the lines come off fracture-zone detection, and the detection is not good
yet. **Splitting the pairs in half does not protect against this.** That split
protects against one thing only -- the solver marking its own homework. Both
halves come off the same tracer on the same data, so a systematic error in the
tracing steers the crust and grades it in the same direction at once, and no
number computed inside the model can see it. It is the one kind of error that
looks like success.

So it has to be looked at, and there is a picture for it now
(`tools/draw-pairs.ts`): every pair as two dots and the line between them, over
the flow lines they came from, over crust younger than two million years --
which is where the axes are today, and is what a pair is meant to straddle.

### Three tests that are the definition, not a theory

Two points that were one point erupted at the same moment. So the grid must give
them the same age, that age must be the age the pair claims, and neither end can
sit on crust the grid does not date at all. Nothing about plates or poles is
involved.

| | result |
|---|---|
| the two ends' ages differ by | median 0.67 Ma, ninetieth 2.02 Ma |
| off the age the pair claims by | median 0.35 Ma, ninetieth 1.08 Ma |
| an end on undated crust | 0 of 2,575 |

That rules out crude nonsense and misses the failure that matters. A point
matched to another five hundred kilometres along the ridge from its true
conjugate has the same age, sits on sea floor, and is wrong. What separates them
is **direction**: sea floor leaves its axis along the spreading direction, which
is the direction the age climbs fastest, so a true pair's join runs along the
local age gradient. Median 14 degrees off, ninetieth 48, and **11.4% more than
forty-five degrees out**.

Split by age, the share past forty-five degrees is 11.1%, 13.3%, 5.1% and 15.3%
over 0-10, 10-30, 30-60 and 60-200 Ma. That is what makes it real rather than a
bad ruler: a gradient is ill-defined *at* an axis, where the age turns round, so
a measurement at fault would have put all of it in the youngest band. Instead it
is worst in the oldest crust, where the score is worst.

Those 292 pairs are now dropped where they are traced, in `build-data`. What is
left has a median of 12 degrees and a ninetieth of 34, and the age tests do not
move -- 0.34 Ma off the claim against 0.35 -- so the filter removes the oblique
ones and not a random sample.

### And it changes the reconstruction by nothing at all

| | 20 Ma pairs | bare | 40 Ma pairs | bare |
|---|---|---|---|---|
| unfiltered | 139 km, 76 pairs | 1.41% | 180 km, 68 pairs | 2.96% |
| filtered | 131 km, 62 pairs | **1.42%** | 167 km, 63 pairs | **2.96%** |

Bare sphere is the only measure here that owes nothing to a pair, and it does not
move to two decimals. The pairs score improves by about what dropping the worst
members of a test set improves it by, which is no evidence of anything.

So the 11% were noise that averaged out, not a bias that steered. The other
answer says the same from the other side: **switch every pair off** with
`PAIR_K=0` and bare sphere goes from 1.41% to 1.85% at 20 Ma and 2.96% to 3.69%
at 40. Pulling on them closes gaps that no pair is used to measure, so the bulk
is carrying real signal. The filter is right because the data was wrong, not
because the model wanted it.

### What the picture shows that the numbers had not

Coverage. Of the pairs, 47.7% are in the Atlantic and **12.4% in the Pacific**,
which is a third of the planet -- and the Pacific's median pair is 20 Ma against
the Atlantic's 60. Old Pacific sea floor has no conjugate to be paired with,
because in the standard reading its other flank has been subducted. On an
expanding Earth it has not been subducted, it is what has to close, and **the
pairs are systematically unavailable exactly where this hypothesis makes its
boldest claim** -- and exactly where the first step's gaps and crushed
triangles are: the East Pacific Rise, the Mariana and Tonga trenches, the Scotia
arc, the South China Sea.

That is not a flaw in the pairs. It is the shape of what they can and cannot
say, and it means the Pacific has to be got right by some other argument.

### The flow lines came back, because a reader wanted to judge them

They were taken off the globe once, as the same claim told twice: a track is the
path one piece of crust took away from its ridge, and a pair is the two ends of
that path at a given age. That was right about the arithmetic and wrong about
the work. A pair is two dots and says nothing about where its crust went; the
path is the thing a reader can look at and call wrong, and every correction to
the direction field in this document came from someone doing exactly that. So
the paths are drawn again, behind their own switch, in the same form as
`tools/draw-paths.ts` draws flat.

## Which way the crust went, read off the age grid's jumps

The direction field decides everything downstream: follow it and you have the
paths, the paths give the conjugate pairs, and half of those pull the solver. Up
to here it was fitted through the grooves in the gravity fabric alone. It now
has a second witness, from a survey the grooves have no part in, and a reader
found it by looking at a scratch picture and saying what it showed.

The picture was the size of the age jump between neighbouring cells, in the
units a spreading gradient is quoted in:

| age jump, Ma per 100 km | |
|---|---|
| median | 3.7 |
| ninetieth centile | 14.3 |
| ninety-ninth centile | 44.5 |

A typical spreading gradient is 2 to 6, so the top of that distribution is not a
slope at all. Over most of an ocean the age climbs steadily, a few million years per hundred
kilometres. In strips it does not: one segment of ridge spread faster than its
neighbour, the isochrons in the two strips are offset, and on the dividing line
between them the age steps by the whole offset over a couple of cells. A reader
looked at that and put it plainly &mdash; many places have bands of gradients,
and the dividing line between the bands is a good indicator for a path. It is:
that line is the trace of the transform that separated the two segments, and the
crust ran *along* it.

`tools/lib/age-steps.ts` measures the jump over the whole grid and finds the
lines in it with the same structure tensor the grooves use. Two kinds of bright
line live in that field and only one of them is a path. The dividing lines run
with the flow. Ridge crests, and the terrace edges between the age bands the
grid was compiled from, run across it and say nothing a path wants &mdash; the
age gradient already knows the crust crosses them.

What tells them apart is the regional climb, and *where* it is read is the whole
of it. Read on the line, a disc wide enough to average the terracing also
averages both sides of the offset, so what it reports is the offset: a climb
square to the line, which refuses every fracture zone the rule exists to admit.
That is not hypothetical, it is the failure the first attempt at this shipped in
a picture, and a reader spotted it in the Weddell Sea. Read a few hundred
kilometres off the line on each flank, each flank's own climb is clean, and
across a transform the two flanks travelled the same way &mdash; which is what
makes it a transform.

The gate is thirty degrees:

| | cells |
|---|---|
| a jump line running with the flow, which anchors the field | 7,261 |
| a jump line running across it, ignored | 17,368 |
| the climb on both flanks too flat to say, ignored | 148 |

`flowField` takes several anchor fields now and adds their doubled angles, so
the jump lines and the grooves are two readings blended rather than one
overriding the other, and where they disagree the answer shortens into doubt
instead of one of them winning. `tools/draw-steps.ts` draws the field with one
tick per cell in the colour of what was done with it, which is how the gate was
judged.

The step it makes the biggest difference to is the one the grooves were worst
at: the direction a path leaves the ridge on. A ridge is an age minimum, so the
age gradient there is noise, and over a staircase of segments offset by
transforms the oldest direction on a ring is the staircase's diagonal &mdash;
paths left Brazil at 31 degrees where the answer is about 90. The previous
attempt at that admitted grooves on their neighbours' agreement instead, which
fixed the bearing and cost ninety kilometres of pair residual; the jump lines
fix it with evidence the age grid itself provides, so that clause is off. See
`grainSpreadDeg` in `tools/solve.ts`'s sibling `tools/build-data.ts` for the
measurement.

### Longer lines, and the reason they were short

A reader asked for longer lines and said what the short ones do wrong: the line
suddenly bends towards a sharper contrast between young and old where it should
have carried straight on over the gentler gradient.

The first reading of that was to prefer the shallowest climb at every step
&mdash; the slowest route over the gradient rather than the shortest. That is
worse, and the picture says so at a glance: every line drifts a little towards
its own shallow side, the drift differs from one line to the next, and the
family that must never meet crosses itself all over the South Atlantic. Two
paths crossing off a ridge is two pieces of crust passing through each other.

What was actually ending the walks was not a wrong turn at all. The age
gradient is read over four points forty kilometres out, and one undated cell
anywhere in that cross makes it nothing: **528 of 785 flanks ended on that,
against 30 that had undated crust in their way.** Near a plateau, an aseismic
ridge, a coastline, or any of the holes the survey left, the cross catches a
hole while the path has hundreds of kilometres of good sea floor in front of it.

So the gradient no longer decides whether to carry on. The fitted field covers
the whole sphere and is the direction; the age ahead &mdash; one sample, not
four &mdash; is the check; and the rule that the age must keep rising is what
ends a flank. Total walking rose 44%, the ninetieth centile of path length from
6,600 to 7,520 km, and the flanks now stop for reasons that are about the ocean
rather than about the probe: 390 on undated crust, 370 on the age falling, 76
after stepping over a hole and picking the line up on the far side.

The bend itself is refused rather than steered around: a step whose climb is
more than two and a half times the path's own looks in a thirty-degree cone for
one that keeps to its rate, and takes the one that turns least. It fires on 788
of 41,025 steps, which is what a rule that corrects one error rather than
replacing the direction field should look like.

### One-sided paths, for the crust with no other half

Half the ocean has no conjugate left: the Pacific off California, the Weddell
Sea, the sea west of Australia. In the standard reading the other flank was
subducted; on an expanding Earth it is what has to close. Either way there is
nothing to pair that crust with, and the section above on coverage is the same
observation from the other end &mdash; the pairs are unavailable exactly where
this hypothesis is boldest.

A path over that crust is still readable. It is seeded where no two-sided path
comes within 500 km, walked down to the young end its crust closed onto, and
back out along the field. Each of its points is joined to that young end as a
pair, and those pairs **pull the reconstruction and are never scored**: a path
with no other half could never be a test of anything, and `pairPulls` in
`shared/tracks.ts` now decides that from the pair's own kind rather than from
its track number. 206 of them, against 221 two-sided paths.

They cost nothing on the score and they buy nothing on it either &mdash; 229 km
at 20 Ma without them, 228 with &mdash; which is exactly what a force that is
never scored should do to a score. What they are for is the mesh: the basins
that had no paths at all now have a direction, and whether that is right is a
question for the pictures and the scorecard, not for the pairs.

### The marks on a path, and what they cost

A reader asked for the points on a path at a fixed interval, twenty-five million
years, and for the same on the one-sided lines. Read that way the pairs
themselves come to 284 where every frame gives 1,765, and the force thins with
them:

| pairs read | at 25 Ma | reunited within 200 km |
|---|---|---|
| every 25 Ma | 210 km | 48% |
| every frame | 182 km | 62% |

So the interval is what the pictures draw and every frame is what pulls. The
one-sided pairs keep the ladder, since all of a path's own pairs share one end
and forty-one claims on one triangle is a heavier hand than eight. The marks are
coloured by the age of their crust, orange young to blue old, another reader's
choice: both ends of a pair are the same age and so the same colour, which makes
the ladder readable where a colour per pair made every claim a different hue.

### The ledger, which does not come out in this work's favour

The pictures are better and a reader says so: the Atlantic runs east-west
instead of at 45 degrees, the Pacific off California has paths where it had
none, and south of Africa and west of Australia are covered. The held-back pairs
are worse than the run this replaced:

| | 20 Ma | 30 Ma | 60 Ma | 120 Ma |
|---|---|---|---|---|
| before | 127 km, 72% | 178 km, 53% | 223 km, 44% | 548 km, 22% |
| the loose jump gate | 138 km, 59% | 245 km, 43% | 335 km, 31% | 707 km, 13% |
| **at fifteen degrees** | **126 km, 62%** | 209 km, 49% | 283 km, 23% | **543 km, 14%** |

Level with the run this replaces at 20 Ma and at 120, and still worse in
between. Two things are worth separating in what is left. The pairs are read
off these very paths, so a change to the paths changes the ruler and the thing
measured together: the count at 20 Ma went the right way, 58 to 68, which is
why the tighter gate is believable, but at 120 Ma there are seven pairs and a
median of seven numbers is not a measurement to lean on. And the share reunited
within two hundred kilometres is down at every depth even where the median is
level, which says the tail is worse rather than the middle.

It is deployed anyway, at a reader's explicit ask: they wanted to see what these
lines do to the reconstruction whether the number likes them or not. The
scorecard, which is the independent check, is mixed &mdash; Antarctica against
Africa closes to 8 km where it was 14, South America against Africa opens to 31
where it was 6, Australia against Antarctica to 47 where it was 50.


## The curtain turns the plates, and a reader had to say so

A reader put the mechanism in five lines: take Africa as the anchor, and North
America should push South America down; South America can then meet Africa
with Natal against Nigeria; South America and Africa together should push
Antarctica; Antarctica should push Australia. What the model did instead was
leave every continent near its own latitude, so at 200 Ma they overlap.

Their reading of the one-sided paths came with a prediction: follow the orange
lines and California ends up against Australia.

The mechanism was already written and switched off. `dragIslands` turns the
pull of the curtain of un-erupted sea floor hanging under a margin into a turn
of the plate it hangs from -- the only way that pull can reach a plate, since
an island moves as one rotation fitted over all of its points and a pull on a
five-thousand-point continent's shore is otherwise diluted to a few per cent.

It had been measured at 40 Ma and turned off there, and that is the whole
mistake: at 40 Ma almost nothing has been taken away, so the curtain is small
and the mechanism has nothing to do. At 200 Ma more than half the crust is
un-erupted and the curtain is the largest thing in the model. Measured over the
whole run at full gain, it does what the reader said, prediction included:

| at 200 Ma unless noted | no drag | full drag |
|---|---|---|
| Australia to North America | 2,089 km | **129 km, 5% in contact** |
| Antarctica to South America | 4 km, 15% | 4 km, **50%** |
| North America to Africa, 190 Ma | 1,252 km | **404 km** |
| India to Africa, 120 Ma | 1,208 km | **600 km** |
| South America to Africa, 180 Ma | **27 km, 7%** | 1,101 km, 0% |

Every gain is on the Pacific side and the loss is the Atlantic, in the same
proportions at every gain from 0.35 up. That is not a knob wanting tuning. It
is two witnesses contradicting each other in the same water: a conjugate pair
says how far apart two pieces of crust were at an age, and in the Atlantic
they are dense enough to already know how that ocean opened, while the drag is
the only claim there is about a Pacific whose western flank is gone.

Weighting the drag by distance to the nearest conjugate pair -- `dragFreeKm`,
so nothing within 600 km may turn its plate -- keeps the Atlantic and loses the
Pacific again, because the Pacific has two-sided pairs of its own along the
East Pacific Rise. It is measured and off.

What ships is a tenth of the gain, at the reader's ask after seeing the ladder:

| | no drag | a tenth |
|---|---|---|
| Australia to Antarctica, 100 Ma | 42 km, 20% | **24 km, 30%** |
| Antarctica to Africa, 170 Ma | 26 km, 6% | **18 km, 7%** |
| Australia to North America | 2,089 km | **1,370 km** |
| North America to Africa, 190 Ma | 1,252 km | **1,045 km** |
| India to Africa, 120 Ma | 1,208 km | **1,041 km** |
| South America to Africa, 180 Ma | **27 km, 7%** | 518 km, 0% |
| held-back pairs at 30 Ma | 209 km, 49% | **195 km, 51%** |
| held-back pairs at 60 Ma | 283 km, 23% | **276 km, 37%** |
| held-back pairs at 120 Ma | **543 km, 14%** | 650 km, 0% |
| bare sphere at 200 Ma | 13.19% | **12.98%** |

Five of the seven scorecard fits improve, the pairs improve where there are
enough of them to mean something and get worse at 120 Ma where there are seven,
and South America against Africa is the price. Which is worth stating without
the softening: that fit was the model's best number and a tenth of drag takes
it from 27 km to 518.

It also has to be said that 27 km was never as good as it sounded. The second
column is the share of the shorter margin actually in contact, and at 7% the
two coasts graze at one point and miss along the rest -- as they do in every
setting measured here, none of which reaches a tenth of a margin in contact.
The reader who asked whether that could really be the best arrangement was
right to doubt it.

And the deeper thing the sweep says: the crust does not fit on the 200 Ma
sphere in either arrangement. 13% of it is bare with no drag and 13 to 16% with,
the reconstruction stops being one block once the drag is real -- 2 plates at
200 Ma without it, 3 at a tenth, 13 to 30 at full gain -- and no pair of
margins comes close to nesting. The drag moves the continents the way a reader
says they should move. It does not make them fit.

## Two continents that have met are one plate

The drag turns each island by the curtain of un-erupted floor hanging under its
own margins, and that is right for as long as the islands are apart. The moment
they are not, it tears them: at 140 Ma the curtain under Africa's eastern margin
turns Africa east while the curtain under South America's western margin turns
it west, and the seam between them is pulled open from the middle. At full drag
the series says it without room for interpretation -- the two come to 20 km
apart at 100 Ma and are 1,587 km apart by 140. It is not the closing that
fails. It is what happens after.

So islands whose crust is within `CONTACT_KM` of each other are collected into
one body every step, from wherever they have actually got to, and the slab
pulls the body rather than its halves. Nothing is welded: this is one step's
worth of sharing a slab's pull, not a statement that two shapes are now one
shape, and the grouping comes apart again if the continents do. Seventeen
islands are thirteen bodies at 1 Ma and twelve for most of the run.

At the tenth of drag this model ships, against the same run with each island
pulled alone:

| | islands alone | as one body |
|---|---|---|
| held-back pairs at 20 Ma | 126 km, 62% | **120 km, 62%** |
| held-back pairs at 40 Ma | 206 km, 50% | **168 km, 56%** |
| held-back pairs at 60 Ma | 263 km, 33% | **243 km, 43%** |
| held-back pairs at 80 Ma | 436 km, 28% | **411 km, 39%** |
| held-back pairs at 120 Ma | **639 km, 14%** | 731 km, 14% |
| South America to Africa, 180 Ma | 391 km, 0% | **18 km, 6%** |
| Antarctica to South America, 200 Ma | **4 km**, 18% | 8 km, 18% |
| Antarctica to Africa, 170 Ma | 16 km, **8%** | 16 km, 5% |
| Australia to Antarctica, 100 Ma | 36 km, **33%** | **29 km**, 24% |
| India to Africa, 120 Ma | **1,019 km** | 1,159 km |
| Australia to North America, 200 Ma | **1,581 km** | 1,930 km |
| bare sphere at 200 Ma | 12.76% | **11.89%** |
| two islands at once | **0.98%** | 1.68% |
| worst island shape lost | 35.6% | **32.2%** |

The score improves at four of the five times it is taken and loses only the
median at 120 Ma, where the share within 200 km is the same. The South Atlantic
is the check that moves: from a 391 km miss with no margin in contact to 18 km
with 6% of it touching, and it closes at 40 Ma and stays closed for the rest of
the run instead of opening again. The price is in the Pacific fits, which were
never good, and in the crust that now lies over crust -- 1.68% of the sphere
under two islands against 0.98%, because continents that arrive together arrive
harder.

Turning the drag up on top of this does not buy the Pacific. At 0.2, 0.35, 0.5
and 1 the held-back pairs at 40 to 80 Ma fall away -- 43% within 200 km at
60 Ma becomes 20%, 10%, 17%, 17% -- while Australia against North America comes
only from 1,930 km to 1,689. The one place harder dragging pays is 120 Ma,
where full gain reaches 29% within 200 km against 14%. So the tenth stays, and
the change is the sharing rather than the strength.

Two things measured on the way that did not work, recorded because they are the
obvious ideas and someone will have them again:

- **Islands pushing each other apart does nothing.** `contact.ts` refuses
  interpenetration and pushes both islands, which is the same reader's point
  about rigid plates in its most literal form. Two million contacts a run, and
  the share of the sphere under two islands at 200 Ma goes from 0.98% to 0.95%
  as a shove and 0.89% as a torque, with no scorecard fit moving more than a few
  kilometres -- at full drag either, where the overlap is three times larger.
  The mechanism is now correct where it was not: a contact hands its island the
  torque `p x (-n) * depth` about the centre of the Earth and the island turns
  by it against its own inertia, so a continent pushed off its middle pivots
  instead of sliding, and adding one vector to every point of a spherical cap --
  which is not a rigid motion and walks its far edge off the shell -- is gone.
  It is still off by default, because being right is not the same as mattering.
- **Masking the drag where the pairs already speak buys the Atlantic and sells
  the Pacific.** `DRAG_FREE` keeps the slab out of water whose conjugate pairs
  survive. Its rule only asked how far the nearest pair was, and the East
  Pacific Rise has pairs of its own, so it switched the drag off along the
  American margins -- the very water it exists for. It now lets the nearer
  witness decide: closer to a one-sided path than to a pair, and the crust keeps
  its whole say, because a one-sided path is crust whose partner was swallowed
  and that is the drag's own claim. The rule reaches far more crust -- 20,117
  points of 40,962 against 16,437 at `DRAG_FREE=600` -- and the trade does not
  break: at full drag with the mask, South America to Africa is 20 km where it
  was 1,024, and North America to Africa is 1,314 km where it was 157. The two
  witnesses contradict each other over the same crust, and no masking rule
  divides them. Still off by default.

## Known weaknesses

- **The crust does not tile, and the figure is honest about it.** An earlier
  solver left roughly 15% of the sphere uncovered, spread between fragments, so
  the reconstruction read as a cracked eggshell rather than continents on an
  ocean. Collapsing dead crust out of the mesh took that to 0.0000% at every
  frame, on a hundred thousand generic probe directions rather than on the
  mesh's own vertices — but a closed triangulation of a sphere covers every
  direction whatever shape its triangles are, so most of that zero was
  structural. The run shipped now folds un-erupted crust inside the shell
  instead, which has no such guarantee, and reports **13.09% bare at 200 Ma**.
  The mesh is as closed as it ever was — see *What it reports about itself* —
  but the crust that exists covers 90.95% of the sphere where its own area asks
  for 99.74%, and the missing nine percent is ridges that have not shut. It
  replaces a different lie of similar size: under the collapse the shortfall
  went into stretched seam triangles spanning crust that had been removed, 31%
  of the shell by 200 Ma. Neither number is good. This one is at least the
  number it looks like.

- **Two continents in the same place, eleven times over.** The share of the
  sphere under two islands of strong crust at once was 0.069% at 200 Ma under
  the collapse and is **0.764%** under the fold. The earlier figure was argued
  down to a suture the mesh is too coarse to draw, on the strength of its depth
  — 25 to 29 km on a 129 km mesh — and that argument has not been re-run at
  this size. Until it has, this is the fold's clearest regression.

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
