# Working the research in, and throwing out what the research shows is wrong

> **Status.** Stages 0, 1, 3, 4, 5 and 6 are done and shipped; what each one
> turned out to say is recorded under it, and at length in MODEL.md. Stage 2 is
> the one still open, and it has already changed shape twice -- see its section.

The findings are in RESEARCH-FINDINGS.md. Two of them are already in the model
-- the three corrected scorecard dates, and Maxlow's measured radii as an
independent check on the curve. This is the plan for the rest, and for the code
that the same reading shows should go.

The order is set by one rule: **a stage that changes what the model is measured
against comes before a stage that changes the model.** Otherwise a solver
improvement is scored on a ruler that is about to move, and nobody can say
afterwards which of the two did the work.

Every stage names the number that decides it first, so a stage can be abandoned
on its own evidence rather than finished out of momentum.

---

## Stage 0 -- Throw out what is unfounded

No model change, nothing to solve, and it makes every later stage smaller.

### The whole-continent reference frame goes; the pin stays

A reader called *hold a continent still* ungrounded. It is worse than
ungrounded: on an expanding Earth it is **geometrically impossible**, and the
picture it draws is almost entirely the impossibility.

A rigid plate on a smaller globe covers a *larger* angular fraction of it --
the arc length in kilometres is fixed and the radius shrank. Africa spans 42
degrees of today's globe; the same rigid crust spans 68 degrees of the 3,926 km
globe at 200 Ma. No rotation maps one onto the other. So the least-squares fit
in `src/frames.ts` is fitting a rotation to a target it cannot reach, and what
is left over is not the world moving around Africa. Measured on the shipped run:

| region | fitted turn at 200 Ma | residual after the fit | what a **perfectly rigid** plate would leave |
|---|---|---|---|
| Africa | 44.3&deg; | 998 km rms | 1,029 km |
| North America | 41.4&deg; | 734 km | 845 km |
| Australia | 35.5&deg; | 444 km | 568 km |
| India | 36.1&deg; | 342 km | 346 km |

The residual is the radius change, to within the accuracy of the comparison --
in three of four cases it is *smaller* than a rigid plate would give, because
the run's own deformation absorbs part of what cannot be rotated away. There is
no signal under it to read.

The `:pin` variant is untouched by this: it matches one point and takes the
smallest turn about it, and one point can always be matched. So:

- delete the least-squares path in `src/frames.ts` and the whole-region options
  in the picker; keep pinning, and rename it to what it is;
- say in MODEL.md why, because *"a rotation cannot hold a continent still on a
  globe that changes size"* is a fact about this hypothesis that a reader
  deserves and that no plate-tectonic reconstruction has to state.

**Checked first, and clean:** the scorecard and the conjugate pairs do *not*
have this bug. They measure separation as angle times the radius **at that
time** (`solver.ts:1359`), which is arc length on the globe of that epoch --
the right thing. The reference frame was the one place that compared two
different radii directly.

### Twenty-eight knobs that never became a measurement

`KNOBS` in `tools/lib/solver.ts` lists 43 environment variables. The working
agreement says a variable is *the way to measure the alternative* -- so a knob
earns its place by having a measurement written down. Twenty-eight of the 43
are not mentioned once in MODEL.md.

Triage each into one of three, and delete the third:

1. **Operational**, not model: `END_MA`, `FRAME_STEP`, `SWEEPS`, `PROBES`, the
   `*_TRACE` flags. Keep, and group them separately so they stop looking like
   physics.
2. **A live alternative**: the measurement is written down and the other value
   is still worth reaching for. Keep.
3. **Scaffolding**: neither. Fold the default into `CONFIG` as a plain number
   and delete the variable.

**Done, and the third category turned out to be empty.** Every one of the 43 is
a live read, and the working agreement says a variable is *how the alternative
gets measured* -- so an unmeasured knob is an unwritten document, not dead code.
They are grouped now, in four blocks with a sentence each.

