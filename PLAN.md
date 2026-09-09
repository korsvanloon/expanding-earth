# Working the research in, and throwing out what the research shows is wrong

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

There is also a per-cell replacement for the constant, once the constant has
been measured: the M&uuml;ller 2019 total stretching factor grid (26 MB, 13% of
the globe, already in the pipeline's grid conventions) and Bradley 2008's 78
dated passive-margin segments (24 kB shapefile), which replace *"rift date from
the nearest sea floor, spread inland over twelve rings"* with published
polylines. That is a Stage 2b, only worth doing if 2a says the caps matter.

Cost: four runs at `END_MA=40` to sort them (80 s each), then full runs on
whichever survive.

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

Largest piece of work in the plan: the picks are not paired, so conjugate
quadruples have to be built by matching same-chron same-end picks across a ridge
within one reference. Worth doing last, and worth doing.

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
