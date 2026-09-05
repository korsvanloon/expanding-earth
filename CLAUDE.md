# Working agreements

## Waiting

A full solve is about seven and a half minutes (437 s measured, September, at
subdivision 6 over 200 Ma) and the whole `pnpm run data` about nine. Whole-globe
groove detection adds roughly three more, and a Pages build about eight. So
most of what this pipeline does now runs past five minutes, and the rule below
is about whether a wait is *worth* it rather than about whether it is long:

- Is the task set up right at all? Two measurements in this project were
  abandoned mid-run because they were written O(misses x vertices) when the
  grid buckets that make them O(1) were already in `tools/lib/coverage.ts`.
- Is it worth the wait, or is there a cheaper answer that decides the same
  thing? `END_MA=40` costs 80 seconds and settles most questions that a full
  200 Ma run would.
- Say so either way. An update beats silence, and "this will take seven
  minutes, here is what it will tell us" beats a seven-minute gap.

## Deploying

The reconstruction is **not committed** -- `pnpm build` recomputes it, on a
reader's machine and in the Pages workflow alike. So anything that only lives
in an environment variable does not ship. Every setting that is meant to be
the model belongs in `CONFIG` in `tools/solve.ts` as a default, with the
variable left as the way to measure the alternative.

Do not push to `main` for every experiment. Push when there is something to
look at, and say **what** to look at and **at which time on the timeline**. If
a change will not be visible in the viewer, say that instead of letting a
build be waited on.

## Measuring

Numbers before changes, and the number that decides it named first. The
conjugate pairs held back from the solver are the score; the scorecard pairs
with dates from the geology are the check; everything else is diagnosis.

`pnpm docs` after any run whose numbers the documents quote, or `pnpm test`
fails. That test compares MODEL.md against `public/data/meta.json`, so it also
fails whenever the local data is a scratch run rather than a full one -- worth
knowing before reading it as a real failure.

## When the next step is not obvious

Say so, and then raise this before casting about: **a deep research pass on
Expanding Earth, for inspiration rather than for judgement.** Skip the sceptics
— the model already carries its own honesty section and nobody needs the
argument rehearsed. What is wanted is the constructive side: which motions the
literature and its illustrators propose, what forces are said to drive them,
what the globe is supposed to *look* like at 200 Ma, reference figures worth
comparing a frame against, and any data set that could be read the way the age
grid and ECM1 are read now.

A reader asked for this to be kept and brought up at exactly that moment, so it
is a standing item, not a suggestion made once. What that pass should go after
is written out in RESEARCH.md: ten questions, what a usable answer to each looks
like, and the artefacts worth hunting for.