What the triage did find is worse than clutter: **four knobs were being read
that the list did not know about.** `MAX_STRETCH`, `MAX_SHORTENING` and
`EASE_PASSES` are read through `knob('NAME', default)` rather than `ENV.NAME`,
and `TRACE_DEPARTURE` lives in a file the check never opened. The test that
exists to prevent exactly this only ever read `tools/lib/solver.ts` and only
ever matched one of the two spellings, so a run made with any of the four
recorded **no override at all** and would have been published as the shipped
model. All four are listed, and the test now scrapes both spellings out of every
file in `tools/lib`.

### Two knobs that are not in the list and should be

`MAX_STRETCH` and `MAX_SHORTENING` (`tools/lib/unstretching.ts`) are read from
the environment but absent from `KNOBS`, so a run made with either one turned
records no override and is indistinguishable from the shipped model in the
picker. `CRUST_MODEL` had the same hole and was fixed by putting the crust model
in the run summary; these two belong in `KNOBS`.

### Three small factual repairs

- **MODEL.md line 48** says the Herodotus Basin crust is "about 280 Ma". It is
  **340 &plusmn; 25 Ma** (Granot 2016, magnetic skewness). That is also the
  largest single age uncertainty anywhere in the grid, which is worth saying
  where the calibration is described.
- **The fetcher and the file disagree.** `tools/fetch-grids.ts` points `age` at
  the GMT server's copy of Seton 2020; `data-src/agegrid.nc` is M&uuml;ller 2019
  v2.0. Two different products under one name. Pick one and say so.
- **`depth-age` has lost on everything measured** -- 109 km from Maxlow's radii
  against `permanent`'s 48, and worse pairs than `nearest-age`. Either keep it
  as a named comparator with that sentence attached, or drop it from
  `CrustModelId` and keep the ensemble at two.

---

## Stage 1 -- Put the budget in front of the reader

**The deciding number already exists and nobody is looking at it.**
`tools/measure-budget.ts` is written, works, and is not in the pipeline, not in
MODEL.md and not in the viewer. On the shipped run it says:

| Ma | the sphere allows | the run deforms | ratio |
|---|---|---|---|
| 40 | 0.20% | 11.3% | &times;56 |
| 120 | 0.11% | 21.0% | &times;186 |
| 200 | 0.30% | 22.0% | &times;73 |

This is the honest headline of the whole project and it is sharper than any
number currently on screen. The data allows a third of a percent of the shell
to deform. The reconstruction deforms a fifth of it. Everything in Stage 2 is
an attempt to move those two columns together, so the columns have to be
visible before the attempts start.

- run the budget inside `solve.ts` and write it into `meta.json` next to the
  other diagnostics, so every run and every published run carries it;
- one row in the run picker and one paragraph in *Known weaknesses*;
- this also answers your own observation directly. Gaps and over-compression at
  the same time is exactly what a solver does when the mismatch it must absorb
  is 70 times what its caps allow: it puts some of it into squashed crust and
  the rest into bare sphere.

Cost: an hour, no solve. This stage is the reason the next one is not guesswork.

**Done.** The budget is computed inside the solver now, recorded per frame,
printed per step as `budget=xN`, carried in every published run's summary, and
generated into MODEL.md. `measure-budget.ts` no longer computes anything -- it
reads what the run recorded, because the second implementation of the same
arithmetic was exactly why nobody ran it. The shipped run: **&times;12 at 5 Ma,
&times;97 at 60, &times;169 at 120, &times;76 at 200.**

---

## Stage 2 -- The caps, to the published values

**Deciding number: the budget ratio above, and the held-back pairs.** Four caps
in the solver sit below every published measurement of the same quantity. Each
one is a separate run, measured on its own, because two at once cannot be
attributed.

| Cap | Now | The literature | Source |
|---|---|---|---|
| `MAX_STRETCH` | 2.5 | 20 of 24 measured Atlantic margins are above it, up to **10** | Biari 2021 Table 2 |
| `MAX_SHORTENING` | 1.6 | Tibet 80 km on a 40 km reference = **2.0**; Andes 1.6&ndash;1.9 | Wang 2021; Eichelberger 2015 |
| `POLE_MEMORY` | 0.5 (&tau; &asymp; 1.4 Ma) | median stage duration **5.0 Ma**, p25 5.0 | computed from the M&uuml;ller 2019 rotation file |
| `PLATE_TOL` | 4 mm/yr | diffuse boundaries 2&ndash;15 mm/yr, but the rigid-plate geodetic residual is **0.25 mm/yr** | Gordon 1998; ITRF2020 |

Two of these pull in opposite directions and that is the point: raising the
stretch and shortening caps lets margins absorb more of the mismatch, while
lengthening the pole memory and tightening the plate tolerance makes the plates
behave more like plates. If the pairs get better in both directions, the caps
were the constraint. If they get worse, they were not, and Stage 2 ends there
with a measurement rather than an opinion.

### Two of the four were not what the table says they are

**`PLATE_TOL` is not a force.** It reads like one, and the research pass
compared it against Gordon's 2 to 15 mm/yr for diffuse plate boundaries as
though it were a physical rate. It is a *measurement threshold*: `findPlates`
is called only from the recording step and its answer goes only into the
`blocks` and `biggest block` columns of the report. The solver never holds a
plate rigid to 4 mm/yr or to anything else.

Which makes the sweep a reframing rather than a change, and a sharp one. At 40
Ma the same run reports **128 blocks at 4 mm/yr, 27 at 1, and 2 at 0.25** --
0.25 being the weighted RMS with which ITRF2020 represents 518 intraplate sites,
i.e. how rigid real plates actually are. Nothing else in the run moves by a
digit. So the "scores of small patches" this project has reported as its open
problem is partly an artefact of a loose threshold, and at the tolerance real
plates meet, this crust is not made of plates at all. Written into MODEL.md
beside the column.

**`POLE_MEMORY` does nothing at the young end.** 0.5 (tau 1.4 Ma) against 0.82
(tau 5 Ma, the measured median stage duration) at 40 Ma: 201 km against 203, and
every other figure identical to three digits. Being retested to 140 Ma, where a
continent whose own sea floor has run out has to coast on its pole and the
memory should matter most.

### And the other two do not bind

**Measured, one at a time, at 140 Ma: nothing moves.** `MAX_STRETCH` 2.5 to 10,
`MAX_SHORTENING` 1.6 to 2.0, `POLE_MEMORY` tau 1.4 to 5 Ma -- the pairs stay at
201 km at 40 Ma and 394 at 120, the radius moves by one kilometre, and no dated
fit moves by more than two.

The reason is better than the experiment. **The stretch cap almost never
binds:** of 81,920 triangles, 10,333 read as stretched at all, their median
stretch is 1.35 and their p90 is 2.04, so the cap clips 329 of them -- 3% of the
stretched crust and 0.4% of the shell. Raised to 10 those 329 reach 5.32 and
stop, so 10 does not bind either.

Which locates the real limit. Biari's beta of 10 off Iberia is a strip of
hyperextended crust seventy kilometres wide; a triangle here is 115 km across,
and averaged over one that strip reads about 1.5. No cap at any value can put
back a structure narrower than the mesh carrying it. **The resolution is the
constraint, not the constant** -- which makes subdivision 7 (163,842 points at
58 km) the way to ask this question, and makes the caps not worth touching
before then.

So Stage 2 ends with the model unchanged and four constants measured rather than
assumed. A worse headline and a better state to be in.

### Note on the two that are real

`MAX_STRETCH` and `MAX_SHORTENING` are the two that are actually forces, and
they are a bigger claim than this plan assumed: `unstretching` is called by
`tools/build-data.ts` as well as by the solver, and its output feeds
`radiusCurve`. So raising the stretch cap does not merely let margins absorb
more -- it asserts that more crust was stretched, which means more area was
demanded in the past, which **moves the radius curve itself**. They need the
whole pipeline re-run, not just a re-solve.

There is also a per-cell replacement for the constant, once the constant has
been measured: the M&uuml;ller 2019 total stretching factor grid (26 MB, 13% of
the globe, already in the pipeline's grid conventions) and Bradley 2008's 78
dated passive-margin segments (24 kB shapefile), which replace *"rift date from
the nearest sea floor, spread inland over twelve rings"* with published
polylines. That is a Stage 2b, only worth doing if 2a says the caps matter.

Cost: four runs at `END_MA=40` to sort them (80 s each), then full runs on
whichever survive. Two of the four turned out not to need a run at all, for the
reasons above.

---

## Stage 3 -- Paleolatitude, the check that does not depend on the radius

**Deciding number: five points, four ages, &plusmn;3 degrees.** Past 120 Ma the
model has seven held-back conjugate pairs and then nothing, which is precisely
where it fails. This adds a whole class of check exactly there, and it is the
only check in the project that is **independent of the radius** -- an
inclination reads a latitude, and a latitude is an angle.

The numbers are already computed in RESEARCH-FINDINGS.md from two independent
compilations with their error circles. Nothing needs fetching:

| point | 200 Ma | 170 Ma | 120 Ma | 60 Ma |
|---|---|---|---|---|
| Nagpur, India | 23&ndash;27&deg; S | 33&ndash;34&deg; S | 43&deg; S | 15&ndash;18&deg; S |
| Alice Springs, Australia | 36&ndash;44&deg; S | 50&ndash;53&deg; S | 60&ndash;62&deg; S | 44&ndash;46&deg; S |
| Schirmacher, E Antarctica | 39&ndash;41&deg; S | 43&ndash;45&deg; S | 57&deg; S | 77&ndash;78&deg; S |
| Johannesburg, Africa | 43&ndash;44&deg; S | 43&ndash;46&deg; S | 42&deg; S | 43&deg; S |
| Bras&iacute;lia, S America | 20&deg; S | 16&ndash;19&deg; S | 13&deg; S | 24&ndash;25&deg; S |

Two honest caveats to carry with it. The 170 Ma window is the weak one in both
compilations (A95 4.6, P95 6.1). And India has **no rock-based pole at all**
between 125 and 210 Ma, so its 200 and 170 Ma rows are a plate circuit talking,
not Indian rocks -- which makes them a weak test of the one continent this
model most needs testing.

A latitude check needs a frame to read it in, and Stage 0 has just deleted the
frame. That is not a conflict: paleolatitude is measured against the **spin
axis**, which the reconstruction has independently of any continent held still.
The frame that was deleted was a viewpoint; this one is a measurement.

Cost: a day. It is the best value in the whole plan -- new evidence where the
model is blind, at the price of arithmetic on tables already in the repository.

**Done, and it was the best value in the plan.** One of twenty cells is inside
its band. The pattern is the finding: the model drives southern Africa onto the
pole (Johannesburg 50 S at 60 Ma, 80 S at 200, where the rocks say 43 S
throughout) and leaves East Antarctica on it (Schirmacher 70 S at every age,
wanted at 36-45 S). That is the *opposite* of what a reader looking at the globe
concluded, and it is the number that settles which reading is right.

Then the follow-up that keeps it from being over-read, and it was worth as much
as the check itself. A latitude needs only the spin axis, not a rotation -- two
parameters -- so the sphere can be searched for the axis that best reconciles
the model's own positions with the measured latitudes. **Two thirds of the miss
goes away**: 24 degrees rms becomes 8 to 13. Most of the error is a coherent
turn of the whole assembly, not continents misplaced against each other. The
axis it wants is tilted 35 degrees, half again past the largest published true
polar wander, so that is a claim rather than a correction -- and the 8 to 13
degrees that survive it are the honest residual.

---

## Stage 4 -- India belongs against East Antarctica

**Deciding number: India's 1,009 km miss, which is currently scored against a
join nobody proposes.** Not one Expanding Earth author read in the pass closes
India onto Africa. Every single one puts India's west margin against East
Antarctica with Madagascar between it and Mozambique, and opens the Indian Ocean
from two ruptures rather than by India travelling.

So the model is being pulled toward, and scored against, a reconstruction that
its own literature does not hold. Add India&ndash;East Antarctica as a target
and a scorecard row; the geology's own date for that join needs one more read
(the Enderby Basin rows in Q6 are the place to start, chron M9r ~133 Ma).

This is the one stage that changes the reconstruction itself rather than a
constant, and it is the one most likely to move the 120&ndash;200 Ma end.

**Done, and it fails by more than the join it replaces.** India against Enderby
and Kemp Land, joined by 135 Ma: **3,107 km apart, no margin in contact**,
against 1,033 km for India&ndash;Africa. Adding a target does not move the
solver -- scorecard rows are graded, not pulled -- so this is a measurement of
where the model already puts India, read against where the literature says it
belongs. It belongs on the card either way: the miss is now against an assembly
somebody actually proposes.

---

## Stage 5 -- A measured strength field

**Deciding number: eleven hand-assigned rigidity values against a measurement
covering a third of the globe.** Audet & B&uuml;rgmann 2011's effective elastic
thickness is 1&deg;, 1&ndash;200 km, MIT-licensed, and **already in this
pipeline's row order** (first row lon &minus;179.5, lat 89.5) -- it needs no
resampling and no flip.

It comes with a result the model did not expect and should not paper over: past
about 60 Ma the Pacific's coherence Te **does not follow the sea-floor age**.
So "old floor stiff, young floor soft", which the rigidity field currently
assumes, is not what the measurement says. The oceans keep a formula
(Calmant 1990, Te = 2.70&middot;&radic;t km, for the age at loading) or keep the
present constant, stated as a choice; the continents get the measurement.

The one thing that has to be *chosen and written down* is the mapping from Te in
kilometres to the model's dimensionless rigidity, because the 0.70 island
threshold and the 0.10 ocean value have no measured counterpart in those units.

---

## Stage 6 -- An external conjugate set

**Deciding number: the score stops being circular.** Today the pairs that pull
the solver and the pairs that score it come off the same tracer. GSFML publishes
101,806 magnetic-anomaly picks from 108 references, and its Hellinger archive
adds 18,315 picks with a **per-pick 1&sigma; of 3&ndash;15 km** -- which is both
an external pick set and the per-pair weight that would replace one uniform
spring stiffness.

It also brings a benchmark that will not be comfortable. On the same kind of
pick, published plate-model fits reach 1&ndash;2 km for a young fast pair and
9&ndash;25 km for Australia&ndash;Antarctica at 83 Ma. This model is at hundreds
of kilometres.

**Done, and it was much less work than feared, because the pairing turned out to
be published.** The plan assumed conjugate quadruples would have to be built by
hand out of the 101,806-pick compilation. They do not: within one Hellinger
file, picks carrying the same **segment number** on opposite sides are the same
isochron segment on the two flanks of one ridge. The pairing is in the format.
Chron ages come from the compilation's own `GeeK2007` column -- 417 chron ends,
grouped by chron and end flag -- so no timescale is interpreted here.

1,302 conjugate segments from eleven studies, 6 to 83 Ma, now grade the run
without ever having touched it. **Median 317 km**, best pair
North America&ndash;Eurasia at 160 km, worst 1,347. Four of 1,302 inside three
sigma. Published plate-model fits reach 1-2 km on a young fast pair and 9-25 km
at 83 Ma -- and fit these picks by construction, since their rotations are
derived from them, so the two numbers are not measuring the same thing. The gap
is what it is, and it is on the page now.

---

## Not doing, and why

- **Paleo-age grids past 200 Ma** to extend A(t). Every one of them says in its
  own words that the floor it draws is modelled rather than preserved. They are
  comparators, not inputs.
- **The paleoradius literature as a check on the curve.** Every
  inclination-based estimate reads 400&ndash;200 Ma as within a few percent of
  today's radius, against this model's 3,926 km. That belongs in *Honesty* as
  the strongest published objection to the curve -- written down, not argued
  with, and not turned into a target.
- **Seton 2020 as a drop-in age grid.** It dates 0.27% of the globe more than
  M&uuml;ller v2 and the newly dated cells are margin fringes, so it changes
  almost nothing about A(t). Its *misfit* grid is the reason to fetch it, in
  Stage 6, as a per-cell weight.
